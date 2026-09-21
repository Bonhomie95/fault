/**
 * A deliberately tiny Markdown-to-HTML converter, for the legal pages only.
 *
 * Why not `marked`: the input here is four documents we wrote ourselves, and
 * they use six constructs — headings, paragraphs, bullet lists, bold, italic
 * and links. A full CommonMark parser is a dependency to audit and keep
 * patched in exchange for features the documents do not use, and its default
 * behaviour is to pass raw HTML straight through, which is the one thing a
 * converter on a public route must never do.
 *
 * The safety property is simple and total: EVERY character of source text is
 * HTML-escaped before any markup is produced, so nothing in a document can
 * become a tag or an attribute. Links are the only construct that emits an
 * attribute, and their targets are restricted to https:, mailto: and
 * site-relative paths — a `javascript:` URL renders as plain text.
 *
 * There is no user input anywhere near this. The rigour is for the day
 * somebody pastes a policy from a word processor into legal/ and it arrives
 * full of angle brackets.
 */

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const SAFE_HREF = /^(https:\/\/|mailto:|\/(?!\/))/i;

/** Inline constructs, applied to text that has ALREADY been escaped. */
function inline(escaped: string): string {
  return (
    escaped
      // [text](href) — href is escaped text too, so it cannot close the attribute.
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, href: string) =>
        SAFE_HREF.test(href) ? `<a href="${href}">${text}</a>` : whole,
      )
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  );
}

export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(escapeHtml(paragraph.join(' ')))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list.length) {
      out.push(`<ul>${list.map((li) => `<li>${inline(escapeHtml(li))}</li>`).join('')}</ul>`);
    }
    list = [];
  };

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();

    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]!.length;
      out.push(`<h${level}>${inline(escapeHtml(heading[2]!))}</h${level}>`);
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

    // A continuation line of a bullet belongs to that bullet.
    if (list.length && /^\s+/.test(raw)) {
      list[list.length - 1] += ' ' + line.trim();
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return out.join('\n');
}

export { escapeHtml };
