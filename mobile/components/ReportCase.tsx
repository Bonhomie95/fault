import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Fonts, Layout, Palette, Space, Type } from '@/constants/theme';
import { api, ApiError } from '@/lib/api';

/**
 * Telling the court a case is wrong.
 *
 * Two reasons this exists, and the second is the one that matters.
 *
 * App Store Guideline 1.2 requires a reporting mechanism for user-generated
 * content, and the juror names on the public registry are that.
 *
 * The bigger reason is the docket. This game asks a language model to write
 * criminal accusations against invented people, sets them in named real
 * jurisdictions, and ships them to a player without a human ever reading them.
 * The system prompt is careful and there is a content filter over the result.
 * Neither is a guarantee. Eventually a case will name someone real, or land
 * somewhere genuinely harmful — and when it does, the only thing that will
 * matter is whether there was a way for the player to say so.
 *
 * A reported case is withheld from the docket immediately, before any human
 * looks at it. The cost of being wrong is one case nobody sees.
 */

const REASONS = [
  { key: 'real_person', label: 'This names a real person' },
  { key: 'harmful_content', label: 'This content is harmful' },
  { key: 'broken_case', label: 'This case does not make sense' },
  { key: 'other', label: 'Something else' },
] as const;

type Reason = (typeof REASONS)[number]['key'];

export function ReportCase({
  caseId,
  onClose,
  onReported,
}: {
  caseId: string;
  onClose: () => void;
  /**
   * Called once a report is filed and acknowledged.
   *
   * Separate from onClose because the outcomes differ: cancelling returns you
   * to the case you were reading, while filing has WITHDRAWN that case from
   * the docket server-side. Leaving the player on a dossier the court has
   * taken back — clock still running, verdict buttons still live — would be
   * worse than not letting them report at all.
   */
  onReported: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (reason: Reason) => {
      if (sending) return;
      setSending(true);
      setError(null);
      try {
        const res = await api.report({ kind: 'case', subjectId: caseId, reason });
        setDone(res.message);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'The report could not be filed.');
        setSending(false);
      }
    },
    [caseId, sending],
  );

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.root}>
      <View style={styles.card}>
        {done ? (
          <>
            <Text style={styles.kicker}>FILED</Text>
            <Text style={styles.body}>{done}</Text>
            <Text style={styles.body}>
              This case has been withdrawn from your docket while it is reviewed.
            </Text>
            <Pressable
              onPress={onReported}
              style={styles.button}
              accessibilityRole="button"
              accessibilityLabel="Return to the docket"
              hitSlop={8}
            >
              <Text style={styles.buttonText}>BACK TO THE DOCKET</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.kicker}>REPORT THIS CASE</Text>
            <Text style={styles.body}>
              These files are generated. If something in this one is wrong, the court would rather
              know.
            </Text>

            {REASONS.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => send(r.key)}
                disabled={sending}
                style={styles.reason}
                accessibilityRole="button"
                accessibilityLabel={r.label}
                accessibilityState={{ disabled: sending }}
                hitSlop={4}
              >
                <Text style={styles.reasonText}>{r.label}</Text>
              </Pressable>
            ))}

            {error && <Text style={styles.error}>{error}</Text>}

            <Pressable
              onPress={onClose}
              disabled={sending}
              style={styles.button}
              accessibilityRole="button"
              accessibilityLabel="Never mind, go back to the case"
              hitSlop={8}
            >
              <Text style={styles.buttonText}>NEVER MIND</Text>
            </Pressable>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,9,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
    zIndex: 30,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: Palette.hairline,
    backgroundColor: Palette.surface,
    borderRadius: 4,
    padding: Space.xl,
    gap: Space.md,
  },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2,
    color: Palette.textMuted,
  },
  body: {
    fontFamily: Fonts.mono,
    fontSize: Type.small,
    lineHeight: 21,
    color: Palette.textMuted,
  },
  reason: {
    minHeight: Layout.touchMin,
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    borderWidth: 1,
    borderColor: Palette.hairline,
    borderRadius: 4,
  },
  reasonText: {
    fontFamily: Fonts.ui,
    fontSize: Type.small,
    color: Palette.text,
  },
  button: {
    marginTop: Space.xs,
    minHeight: Layout.touchMin,
    borderWidth: 1,
    borderColor: Palette.hairlineBright,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: Fonts.uiBold,
    fontSize: Type.label,
    letterSpacing: 2,
    color: Palette.text,
  },
  error: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    color: '#E04E2E',
  },
});
