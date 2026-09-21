import { Redirect } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Actor, TRIAL_EXPRESSIONS } from '@/components/cast/Actor';
import { EYES_PX, HEAD_PX, SPRITE_H, SPRITE_W, SPRITES } from '@/components/cast/sprites';
import { REACTION_NAMES, type Expression } from '@/components/scene2d/expression';
import { Fonts, Palette, Space, Type } from '@/constants/theme';

const PEOPLE = Object.keys(SPRITES);
const FACES: Expression[] = [...TRIAL_EXPRESSIONS, ...REACTION_NAMES];
const LINE = 'I have never seen that ledger before in my life, and you know it.';

/**
 * The cast, on demand — `/dev-suspect`. Development only.
 *
 * Every rendered person in every expression and reaction, talking or not, at
 * the size the defendant tab shows them. The only other way to see a
 * reaction is to play a whole case and wait out the verdict flash, which is a
 * poor loop for judging whether a smirk reads as a smirk.
 *
 * Redirects home outside __DEV__ and is linked from nowhere, so it cannot
 * appear in a release build.
 */
export default function DevSuspect() {
  const [face, setFace] = useState<Expression>('tense');
  const [who, setWho] = useState(PEOPLE[0]!);
  const [talking, setTalking] = useState(false);
  const { width, height } = useWindowDimensions();

  // Redirect rather than render nothing: expo-router still registers this
  // route in a release build, and a deep link to it (fault://dev-…) used to
  // land on a blank black screen with no way out.
  if (!__DEV__) return <Redirect href="/" />;

  const k = (height * 0.16) / HEAD_PX;

  return (
    <View style={styles.root}>
      <View
        style={{
          position: 'absolute',
          left: width / 2 - EYES_PX.x * k,
          top: height * 0.3 - EYES_PX.y * k,
          width: SPRITE_W * k,
          height: SPRITE_H * k,
        }}
      >
        <Actor who={who} expression={face} speaking={talking ? LINE : null} ready={[face]} />
      </View>

      <View style={styles.panel} pointerEvents="box-none">
        <Text style={styles.label}>FACE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {FACES.map((name) => (
            <Pressable key={name} onPress={() => setFace(name)} style={[styles.chip, face === name && styles.chipOn]}>
              <Text style={[styles.chipText, face === name && styles.chipTextOn]}>{name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setTalking((t) => !t)} style={[styles.chip, talking && styles.chipOn]}>
            <Text style={[styles.chipText, talking && styles.chipTextOn]}>talk</Text>
          </Pressable>
        </ScrollView>

        <Text style={styles.label}>PERSON</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {PEOPLE.map((p) => (
            <Pressable key={p} onPress={() => setWho(p)} style={[styles.chip, who === p && styles.chipOn]}>
              <Text style={[styles.chipText, who === p && styles.chipTextOn]}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Space.lg, gap: Space.sm },
  label: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 2, color: Palette.textMuted },
  row: { flexDirection: 'row', gap: Space.sm, paddingBottom: Space.xs },
  chip: { paddingHorizontal: Space.md, paddingVertical: Space.sm, borderWidth: 1, borderColor: Palette.hairline, borderRadius: 2 },
  chipOn: { backgroundColor: '#D4860A', borderColor: '#D4860A' },
  chipText: { fontFamily: Fonts.mono, fontSize: Type.micro, color: Palette.text },
  chipTextOn: { color: Palette.bg },
});
