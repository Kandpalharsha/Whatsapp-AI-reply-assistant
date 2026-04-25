import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { chatAPI, replyAPI, settingsAPI } from '../services/api';
import { useStore } from '../store';
import { colors, radius, spacing } from '../utils/theme';
import { whatsAppNotifications } from '../services/whatsAppNotifications';

function getErrorMessage(error: any, fallback: string) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map(item => {
        if (typeof item === 'string') {
          return item;
        }
        if (typeof item?.msg === 'string') {
          return item.msg;
        }
        return JSON.stringify(item);
      })
      .join('\n');
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export default function SettingsScreen({ navigation }: any) {
  const settings = useStore(s => s.settings);
  const setSettings = useStore(s => s.setSettings);
  const stats = useStore(s => s.stats);
  const setStats = useStore(s => s.setStats);
  const user = useStore(s => s.user);
  const logout = useStore(s => s.logout);

  const [listenerEnabled, setListenerEnabled] = useState(false);
  const [delayMinInput, setDelayMinInput] = useState('2');
  const [delayMaxInput, setDelayMaxInput] = useState('8');
  const [newBlacklist, setNewBlacklist] = useState('');

  useEffect(() => {
    settingsAPI
      .get()
      .then(r => {
        const d = r.data;
        setSettings({
          botEnabled: d.bot_enabled,
          humanDelay: d.human_delay,
          styleCloning: d.style_cloning,
          notifications: d.notifications,
          responseTone: d.response_tone,
          genderTone: d.gender_tone,
          delayMinSeconds: d.delay_min_seconds ?? 2,
          delayMaxSeconds: d.delay_max_seconds ?? 8,
          blacklist: d.blacklist || [],
          trainingContactIds: d.training_contact_ids || [],
        });
        setDelayMinInput(String(d.delay_min_seconds ?? 2));
        setDelayMaxInput(String(d.delay_max_seconds ?? 8));
      })
      .catch(() => {});

    replyAPI
      .getStats()
      .then(r =>
        setStats({
          totalReplied: r.data.total_replied,
          totalTrained: r.data.total_trained,
          styleMatchPercent: r.data.style_match_percent,
        }),
      )
      .catch(() => {});

    whatsAppNotifications.isEnabled().then(setListenerEnabled).catch(() => {});
    chatAPI.getContacts().catch(() => {});
  }, [setSettings, setStats]);

  const toggleSetting = async (key: 'botEnabled' | 'humanDelay') => {
    const next = !settings[key];
    setSettings({ [key]: next });
    const snakeKey = key.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`);
    try {
      await settingsAPI.update({ [snakeKey]: next });
    } catch (error: any) {
      setSettings({ [key]: !next });
      Alert.alert('Save failed', getErrorMessage(error, 'Could not update this setting.'));
    }
  };

  const saveDelayWindow = async () => {
    const min = Number(delayMinInput);
    const max = Number(delayMaxInput);

    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
      Alert.alert('Invalid delay', 'Delay must be 0 or more seconds.');
      return;
    }

    if (min > max) {
      Alert.alert('Invalid delay', 'Minimum delay must be less than or equal to maximum delay.');
      return;
    }

    setSettings({ delayMinSeconds: min, delayMaxSeconds: max });
    try {
      await settingsAPI.update({
        delay_min_seconds: min,
        delay_max_seconds: max,
      });
      Alert.alert('Saved', 'Reply timer updated.');
    } catch (error: any) {
      Alert.alert('Save failed', getErrorMessage(error, 'Could not update the reply timer.'));
    }
  };

  const saveGenderTone = async (value: 'neutral' | 'male' | 'female') => {
    const previous = settings.genderTone;
    setSettings({ genderTone: value });
    try {
      await settingsAPI.update({ gender_tone: value });
    } catch (error: any) {
      setSettings({ genderTone: previous });
      Alert.alert('Save failed', getErrorMessage(error, 'Could not update reply style.'));
    }
  };

  const addBlacklist = async () => {
    const value = newBlacklist.trim();
    if (!value) {
      return;
    }

    if (settings.blacklist.includes(value)) {
      setNewBlacklist('');
      return;
    }

    setSettings({ blacklist: [...settings.blacklist, value] });
    setNewBlacklist('');
    try {
      await settingsAPI.addBlacklist(value);
    } catch (error: any) {
      Alert.alert(
        'Save failed',
        getErrorMessage(error, 'Could not add that contact to the blacklist.'),
      );
    }
  };

  const removeBlacklist = async (item: string) => {
    const next = settings.blacklist.filter(name => name !== item);
    setSettings({ blacklist: next });
    try {
      await settingsAPI.removeBlacklist(item);
    } catch (error: any) {
      Alert.alert(
        'Save failed',
        getErrorMessage(error, 'Could not remove that contact from the blacklist.'),
      );
    }
  };

  const openNotificationAccess = () => {
    whatsAppNotifications.openSettings();
    setTimeout(() => {
      whatsAppNotifications.isEnabled().then(setListenerEnabled).catch(() => {});
    }, 1500);
  };

  const confirmLogout = () =>
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          navigation.replace('Login');
        },
      },
    ]);

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.name}>{user?.name || 'User'}</Text>
        <Text style={s.email}>{user?.email || ''}</Text>
      </View>

      <View style={s.statsRow}>
        <View style={s.statCard}>
          <Text style={s.statNumber}>{stats.totalReplied}</Text>
          <Text style={s.statLabel}>Replied</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNumber}>{stats.totalTrained}</Text>
          <Text style={s.statLabel}>Trained</Text>
        </View>
        <View style={s.statCard}>
          <Text style={s.statNumber}>{Math.round(stats.styleMatchPercent)}%</Text>
          <Text style={s.statLabel}>Style</Text>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Bot</Text>
        <TouchableOpacity style={s.row} onPress={() => toggleSetting('botEnabled')}>
          <Text style={s.rowLabel}>Auto reply</Text>
          <Text style={settings.botEnabled ? s.onText : s.offText}>
            {settings.botEnabled ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.row} onPress={() => toggleSetting('humanDelay')}>
          <Text style={s.rowLabel}>Reply timer</Text>
          <Text style={settings.humanDelay ? s.onText : s.offText}>
            {settings.humanDelay ? 'ON' : 'OFF'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Delay</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={delayMinInput}
            onChangeText={setDelayMinInput}
            keyboardType="number-pad"
            placeholder="Min seconds"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={s.input}
            value={delayMaxInput}
            onChangeText={setDelayMaxInput}
            keyboardType="number-pad"
            placeholder="Max seconds"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <TouchableOpacity style={s.primaryBtn} onPress={saveDelayWindow}>
          <Text style={s.primaryBtnText}>Save timer</Text>
        </TouchableOpacity>
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Reply Persona</Text>
        <Text style={s.helper}>
          Choose whether the bot should reply in a more neutral, male, or female texting style.
        </Text>
        <View style={s.choiceRow}>
          {(['neutral', 'male', 'female'] as const).map(option => {
            const active = settings.genderTone === option;
            return (
              <TouchableOpacity
                key={option}
                style={[s.choiceBtn, active && s.choiceBtnActive]}
                onPress={() => saveGenderTone(option)}
              >
                <Text style={[s.choiceText, active && s.choiceTextActive]}>
                  {option[0].toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Blacklist</Text>
        {settings.blacklist.length === 0 ? (
          <Text style={s.helper}>No contacts blacklisted</Text>
        ) : (
          settings.blacklist.map(item => (
            <View key={item} style={s.row}>
              <Text style={s.rowLabel}>{item}</Text>
              <TouchableOpacity onPress={() => removeBlacklist(item)}>
                <Text style={s.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <View style={s.inputRow}>
          <TextInput
            style={[s.input, s.flexInput]}
            value={newBlacklist}
            onChangeText={setNewBlacklist}
            placeholder="Contact name"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity style={s.addBtn} onPress={addBlacklist}>
            <Text style={s.primaryBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.sectionTitle}>Notifications</Text>
        <Text style={s.helper}>
          Notification access is {listenerEnabled ? 'enabled' : 'disabled'}.
        </Text>
        <TouchableOpacity style={s.primaryBtn} onPress={openNotificationAccess}>
          <Text style={s.primaryBtnText}>
            {listenerEnabled ? 'Manage notification access' : 'Enable notification access'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={s.logoutBtn} onPress={confirmLogout}>
        <Text style={s.logoutText}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  name: { fontSize: 18, fontWeight: '600', color: colors.text },
  email: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: spacing.sm,
    alignItems: 'center',
  },
  statNumber: { fontSize: 20, fontWeight: '700', color: colors.text },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 14, color: colors.text, flex: 1 },
  onText: { color: colors.primaryDark, fontWeight: '700', fontSize: 13 },
  offText: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
  helper: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  input: {
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
    flex: 1,
  },
  flexInput: { flex: 1 },
  primaryBtn: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  choiceRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  choiceBtn: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  choiceBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  choiceTextActive: {
    color: '#fff',
  },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  logoutBtn: {
    borderWidth: 0.5,
    borderColor: colors.danger,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  logoutText: { color: colors.danger, fontWeight: '600', fontSize: 14 },
});
