import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Fonts, Palette, Radius, Space, Type } from '@/constants/theme';
import type { ClientCase, Speaker } from '@/lib/api';
import type { Utterance } from '@/lib/courtroom';

/**
 * What was just said in the room, and who said it.
 *
 * Always attributed. An unattributed line in a courtroom is a rumour, and the
 * player has to be able to weigh WHO is pulling at them — the accused, a
 * witness, counsel — because that is most of what a line is worth.
 *
 * In voice-only mode the words stay off the screen and the attribution stays
 * on: the player still needs to know whose voice that was.
 *
 * It sits as a subtitle above the verdict buttons, and grows upward — the
 * dossier behind it scrolls, the face above it never moves.
 */
const CHAR_MS = 34;

export function speakerLabel(c: ClientCase, s: Speaker): { name: string; role: string } {
  switch (s) {
    case 'defendant':
      return { name: c.defendant.name, role: 'THE ACCUSED' };
    case 'witness1':
    case 'witness2': {
      const w = c.witnesses[s === 'witness1' ? 0 : 1];
      return { name: w?.name ?? 'Witness', role: (w?.role || 'WITNESS').toUpperCase() };
    }
    case 'prosecution':
      return { name: 'Prosecution', role: 'FOR THE STATE' };
    case 'defence':
      return { name: 'Defence', role: 'COUNSEL FOR THE ACCUSED' };
  }
}

export function CourtSpeech({
  activeCase,
  utterance,
  accent,
  showText,
  reducedMotion,
}: {
  activeCase: ClientCase;
  utterance: Utterance | null;
  accent: string;
  showText: boolean;
  reducedMotion: boolean;
}) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!utterance) return;
    if (reducedMotion || !showText) {
      setShown(utterance.text.length);
      return;
    }
    setShown(0);
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= utterance.text.length) clearInterval(id);
    }, CHAR_MS);
    return () => clearInterval(id);
  }, [utterance, reducedMotion, showText]);

  return (
    <View style={styles.wrap} pointerEvents="none">
      {utterance && (
        <Animated.View
          key={utterance.id}
          entering={reducedMotion ? undefined : FadeIn.duration(180)}
          exiting={reducedMotion ? undefined : FadeOut.duration(220)}
          style={[
            styles.bubble,
            { borderColor: accent + '77' },
            utterance.speaker === 'defendant' && { borderLeftColor: accent, borderLeftWidth: 3 },
          ]}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${speakerLabel(activeCase, utterance.speaker).name}: ${utterance.text}`}
        >
          <View style={styles.head}>
            <Text style={[styles.name, { color: accent }]} numberOfLines={1}>
              {speakerLabel(activeCase, utterance.speaker).name.toUpperCase()}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {speakerLabel(activeCase, utterance.speaker).role}
            </Text>
          </View>
          {showText ? (
            <Text style={styles.text}>
              {utterance.text.slice(0, shown)}
              {/* The rest, invisible, so the bubble is its final size from
                  the first letter rather than growing under the player. */}
              <Text style={styles.ghost}>{utterance.text.slice(shown)}</Text>
            </Text>
          ) : (
            <Text style={styles.speaking}>speaking…</Text>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Space.md,
  },
  bubble: {
    maxWidth: 360,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(18,18,20,0.9)',
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm + 2,
    gap: 4,
  },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: {
    fontFamily: Fonts.monoBold,
    fontSize: Type.micro,
    letterSpacing: 1.3,
    flexShrink: 1,
  },
  role: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 1.1,
    color: Palette.textFaint,
    flexShrink: 1,
  },
  text: {
    fontFamily: Fonts.displayRegular,
    fontSize: Type.body,
    lineHeight: Type.body * 1.3,
    color: Palette.text,
  },
  ghost: { color: 'transparent' },
  speaking: {
    fontFamily: Fonts.mono,
    fontSize: Type.small,
    color: Palette.textMuted,
  },
});
