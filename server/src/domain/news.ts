import type { NewsKind } from '@prisma/client';
import type { CityMetrics } from './city.js';

/**
 * The papers.
 *
 * A verdict moves the city's six dials, and until now it moved them silently:
 * a player could convict a syndicate lieutenant, watch "Syndicate" tick up two
 * points on a bar, and never learn that a warehouse burned for it. This is the
 * layer that turns dials into a city — the court report the morning after,
 * the backlash, the robberies when crime climbs, the crowd outside the court
 * when trust falls, the quiet week when it all holds.
 *
 * Deterministic templates rather than the model, deliberately. News is written
 * on every verdict and on every tick of the city clock; that volume on Groq
 * would spend the daily token budget the CASES need, and a template cannot
 * hallucinate a detail that contradicts the file. Variety comes from breadth:
 * every kind has many headlines, and every slot draws from the player's own
 * country texture — their neighbourhoods, their market, their currency.
 *
 * NOTHING HERE KNOWS WHETHER A VERDICT WAS RIGHT. The court report says what
 * the jury decided; the fallout follows the dials, and the dials follow the
 * verdict's SHAPE (convicting the wealthy, acquitting against strong evidence)
 * as the city perceives it. Whether the defendant actually did it arrives
 * later, at the review, and only there.
 */

export interface NewsContext {
  district: string;
  court: string;
  police: string;
  neighbourhoods: string[];
  market: string;
  transportJob: string;
  money: { small: string; mid: string; large: string; huge: string };
  factions: string[];
}

export interface Story {
  kind: NewsKind;
  outlet: string;
  headline: string;
  body: string;
  severity: 1 | 2 | 3;
}

/** A small seeded roller, so a test can pin the output. */
export type Roll = () => number;

function pick<T>(xs: readonly T[], roll: Roll): T {
  return xs[Math.floor(roll() * xs.length) % xs.length]!;
}

/**
 * The mastheads of a district. The Herald is the paper of record.
 *
 * All INVENTED, for the reason domain/jurisdiction gives for the Herald:
 * courts are public institutions and may be depicted; a newspaper is a
 * private company, and printing made-up stories under a real masthead is
 * defamatory. "Daily Mirror" and "<city> FM" are real, or plausibly real,
 * somewhere — these names were chosen to be nobody's.
 */
export function outletsFor(district: string) {
  const plain = district.replace(/[^A-Za-z]/g, '');
  return {
    herald: `The ${district} Herald`,
    radio: `Nightline ${district}`,
    tabloid: `The ${district} Clarion`,
    ledger: `The Bench & Ledger`,
    social: `#${plain}Talks`,
    tribune: `The Commons`,
  };
}

function fill(t: string, s: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => s[k] ?? k);
}

function slots(ctx: NewsContext, roll: Roll, extra: Record<string, string> = {}) {
  return {
    district: ctx.district,
    court: ctx.court,
    police: ctx.police,
    hood: pick(ctx.neighbourhoods.length ? ctx.neighbourhoods : [ctx.district], roll),
    hood2: pick(ctx.neighbourhoods.length ? ctx.neighbourhoods : [ctx.district], roll),
    market: ctx.market,
    job: ctx.transportJob,
    small: ctx.money.small,
    mid: ctx.money.mid,
    large: ctx.money.large,
    huge: ctx.money.huge,
    faction: pick(ctx.factions.length ? ctx.factions : ['the Syndicate'], roll),
    n: String(2 + Math.floor(roll() * 9)),
    pct: String(4 + Math.floor(roll() * 19)),
    ...extra,
  };
}

/* ------------------------------------------------------------------ *
 * The court report — the morning after every verdict.
 * ------------------------------------------------------------------ */

export interface VerdictFacts {
  defendant: string;
  charge: string;
  occupation: string;
  verdict: 'guilty' | 'not_guilty';
  wasHung: boolean;
  /** A line someone said in court, for the reporter to quote. */
  quote?: { speaker: string; text: string } | null;
}

