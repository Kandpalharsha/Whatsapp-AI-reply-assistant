import re
import json
import numpy as np
import faiss
from pathlib import Path
from typing import List, Tuple, Dict
from sentence_transformers import SentenceTransformer
from core.config import get_settings

settings = get_settings()
_model = None

def get_model():
    global _model
    if _model is None:
        print("Loading embedding model...")
        _model = SentenceTransformer(settings.embeddings_model)
    return _model

def embed_texts(texts: List[str]) -> np.ndarray:
    embeddings = get_model().encode(texts, convert_to_numpy=True, show_progress_bar=False)
    faiss.normalize_L2(embeddings)
    return embeddings.astype("float32")

def get_index_path(user_id: str, contact_id: str) -> Path:
    base = Path(settings.faiss_index_dir) / user_id / contact_id
    base.mkdir(parents=True, exist_ok=True)
    return base

# 🔥 NEW: Build index using PAIRS
def build_index(user_id: str, contact_id: str, pairs: List[Dict]) -> int:
    if not pairs:
        return 0

    filtered_pairs = [
        p for p in pairs
        if len(p.get("incoming", "").strip()) > 2 and len(p.get("reply", "").strip()) > 1
    ]

    if not filtered_pairs:
        return 0

    embedding_inputs = [
        p.get("embedding_text") or p.get("incoming", "")
        for p in filtered_pairs
    ]

    embeddings = embed_texts(embedding_inputs)
    index = faiss.IndexFlatIP(embeddings.shape[1])
    index.add(embeddings)

    base = get_index_path(user_id, contact_id)
    faiss.write_index(index, str(base / "index.faiss"))

    with open(base / "pairs.json", "w", encoding="utf-8") as f:
        json.dump(filtered_pairs, f, ensure_ascii=False, indent=2)

    return len(filtered_pairs)

def load_index(user_id: str, contact_id: str):
    base = get_index_path(user_id, contact_id)

    if not (base / "index.faiss").exists():
        return None, []

    index = faiss.read_index(str(base / "index.faiss"))

    with open(base / "pairs.json", encoding="utf-8") as f:
        pairs = json.load(f)

    return index, pairs

# 🔥 NEW: Return (incoming, reply)
def retrieve_similar(user_id: str, contact_id: str, query: str, top_k: int = 5):
    index, pairs = load_index(user_id, contact_id)

    if index is None or index.ntotal == 0:
        return []

    query_vec = embed_texts([query])
    k = min(top_k, index.ntotal)

    distances, indices = index.search(query_vec, k)

    results = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx < len(pairs):
            results.append({
                "incoming": pairs[idx]["incoming"],
                "reply": pairs[idx]["reply"],
                "context": pairs[idx].get("context", ""),
                "similarity": float(dist)
            })

    return results


def retrieve_similar_from_contacts(
    user_id: str, contact_ids: List[str], query: str, top_k: int = 5
):
    results = []

    for contact_id in contact_ids:
        for item in retrieve_similar(user_id, contact_id, query, top_k=top_k):
            results.append({**item, "contact_id": contact_id})

    results.sort(key=lambda item: item["similarity"], reverse=True)
    return results[:top_k]

# 🔥 UPDATED: Parse into PAIRS
def parse_whatsapp_export(raw_text: str, your_name: str):
    pattern = re.compile(
        r"(\d{1,2}/\d{1,2}/\d{2,4},\s*\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)\s*-\s*([^:]+):\s*(.+)"
    )

    all_messages = []

    for line in raw_text.splitlines():
        m = pattern.match(line.strip())
        if not m:
            continue

        timestamp, sender, text = m.group(1), m.group(2).strip(), m.group(3).strip()

        if text.lower() in ("<media omitted>", "this message was deleted", "null"):
            continue

        all_messages.append({
            "sender": sender,
            "text": text,
            "timestamp": timestamp,
            "is_you": sender.lower() == your_name.lower()
        })

    # 🔥 Create (incoming → reply) pairs
    pairs = []

    for i in range(len(all_messages) - 1):
        curr = all_messages[i]
        nxt = all_messages[i + 1]

        if not curr["is_you"] and nxt["is_you"]:
            if len(curr["text"]) > 1 and len(nxt["text"]) > 1:
                history_window = all_messages[max(0, i - 4):i]
                context_lines = [
                    f'{"You" if item["is_you"] else "Them"}: {item["text"]}'
                    for item in history_window
                ]
                context_text = "\n".join(context_lines)
                embedding_text = (
                    f"{context_text}\nThem: {curr['text']}".strip()
                    if context_text
                    else curr["text"]
                )
                pairs.append({
                    "incoming": curr["text"],
                    "reply": nxt["text"],
                    "context": context_text,
                    "embedding_text": embedding_text,
                })

    return pairs, all_messages
