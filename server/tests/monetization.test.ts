import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { splitSigned, verifyWithPem } from '../src/services/adSsv.js';
import { daysBetween } from '../src/services/missions.js';
import { SEED_CASES } from '../src/services/seedCases.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';

after(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

/**
 * The money paths that do not need a database: Google's rewarded-ad
 * signature, the streak-shield day arithmetic, and the Daily Trial's
 * placeless template.
 */

describe('AdMob server-side verification', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const query =
    'ad_network=5450213213286189855&ad_unit=1234567890&custom_data=case&reward_amount=1' +
    '&reward_item=case&timestamp=150777823&transaction_id=12TUVWXYZ&user_id=juror1';
  const signature = sign('sha256', Buffer.from(query), { key: privateKey, dsaEncoding: 'der' }).toString('base64url');
  const raw = `${query}&signature=${signature}&key_id=3335741209`;

  it('verifies exactly the bytes before &signature=', () => {
    const split = splitSigned(raw)!;
    assert.equal(split.message, query);
    assert.equal(split.params.get('key_id'), '3335741209');
    assert.equal(verifyWithPem(split.message, split.params.get('signature')!, pem), true);
  });

  it('refuses a callback someone edited', () => {
    const forged = raw.replace('reward_amount=1', 'reward_amount=9');
    const split = splitSigned(forged)!;
    assert.equal(verifyWithPem(split.message, split.params.get('signature')!, pem), false);
  });

  it('refuses a callback with no signature at all', () => {
    assert.equal(splitSigned(query), null);
  });
});

describe('streak shields', () => {
  it('count whole days across month and year ends', () => {
    assert.equal(daysBetween('2026-09-21', '2026-09-22'), 1);
    assert.equal(daysBetween('2026-12-31', '2027-01-02'), 2);
    assert.equal(daysBetween('2026-03-28', '2026-03-30'), 2); // across a DST change
  });
});

describe('the Daily Trial template', () => {
  it('turns a case’s people and institutions into slots', async () => {
    const { toTemplate } = await import('../src/services/dailyTrial.js');
    const { localizeCase } = await import('../src/services/localizeCase.js');
    const { profileFor } = await import('../src/domain/jurisdiction.js');
    const base = SEED_CASES[0]!;
    // A generated case: real-looking names where the template had slots.
    const generated = localizeCase(base, {
      profile: profileFor('ZZ'),
      district: 'the Capital District',
      court: 'the Capital District District Court',
      policeService: 'the Capital District police service',
      seed: 7,
    });
    const place = {
      country: 'ZZ',
      countryName: 'the country',
      district: 'the Capital District',
      court: 'the Capital District District Court',
      policeService: 'the Capital District police service',
      currency: 'local currency',
      nameRegister: '',
      tier: 'district' as const,
      tierLabel: 'District',
      difficulty: 3,
    };
    const template = toTemplate(generated, place);
    const blob = JSON.stringify(template);
    assert.ok(!blob.includes(generated.defendant.name), 'the defendant kept their name');
    assert.match(template.defendant.name, /\{D_FULL\}/);

    // And back out, somewhere real.
    const oslo = localizeCase(template, {
      profile: profileFor('NO'),
      district: 'Oslo',
      court: 'Oslo tingrett',
      policeService: 'Oslo politidistrikt',
      seed: 99,
    });
    assert.doesNotMatch(JSON.stringify(oslo), /\{[A-Z0-9_]+\}/, 'a slot was left unfilled');
    assert.ok(profileFor('NO').texture.surnames.some((n) => oslo.defendant.name.endsWith(n)));
  });
});
