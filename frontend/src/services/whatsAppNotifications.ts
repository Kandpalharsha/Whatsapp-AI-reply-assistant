import { NativeEventEmitter, NativeModules } from 'react-native';

type NativeNotification = {
  key: string;
  packageName: string;
  title: string;
  text: string;
  postTime: number;
  canReply: boolean;
  autoReplyStatus?: string | null;
};

type NativeWhatsAppNotification = {
  openNotificationAccessSettings: () => void;
  isNotificationAccessEnabled: () => Promise<boolean>;
  getCapturedNotifications: () => Promise<NativeNotification[]>;
  configureSession: (accessToken: string, baseUrl: string) => Promise<boolean>;
  clearSession: () => Promise<boolean>;
  sendQuickReply: (notificationKey: string, message: string) => Promise<boolean>;
};

const nativeModule = NativeModules.WhatsAppNotification as NativeWhatsAppNotification | undefined;

export const whatsAppNotifications = {
  isAvailable() {
    return Boolean(nativeModule);
  },
  openSettings() {
    nativeModule?.openNotificationAccessSettings();
  },
  isEnabled() {
    return nativeModule?.isNotificationAccessEnabled() ?? Promise.resolve(false);
  },
  getCapturedNotifications() {
    return nativeModule?.getCapturedNotifications() ?? Promise.resolve([]);
  },
  configureSession(accessToken: string, baseUrl: string) {
    if (!nativeModule) {
      return Promise.resolve(false);
    }
    return nativeModule.configureSession(accessToken, baseUrl);
  },
  clearSession() {
    if (!nativeModule) {
      return Promise.resolve(false);
    }
    return nativeModule.clearSession();
  },
  sendQuickReply(notificationKey: string, message: string) {
    if (!nativeModule) {
      return Promise.reject(new Error('WhatsApp notification module is not available.'));
    }
    return nativeModule.sendQuickReply(notificationKey, message);
  },
  createEmitter() {
    if (!nativeModule) {
      return null;
    }
    return new NativeEventEmitter(NativeModules.WhatsAppNotification);
  },
};

export type WhatsAppPopupNotification = NativeNotification;
