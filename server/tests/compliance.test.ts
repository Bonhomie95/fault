import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import request from 'supertest';

/**
 * The launch-compliance surface: the things a store reviewer checks and a
 * regulator can ask about, as opposed to the things a player notices.
 *
 *   - guest accounts, the only door into a release build without Apple or
 *     Google, and the one piece of new auth code in this set
 *   - consent to the Terms and Privacy Policy, recorded per version
 *   - the data export (GDPR access/portability)
 *   - the public legal pages, and that they match legal/*.md
 *   - rewarded ads refusing to pay on the client's word
 *   - juror names being reportable
 *
 * Same database and environment as routes.test.ts. Every juror made here is
 * tracked by id and deleted afterwards; guest subjects are hashes, so there
 * is no name prefix to scope a cleanup by.
 */

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://bonhomie@localhost:5432/fault_test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-secret-that-is-comfortably-long-enough-for-hs256-signing';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.GROQ_API_KEY = '';
process.env.GROQ_API_KEYS = '';
for (const k of Object.keys(process.env)) if (/^GROQ_API_KEY_\d+$/.test(k)) delete process.env[k];
process.env.DISABLE_RATE_LIMITS = 'true';

const { app } = await import('../src/app.js');
const { prisma } = await import('../src/lib/prisma.js');
const { redis } = await import('../src/lib/redis.js');
const { env } = await import('../src/lib/env.js');
const { LEGAL_DOCS, LEGAL_VERSION } = await import('../src/lib/legalText.js');
const { escapeHtml, markdownToHtml } = await import('../src/lib/markdown.js');
const { guestSubject } = await import('../src/services/auth.js');

const server = app.listen(0);
server.unref();
const api = () => request(server);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

const created = new Set<string>();

after(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { id: { in: [...created] } } });
  await prisma.$disconnect();
  redis.disconnect();
});

/** What lib/auth.ts on the phone generates: 32 random bytes, base64url. */
const newSecret = () => randomBytes(32).toString('base64url');

async function guest(secret = newSecret(), extra: Record<string, unknown> = {}) {
  const res = await api()
    .post('/api/auth/sign-in')
    .send({ provider: 'guest', token: secret, jurorName: 'Guest Juror', country: 'NO', ...extra });
  if (res.body?.userId) created.add(res.body.userId);
  return res;
}

describe('guest accounts', () => {
  it('swears in a new guest, and the same secret signs back into the same juror', async () => {
    const secret = newSecret();
    const first = await guest(secret, { consentVersion: LEGAL_VERSION });
    assert.equal(first.status, 201, JSON.stringify(first.body));

    const again = await api().post('/api/auth/sign-in').send({ provider: 'guest', token: secret });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.userId, first.body.userId);
    assert.equal(again.body.returning, true);
  });

  it('stores only a hash of the secret, never the secret itself', async () => {
    const secret = newSecret();
    const res = await guest(secret);
    assert.equal(res.status, 201);

    const identities = await prisma.authIdentity.findMany({ where: { userId: res.body.userId } });
    assert.equal(identities.length, 1);
    assert.equal(identities[0]!.subject, guestSubject(secret));
    assert.ok(!identities[0]!.subject.includes(secret), 'the raw secret reached the database');
  });

  it('gives a different secret a different juror', async () => {
    const a = await guest();
    const b = await guest();
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.notEqual(a.body.userId, b.body.userId);
  });

  it('refuses a secret too short to be the 256 bits the app generates', async () => {
    for (const token of ['short', 'a'.repeat(42), 'z'.repeat(64), `${newSecret()}!`]) {
      const res = await api()
        .post('/api/auth/sign-in')
        .send({ provider: 'guest', token, jurorName: 'Weak Secret', country: 'NO' });
      assert.equal(res.status, 401, `accepted guest secret ${JSON.stringify(token)}`);
    }
  });

  it('cannot be reached through the dev device bypass by naming its stored subject', async () => {
    const secret = newSecret();
    const res = await guest(secret);
    assert.equal(res.status, 201);

    // The dev bypass trusts any id it is handed. Handed a guest's stored
    // subject, it must refuse rather than open that guest's account.
    const hijack = await api()
      .post('/api/auth/sign-in')
      .send({ provider: 'device', token: guestSubject(secret) });
    assert.equal(hijack.status, 401);
  });

  it('is refused when ALLOW_GUEST_AUTH is off', async () => {
    const was = env.ALLOW_GUEST_AUTH;
    env.ALLOW_GUEST_AUTH = false;
    try {
      const res = await guest();
      assert.equal(res.status, 401);
    } finally {
      env.ALLOW_GUEST_AUTH = was;
    }
  });
});

