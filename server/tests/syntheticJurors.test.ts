import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COUNTRIES, profileFor } from '../src/domain/jurisdiction.js';
import { cityVerdict, peaceIndex } from '../src/domain/peace.js';
import { _internals, SYNTHETIC_POOL } from '../src/services/syntheticJurors.js';

const { cityFor, nameFor, weightedCountry, rng, humped } = _internals;

/**
 * House jurors exist so a new player does not open the World tab and find it
 * empty. That only works if they survive a second look, so these test the
 * things that would give them away rather than that the code runs.
 */
describe('house jurors', () => {
  it('name people from one naming tradition, not two', () => {
    // The whole point of the registers: a Yoruba given name on an Igbo surname
    // reads wrong to anyone Nigerian, and a board full of them reads as
    // generated.
    const ng = profileFor('NG');
    const regs = ng.texture.registers!;
    for (let i = 0; i < 300; i++) {
      const name = nameFor(ng, rng(`name:${i}`));
      const [given, ...rest] = name.split(' ');
      const surname = rest.join(' ');
      const home = regs.find((r) => r.surnames.includes(surname));
      assert.ok(home, `${name}: surname ${surname} belongs to no register`);
      assert.ok(
        home!.given.includes(given!),
        `${name}: ${given} is not a ${home!.label} given name`,
      );
    }
  });

  it('name people in every country it can seed from', () => {
    for (let i = 0; i < 400; i++) {
      const code = weightedCountry(rng(`country:${i}`));
      assert.ok(COUNTRIES[code], `weighted a country that does not exist: ${code}`);
      const name = nameFor(profileFor(code), rng(`n:${i}`));
      assert.match(name, /^\S+ \S/, `${code} produced a name of one word: "${name}"`);
    }
  });

  it('build cities whose six dials agree with one another', () => {
    // A city with rampant organised crime and spotless police is a
    // contradiction, and six independent draws produce it constantly.
    let contradictions = 0;
    for (let i = 0; i < 600; i++) {
      const roll = rng(`city:${i}`);
      const c = cityFor(humped(roll), roll);
      if (c.organizedCrimePower > 70 && c.policeIntegrity > 70) contradictions++;
      if (c.crimeRate > 75 && c.judicialTrust > 75) contradictions++;
      for (const [k, v] of Object.entries(c)) {
        assert.ok(v >= 0 && v <= 100, `${k} out of range: ${v}`);
      }
    }
    assert.equal(contradictions, 0, `${contradictions} cities contradict themselves`);
  });

  it('cluster in the middle rather than spreading flat', () => {
    // A flat spread of peace indices is the single most obvious tell: real
    // populations bunch, and a board with as many utopias as slums is not one.
    const bands = new Map<string, number>();
    const n = 1200;
    for (let i = 0; i < n; i++) {
      const roll = rng(`dist:${i}`);
      const v = cityVerdict(peaceIndex(cityFor(humped(roll), roll)));
      bands.set(v, (bands.get(v) ?? 0) + 1);
    }
    const extremes = (bands.get('At peace') ?? 0) + (bands.get('Ungovernable') ?? 0);
    const middle = (bands.get('Strained') ?? 0) + (bands.get('Troubled') ?? 0);
    assert.ok(middle > n * 0.5, `only ${middle}/${n} cities are mid-range`);
    assert.ok(extremes < n * 0.1, `${extremes}/${n} cities are at an extreme — too flat`);
    assert.ok(extremes > 0, 'no city reaches either end — the board has no top');
  });

  it('are deterministic, so seeding twice does not invent a second population', () => {
    const once = nameFor(profileFor('NG'), rng('house:7'));
    const twice = nameFor(profileFor('NG'), rng('house:7'));
    assert.equal(once, twice);
  });

  it('seeds a pool big enough to look inhabited', () => {
    assert.ok(SYNTHETIC_POOL >= 200, `${SYNTHETIC_POOL} jurors is still an empty room`);
  });
});
