import { Fragment, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { Fonts, Palette, Space, Type } from '@/constants/theme';

/**
 * Just enough Markdown to read the legal documents.
 *
 * The documents in legal/ are written with headings, paragraphs, bullet
 * lists, bold and italic, and nothing else — the sync script bundles them
 * as strings (lib/legalText.ts). A Markdown library would add a dependency
 * and a WebView or a parser the size of this screen for six constructs, and
 * the text must render before sign-in, offline, on the first launch.
 *
 * Links are shown as their text. Nothing in these documents needs to open a
 * browser, and a policy that navigates away mid-read is a worse policy.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

function parse(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ kind: 'list', items: list });
    list = [];
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]! });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]!);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    if (list.length && /^\s+/.test(raw)) {
      list[list.length - 1] += ' ' + line.trim();
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** **bold**, *italic*, and [text](url) shown as its text. */
function Inline({ text, style }: { text: string; style: StyleProp<TextStyle> }) {
  const parts = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g)
    .filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <Text key={i} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <Text key={i} style={styles.italic}>
            {part.slice(1, -1)}
          </Text>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </Text>
  );
}

export function LegalMarkdown({ markdown, scale = 1 }: { markdown: string; scale?: number }) {
  const blocks = useMemo(() => parse(markdown), [markdown]);
  const body = { fontSize: Type.small * scale, lineHeight: 22 * scale };

  return (
    <View style={styles.root}>
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          const style =
            block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3;
          return (
            <Text key={i} style={style} accessibilityRole="header">
              {block.text.replace(/\*\*/g, '')}
            </Text>
          );
        }
        if (block.kind === 'list') {
          return (
            <View key={i} style={styles.list}>
              {block.items.map((item, j) => (
                <View key={j} style={styles.item}>
                  <Text style={[styles.bullet, body]}>•</Text>
                  <Inline text={item} style={[styles.text, body, styles.itemText]} />
                </View>
              ))}
            </View>
          );
        }
        return <Inline key={i} text={block.text} style={[styles.text, body]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Space.md },
  h1: { fontFamily: Fonts.display, fontSize: Type.heading, color: Palette.text, marginBottom: Space.xs },
  h2: { fontFamily: Fonts.display, fontSize: Type.subhead, color: Palette.text, marginTop: Space.lg },
  h3: { fontFamily: Fonts.uiBold, fontSize: Type.body, color: Palette.text, marginTop: Space.md },
  text: { fontFamily: Fonts.ui, color: Palette.textMuted },
  bold: { fontFamily: Fonts.uiBold, color: Palette.text },
  italic: { fontStyle: 'italic' },
  list: { gap: Space.sm },
  item: { flexDirection: 'row', gap: Space.sm, paddingRight: Space.sm },
  bullet: { fontFamily: Fonts.ui, color: Palette.textFaint },
  itemText: { flex: 1 },
});