describe('consent to the terms', () => {
  it('records consent sent with sign-in, when it is the current version', async () => {
    const res = await guest(newSecret(), { consentVersion: LEGAL_VERSION });
    assert.equal(res.status, 201);
    assert.equal(res.body.consentRequired, false);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: res.body.userId } });
    assert.equal(user.consentVersion, LEGAL_VERSION);
    assert.ok(user.consentedAt);

    const me = await api().get('/api/session/me').set(auth(res.body.accessToken));
    assert.equal(me.body.consentRequired, false);
    assert.equal(me.body.legalVersion, LEGAL_VERSION);
  });

  it('does not record an outdated version as consent to the current one', async () => {
    const res = await guest(newSecret(), { consentVersion: '1999-01-01' });
    assert.equal(res.status, 201);
    assert.equal(res.body.consentRequired, true);
  });

  it('asks an existing juror without consent, and accepts it once, by version', async () => {
    const res = await guest();
    assert.equal(res.status, 201);
    const token = res.body.accessToken as string;

    const me = await api().get('/api/session/me').set(auth(token));
    assert.equal(me.body.consentRequired, true);

    const stale = await api().post('/api/session/consent').set(auth(token)).send({ version: '1999-01-01' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.legalVersion, LEGAL_VERSION);

    const ok = await api().post('/api/session/consent').set(auth(token)).send({ version: LEGAL_VERSION });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    const after = await api().get('/api/session/me').set(auth(token));
    assert.equal(after.body.consentRequired, false);
  });

  it('requires a juror', async () => {
    const res = await api().post('/api/session/consent').send({ version: LEGAL_VERSION });
    assert.equal(res.status, 401);
  });
});

describe('data export', () => {
  it('returns the juror’s own record, and no credentials', async () => {
    const res = await guest(newSecret(), { consentVersion: LEGAL_VERSION });
    const { accessToken, userId } = res.body as { accessToken: string; userId: string };

    // Something on the record to export.
    await prisma.user.update({ where: { id: userId }, data: { appleRefreshToken: 'r.secret-apple-token' } });
    await prisma.newsItem.create({
      data: { userId, outlet: 'The Oslo Herald', kind: 'city', headline: 'Quiet week', body: 'Nothing happened.' },
    });

    const exp = await api().get('/api/session/export').set(auth(accessToken));
    assert.equal(exp.status, 200, JSON.stringify(exp.body));
    assert.match(String(exp.headers['content-disposition']), /attachment/);

    assert.equal(exp.body.profile.userId, userId);
    assert.equal(exp.body.profile.jurorName, 'Guest Juror');
    assert.equal(exp.body.profile.consentVersion, LEGAL_VERSION);
    assert.deepEqual(exp.body.signInMethods.map((m: { provider: string }) => m.provider), ['guest']);
    for (const key of ['casesHeard', 'missions', 'meritLedger', 'entitlements', 'purchases', 'news']) {
      assert.ok(Array.isArray(exp.body[key]), `${key} missing from export`);
    }
    assert.equal(exp.body.news[0].headline, 'Quiet week');

    const text = JSON.stringify(exp.body);
    assert.ok(!text.includes('r.secret-apple-token'), 'the Apple refresh token leaked into the export');
    assert.ok(!text.includes('guest:'), 'the guest subject hash leaked into the export');
  });

  it('requires a juror', async () => {
    const res = await api().get('/api/session/export');
    assert.equal(res.status, 401);
  });
});

describe('account deletion with an Apple token on file', () => {
  it('deletes the juror even though revocation is not configured', async () => {
    const res = await guest();
    const { accessToken, userId } = res.body as { accessToken: string; userId: string };
    await prisma.user.update({ where: { id: userId }, data: { appleRefreshToken: 'r.never-revocable-here' } });

    const del = await api().delete('/api/session/me').set(auth(accessToken));
    assert.equal(del.status, 200);
    assert.equal(await prisma.user.count({ where: { id: userId } }), 0);
  });
});

