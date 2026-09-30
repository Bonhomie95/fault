import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Enter } from '@/components/Enter';
import { Elevation, Fonts, IMPACT_LEADING, Palette, Radius, Space, Type } from '@/constants/theme';
import { useGame } from '@/store/game';

/**
 * Chambers — the juror's own room.
 *
 * These four entries used to be the tail of the docket: four links under the
 * day's cases, the Daily Trial, the offers and the City Pulse, found only by
 * scrolling past everything a player came to the docket for. Two of them are
 * rank-locked, so for a new juror the reward for scrolling that far was two
 * greyed-out buttons.
 *
 * They are a room now, and the locks say what opens them rather than only
 * that they are shut.
 */
export default function Juror() {
  /**
   * The tab bar sits over the bottom of this screen.
   *
   * The padding below was a fixed number chosen before there WAS a tab bar,
   * and the bar is 60pt plus the home-indicator inset — about 94 on a modern
   * phone. So the last card on every tab was sliced in half by it. This is the
   * measured height rather than another guess, so it is right on a phone with
   * a home indicator, one with a bezel, and an iPad.
   */
  const tabBar = useBottomTabBarHeight();
  const standing = useGame((s) => s.standing);
  const city = useGame((s) => s.city);

  const archiveOpen = standing?.unlocks.caseArchive ?? false;
  const recordOpen = standing?.unlocks.jurorRecord ?? false;
  const heard = city?.casesHeard ?? standing?.casesHeard ?? 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabBar + 24 }]}>
        <Text style={styles.title}>CHAMBERS</Text>

        {standing && (
          <Enter style={styles.card}>
            <Text style={styles.name}>{standing.jurorName}</Text>
            <Text style={styles.meta}>
              {standing.rankTitle} · {standing.tierLabel}
            </Text>
            <View style={styles.rule} />
            <Text style={styles.meta}>{standing.court}</Text>
            <Text style={styles.metaFaint}>
              {standing.district} · STANDING {standing.trust} · {standing.trustLabel.toUpperCase()}
            </Text>
          </Enter>
        )}

        <View style={styles.links}>
          <Enter index={1}>
            <Button
              label="Juror record"
              onPress={() => router.push('/record')}
              variant="secondary"
              disabled={!recordOpen}
              hint={recordOpen ? 'What the court has learned about how you judge' : `Opens at 10 cases · ${heard}/10 heard`}
              icon="bar-chart-2"
            />
          </Enter>
          <Enter index={2}>
            <Button
              label="Past cases"
              onPress={() => router.push('/archive')}
              variant="secondary"
              disabled={!archiveOpen}
              hint={archiveOpen ? 'Every case you have heard' : 'Opens to jurors of rank 2'}
              icon="archive"
            />
          </Enter>
          <Enter index={3}>
            <Button
              label="The Clerk’s Office"
              onPress={() => router.push('/store')}
              variant="secondary"
              hint="Dockets, courtrooms and Merit"
              icon="shopping-bag"
            />
          </Enter>
          <Enter index={4}>
            <Button
              label="Settings"
              onPress={() => router.push('/settings')}
              variant="secondary"
              hint="Sound, text size, privacy and your account"
              icon="sliders"
            />
          </Enter>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  scroll: { padding: Space.xl, paddingBottom: Space.xxl, gap: Space.xl },
  title: {
    fontFamily: Fonts.impact,
    fontSize: Type.hero,
    lineHeight: Type.hero * IMPACT_LEADING,
    color: Palette.text,
  },
  card: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Palette.hairline,
    padding: Space.lg,
    gap: 6,
    ...Elevation.raised,
  },
  name: { fontFamily: Fonts.display, fontSize: Type.heading, color: Palette.text },
  meta: { fontFamily: Fonts.mono, fontSize: Type.small, color: Palette.textMuted },
  metaFaint: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 1.2, color: Palette.textFaint },
  rule: { height: 1, backgroundColor: Palette.hairline, marginVertical: Space.sm },
  links: { gap: Space.sm },
});
