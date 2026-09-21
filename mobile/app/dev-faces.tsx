import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';
import { StandaloneFace } from '@/components/scene2d/CourtroomScene';
import { EXPRESSIONS, REACTION_NAMES } from '@/components/scene2d/expression';
import { Fonts, Palette, Type } from '@/constants/theme';

/**
 * A contact sheet of faces. Development only — `/dev-faces`.
 *
 * The faces are only ever seen inside a running trial, and a trial is a
 * two-minute clock that ends in a hung verdict and takes the defendant away.
 * That makes the one screen where the drawing actually matters — the defendant
 * tab, where the camera fills the display with a face — the most expensive
 * place in the app to look at one. This renders a spread of seeds across the
 * appearance axis, at the size the defendant tab uses, and stays put.
 *
 * It is not linked from anywhere and redirects home outside __DEV__, so it
 * cannot appear in a release build. Delete the file if it stops earning its
 * place.
 */
const SEEDS = [3, 7, 11, 19, 23, 31, 44, 57, 68, 79, 88, 97];
const APPEARANCE = [18, 50, 82];

export default function DevFaces() {
  // Redirect rather than render nothing: expo-router still registers this
  // route in a release build, and a deep link to it (fault://dev-…) used to
  // land on a blank black screen with no way out.
  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>REACTIONS · after the gavel</Text>
      {/* The five verdict-screen faces on one person, because the only thing
          that matters about them is whether they can be told apart. A smirk
          that reads as relief means letting a guilty defendant go costs the
          player nothing. */}
      <View style={styles.reactionRow}>
        {REACTION_NAMES.map((name) => (
          <View key={name} style={styles.cell}>
            <Svg width={112} height={140} viewBox="-56 -70 112 140">
              <StandaloneFace seed={11} appearance={50} r={42} expr={EXPRESSIONS[name]} />
            </Svg>
            <Text style={styles.caption}>{name}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.title}>FACES · seed × appearance</Text>
      {SEEDS.map((seed) => (
        <View key={seed} style={styles.row}>
          {APPEARANCE.map((a) => (
            <View key={a} style={styles.cell}>
              <Svg width={104} height={132} viewBox="-52 -66 104 132">
                <StandaloneFace seed={seed} appearance={a} r={40} />
              </Svg>
              <Text style={styles.caption}>{`${seed}·${a}`}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  content: { padding: 16, paddingBottom: 48 },
  title: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2,
    color: Palette.textMuted,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', marginBottom: 24 },
  cell: { alignItems: 'center' },
  caption: { fontFamily: Fonts.mono, fontSize: Type.micro, color: Palette.textMuted },
});
