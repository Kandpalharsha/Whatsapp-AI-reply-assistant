import time
from typing import List, Optional
import re
from openai import AsyncOpenAI
from core.config import get_settings
from core.database import contacts_col, settings_col
from services.rag_service import retrieve_similar, retrieve_similar_from_contacts

settings = get_settings()
client = AsyncOpenAI(api_key=settings.openai_api_key)

SIMPLE_MESSAGE_PATTERNS = [
    r"^\s*hi+\s*$",
    r"^\s*hii+\s*$",
    r"^\s*hello+\s*$",
    r"^\s*hey+\s*$",
    r"^\s*whats? ?up+\s*\??\s*$",
    r"^\s*kya haal.*$",
    r"^\s*kaisa hai.*$",
    r"^\s*kaisi hai.*$",
    r"^\s*how are you.*$",
    r"^\s*bolo+\s*$",
    r"^\s*haan+\s*$",
]


def is_simple_message(message: str) -> bool:
    text = message.strip().lower()
    if len(text) <= 14 and "?" not in text and len(text.split()) <= 3:
        return True
    return any(re.match(pattern, text) for pattern in SIMPLE_MESSAGE_PATTERNS)


def normalize_name(value: Optional[str]) -> str:
    return (value or "").strip().lower()

async def generate_reply(
    user_id: str,
    contact_id: Optional[str],
    incoming_message: str,
    conversation_history: List[dict],
    tone: str = "casual",
    gender: str = "neutral",
    contact_name: Optional[str] = None,
) -> dict:

    start = time.time()

    user_settings = await settings_col().find_one({"user_id": user_id}) or {}
    trained_contact_ids = user_settings.get("training_contact_ids") or []

    if not trained_contact_ids:
        async for contact in contacts_col().find({"user_id": user_id}, {"contact_id": 1}):
            trained_contact_ids.append(contact["contact_id"])

    if contact_id and contact_id not in trained_contact_ids:
        trained_contact_ids = [contact_id, *trained_contact_ids]

    preferred_contact_ids: List[str] = []
    normalized_contact_name = normalize_name(contact_name)
    if normalized_contact_name:
        async for contact in contacts_col().find({"user_id": user_id}, {"contact_id": 1, "name": 1}):
            if normalize_name(contact.get("name")) == normalized_contact_name:
                preferred_contact_ids.append(contact["contact_id"])

    preferred_contact_ids = [
        cid for cid in preferred_contact_ids
        if cid in trained_contact_ids
    ]

    if not trained_contact_ids:
        retrieved = []
    elif preferred_contact_ids:
        retrieved = retrieve_similar_from_contacts(
            user_id, preferred_contact_ids, incoming_message, top_k=4
        )
        if len(retrieved) < 2:
            fallback_contact_ids = [
                cid for cid in trained_contact_ids
                if cid not in preferred_contact_ids
            ]
            if fallback_contact_ids:
                retrieved.extend(
                    retrieve_similar_from_contacts(
                        user_id, fallback_contact_ids, incoming_message, top_k=2
                    )
                )
    elif contact_id and len(trained_contact_ids) == 1:
        retrieved = retrieve_similar(user_id, contact_id, incoming_message, top_k=3)
    else:
        retrieved = retrieve_similar_from_contacts(
            user_id, trained_contact_ids, incoming_message, top_k=3
        )

    retrieved = [
        item for item in retrieved
        if item.get("similarity", 0) >= 0.45
    ][:3]

    if is_simple_message(incoming_message):
        retrieved = []

    # 🔥 Format as MESSAGE → REPLY examples
    examples = "\n\n".join(
        (
            f'Context:\n{r["context"]}\n' if r.get("context") else ""
        ) +
        f'Message: "{r["incoming"]}"\nReply: "{r["reply"]}"'
        for r in retrieved
    ) if retrieved else "No examples available."

    recent_ctx = ""
    if conversation_history:
        recent_ctx = "\n".join(
            f"{'Them' if getattr(m, 'role', None) == 'in' else 'You'}: {getattr(m, 'text', '')}"
            for m in conversation_history[-6:]
        )

    simple_message_hint = (
        "The incoming message is a simple opener/check-in. Reply directly to it in a natural casual way."
        if is_simple_message(incoming_message)
        else "The incoming message may need a contextual answer grounded in the latest topic."
    )
    gender_hint = {
        "male": "Prefer a masculine texting voice when Hindi/Hinglish phrasing naturally reflects gender.",
        "female": "Prefer a feminine texting voice when Hindi/Hinglish phrasing naturally reflects gender.",
        "neutral": "Keep the reply gender-neutral unless the user's learned style clearly suggests otherwise.",
    }.get(gender, "Keep the reply gender-neutral unless the user's learned style clearly suggests otherwise.")

    system_prompt = f"""
You are writing one WhatsApp reply on behalf of the user.

Your first job is to reply to the latest incoming message correctly and directly.
Your second job is to keep the user's texting style.

Here are examples of how the user replies:

{examples}

Recent conversation:
{recent_ctx if recent_ctx else "None"}

Incoming chat name:
{contact_name or "Unknown"}

Rules:
- {simple_message_hint}
- {gender_hint}
- Reply to the actual latest incoming message, not to some older topic from the examples.
- If the incoming message is just a greeting or short nudge like "hii", "bolo", "whatsapp", reply to that directly.
- Do not invent context that is not present in the incoming message or recent conversation.
- Use retrieved examples only for tone, wording habits, and texting style.
- If examples are unrelated to the latest incoming message, ignore their topic completely.
- Keep reply short (1–2 lines maximum).
- Do NOT sound poetic or dramatic.
- Do NOT add emojis.
- Avoid over-enthusiastic phrases.
- Write casually, like normal texting.
- Use natural Hinglish if present.
- Copy vocabulary style from examples.
- Do NOT use corporate or assistant tone.
- Do NOT sound motivational.
- Do not improve grammar too much.
- Do not beautify language.
- Small natural mistakes are fine if they match the style.
- Prefer a direct, context-aware reply over a stylish but irrelevant one.

Return only the reply text.

"""

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f'Latest incoming message: "{incoming_message}"\nWrite the next reply only.',
            },
        ],
        temperature=0.45 if tone == "casual" else 0.35,
        max_tokens=100,
    )

    reply = response.choices[0].message.content.strip().strip('"')
    
    return {
        "reply": reply,
        "retrieved_messages": retrieved,
        "rag_context_used": len(retrieved) > 0,
        "processing_time_ms": int((time.time() - start) * 1000),
    }
