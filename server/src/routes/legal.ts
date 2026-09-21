import { Router, type Response } from 'express';
import { env } from '../lib/env.js';
import { LEGAL_DOC_KEYS, LEGAL_DOCS, LEGAL_VERSION, type LegalDocKey } from '../lib/legalText.js';
import { escapeHtml, markdownToHtml } from '../lib/markdown.js';

/**
 * The legal documents, as public web pages.
 *
 * App Store Connect and Play Console both demand a privacy policy URL before
 * a build can be submitted, and Apple wants the terms reachable too. Until
 * now the server refused to boot in production without those URLs and nothing
 * anywhere served them — so the launch was blocked on hosting four pages
 * somewhere else. They live here now, generated from the same legal/*.md the
 * app bundles (tools/legal/sync.mjs), so the web copy and the in-app copy
 * cannot disagree.
 *
 * Plain server-rendered HTML with one inline stylesheet: no scripts, no
 * external fonts, nothing that can fail to load on a reviewer's phone. The
 * markdown converter escapes everything first (lib/markdown.ts); there is no
 * user input on these routes at all.
 */
export const legalRouter = Router();

const rendered = new Map<LegalDocKey, string>(
  LEGAL_DOC_KEYS.map((key) => [key, markdownToHtml(LEGAL_DOCS[key].markdown)]),
);

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index, follow">
<title>${escapeHtml(title)} · FAULT</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #0B0B0C; color: #F4F2EF;
    font: 16px/1.65 Georgia, 'Times New Roman', serif;
    -webkit-text-size-adjust: 100%;
  }
  main { max-width: 720px; margin: 0 auto; padding: 28px 18px 64px; }
  header { border-bottom: 1px solid #2E2E33; margin-bottom: 24px; padding-bottom: 12px; }
  header a { color: #9A9A96; text-decoration: none; font: 12px/1 ui-monospace, Menlo, monospace; letter-spacing: .2em; }
  h1 { font-size: 30px; line-height: 1.2; margin: 8px 0 4px; }
  h2 { font-size: 20px; margin: 32px 0 8px; }
  h3 { font-size: 17px; margin: 24px 0 6px; }
  p, li { color: #D9D6D0; }
  ul { padding-left: 22px; }
  li { margin: 6px 0; }
  strong { color: #F4F2EF; }
  a { color: #F0A020; }
  .meta { color: #9A9A96; font: 12px/1.5 ui-monospace, Menlo, monospace; margin: 0 0 24px; }
  nav ul { list-style: none; padding: 0; }
  nav li { margin: 0; border-bottom: 1px solid #2E2E33; }
  nav a { display: block; padding: 16px 0; color: #F4F2EF; text-decoration: none; font-size: 18px; }
</style>
</head>
<body><main>
<header><a href="/legal">FAULT · THE COURT&#39;S PAPERS</a></header>
${body}
</main></body>
</html>`;
}

function send(res: Response, html: string) {
  // Public, identical for everyone, and only changes on deploy.
  res.set('Cache-Control', 'public, max-age=3600');
  res.type('html').send(html);
}

const contact = () =>
  env.SUPPORT_EMAIL
    ? `<p class="meta">Contact: <a href="mailto:${escapeHtml(env.SUPPORT_EMAIL)}">${escapeHtml(env.SUPPORT_EMAIL)}</a></p>`
    : '';

legalRouter.get('/', (_req, res) => {
  const items = LEGAL_DOC_KEYS.map(
    (key) => `<li><a href="/legal/${key}">${escapeHtml(LEGAL_DOCS[key].title)}</a></li>`,
  ).join('');
  send(
    res,
    page(
      'Legal',
      `<h1>Legal</h1><p class="meta">Version ${LEGAL_VERSION}</p><nav><ul>${items}</ul></nav>${contact()}`,
    ),
  );
});

legalRouter.get('/:doc', (req, res) => {
  const key = req.params.doc as LegalDocKey;
  const html = LEGAL_DOC_KEYS.includes(key) ? rendered.get(key) : undefined;
  if (!html) {
    res.status(404).type('html').send(page('Not found', '<h1>Not found</h1><p><a href="/legal">All documents</a></p>'));
    return;
  }
  // The version line goes directly under the title, so a player comparing the
  // web copy with the in-app one can see they are reading the same edition.
  const withMeta = html.replace(
    /<\/h1>/,
    `</h1><p class="meta">Version ${LEGAL_VERSION}</p>`,
  );
  send(res, page(LEGAL_DOCS[key].title, withMeta + contact()));
});