const CONVICT_HEAD = [
  '{defendant} convicted of {charge}',
  'Guilty: jury convicts {defendant}',
  '{occupation} found guilty in {court}',
  '{defendant} taken into custody after guilty verdict',
  'Jury returns guilty verdict against {defendant}',
];
const ACQUIT_HEAD = [
  '{defendant} walks free',
  'Not guilty: {defendant} cleared of {charge}',
  'Jury acquits {occupation} in {court}',
  '{defendant} leaves {court} a free {person}',
  'Acquittal for {defendant} as jury rejects prosecution case',
];
const HUNG_HEAD = [
  'Clock runs out on {defendant} jury',
  'No verdict: {defendant} case decided by default',
  'Deadlock in {court} as time expires on {defendant}',
];
const CONVICT_BODY = [
  'The jury in {court} took under two minutes to convict {defendant}, {occupationLower}, of {chargeLower}. Sentencing is expected within the week.',
  '{defendant} was led from the dock after the verdict. Supporters in the public gallery were asked to leave.',
  'Prosecutors called the verdict "a message to {district}". The defence said it would consider an appeal.',
];
const ACQUIT_BODY = [
  '{defendant}, {occupationLower}, was cleared of {chargeLower} in {court}. Outside, relatives embraced on the steps.',
  'The prosecution declined to comment after the jury rejected its case against {defendant}.',
  '{defendant} left by a side door. "I just want to go home," the defence said on the {person}\'s behalf.',
];
const HUNG_BODY = [
  'With no verdict delivered in time, the court recorded the case as hung. Legal observers called it "a failure of the room, not the evidence".',
  'The juror\'s time expired before a decision. The case against {defendant} was closed by default, satisfying no one.',
];

export function courtReport(ctx: NewsContext, f: VerdictFacts, roll: Roll): Story {
  const o = outletsFor(ctx.district);
  const s = slots(ctx, roll, {
    defendant: f.defendant,
    charge: f.charge.toLowerCase(),
    chargeLower: f.charge.toLowerCase(),
    occupation: capitalise(f.occupation.split(',')[0]!.trim()),
    occupationLower: lowerFirst(f.occupation.split(',')[0]!.trim()),
    person: 'defendant',
  });
  const head = f.wasHung ? HUNG_HEAD : f.verdict === 'guilty' ? CONVICT_HEAD : ACQUIT_HEAD;
  const body = f.wasHung ? HUNG_BODY : f.verdict === 'guilty' ? CONVICT_BODY : ACQUIT_BODY;
  let text = fill(pick(body, roll), s);
  if (f.quote && f.quote.text.length < 140) {
    text += ` Earlier, ${f.quote.speaker} had told the court: “${f.quote.text.replace(/[“”"]/g, '')}”`;
  }
  return {
    kind: 'verdict',
    outlet: o.herald,
    headline: fill(pick(head, roll), s),
    body: text,
    severity: 2,
  };
}

/* ------------------------------------------------------------------ *
 * Fallout — what the verdict's shape does to the city.
 * ------------------------------------------------------------------ */

/**
 * The shapes the MORNING PAPERS react to — and note which are missing.
 *
 * cityEffects also distinguishes convicting on weak evidence and acquitting
 * against strong evidence, because the city's dials should feel that. The
 * papers must not say it. Evidence strength is hidden from the player, and a
 * headline the morning after — "Legal experts query evidence" — would tell
 * them they got it wrong, which is the review's job, delivered later and in
 * aggregate. So those two are read here as a plain conviction or acquittal
 * (see newsShapeFor) and their cost shows up only through the dials, mixed in
 * with everything else the city does.
 */
type EffectShape =
  | 'convict_wealthy'
  | 'acquit_poor'
  | 'hung_verdict'
  | 'convict_organised_crime'
  | 'acquit_organised_crime'
  | 'standard_convict'
  | 'standard_acquit';

/** A city effect, as the press may see it. Strips anything evidence-derived. */
export function newsShapeFor(effectKey: string): EffectShape {
  if (effectKey === 'convict_weak_evidence') return 'standard_convict';
  if (effectKey === 'acquit_strong_evidence') return 'standard_acquit';
  return effectKey as EffectShape;
}

interface Template {
  kind: NewsKind;
  outlet: keyof ReturnType<typeof outletsFor>;
  head: string;
  body: string;
  severity: 1 | 2 | 3;
}

