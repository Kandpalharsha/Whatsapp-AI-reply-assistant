import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { chatAPI, replyAPI } from '../services/api';
import { useStore, Contact } from '../store';
import { colors, radius, spacing } from '../utils/theme';

export default function ContactsScreen({ navigation }: any) {
  const contacts = useStore(s => s.contacts);
  const setContacts = useStore(s => s.setContacts);
  const setStats = useStore(s => s.setStats);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = useCallback(async () => {
    try {
      const [cr, sr] = await Promise.all([
        chatAPI.getContacts(),
        replyAPI.getStats(),
      ]);
      setContacts(cr.data);
      const d = sr.data;
      setStats({
        totalReplied: d.total_replied,
        totalTrained: d.total_trained,
        styleMatchPercent: d.style_match_percent,
        avgDelaySeconds: d.avg_delay_seconds,
        contactsTrained: d.contacts_trained,
      });
    } catch {}
  }, [setContacts, setStats]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: Contact }) => (
    <TouchableOpacity
      style={s.row}
      onPress={() => navigation.navigate('Chat', { contact: item })}
    >
      <View style={[s.avatar, { backgroundColor: item.color }]}>
        <Text style={s.avatarText}>{item.initials}</Text>
      </View>
      <View style={s.info}>
        <Text style={s.name}>{item.name}</Text>
        <Text style={s.preview} numberOfLines={1}>
          {item.preview}
        </Text>
      </View>
      <View style={s.meta}>
        <Text style={s.time}>{item.time}</Text>
        {item.unreadCount > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{item.unreadCount}</Text>
          </View>
        )}
        <View
          style={[
            s.botDot,
            {
              backgroundColor: item.botEnabled ? colors.primary : colors.border,
            },
          ]}
        />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      <FlatList
        data={contacts}
        keyExtractor={c => c.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyIcon}>Chats</Text>
            <Text style={s.emptyTitle}>No training chats yet</Text>
            <Text style={s.emptyHint}>
              Go to the Train tab and upload one or more WhatsApp exports to teach the AI your reply style.
            </Text>
            <TouchableOpacity
              style={s.emptyBtn}
              onPress={() => navigation.navigate('Train')}
            >
              <Text style={s.emptyBtnText}>Go to Train</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  info: { flex: 1 },
  name: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 3,
  },
  preview: { fontSize: 13, color: colors.textSecondary },
  meta: { alignItems: 'flex-end', gap: 4 },
  time: { fontSize: 11, color: colors.textMuted },
  badge: {
    backgroundColor: colors.primary,
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  botDot: { width: 8, height: 8, borderRadius: 4 },
  empty: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIcon: { fontSize: 20, marginBottom: spacing.md, fontWeight: '600' },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  emptyBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  emptyBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
