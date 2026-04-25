import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { authAPI } from '../services/api';
import { useStore } from '../store';
import { colors, radius, spacing } from '../utils/theme';

export default function LoginScreen({ navigation }: any) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setUser = useStore(s => s.setUser);

  const submit = async () => {
    if (!email.trim() || !password.trim())
      return Alert.alert('Missing fields', 'Please enter email and password');
    if (mode === 'signup' && !name.trim())
      return Alert.alert('Missing fields', 'Please enter your name');
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await authAPI.login(email.trim(), password)
          : await authAPI.signup(name.trim(), email.trim(), password);
      const { access_token, user_id, name: uName, email: uEmail } = res.data;
      await setUser({ id: user_id, name: uName, email: uEmail }, access_token);
      navigation.replace('Upload');
    } catch (e: any) {
      Alert.alert(
        'Error',
        e.response?.data?.detail ||
          'Could not connect. Is the backend running?',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.logoWrap}>
          <Text style={s.logoEmoji}>💬</Text>
        </View>
        <Text style={s.title}>WhatsApp AI Assistant</Text>
        <Text style={s.subtitle}>Replies like you — powered by RAG</Text>

        <View style={s.card}>
          {mode === 'signup' && (
            <TextInput
              style={s.input}
              placeholder="Your name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholderTextColor={colors.textMuted}
            />
          )}
          <TextInput
            style={s.input}
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={s.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity style={s.btn} onPress={submit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>
                {mode === 'login' ? 'Sign in' : 'Create account'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}
          >
            <Text style={s.switchText}>
              {mode === 'login'
                ? "Don't have an account? "
                : 'Already have an account? '}
              <Text style={s.switchLink}>
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={s.hint}>
          Make sure the backend is running on localhost:8000
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoEmoji: { fontSize: 36 },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  input: {
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  switchText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  switchLink: { color: colors.primary, fontWeight: '500' },
  hint: {
    marginTop: spacing.xl,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