const FALLOUT: Record<EffectShape, Template[]> = {
  convict_wealthy: [
    { kind: 'economy', outlet: 'ledger', severity: 2, head: 'Business leaders warn of "witch hunt" after {defendant} verdict', body: 'Three firms in {district} have paused hiring, citing "legal uncertainty". Traders at {market} called the verdict overdue.' },
    { kind: 'reform', outlet: 'tribune', severity: 1, head: '"Nobody is above it": {hood} residents cheer conviction', body: 'A small crowd gathered outside {court}. One held a sign reading "FINALLY".' },
    { kind: 'press', outlet: 'tabloid', severity: 2, head: 'THE FALL OF {defendantUpper}', body: 'From boardroom to dock in eleven months. Friends say {defendant} "never believed it would come to this".' },
  ],
  acquit_poor: [
    { kind: 'reform', outlet: 'tribune', severity: 1, head: 'Legal aid groups hail {defendant} acquittal', body: '"The poor are tried more often and believed less," said a volunteer lawyer in {hood}. "Not today."' },
    { kind: 'police', outlet: 'radio', severity: 1, head: '{police} questioned over {defendant} arrest', body: 'Callers to {outlet_radio} asked why the case reached court at all.' },
  ],
  hung_verdict: [
    { kind: 'press', outlet: 'herald', severity: 2, head: 'Opinion: a jury that cannot decide is a court that cannot govern', body: 'Another case in {court} has run out of time. The city notices, the Herald writes, even when the jury does not.' },
    { kind: 'backlash', outlet: 'social', severity: 1, head: '"They couldn\'t even decide": anger over hung case', body: 'Replies to the court\'s announcement were closed after an hour.' },
  ],
  convict_organised_crime: [
    { kind: 'syndicate', outlet: 'radio', severity: 3, head: 'Warehouse fire in {hood} hours after syndicate conviction', body: 'Firefighters were called at 3am. Police would not say whether the blaze was linked to the {defendant} verdict. Nobody was hurt.' },
    { kind: 'police', outlet: 'herald', severity: 2, head: '{police} raid follows guilty verdict', body: 'Officers seized {mid} in cash from a property in {hood2}. "The verdict gave us room to move," a source said.' },
    { kind: 'syndicate', outlet: 'tabloid', severity: 2, head: 'Threats against jury after {defendant} convicted', body: 'The court has increased security. A spokesperson said the juror\'s identity "remains protected".' },
  ],
  acquit_organised_crime: [
    { kind: 'syndicate', outlet: 'radio', severity: 3, head: '{faction} "emboldened" after acquittal, traders say', body: 'Stall-holders at {market} report new "protection fees" of up to {small} a month. None would give their names.' },
    { kind: 'crime', outlet: 'herald', severity: 2, head: 'Extortion complaints rise in {hood}', body: 'Reports to {police} are up {pct}% this month. Officers declined to link the rise to any single case.' },
  ],
  standard_convict: [
    { kind: 'police', outlet: 'radio', severity: 1, head: '{police} welcomes "swift justice" in {defendant} case', body: 'A spokesperson thanked the jury and said the arresting officers "did their job".' },
    { kind: 'city', outlet: 'social', severity: 1, head: 'Mixed reaction in {hood} to {defendant} verdict', body: 'Some neighbours called it fair. Others said the sentence will "fall on the family, not the crime".' },
  ],
  standard_acquit: [
    { kind: 'city', outlet: 'social', severity: 1, head: '{defendant} home to {hood} after acquittal', body: 'Neighbours brought food. "We knew," one said. Others were less sure.' },
    { kind: 'press', outlet: 'herald', severity: 1, head: 'Prosecution reviews approach after {defendant} loss', body: 'The prosecutor\'s office said it "respects the jury" and would "learn from the file".' },
  ],
};

export function falloutFor(
  ctx: NewsContext,
  shape: string,
  f: VerdictFacts,
  roll: Roll,
): Story | null {
  const list = FALLOUT[newsShapeFor(shape)];
  if (!list || !list.length) return null;
  const t = pick(list, roll);
  const o = outletsFor(ctx.district);
  const s = slots(ctx, roll, {
    defendant: f.defendant,
    defendantUpper: f.defendant.toUpperCase(),
    defendantHash: f.defendant.split(/\s+/)[0]!.replace(/[^A-Za-z]/g, ''),
    outlet_radio: o.radio,
  });
  return { kind: t.kind, outlet: o[t.outlet], headline: fill(t.head, s), body: fill(t.body, s), severity: t.severity };
}

/* ------------------------------------------------------------------ *
 * The city on its own — what the dials make happen, verdict or not.
 * ------------------------------------------------------------------ */

interface Condition {
  when: (c: CityMetrics) => number; // 0..1 likelihood weight
  stories: Template[];
  /** How the event itself pushes the dials. The city is not only reported; it moves. */
  deltas?: Partial<CityMetrics>;
}

