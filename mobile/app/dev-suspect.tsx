import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AccusedReaction } from '@/components/scene2d/AccusedReaction';
import { REACTION_NAMES, type ReactionName } from '@/components/scene2d/expression';
import { ARCHETYPES, archetypeFor, seedForArchetype } from '@/components/suspect/archetypes';
import { Fonts, Palette, Space, Type } from '@/constants/theme';

/**
 * The accused, on demand — `/dev-suspect`. Development only.
 *
 * The reaction only happens after a verdict, which means the only way to see
 * one in the real game is to play a whole case and then wait out a two-second
 * flash. That is a poor loop for judging whether a smirk reads as a smirk, and
 * an impossible one for checking all six archetypes against all five
 * reactions. This shows any combination immediately.
 *
 * Returns nothing outside __DEV__ and is linked from nowhere, so it cannot
 * appear in a release build.
 */
export default function DevSuspect() {
  const [reaction, setReaction] = useState<ReactionName>('smirk');
  const [seed, setSeed] = useState(4);

  if (!__DEV__) return null;

  return (
    <View style={styles.root}>
      <AccusedReaction seed={seed} appearance={50} reaction={reaction} reducedMotion />

      <View style={styles.panel} pointerEvents="box-none">
        <Text style={styles.label}>REACTION</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {REACTION_NAMES.map((name) => (
            <Pressable key={name} onPress={() => setReaction(name)} style={[styles.chip, reaction === name && styles.chipOn]}>
              <Text style={[styles.chipText, reaction === name && styles.chipTextOn]}>{name}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>ARCHETYPE · seed {seed}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {/* Which archetype a seed produces is a hash of it, not an index —
              see archetypeFor — so the chips carry seeds that land on each. */}
          {ARCHETYPES.map((a) => {
            const on = archetypeFor(seed).name === a.name;
            return (
              <Pressable key={a.name} onPress={() => setSeed(seedForArchetype(a.name))} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{a.name}</Text>
              </Pressable>
            );
          })}
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