describe('the legal pages', () => {
  const legalDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'legal');

  it('serves every document as HTML, with its title and the current version', async () => {
    for (const key of ['terms', 'privacy', 'dmca', 'community'] as const) {
      const res = await api().get(`/legal/${key}`);
      assert.equal(res.status, 200, key);
      assert.match(String(res.headers['content-type']), /text\/html/);
      assert.ok(res.text.includes(escapeHtml(LEGAL_DOCS[key].title)), `${key} is missing its title`);
      assert.ok(res.text.includes(LEGAL_VERSION), `${key} is missing the version`);
      assert.ok(res.text.includes('name="viewport"'), `${key} is not mobile-friendly`);
    }
  });

  it('lists them at /legal and 404s anything else', async () => {
    const index = await api().get('/legal');
    assert.equal(index.status, 200);
    assert.ok(index.text.includes('/legal/privacy'));

    const missing = await api().get('/legal/constructor');
    assert.equal(missing.status, 404);
  });

  it('says the things the stores and the design depend on it saying', () => {
    assert.match(LEGAL_DOCS.terms.markdown, /13 years old/);
    assert.match(LEGAL_DOCS.terms.markdown, /no cash value/);
    assert.match(LEGAL_DOCS.terms.markdown, /fictional/);
    assert.match(LEGAL_DOCS.privacy.markdown, /Groq/);
    assert.match(LEGAL_DOCS.privacy.markdown, /coordinates are never sent/);
    assert.match(LEGAL_DOCS.dmca.markdown, /\[AGENT NAME \/ EMAIL\]/);
  });

  it('matches legal/*.md — tools/legal/sync.mjs was re-run after the last edit', () => {
    const version = readFileSync(join(legalDir, 'VERSION'), 'utf8').trim();
    assert.equal(LEGAL_VERSION, version, 'legal/VERSION moved; run node tools/legal/sync.mjs');
    for (const key of ['terms', 'privacy', 'dmca', 'community'] as const) {
      const source = readFileSync(join(legalDir, `${key}.md`), 'utf8')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\r\n/g, '\n')
        .trim();
      assert.equal(
        LEGAL_DOCS[key].markdown.trim(),
        source,
        `legal/${key}.md changed; run node tools/legal/sync.mjs`,
      );
    }
  });
});

describe('the markdown converter', () => {
  it('escapes HTML rather than passing it through', () => {
    const html = markdownToHtml('# Title <script>alert(1)</script>\n\nA <b>bold</b> & "quoted" line.');
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<b>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&amp;'));
  });

  it('renders the constructs the documents use', () => {
    const html = markdownToHtml('## Head\n\nSome **bold** and *italic*.\n\n- one\n- two');
    assert.ok(html.includes('<h2>Head</h2>'));
    assert.ok(html.includes('<strong>bold</strong>'));
    assert.ok(html.includes('<em>italic</em>'));
    assert.ok(html.includes('<ul><li>one</li><li>two</li></ul>'));
  });

  it('links only to https, mailto and site paths', () => {
    assert.ok(markdownToHtml('[ok](https://example.com)').includes('<a href="https://example.com">'));
    assert.ok(markdownToHtml('[mail](mailto:a@b.c)').includes('<a href="mailto:a@b.c">'));
    assert.ok(markdownToHtml('[here](/legal/terms)').includes('<a href="/legal/terms">'));
    assert.ok(!markdownToHtml('[x](javascript:alert(1))').includes('<a '));
    assert.ok(!markdownToHtml('[x](//evil.example)').includes('<a '));
    assert.ok(!markdownToHtml('[x](http://plain.example)').includes('<a '));
  });
});

describe('rewarded ads', () => {
  it('will not pay Merit on the client’s word while server verification is off', async () => {
    const res = await guest();
    const token = res.body.accessToken as string;

    const claim = await api().post('/api/store/ad-reward').set(auth(token)).send({ viewId: 'view-123456' });
    assert.equal(claim.status, 404);

    const shelf = await api().get('/api/store').set(auth(token));
    assert.equal(shelf.body.rewardedAdsLeft, 0);

    const ads = await api().get('/api/store/ads').set(auth(token));
    assert.equal(ads.body.rewardedAvailable, false);
  });
});

describe('reporting a juror name', () => {
  it('files a report against another juror, with the name as it was', async () => {
    const reporter = await guest();
    const subject = await guest(newSecret(), { jurorName: 'Rude Name' });

    const res = await api()
      .post('/api/report')
      .set(auth(reporter.body.accessToken))
      .send({ kind: 'juror_name', subjectId: subject.body.userId, reason: 'offensive_name' });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const report = await prisma.contentReport.findUniqueOrThrow({ where: { id: res.body.reference } });
    assert.equal(report.kind, 'juror_name');
    assert.match(report.detail ?? '', /Rude Name/);
    await prisma.contentReport.delete({ where: { id: report.id } });
  });

  it('refuses a report about nobody, and a report about yourself', async () => {
    const reporter = await guest();
    const token = reporter.body.accessToken as string;

    const nobody = await api()
      .post('/api/report')
      .set(auth(token))
      .send({ kind: 'juror_name', subjectId: 'c-no-such-juror', reason: 'offensive_name' });
    assert.equal(nobody.status, 404);

    const self = await api()
      .post('/api/report')
      .set(auth(token))
      .send({ kind: 'juror_name', subjectId: reporter.body.userId, reason: 'offensive_name' });
    assert.equal(self.status, 400);
  });
});
