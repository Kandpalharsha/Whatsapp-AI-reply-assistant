import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  NativeModules,
  Platform,
} from 'react-native';
import { chatAPI } from '../services/api';
import { BASE_URL } from '../services/api';
import { useStore } from '../store';
import { colors, radius, spacing } from '../utils/theme';

const STEPS = ['Parse', 'Embed', 'Index', 'Store', 'Ready'];

type PickedFile = {
  uri: string;
  name: string;
  type?: string;
  text?: string;
};

type AndroidFilePickerModule = {
  pickTextFile: () => Promise<PickedFile>;
};

const picker = NativeModules.AndroidFilePicker as AndroidFilePickerModule | undefined;

function getErrorMessage(error: any): string {
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
    if (error.message === 'Network Error') {
      return `Could not reach the local backend at ${BASE_URL}. Make sure the FastAPI server is running and the Android app has been reloaded after the API URL change.`;
    }
    return error.message;
  }

  return 'Could not upload the selected WhatsApp export.';
}

export default function UploadScreen({ navigation }: any) {
  const [yourName, setYourName] = useState('');
  const [contactName, setContactName] = useState('');
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [loading, setLoading] = useState(false);
  const setContacts = useStore(s => s.setContacts);

  const animatePipeline = (): Promise<void> =>
    new Promise(resolve => {
      let i = 0;
      const tick = () => {
        setActiveStep(i++);
        if (i < STEPS.length) {
          setTimeout(tick, 500);
        } else {
          setTimeout(resolve, 400);
        }
      };
      tick();
    });

  const chooseFile = async () => {
    if (Platform.OS !== 'android' || !picker?.pickTextFile) {
      Alert.alert('Not available', 'File picker is only wired for Android right now.');
      return;
    }

    try {
      const file = await picker.pickTextFile();
      setPickedFile(file);
    } catch (e: any) {
      if (e?.code !== 'PICKER_CANCELLED') {
        Alert.alert('File picker error', e?.message || 'Could not open the file picker.');
      }
    }
  };

  const upload = async () => {
    if (!yourName.trim() || !contactName.trim() || !pickedFile?.text) {
      return Alert.alert(
        'Missing info',
        'Fill in your name, contact name, and select the exported chat file.',
      );
    }

    setLoading(true);
    setActiveStep(0);

    try {
      const [, res] = await Promise.all([
        animatePipeline(),
        chatAPI.uploadChat({
          fileName: pickedFile.name || 'chat.txt',
          rawText: pickedFile.text,
          yourName: yourName.trim(),
          contactName: contactName.trim(),
        }),
      ]);

      const contactsRes = await chatAPI.getContacts();
      setContacts(contactsRes.data);

      Alert.alert(
        'Training complete',
        `${res.data.messages_embedded} reply examples added from ${contactName}. You can train on more chats and use them across non-blacklisted WhatsApp chats.`,
        [{ text: 'Open chats', onPress: () => navigation.replace('MainTabs') }],
      );
    } catch (e: any) {
      setActiveStep(-1);
      Alert.alert(
        'Upload failed',
        getErrorMessage(e),
      );
    } finally {
      setLoading(false);
    }
  };

  const skip = async () => {
    try {
      const r = await chatAPI.getContacts();
      setContacts(r.data);
    } catch {}

    navigation.replace('MainTabs');
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={s.sectionTitle}>Step 1 - Your name</Text>
      <Text style={s.hint}>Exactly as it appears in the WhatsApp export.</Text>
      <TextInput
        style={s.input}
        value={yourName}
        onChangeText={setYourName}
        placeholder="e.g. Harsha Kandpal"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={s.sectionTitle}>Step 2 - Training chat name</Text>
      <TextInput
        style={s.input}
        value={contactName}
        onChangeText={setContactName}
        placeholder="e.g. Best Friend or Office Group"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={s.sectionTitle}>Step 3 - WhatsApp export file</Text>
      <Text style={s.hint}>
        Tap below and pick one exported WhatsApp `.txt` file. You can repeat this with more chats to build your style from a few examples instead of every conversation.
      </Text>

      <TouchableOpacity style={s.dropZone} onPress={chooseFile} activeOpacity={0.85}>
        <Text style={s.dropIcon}>Select file</Text>
        <Text style={s.dropTitle}>
          {pickedFile?.name || 'Choose WhatsApp export file'}
        </Text>
        <Text style={s.dropHint}>
          {pickedFile?.text
            ? 'File selected and ready to upload'
            : 'Only .txt files are supported'}
        </Text>
      </TouchableOpacity>

      {activeStep >= 0 && (
        <View style={s.pipeline}>
          {STEPS.map((label, i) => (
            <View key={label} style={[s.pipeStep, i <= activeStep && s.pipeActive]}>
              <Text style={[s.pipeNum, i <= activeStep && s.pipeNumActive]}>
                {i + 1}
              </Text>
              <Text style={s.pipeLabel}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={s.btnPrimary} onPress={upload} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.btnPrimaryText}>Start training</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={s.btnSecondary} onPress={skip}>
        <Text style={s.btnSecondaryText}>Skip - already have contacts</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  input: {
    width: '100%',
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
    marginBottom: 4,
  },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  dropIcon: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
    color: colors.primary,
  },
  dropTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  dropHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  pipeline: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  pipeStep: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderRightWidth: 0.5,
    borderRightColor: colors.border,
  },
  pipeActive: { backgroundColor: colors.primaryLight },
  pipeNum: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
  pipeNumActive: { color: colors.primary },
  pipeLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  btnSecondary: {
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  btnSecondaryText: { color: colors.textSecondary, fontSize: 14 },
});