const CONDITIONS: Condition[] = [
  {
    when: (c) => clamp01((c.crimeRate - 50) / 30),
    deltas: { crimeRate: 1, judicialTrust: -1 },
    stories: [
      { kind: 'crime', outlet: 'radio', severity: 3, head: 'Armed robbers hit {market} traders', body: 'Four men on motorbikes took cash and phones from {n} stalls just before closing. {police} say inquiries are ongoing.' },
      { kind: 'crime', outlet: 'herald', severity: 2, head: 'Spate of break-ins across {hood}', body: '{n} homes were burgled in a single week. Residents have begun organising night watches.' },
      { kind: 'crime', outlet: 'tabloid', severity: 2, head: '{job} robbed at knifepoint in {hood2}', body: 'The driver lost a day\'s takings — about {small}. "Nobody helped," he said.' },
      { kind: 'crime', outlet: 'social', severity: 1, head: 'Phone snatchings reported near {market}', body: 'Several users posted warnings. {police} advised shoppers to "stay alert".' },
    ],
  },
  {
    when: (c) => clamp01((c.organizedCrimePower - 55) / 30),
    deltas: { organizedCrimePower: 1, policeIntegrity: -1 },
    stories: [
      { kind: 'syndicate', outlet: 'radio', severity: 3, head: '{faction} tightens grip on {hood} transport routes', body: 'Drivers say a new "levy" is collected at dawn. Refusers have had windscreens smashed.' },
      { kind: 'syndicate', outlet: 'herald', severity: 2, head: 'Shipment worth {large} vanishes from depot', body: 'Customs officials called it "an inside job". No arrests have been made.' },
      { kind: 'syndicate', outlet: 'tabloid', severity: 2, head: 'WHO RUNS {hoodUpper}?', body: 'Residents describe a "second government" that settles disputes, collects fees, and asks for loyalty.' },
    ],
  },
  {
    when: (c) => clamp01((40 - c.judicialTrust) / 25),
    deltas: { mediaPressure: 1 },
    stories: [
      { kind: 'protest', outlet: 'tribune', severity: 3, head: '"No justice, no peace": crowds gather at {court}', body: 'Hundreds blocked the road for two hours. Speakers accused the courts of "deciding by the clock".' },
      { kind: 'protest', outlet: 'social', severity: 2, head: 'Petition to "audit the jury system" passes {n}0,000 signatures', body: 'The organisers want every verdict of the past year reviewed.' },
      { kind: 'backlash', outlet: 'herald', severity: 2, head: 'Poll: trust in {district} courts at record low', body: 'Only one in {n} residents say they would trust a jury with their own case.' },
    ],
  },
  {
    when: (c) => clamp01((40 - c.policeIntegrity) / 25),
    deltas: { judicialTrust: -1 },
    stories: [
      { kind: 'police', outlet: 'herald', severity: 3, head: 'Officers suspended over missing evidence', body: '{police} confirmed {n} officers are under investigation after exhibits "went missing between the station and the court".' },
      { kind: 'police', outlet: 'radio', severity: 2, head: 'Checkpoint "fees" anger {job}s', body: 'Drivers say unofficial roadside payments have doubled. {police} denies any policy.' },
    ],
  },
  {
    when: (c) => clamp01((c.mediaPressure - 60) / 30),
    stories: [
      { kind: 'press', outlet: 'tabloid', severity: 2, head: 'WHO IS JUROR NINE?', body: 'The Mirror has learned the anonymous juror behind the city\'s most talked-about verdicts has sat {n} cases this month. The court refused to comment.' },
      { kind: 'press', outlet: 'radio', severity: 1, head: 'Phone-in: "Would you want this juror on your case?"', body: 'Lines were jammed for an hour. Opinion split almost exactly down the middle.' },
    ],
  },
  {
    when: (c) => clamp01((c.wealthDisparity - 60) / 30),
    deltas: { crimeRate: 1 },
    stories: [
      { kind: 'economy', outlet: 'ledger', severity: 2, head: '{job}s strike over fuel prices', body: 'Much of {district} walked to work. Organisers say the strike continues "until someone listens".' },
      { kind: 'economy', outlet: 'tribune', severity: 2, head: 'Evictions rise in {hood} as rents climb', body: 'Families say rents have risen by {pct}% in a year. A housing charity warned of "a quiet emergency".' },
    ],
  },
  {
    when: (c) => clamp01((32 - c.crimeRate) / 20),
    deltas: { judicialTrust: 1 },
    stories: [
      { kind: 'city', outlet: 'herald', severity: 1, head: 'Quietest month in years for {hood}', body: 'Reported crime is down {pct}%. Shopkeepers at {market} are staying open later.' },
      { kind: 'city', outlet: 'radio', severity: 1, head: 'Night market returns to {hood2}', body: 'Closed for two years over safety fears, the market reopened to a crowd of hundreds.' },
    ],
  },
  {
    when: (c) => clamp01((c.judicialTrust - 65) / 25),
    deltas: { mediaPressure: -1 },
    stories: [
      { kind: 'reform', outlet: 'herald', severity: 1, head: 'Council funds legal aid centre in {hood}', body: 'Advocates credited "a court people are starting to believe in".' },
      { kind: 'reform', outlet: 'tribune', severity: 1, head: 'Jury service applications up {pct}%', body: '"People want to take part," a clerk said. "That wasn\'t true last year."' },
    ],
  },
];

