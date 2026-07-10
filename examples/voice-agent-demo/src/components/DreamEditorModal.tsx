import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useStreamingTranscription } from 'expo-assemblyai';

import { streamingToken } from '../config';
import { useDreams } from '../context/DreamsContext';
import { theme } from '../theme';
import { formatLong, relativeLabel } from '../types';
import { PillButton } from './PillButton';

type Props = {
  /** `YYYY-MM-DD` day being edited, or null when closed. */
  date: string | null;
  onClose: () => void;
};

/** Add or edit the dream for one day. Text entry, or dictate it with live STT. */
export function DreamEditorModal({ date, onClose }: Props) {
  const { getByDate, upsert } = useDreams();
  const [text, setText] = useState('');
  const baseRef = useRef('');

  const stt = useStreamingTranscription({ token: streamingToken, formatTurns: true });

  // Load the existing entry each time the modal opens on a new day.
  useEffect(() => {
    if (date) setText(getByDate(date)?.text ?? '');
  }, [date, getByDate]);

  const dictating = stt.isListening;
  const liveText = dictating
    ? [baseRef.current, stt.transcript, stt.partialTranscript]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ')
    : text;

  async function toggleDictation() {
    if (stt.isListening) {
      setText(
        [baseRef.current, stt.transcript, stt.partialTranscript]
          .map((s) => s.trim())
          .filter(Boolean)
          .join(' ')
      );
      await stt.stop();
    } else {
      baseRef.current = text;
      await stt.start();
    }
  }

  async function close() {
    if (stt.isListening) await stt.stop();
    onClose();
  }

  async function save() {
    const value = dictating ? liveText : text;
    if (stt.isListening) await stt.stop();
    if (date) upsert(date, value);
    onClose();
  }

  return (
    <Modal visible={date !== null} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{date ? formatLong(date) : ''}</Text>
              {date && relativeLabel(date) ? (
                <Text style={styles.subtitle}>{relativeLabel(date)}</Text>
              ) : null}
            </View>
            <Pressable onPress={close} hitSlop={12}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.inputWrap} keyboardShouldPersistTaps="handled">
            <TextInput
              style={styles.input}
              value={liveText}
              onChangeText={setText}
              editable={!dictating}
              multiline
              placeholder="What did you dream about? Type it, or tap the mic to speak."
              placeholderTextColor={theme.colors.textMuted}
              textAlignVertical="top"
            />
          </ScrollView>

          {stt.error ? <Text style={styles.error}>⚠️ {stt.error.message}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={toggleDictation}
              style={[styles.mic, dictating && styles.micActive]}>
              <Text style={[styles.micLabel, dictating && styles.micLabelActive]}>
                {dictating ? '● Listening… tap to stop' : '🎙  Dictate'}
              </Text>
            </Pressable>
            <PillButton label="Save" onPress={save} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: {
    color: theme.colors.cyan,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  close: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' },
  inputWrap: { maxHeight: 320 },
  input: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 25,
    minHeight: 160,
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.md,
    padding: 14,
  },
  error: { color: theme.colors.danger, marginTop: 8 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  mic: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  micActive: { borderColor: theme.colors.pink, backgroundColor: 'rgba(243,42,145,0.12)' },
  micLabel: { color: theme.colors.textMuted, fontWeight: '700', fontSize: 15 },
  micLabelActive: { color: theme.colors.pink },
});
