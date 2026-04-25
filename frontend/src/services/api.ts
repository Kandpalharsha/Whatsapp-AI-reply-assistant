import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Production backend URL. If Render gives you a different hostname,
// update only this line and rebuild the app.
export const BASE_URL = 'https://whatsapp-ai-reply-assistant-api.onrender.com';

const api = axios.create({ baseURL: BASE_URL, timeout: 30000 });

api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  res => res,
  async err => {
    if (err.response?.status === 401) {
      await AsyncStorage.multiRemove(['access_token', 'user']);
    }
    return Promise.reject(err);
  },
);

export const authAPI = {
  signup: (name: string, email: string, password: string) =>
    api.post('/auth/signup', { name, email, password }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
};

type UploadChatPayload = {
  fileName: string;
  rawText: string;
  yourName: string;
  contactName: string;
};

export const chatAPI = {
  uploadChat: async ({
    fileName,
    rawText,
    yourName,
    contactName,
  }: UploadChatPayload) => {
    return api.post('/chat/upload-text', {
      file_name: fileName,
      raw_text: rawText,
      your_name: yourName,
      contact_name: contactName,
    });
  },
  getContacts: () => api.get('/chat/contacts'),
  toggleContactBot: (contactId: string, enabled: boolean) =>
    api.patch(`/chat/contacts/${contactId}/bot?enabled=${enabled}`),
};

export const replyAPI = {
  generate: (
    contactId: string | null,
    message: string,
    history: any[],
    contactName?: string,
  ) =>
    api.post('/reply/generate', {
      contact_id: contactId,
      contact_name: contactName,
      incoming_message: message,
      conversation_history: history,
    }),
  getStats: () => api.get('/reply/stats'),
};

export const settingsAPI = {
  get: () => api.get('/settings/'),
  update: (updates: Record<string, any>) => api.patch('/settings/', updates),
  addBlacklist: (contact: string) =>
    api.post(`/settings/blacklist/${encodeURIComponent(contact)}`),
  removeBlacklist: (contact: string) =>
    api.delete(`/settings/blacklist/${encodeURIComponent(contact)}`),
};

export default api;
