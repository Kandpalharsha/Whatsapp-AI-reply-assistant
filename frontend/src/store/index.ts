import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from '../services/api';
import { whatsAppNotifications } from '../services/whatsAppNotifications';

export interface Message {
  id: string;
  role: 'in' | 'out';
  text: string;
  time: string;
  isAI?: boolean;
  ragContext?: { text: string; similarity: number }[];
}

export interface Contact {
  id: string;
  name: string;
  initials: string;
  color: string;
  preview: string;
  time: string;
  unreadCount: number;
  botEnabled: boolean;
  messagesTrained: number;
}

export interface UserSettings {
  botEnabled: boolean;
  humanDelay: boolean;
  styleCloning: boolean;
  notifications: boolean;
  responseTone: 'casual' | 'formal' | 'friendly' | 'brief';
  genderTone: 'neutral' | 'male' | 'female';
  delayMinSeconds: number;
  delayMaxSeconds: number;
  blacklist: string[];
  trainingContactIds: string[];
}

export interface Stats {
  totalReplied: number;
  totalTrained: number;
  styleMatchPercent: number;
  avgDelaySeconds: number;
  contactsTrained: number;
}

interface AppState {
  user: { id: string; name: string; email: string } | null;
  accessToken: string | null;
  setUser: (user: any, token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadAuth: () => Promise<void>;

  contacts: Contact[];
  setContacts: (raw: any[]) => void;
  updateContact: (id: string, updates: Partial<Contact>) => void;

  messages: Record<string, Message[]>;
  addMessage: (contactId: string, msg: Message) => void;
  setMessages: (contactId: string, msgs: Message[]) => void;

  settings: UserSettings;
  setSettings: (s: Partial<UserSettings>) => void;

  stats: Stats;
  setStats: (s: Partial<Stats>) => void;

  activeContactId: string | null;
  setActiveContact: (id: string | null) => void;

  isGenerating: boolean;
  setGenerating: (v: boolean) => void;
}

const AVATAR_COLORS = [
  '#128c7e',
  '#0d47a1',
  '#6a1b9a',
  '#e65100',
  '#2e7d32',
  '#c62828',
  '#00695c',
  '#283593',
];

function avatarColor(name: string): string {
  let hash = 0;
  for (const c of name)
    hash = (hash * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

const DEFAULT_SETTINGS: UserSettings = {
  botEnabled: true,
  humanDelay: true,
  styleCloning: true,
  notifications: true,
  responseTone: 'casual',
  genderTone: 'neutral',
  delayMinSeconds: 2,
  delayMaxSeconds: 8,
  blacklist: [],
  trainingContactIds: [],
};

export const useStore = create<AppState>(set => ({
  user: null,
  accessToken: null,

  setUser: async (user, token) => {
    await AsyncStorage.setItem('access_token', token);
    await AsyncStorage.setItem('user', JSON.stringify(user));
    await whatsAppNotifications.configureSession(token, BASE_URL).catch(() => {});
    set({ user, accessToken: token });
  },

  logout: async () => {
    await AsyncStorage.multiRemove(['access_token', 'user']);
    await whatsAppNotifications.clearSession().catch(() => {});
    set({ user: null, accessToken: null, contacts: [], messages: {} });
  },

  loadAuth: async () => {
    const token = await AsyncStorage.getItem('access_token');
    const userStr = await AsyncStorage.getItem('user');
    if (token && userStr) {
      await whatsAppNotifications.configureSession(token, BASE_URL).catch(() => {});
      set({ accessToken: token, user: JSON.parse(userStr) });
    }
  },

  contacts: [],
  setContacts: (raw: any[]) => {
    const contacts: Contact[] = raw.map(c => ({
      id: c.id,
      name: c.name,
      initials: initials(c.name),
      color: avatarColor(c.name),
      preview: `${c.messages_trained} messages trained`,
      time: 'now',
      unreadCount: 0,
      botEnabled: c.bot_enabled ?? true,
      messagesTrained: c.messages_trained ?? 0,
    }));
    set({ contacts });
  },

  updateContact: (id, updates) =>
    set(state => ({
      contacts: state.contacts.map(c =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    })),

  messages: {},
  addMessage: (contactId, msg) =>
    set(state => ({
      messages: {
        ...state.messages,
        [contactId]: [...(state.messages[contactId] || []), msg],
      },
    })),

  setMessages: (contactId, msgs) =>
    set(state => ({ messages: { ...state.messages, [contactId]: msgs } })),

  settings: DEFAULT_SETTINGS,
  setSettings: updates =>
    set(state => ({ settings: { ...state.settings, ...updates } })),

  stats: {
    totalReplied: 0,
    totalTrained: 0,
    styleMatchPercent: 0,
    avgDelaySeconds: 0,
    contactsTrained: 0,
  },
  setStats: updates =>
    set(state => ({ stats: { ...state.stats, ...updates } })),

  activeContactId: null,
  setActiveContact: id => set({ activeContactId: id }),

  isGenerating: false,
  setGenerating: v => set({ isGenerating: v }),
}));
