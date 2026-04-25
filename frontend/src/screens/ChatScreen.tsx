import React, { useState, useRef, useLayoutEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { replyAPI, chatAPI } from '../services/api';
import { useStore, Message } from '../store';
import { colors, radius, spacing } from '../utils/theme';

let msgId = 0;
const EMPTY_MESSAGES: Message[] = [];
const mkId = () => `msg_${++msgId}_${Date.now()}`;
const nowTime = () => {
  const d = new Date();
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function HeaderToggle({
  botOn,
  onPress,
}: {
  botOn: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={hdr.toggleButton}>
      <View style={[hdr.pill, botOn && hdr.pillOn]}>
        <Text style={hdr.pillText}>AI {botOn ? 'ON' : 'OFF'}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatScreen({ route, navigation }: any) {
  const { contact } = route.params;
  const insets = useSafeAreaInsets();
  const messages = useStore(s => s.messages[contact.id] ?? EMPTY_MESSAGES);
  const addMessage = useStore(s => s.addMessage);
  const updateContact = useStore(s => s.updateContact);
  const settings = useStore(s => s.settings);

  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [botOn, setBotOn] = useState(contact.botEnabled);
  const [expandedRag, setExpanded] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const scrollBottom = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const toggleBot = useCallback(async () => {
    const next = !botOn;
    setBotOn(next);
    updateContact(contact.id, { botEnabled: next });
    try {
      await chatAPI.toggleContactBot(contact.id, next);
    } catch {}
  }, [botOn, contact.id, updateContact]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: contact.name,
      headerRight: () => <HeaderToggle botOn={botOn} onPress={toggleBot} />,
    });
  }, [botOn, contact.name, navigation, toggleBot]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || typing) {
      return;
    }

    setText('');

    const outMsg: Message = {
      id: mkId(),
      role: 'out',
      text: trimmed,
      time: nowTime(),
    };
    addMessage(contact.id, outMsg);
    updateContact(contact.id, { preview: trimmed, time: 'now' });
    scrollBottom();

    if (!botOn || !settings.botEnabled) {
      return;
    }

    setTyping(true);
    try {
      const history = messages
        .slice(-8)
        .map(m => ({ role: m.role, text: m.text }));
      const res = await replyAPI.generate(contact.id, trimmed, history, contact.name);
      const { reply, retrieved_messages } = res.data;

      const aiMsg: Message = {
        id: mkId(),
        role: 'in',
        text: reply,
        time: nowTime(),
        isAI: true,
        ragContext: retrieved_messages,
      };
      addMessage(contact.id, aiMsg);
      updateContact(contact.id, { preview: `AI: ${reply.slice(0, 35)}...` });
      scrollBottom();
    } catch (e: any) {
      const errMsg: Message = {
        id: mkId(),
        role: 'in',
        text: e.response?.data?.detail || 'AI could not reply right now',
        time: nowTime(),
      };
      addMessage(contact.id, errMsg);
      scrollBottom();
    } finally {
      setTyping(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isExpanded = expandedRag === item.id;
    return (
      <View>
        {item.isAI && item.ragContext && item.ragContext.length > 0 && (
          <TouchableOpacity
            style={s.ragTag}
            onPress={() => setExpanded(isExpanded ? null : item.id)}
          >
            <Text style={s.ragTagText}>
              AI - {isExpanded ? 'hide' : 'show'} RAG context ({item.ragContext.length}{' '}
              matches)
            </Text>
          </TouchableOpacity>
        )}

        {isExpanded && item.ragContext && (
          <View style={s.ragPanel}>
            <Text style={s.ragPanelTitle}>Retrieved from your past messages</Text>
            {item.ragContext.map((r, i) => (
              <View key={i} style={s.ragRow}>
                <View style={s.ragBarWrap}>
                  <View
                    style={[
                      s.ragBarFill,
                      { width: `${Math.round(r.similarity * 100)}%` as any },
                    ]}
                  />
                </View>
                <Text style={s.ragSim}>{r.similarity.toFixed(2)}</Text>
                <Text style={s.ragText} numberOfLines={1}>
                  "{r.text}"
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={[s.msgRow, item.role === 'out' ? s.msgRowOut : s.msgRowIn]}>
          <View
            style={[
              s.bubble,
              item.role === 'out' ? s.bubbleOut : s.bubbleIn,
              item.isAI && s.bubbleAI,
            ]}
          >
            {item.isAI && <Text style={s.aiLabel}>AI reply</Text>}
            <Text style={s.msgText}>{item.text}</Text>
            <Text style={s.msgTime}>
              {item.time}
              {item.role === 'out' ? ' sent' : ''}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={s.chatBg}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={renderMessage}
          contentContainerStyle={[
            s.listContent,
            { paddingBottom: spacing.md + 64 + insets.bottom },
          ]}
          onContentSizeChange={scrollBottom}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Text style={s.emptyChatText}>
                Send a message and the AI will reply in your style.
              </Text>
            </View>
          }
          ListFooterComponent={
            typing ? (
              <View style={s.msgRowIn}>
                <View style={[s.bubble, s.bubbleIn, s.typingBubble]}>
                  <ActivityIndicator size="small" color={colors.textMuted} />
                  <Text style={s.typingText}> AI is thinking...</Text>
                </View>
              </View>
            ) : null
          }
        />

        <View style={[s.inputBar, { paddingBottom: spacing.sm + insets.bottom }]}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || typing) && s.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || typing}
          >
            <Text style={s.sendIcon}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const hdr = StyleSheet.create({
  toggleButton: { marginRight: spacing.md },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  pillOn: { backgroundColor: colors.primary },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});

const s = StyleSheet.create({
  flex: { flex: 1 },
  chatBg: { flex: 1, backgroundColor: colors.chatBg },
  listContent: { padding: spacing.sm, paddingBottom: spacing.md },
  msgRow: { flexDirection: 'row', marginVertical: 2 },
  msgRowOut: { justifyContent: 'flex-end' },
  msgRowIn: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '72%',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  bubbleOut: { backgroundColor: colors.bubbleOut, borderTopRightRadius: 2 },
  bubbleIn: { backgroundColor: colors.bubbleIn, borderTopLeftRadius: 2 },
  bubbleAI: {
    backgroundColor: colors.bubbleAI,
    borderLeftWidth: 2,
    borderLeftColor: colors.primary,
  },
  aiLabel: {
    fontSize: 10,
    color: colors.primaryDark,
    fontWeight: '600',
    marginBottom: 2,
  },
  msgText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  msgTime: { fontSize: 10, color: colors.textMuted, textAlign: 'right', marginTop: 2 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  typingText: { fontSize: 13, color: colors.textMuted },
  ragTag: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: spacing.sm,
    marginBottom: 2,
  },
  ragTagText: { fontSize: 11, color: colors.primaryDark, fontWeight: '500' },
  ragPanel: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    margin: spacing.sm,
    padding: spacing.sm,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  ragPanelTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  ragRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  ragBarWrap: {
    width: 60,
    height: 5,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  ragBarFill: { height: '100%', backgroundColor: colors.primary },
  ragSim: { fontSize: 10, color: colors.textSecondary, width: 28 },
  ragText: { flex: 1, fontSize: 11, color: colors.textSecondary },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    fontSize: 15,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  sendBtnDisabled: { backgroundColor: colors.border },
  sendIcon: { color: '#fff', fontSize: 12, fontWeight: '600' },
  emptyChat: { flex: 1, alignItems: 'center', paddingTop: 60 },
  emptyChatText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
