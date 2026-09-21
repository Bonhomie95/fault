import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Accents, Fonts, Palette, Radius, Space, Type } from '@/constants/theme';
import type { NewsStory } from '@/lib/api';

/**
 * Newspaper pieces, shared by the lobby's front page, the papers screen, the
 * verdict teaser and the "while you were away" report.
 *
 * Paper-coloured on purpose: the news is the one surface in the game that is
 * the city talking rather than the court, and it should look like something
 * printed rather than like the dossier.
 */

export const INK = '#0D0D0D';
export const INK_MUTED = '#5E594E';

/** What kind of story, in the little caps tag above the headline. */
export const KIND_LABEL: Record<NewsStory['kind'], string> = {
  verdict: 'COURT',
  backlash: 'BACKLASH',
  crime: 'CRIME',
  protest: 'PROTEST',
  reform: 'REFORM',
  syndicate: 'SYNDICATE',
  police: 'POLICE',
  economy: 'ECONOMY',
  press: 'PRESS',
  echo: 'PEOPLE',
  city: 'CITY',
};

export const KIND_TINT: Record<NewsStory['kind'], string> = {
  verdict: INK,
  backlash: '#A3321C',
  crime: '#B03A22',
  protest: '#A3321C',
  reform: '#12705C',
  syndicate: '#5B3FA8',
  police: '#23507A',
  economy: '#9A6206',
  press: INK_MUTED,
  echo: INK_MUTED,
  city: INK_MUTED,
};

/** "3h ago", "yesterday", "12 Sep". */
export function when(iso: string): string {
  const t = new Date(iso).getTime();
  const h = (Date.now() - t) / 3_600_000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  if (h < 48) return 'yesterday';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function Story({
  story,
  lead = false,
  withBody = true,
  onPress,
}: {
  story: NewsStory;
  lead?: boolean;
  withBody?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.story, lead && styles.lead]}>
      <View style={styles.tagRow}>
        <Text style={[styles.tag, { color: KIND_TINT[story.kind] ?? INK }]}>
          {KIND_LABEL[story.kind] ?? 'NEWS'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {story.outlet} · {when(story.at)}
        </Text>
        {!story.read && <View style={styles.unread} accessibilityLabel="unread" />}
      </View>
      <Text
        style={[styles.headline, lead || story.severity >= 3 ? styles.headlineBig : null]}
        accessibilityRole="header"
      >
        {story.headline}
      </Text>
      {withBody && <Text style={styles.body}>{story.body}</Text>}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={story.headline}>
      {content}
    </Pressable>
  );
}

export function Masthead({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={styles.masthead}>
      <Text style={styles.mastTitle}>{title.toUpperCase()}</Text>
      <View style={styles.rule} />
      {sub ? <Text style={styles.mastSub}>{sub}</Text> : null}
    </View>
  );
}

export const paper = StyleSheet.create({
  sheet: {
    backgroundColor: Palette.paper,
    borderRadius: Radius.md,
    padding: Space.lg,
    gap: Space.md,
  },
});

const styles = StyleSheet.create({
  story: { gap: 4, paddingVertical: Space.sm },
  lead: { paddingBottom: Space.md },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tag: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.6 },
  meta: { fontFamily: Fonts.mono, fontSize: Type.micro, color: INK_MUTED, flexShrink: 1 },
  unread: { width: 7, height: 7, borderRadius: 4, backgroundColor: Accents.violent },
  headline: {
    fontFamily: Fonts.display,
    fontSize: Type.body + 1,
    lineHeight: (Type.body + 1) * 1.25,
    color: INK,
  },
  headlineBig: { fontSize: Type.subhead + 2, lineHeight: (Type.subhead + 2) * 1.2 },
  body: {
    fontFamily: Fonts.displayRegular,
    fontSize: Type.small,
    lineHeight: Type.small * 1.45,
    color: '#26241F',
  },
  masthead: { alignItems: 'center', gap: 6 },
  mastTitle: {
    fontFamily: Fonts.display,
    fontSize: Type.subhead,
    letterSpacing: 3,
    color: INK,
    textAlign: 'center',
  },
  rule: { height: 1, backgroundColor: INK, alignSelf: 'stretch' },
  mastSub: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 1.6, color: INK_MUTED },
});
