import { useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { DictationWave } from './DictationWave';
import { PillButton } from './PillButton';

type Props = {
  /** `YYYY-MM-DD` day being edited, or null when closed. */
  date: string | null;
  onClose: () => void;
};

/** Add or edit the dream for one day. Text entry, or dictate it with live STT. */
export function DreamEditorModal({ date, onClose }: Props) {
  const { getByDate, upsert, remove } = useDreams();
  const [text, setText] = useState('');
  // Instant tap feedback: start() is async (permission → socket), so reflect the
  // intent immediately instead of leaving the button dead until isListening flips.
  const [starting, setStarting] = useState(false);
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
      setStarting(true);
      try {
        await stt.start();
      } finally {
        setStarting(false);
      }
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

  // Only offer Delete when the day already has a saved entry (not for drafts).
  const hasSavedEntry = date !== null && getByDate(date) !== undefined;

  function deleteEntry() {
    confirmDestructive('Delete this dream?', 'This removes the entry for this day.', async () => {
      if (stt.isListening) await stt.stop();
      if (date) remove(date);
      onClose();
    });
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
            {hasSavedEntry ? (
              <Pressable
                onPress={deleteEntry}
                hitSlop={12}
                accessibilityLabel="Delete this dream"
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}>
                <TrashIcon color={theme.colors.danger} />
              </Pressable>
            ) : null}
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

          {stt.error ? <Text style={styles.error}>{stt.error.message}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              onPress={toggleDictation}
              disabled={starting}
              style={({ pressed }) => [
                styles.mic,
                (dictating || starting) && styles.micActive,
                pressed && styles.micPressed,
              ]}>
              <DictationWave level={stt.inputLevel} active={dictating} />
              <Text style={[styles.micLabel, (dictating || starting) && styles.micLabelActive]}>
                {starting ? 'Starting…' : dictating ? 'Tap to stop' : 'Dictate'}
              </Text>
            </Pressable>
            <PillButton label="Save" onPress={save} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A drawn trash can — handle, lid, and a slatted body — in the app's no-icon-font style. */
function TrashIcon({ color }: { color: string }) {
  return (
    <View style={styles.trash}>
      <View style={[styles.trashHandle, { backgroundColor: color }]} />
      <View style={[styles.trashLid, { backgroundColor: color }]} />
      <View style={[styles.trashBody, { borderColor: color }]}>
        <View style={[styles.trashSlat, { backgroundColor: color }]} />
        <View style={[styles.trashSlat, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

/**
 * Confirm-then-run for a destructive action. Alert.alert is a no-op on
 * react-native-web, so the web build falls back to window.confirm.
 */
function confirmDestructive(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ]);
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
  title: { color: theme.colors.text, fontSize: 19, fontWeight: '700', letterSpacing: 0.2 },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  close: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' },
  deleteBtn: { marginRight: 18 },
  trash: { alignItems: 'center' },
  trashHandle: { width: 6, height: 2, borderRadius: 1, marginBottom: 1 },
  trashLid: { width: 15, height: 2, borderRadius: 1 },
  trashBody: {
    width: 11,
    height: 11,
    marginTop: 1.5,
    borderWidth: 1.5,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 3.5,
    borderBottomRightRadius: 3.5,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 2,
  },
  trashSlat: { width: 1.5, height: 4.5, borderRadius: 1 },
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
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 15,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
  micPressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  micLabel: { color: theme.colors.textMuted, fontWeight: '600', fontSize: 15 },
  micLabelActive: { color: theme.colors.accent },
});