/** Background colour for a quiet city — something is always happening. */
const QUIET: Template[] = [
  { kind: 'city', outlet: 'radio', severity: 1, head: 'Heavy rain floods roads in {hood}', body: 'Traffic crawled for most of the morning. No injuries were reported.' },
  { kind: 'city', outlet: 'social', severity: 1, head: '{market} traders complain of power cuts', body: 'Generators ran all afternoon. "Justice is fine, but we need light," one trader posted.' },
  { kind: 'economy', outlet: 'ledger', severity: 1, head: 'New bus route links {hood} and {hood2}', body: 'Commuters welcomed the route but said fares were "already too high".' },
  { kind: 'press', outlet: 'herald', severity: 1, head: 'Court backlog: {n}00 cases waiting in {district}', body: 'The court says every sitting juror is "carrying more than their share".' },
];

export interface CityEvent {
  story: Story;
  deltas: Partial<CityMetrics>;
}

/**
 * One thing the city does on its own, weighted by how the dials stand.
 *
 * A city with crime at 80 mostly produces robberies; a city with trust at 20
 * mostly produces crowds; a calm city produces rain and bus routes. The event
 * also nudges the dials — a robbery wave makes the next robbery wave likelier
 * unless the courts intervene, which is the pressure that brings a juror back.
 */
export function cityEvent(ctx: NewsContext, city: CityMetrics, roll: Roll): CityEvent {
  const weighted = CONDITIONS.map((c) => ({ c, w: c.when(city) })).filter((x) => x.w > 0);
  const total = weighted.reduce((a, x) => a + x.w, 0);
  const o = outletsFor(ctx.district);
  let template: Template = pick(QUIET, roll);
  let deltas: Partial<CityMetrics> = {};
  if (total > 0 && roll() < Math.min(0.9, 0.35 + total * 0.4)) {
    let r = roll() * total;
    for (const x of weighted) {
      r -= x.w;
      if (r <= 0) {
        template = pick(x.c.stories, roll);
        deltas = x.c.deltas ?? {};
        break;
      }
    }
  }
  const s = slots(ctx, roll);
  const filled = { ...s, hoodUpper: s.hood.toUpperCase(), outlet_radio: o.radio };
  return {
    story: {
      kind: template.kind,
      outlet: o[template.outlet],
      headline: fill(template.head, filled),
      body: fill(template.body, filled),
      severity: template.severity,
    },
    deltas,
  };
}

/** A returning name, as a human-interest story. Never says how their case went. */
export function echoStory(ctx: NewsContext, name: string, roll: Roll): Story {
  const s = slots(ctx, roll, { name });
  const options = [
    { head: '{name} opens a food stall in {hood}', body: 'Customers queued from mid-morning. "Everyone deserves a second start," the owner said.' },
    { head: '{name} seen at {market} as rumours swirl', body: 'Traders say {name} has been asking about old friends. Nobody would say more.' },
    { head: 'Where are they now? {name}', body: 'The Herald tracked down one of the faces from this year\'s docket. Life, {name} says, "carries on, whatever the papers say".' },
  ];
  const t = pick(options, roll);
  return {
    kind: 'echo',
    outlet: outletsFor(ctx.district).herald,
    headline: fill(t.head, s),
    body: fill(t.body, s),
    severity: 1,
  };
}

/** A new district opening to the player. */
export function districtOpens(district: string, newDistrict: string): Story {
  return {
    kind: 'press',
    outlet: outletsFor(newDistrict).herald,
    headline: `${newDistrict} courts request a juror of your standing`,
    body: `The clerk's office in ${newDistrict} has asked for you by name. Its docket is heavier and harder than ${district}'s — and it pays accordingly. Change court from your Career file.`,
    severity: 2,
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
function capitalise(s: string) {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
function lowerFirst(s: string) {
  return s ? s[0]!.toLowerCase() + s.slice(1) : s;
}
