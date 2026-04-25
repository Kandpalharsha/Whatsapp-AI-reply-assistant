import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from './store';
import LoginScreen from './screens/LoginScreen';
import UploadScreen from './screens/UploadScreen';
import ContactsScreen from './screens/ContactScreen';
import ChatScreen from './screens/ChatScreen';
import SettingsScreen from './screens/SettingsScreen';
import NotificationInboxScreen from './screens/NotificationInboxScreen';
import { colors, spacing } from './utils/theme';

const Stack = createNativeStackNavigator();

type MainTabName = 'Chats' | 'Inbox' | 'Train' | 'Settings';

const TAB_TITLES: Record<MainTabName, string> = {
  Chats: 'WhatsApp AI',
  Inbox: 'Popup Inbox',
  Train: 'Train AI',
  Settings: 'Settings',
};

function MainTabs({ navigation }: any) {
  const [activeTab, setActiveTab] = useState<MainTabName>('Chats');
  const insets = useSafeAreaInsets();

  const screenNavigation = useMemo(
    () => ({
      ...navigation,
      navigate: (name: string, params?: any) => {
        if (name === 'Train' || name === 'Inbox' || name === 'Chats' || name === 'Settings') {
          setActiveTab(name as MainTabName);
          return;
        }

        navigation.navigate(name, params);
      },
      replace: (name: string, params?: any) => {
        if (name === 'MainTabs') {
          setActiveTab('Chats');
          return;
        }

        navigation.replace(name, params);
      },
    }),
    [navigation],
  );

  const renderCurrentScreen = () => {
    switch (activeTab) {
      case 'Inbox':
        return <NotificationInboxScreen navigation={screenNavigation} />;
      case 'Train':
        return <UploadScreen navigation={screenNavigation} />;
      case 'Settings':
        return <SettingsScreen navigation={screenNavigation} />;
      case 'Chats':
      default:
        return <ContactsScreen navigation={screenNavigation} />;
    }
  };

  return (
    <View style={styles.shell}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.headerTitle}>{TAB_TITLES[activeTab]}</Text>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => setActiveTab('Train')}
          activeOpacity={0.85}
        >
          <Text style={styles.headerActionText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>{renderCurrentScreen()}</View>

      <View
        style={[
          styles.tabBar,
          {
            paddingBottom: Math.max(insets.bottom, spacing.md),
          },
        ]}
      >
        {(['Chats', 'Inbox', 'Train', 'Settings'] as MainTabName[]).map(tab => {
          const active = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={styles.tabButton}
              onPress={() => setActiveTab(tab)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const loadAuth = useStore(s => s.loadAuth);
  const user = useStore(s => s.user);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadAuth().finally(() => setReady(true));
  }, [loadAuth]);

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.header },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        {!user ? (
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Upload"
              component={UploadScreen}
              options={{ title: 'Train AI' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Upload"
              component={UploadScreen}
              options={{ title: 'Train AI' }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }: any) => ({
                title: route.params?.contact?.name || 'Chat',
              })}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.header,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerAction: {
    minWidth: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 18,
    backgroundColor: '#18bfd1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionText: {
    color: '#04363d',
    fontSize: 13,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 72,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
});
