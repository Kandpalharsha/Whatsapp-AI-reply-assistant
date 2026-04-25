import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { chatAPI, replyAPI, settingsAPI } from '../services/api';
import { useStore } from '../store';
import { colors, radius, spacing } from '../utils/theme';
import {
  whatsAppNotifications,
  WhatsAppPopupNotification,
} from '../services/whatsAppNotifications';

type NotificationDrafts = Record<string, string>;
type NotificationLoading = Record<string, boolean>;

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

export default function NotificationInboxScreen() {
  const contacts = useStore(s => s.contacts);
  const setContacts = useStore(s => s.setContacts);
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const [enabled, setEnabled] = useState(false);
  const [items, setItems] = useState<WhatsAppPopupNotification[]>([]);
  const [drafts, setDrafts] = useState<NotificationDrafts>({});
  const [loading, setLoading] = useState<NotificationLoading>({});
  const [refreshing, setRefreshing] = useState(false);

  const trainingSourceIds = settings.trainingContactIds.length
    ? settings.trainingContactIds
    : contacts.map(contact => contact.id);
  const trainingSourceCount = trainingSourceIds.length;

  const loadContacts = useCallback(async () => {
    try {
      const res = await chatAPI.getContacts();
      setContacts(res.data);
    } catch {}
  }, [setContacts]);

  const loadSettings = useCallback(async () => {
    try {
      const res = await settingsAPI.get();
      const data = res.data;
      setSettings({
        botEnabled: data.bot_enabled,
        humanDelay: data.human_delay,
        styleCloning: data.style_cloning,
        notifications: data.notifications,
        responseTone: data.response_tone,
        genderTone: data.gender_tone,
        delayMinSeconds: data.delay_min_seconds ?? 2,
        delayMaxSeconds: data.delay_max_seconds ?? 8,
        blacklist: data.blacklist || [],
        trainingContactIds: data.training_contact_ids || [],
      });
    } catch {}
  }, [setSettings]);

  const loadNotifications = useCallback(async () => {
    if (!whatsAppNotifications.isAvailable()) {
      return;
    }
    try {
      const [listenerEnabled, captured] = await Promise.all([
        whatsAppNotifications.isEnabled(),
        whatsAppNotifications.getCapturedNotifications(),
      ]);
      setEnabled(listenerEnabled);
      setItems(captured);
    } catch {}
  }, []);

  useEffect(() => {
    loadContacts();
    loadSettings();
    loadNotifications();

    const emitter = whatsAppNotifications.createEmitter();
    if (!emitter) {
      return;
    }

    const subscription = emitter.addListener(
      'whatsapp_notification',
      (payload: WhatsAppPopupNotification) => {
        setItems(current => {
          const filtered = current.filter(item => item.key !== payload.key);
          return [payload, ...filtered].slice(0, 20);
        });
      },
    );

    return () => subscription.remove();
  }, [loadContacts, loadNotifications, loadSettings]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadContacts(), loadSettings(), loadNotifications()]);
    setRefreshing(false);
  };

  const setDraft = (key: string, value: string) => {
    setDrafts(current => ({ ...current, [key]: value }));
  };

  const setItemLoading = (key: string, value: boolean) => {
    setLoading(current => ({ ...current, [key]: value }));
  };

  const generateReply = async (notification: WhatsAppPopupNotification) => {
    if (trainingSourceCount === 0) {
      Alert.alert(
        'No training chats yet',
        'Upload one or more WhatsApp chats first so the AI has examples of your style.',
      );
      return;
    }

    setItemLoading(notification.key, true);
    try {
      const res = await replyAPI.generate(null, notification.text, [], notification.title);
      setDraft(notification.key, res.data.reply || '');
    } catch (error: any) {
      Alert.alert(
        'AI reply failed',
        error?.response?.data?.detail || 'Could not generate a reply for this notification.',
      );
    } finally {
      setItemLoading(notification.key, false);
    }
  };

  const sendReply = async (notification: WhatsAppPopupNotification) => {
    const draft = drafts[notification.key]?.trim();
    if (!draft) {
      Alert.alert('Reply missing', 'Type a reply or generate one first.');
      return;
    }

    if (!notification.canReply) {
      Alert.alert(
        'Quick reply unavailable',
        'This WhatsApp notification did not expose an Android quick-reply action.',
      );
      return;
    }

    setItemLoading(notification.key, true);
    try {
      await whatsAppNotifications.sendQuickReply(notification.key, draft);
      Alert.alert('Reply sent', 'The quick reply was sent through the WhatsApp notification action.');
      setDraft(notification.key, '');
    } catch (error: any) {
      Alert.alert(
        'Send failed',
        error?.message || 'Could not send the quick reply for this notification.',
      );
    } finally {
      setItemLoading(notification.key, false);
    }
  };

  const renderItem = ({ item }: { item: WhatsAppPopupNotification }) => {
    const draft = drafts[item.key] || '';
    const busy = loading[item.key] || false;
    const isBlacklisted = settings.blacklist.some(
      blocked =>
        normalizeName(item.title).includes(normalizeName(blocked)) ||
        normalizeName(blocked).includes(normalizeName(item.title)),
    );
    const autoReplyStatus = !settings.botEnabled
      ? 'Auto-reply is off globally'
      : isBlacklisted
        ? 'Blocked by blacklist'
        : trainingSourceCount === 0
          ? 'Upload at least one training chat first'
          : !item.canReply
            ? 'WhatsApp did not expose quick reply for this popup'
            : settings.humanDelay
              ? `Auto-reply will wait about ${settings.delayMinSeconds}-${settings.delayMaxSeconds} seconds`
              : 'Auto-reply can send immediately';
    const nativeStatus = item.autoReplyStatus?.trim();

    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <View style={s.cardMeta}>
            <Text style={s.cardTitle}>{item.title}</Text>
            <Text style={s.cardSubtitle} numberOfLines={2}>
              {item.text || 'No message text available in notification'}
            </Text>
          </View>
          <View style={[s.replyBadge, item.canReply ? s.replyBadgeOn : s.replyBadgeOff]}>
            <Text style={s.replyBadgeText}>
              {item.canReply ? 'Reply' : 'Read'}
            </Text>
          </View>
        </View>

        <Text style={s.matchText}>
          {trainingSourceCount > 0
            ? `Using ${trainingSourceCount} training chat${trainingSourceCount === 1 ? '' : 's'} for style`
            : 'No training chats selected yet'}
        </Text>
        <Text style={s.statusText}>{autoReplyStatus}</Text>
        {nativeStatus ? <Text style={s.nativeStatusText}>{nativeStatus}</Text> : null}

        <TextInput
          style={s.replyInput}
          value={draft}
          onChangeText={value => setDraft(item.key, value)}
          placeholder="Type or generate a reply..."
          placeholderTextColor={colors.textMuted}
          multiline
        />

        <View style={s.actionRow}>
          <TouchableOpacity
            style={[s.actionBtn, s.secondaryBtn]}
            onPress={() => generateReply(item)}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color={colors.primaryDark} />
            ) : (
              <Text style={s.secondaryBtnText}>Generate AI</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionBtn, s.primaryBtn, (!draft.trim() || !item.canReply) && s.disabledBtn]}
            onPress={() => sendReply(item)}
            disabled={busy || !draft.trim() || !item.canReply}
          >
            <Text style={s.primaryBtnText}>Send Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (!whatsAppNotifications.isAvailable()) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>WhatsApp listener unavailable</Text>
        <Text style={s.emptyHint}>
          Rebuild the Android app to install the native notification listener.
        </Text>
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={s.empty}>
        <Text style={s.emptyTitle}>Notification access is off</Text>
        <Text style={s.emptyHint}>
          Open Settings and enable the WhatsApp notification listener first.
        </Text>
        <TouchableOpacity style={s.primaryCta} onPress={() => whatsAppNotifications.openSettings()}>
          <Text style={s.primaryBtnText}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <FlatList
        data={items}
        keyExtractor={item => item.key}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? s.emptyContainer : s.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTitle}>No WhatsApp popup notifications yet</Text>
            <Text style={s.emptyHint}>
              Send a WhatsApp message to this phone while notifications are enabled, then pull to refresh.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  listContent: { padding: spacing.md, paddingBottom: 40 },
  emptyContainer: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  primaryCta: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  cardMeta: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  cardSubtitle: {
    marginTop: 4,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  replyBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  replyBadgeOn: { backgroundColor: colors.primaryLight },
  replyBadgeOff: { backgroundColor: colors.border },
  replyBadgeText: { fontSize: 11, fontWeight: '700', color: colors.primaryDark },
  matchText: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.textMuted,
  },
  statusText: {
    marginTop: 6,
    fontSize: 12,
    color: colors.primaryDark,
  },
  nativeStatusText: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  replyInput: {
    marginTop: spacing.sm,
    minHeight: 82,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
    color: colors.text,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryBtn: { backgroundColor: colors.primary },
  secondaryBtn: {
    backgroundColor: colors.primaryLight,
    borderWidth: 0.5,
    borderColor: colors.primary,
  },
  disabledBtn: { backgroundColor: colors.border },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  secondaryBtnText: { color: colors.primaryDark, fontSize: 14, fontWeight: '600' },
});
