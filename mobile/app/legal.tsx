import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { LegalMarkdown } from '@/components/LegalMarkdown';
import { Fonts, Layout, Palette, Space, Type } from '@/constants/theme';
import { LEGAL_DOC_KEYS, LEGAL_DOCS, LEGAL_VERSION, type LegalDocKey } from '@/lib/legalText';
import { useSettings } from '@/store/settings';

/**
 * The court's papers — Terms, Privacy, Copyright, Community Guidelines.
 *
 * `/legal` lists them; `/legal?doc=privacy` shows one.
 *
 * Reachable BEFORE sign-in, deliberately, and that is the whole reason the
 * text is bundled (lib/legalText.ts, generated from legal/*.md) rather than
 * fetched: the sign-in screen asks a player to agree to these, and asking
 * someone to agree to a document they cannot open until after they have
 * agreed is not consent. It also means the papers read offline, on a first
 * launch, and on a build whose server is down.
 *
 * Unlike every other screen, this one never redirects a player who is not
 * signed in.
 */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const textScale = useSettings((s) => s.textScale);
  const key = LEGAL_DOC_KEYS.includes(doc as LegalDocKey) ? (doc as LegalDocKey) : null;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.kicker}>THE COURT&apos;S PAPERS · {LEGAL_VERSION}</Text>

          {key ? (
            <LegalMarkdown markdown={LEGAL_DOCS[key].markdown} scale={textScale} />
          ) : (
            <View style={styles.index}>
              <Text style={styles.title}>Legal</Text>
              {LEGAL_DOC_KEYS.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => router.push({ pathname: '/legal', params: { doc: k } })}
                  style={styles.entry}
                  accessibilityRole="link"
                  accessibilityLabel={LEGAL_DOCS[k].title}
                >
                  <Text style={styles.entryText}>{LEGAL_DOCS[k].title}</Text>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button label="Close" onPress={close} variant="primary" />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.bg },
  safe: { flex: 1 },
  content: { padding: 22, gap: Space.lg, paddingBottom: Space.xxxl },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: Type.micro,
    letterSpacing: 2,
    color: Palette.textFaint,
  },
  title: { fontFamily: Fonts.display, fontSize: 28, color: Palette.text, marginBottom: Space.sm },
  index: { gap: 0 },
  entry: {
    minHeight: Layout.touchMin + 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Palette.hairline,
  },
  entryText: { fontFamily: Fonts.ui, fontSize: Type.body, color: Palette.text },
  chevron: { fontFamily: Fonts.ui, fontSize: Type.subhead, color: Palette.textFaint },
  footer: { paddingHorizontal: 22, paddingBottom: 12 },
});
