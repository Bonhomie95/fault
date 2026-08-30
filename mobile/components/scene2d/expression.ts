/**
 * Expression — faces that work on you.
 *
 * ─── THE CONSTRAINT, FIRST, BECAUSE IT IS THE WHOLE DESIGN ───────────────
 *
 * FAULT measures `appearance_bias`: whether a defendant's face changed the
 * player's verdict. That measurement is only meaningful because appearance is
 * generated INDEPENDENTLY of guilt — the server rolls it "as if blind to the
 * verdict", so a sympathetic person is exactly as likely to have done it as a
 * hard-faced one. The face means nothing, and the game is watching to see
 * whether the player behaves as though it does.
 *
 * Expression has to live inside that constraint or it destroys the thing it
 * decorates. So the rule here is absolute:
 *
 *   Expression is driven by WHAT IS HAPPENING IN THE ROOM — which tab is open,
 *   which exhibit was lifted, who is speaking, how much clock is left — and
 *   NEVER by `correct_verdict` or `evidence_strength`. Neither of those
 *   reaches the client at all (they are stripped in toClientCase), and that is
 *   not an accident to work around; it is the reason this is safe.
 *
 * A defendant who flinches at the exhibit that actually convicts them is the
 * game answering its own question. A defendant who flinches at WHICHEVER
 * exhibit you happen to lift is the game working on you. The second one is
 * the product.
 *
 * ─── HOW IT COMPOSES ─────────────────────────────────────────────────────
 *
 * Everything below is a DELTA applied on top of `faceGeom`, never a
 * replacement for it. That is what preserves the person: a disarming face
 * going `defiant` still reads as that same disarming person, hardened — which
 * is exactly what a bias probe needs to survive. If expression overwrote the
 * base geometry, every defendant would converge on six faces and the
 * measurement would be gone.
 *
 * Two independent axes, as before, plus a third that is orthogonal to both:
 *
 *   appearance  (server, measured)   — hard ↔ soft
 *   seed        (server, decorative) — presentation, attire, colouring
 *   expression  (client, room state) — what they are doing right now
 */

export type Expression =
  | 'neutral'
  | 'tense'
  | 'pleading'
  | 'defiant'
  | 'ashamed'
  | 'startled'
  // The five that only ever appear after the gavel — see REACTIONS below.
  | 'broken'
  | 'stricken'
  | 'smirk'
  | 'relief'
  | 'unreadable';

/**
 * How a face moves, as offsets on the base geometry.
 *
 * Values are small on purpose. This is a person sitting still in a courtroom
 * being looked at, not a cartoon — the difference between `neutral` and
 * `pleading` should be something a player feels before they can name it.
 */
export interface ExpressionDeltas {
  /** + drives the inner brow DOWN (glowering); − lifts it (worried, pleading). */
  browAngle: number;
  /** Both brows up, as a unit. Surprise and appeal. */
  browRaise: number;
  /** + hoods the eye (unimpressed, withdrawn); − widens it (alarm). */
  lidDrop: number;
  /** −1 downturned .. +1 lifted. */
  mouthCurve: number;
  /** How far the mouth opens. Startle, and speech. */
  mouthOpen: number;
  /** Head tilt in degrees. + is toward the player's right. */
  headTilt: number;
  /** Where they are looking, in head-radius units from centre. */
  gazeX: number;
  gazeY: number;
}

const NONE: ExpressionDeltas = {
  browAngle: 0,
  browRaise: 0,
  lidDrop: 0,
  mouthCurve: 0,
  mouthOpen: 0,
  headTilt: 0,
  gazeX: 0,
  gazeY: 0,
};

export const EXPRESSIONS: Record<Expression, ExpressionDeltas> = {
  neutral: NONE,

  /** Holding it together, and not quite managing. The default under pressure. */
  tense: {
    ...NONE,
    browAngle: 0.06,
    lidDrop: 0.08,
    mouthCurve: -0.18,
    headTilt: -1,
  },

  /** Looking for something in your face. Open, raised, slightly lost. */
  pleading: {
    ...NONE,
    browAngle: -0.14,
    browRaise: 0.1,
    lidDrop: -0.12,
    mouthCurve: -0.24,
    headTilt: 2.5,
    gazeY: -0.04,
  },

  /** Not giving you anything. Chin level, eyes steady, jaw set. */
  defiant: {
    ...NONE,
    browAngle: 0.16,
    lidDrop: 0.14,
    mouthCurve: -0.3,
    headTilt: -2,
    gazeY: 0.03,
  },

  /** Cannot look at you. The only one that breaks eye contact outright. */
  ashamed: {
    ...NONE,
    browAngle: -0.06,
    browRaise: -0.05,
    lidDrop: 0.3,
    mouthCurve: -0.14,
    headTilt: 3,
    gazeX: -0.16,
    gazeY: 0.14,
  },

  /** Something just landed. Brief, and it decays back on its own. */
  startled: {
    ...NONE,
    browRaise: 0.22,
    lidDrop: -0.3,
    mouthOpen: 0.22,
    headTilt: -0.5,
  },

  /* ---------------------------------------------------------------- *
   * After the gavel.
   *
   * These five are never reached during a trial. They belong to the verdict
   * screen, where the accused finally reacts to what has happened to them —
   * and where, for the first time, their face means something, because they
   * are the one person in the room who knows whether they did it.
   *
   * The two convictions are deliberately close to each other. A man who has
   * just been sent down looks much the same whether or not he deserved it, and
   * the difference between them is where he puts his eyes: `broken` cannot
   * look at you, `stricken` cannot look anywhere else.
   * ---------------------------------------------------------------- */

  /** Convicted, and they did it. Folded. Nothing aimed at anyone. */
  broken: {
    ...NONE,
    browAngle: -0.16,
    browRaise: -0.18,
    lidDrop: 0.62,
    mouthCurve: -0.72,
    headTilt: 9,          // the head goes down, and that is most of the read
    gazeX: -0.12,
    gazeY: 0.20,
  },

  /** Convicted, and they did not. Open, disbelieving, and looking at YOU. */
  stricken: {
    ...NONE,
    browAngle: -0.52,     // inner brows driven UP — the pleading shape, hard
    browRaise: 0.54,
    lidDrop: -0.5,
    mouthCurve: -0.86,
    mouthOpen: 0.5,
    headTilt: -2,
    gazeX: 0,
    gazeY: -0.03,
  },

  /** Acquitted, and they did it. Small, private, and held a beat too long. */
  smirk: {
    ...NONE,
    // Light. At 0.30 the inner brows drove down hard enough to turn the whole
    // thing into a sneer — an angry man with a wide mouth, not a smug one.
    // What makes a smirk is the hooded eye and the raised chin below; the brow
    // only has to stop it being an open, friendly smile.
    browAngle: 0.12,
    browRaise: 0.02,
    lidDrop: 0.40,
    // Not a grin. A grin is a happy man; this is a man who has got away with
    // something and cannot quite keep it off his face.
    mouthCurve: 0.78,
    headTilt: -7,         // the chin comes up, and it is aimed at the juror
    gazeX: 0,
    gazeY: 0.02,
  },

  /** Acquitted, and they did not. The breath they have been holding. */
  relief: {
    ...NONE,
    browAngle: -0.34,
    browRaise: 0.24,
    lidDrop: 0.58,        // eyes closing, not narrowing
    mouthCurve: 0.94,
    headTilt: 6,
    gazeX: -0.10,
    gazeY: 0.16,          // looking down and away, not at the juror
  },

  /** No answer existed. Composed, and telling you nothing. */
  unreadable: {
    ...NONE,
    lidDrop: 0.12,
    mouthCurve: -0.05,
    headTilt: 0,
  },
};

/**
 * The faces that only exist after the gavel.
 *
 * Exported as a list, not just a type, so the bounds test can tell the two
 * sets apart at runtime — a trial expression and a reaction are held to
 * different limits, for a reason that is written out there.
 */
export const REACTION_NAMES = ['broken', 'stricken', 'smirk', 'relief', 'unreadable'] as const;

/** What the server calls it, and the face that goes with it. */
export type ReactionName = (typeof REACTION_NAMES)[number];

/**
 * The verdict screen's reaction, as an expression.
 *
 * A pass-through today, and a named seam rather than an inline cast because
 * the server owns the vocabulary (see server/src/domain/reaction.ts). If the
 * two ever drift, this is the one place that has to notice.
 */
export function reactionExpression(reaction: ReactionName | null | undefined): Expression {
  // An older server, or a response that predates the field, degrades to a
  // face that says nothing rather than throwing on a screen with no way out.
  return reaction && (REACTION_NAMES as readonly string[]).includes(reaction)
    ? reaction
    : 'neutral';
}

/* ------------------------------------------------------------------ *
 * Room state → expression
 * ------------------------------------------------------------------ */

export type SceneTab = 'defendant' | 'evidence' | 'witnesses' | 'arguments';

export interface RoomState {
  tab: SceneTab;
  /**
   * BODY LANGUAGE, 0 closed .. 100 open. From the server, blind to guilt.
   *
   * Drives posture, not expression: how far the shoulders roll forward, how
   * much the head drops, how much the whole figure withdraws from the room.
   * A juror reads it as readily as they read a face, and it is exactly as
   * empty — which is why `demeanour_bias` is worth measuring.
   */
  demeanour: number;
  /**
   * THE UNCANNY, 0 unremarkable .. 100 strange. Also from the server.
   *
   * Drives the things that unsettle without being nameable: a gaze that sits
   * slightly off yours, a stillness that goes on a beat too long, a blink rate
   * that is not quite right. Never a deformity — see `oddityDeltas`.
   */
  oddity: number;
  /** An exhibit is lifted right now. WHICH one is deliberately not passed. */
  examiningEvidence: boolean;
  /** A witness is on the stand and speaking. */
  witnessSpeaking: boolean;
  /** Seconds left. The room tightens as it runs out. */
  remaining: number;
  /** The threshold the tension bed already uses, so they move together. */
  tensionAt: number;
}

/**
 * A per-person behavioural signature, drawn from the seed.
 *
 * This is what makes an echo land. A returning character carries the same tell
 * they had the first time, so a player who half-remembers them feels it before
 * they read the name — which is the Echo System's payoff delivered without the
 * game announcing anything, exactly as GDD 2.4 asks.
 *
 * Seeded, never scored: a `tell` says nothing about guilt, and two defendants
 * with the same tell are as likely to differ in the truth as any other pair.
 */
export type Tell =
  | 'looks_away' // cannot hold your gaze when the file is on them
  | 'hardens' // meets pressure by closing down
  | 'appeals' // meets pressure by opening up
  | 'flinches'; // startles at the exhibits

function rand(seed: number, channel: number): number {
  const x = Math.sin(seed * 127.1 + channel * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function tellFor(seed: number): Tell {
  const r = rand(seed, 31);
  if (r < 0.28) return 'looks_away';
  if (r < 0.56) return 'hardens';
  if (r < 0.82) return 'appeals';
  return 'flinches';
}

/**
 * How hard the face is doing whatever it is doing.
 *
 * A separate axis from WHICH expression, and it has to be.
 *
 * The first version of this handled the clock by switching expression under
 * pressure — and the mapping it switched to was the same one it already used,
 * so the last fifteen seconds changed precisely nothing on screen. The bug is
 * instructive: "they do it harder" is not a different expression, it is more
 * of the same one, and modelling it as a name could only ever produce either
 * no change or a wrong one.
 *
 * So intensity scales the deltas. Everyone tightens as the clock runs out,
 * whatever their tell, and a `defiant` face at eight seconds is the same
 * person more so — not a different person.
 */
export function intensityFor(room: RoomState): number {
  if (room.remaining <= 0) return 1;
  if (room.remaining > room.tensionAt) return 1;
  // 1.0 at the threshold, rising to 1.75 at zero. Enough to read; not enough
  // to turn anybody into a gargoyle.
  const t = 1 - room.remaining / room.tensionAt;
  return 1 + t * 0.75;
}

/** Scale a set of deltas. Gaze is NOT scaled — eyes do not leave the head. */
export function amplify(d: ExpressionDeltas, k: number): ExpressionDeltas {
  return {
    browAngle: d.browAngle * k,
    browRaise: d.browRaise * k,
    lidDrop: d.lidDrop * k,
    mouthCurve: d.mouthCurve * k,
    mouthOpen: d.mouthOpen * k,
    headTilt: d.headTilt * k,
    gazeX: d.gazeX,
    gazeY: d.gazeY,
  };
}

/**
 * What the accused's face is doing, given the room and who they are.
 *
 * Reads ONLY room state and the person's seed. It has no access to the
 * verdict, the evidence strength, or which exhibit is open — and the function
 * signature is the enforcement: `examiningEvidence` is a boolean, not an id,
 * so this cannot react to a particular piece of evidence even by accident.
 *
 * The clock's effect lives in `intensityFor`, not here.
 */
export function defendantExpression(seed: number, room: RoomState): Expression {
  const tell = tellFor(seed);

  switch (room.tab) {
    case 'defendant':
      // Being read. The tell shows most plainly here, because here the player
      // is looking straight at them and nothing else is happening.
      return tell === 'looks_away' ? 'ashamed' : tell === 'hardens' ? 'defiant' : 'tense';

    case 'evidence':
      // Something of theirs is in someone else's hands. Note again: WHICH
      // exhibit is unknown to this function, on purpose.
      if (!room.examiningEvidence) return 'tense';
      return tell === 'flinches' ? 'startled' : tell === 'hardens' ? 'defiant' : 'pleading';

    case 'witnesses':
      // Being talked about, which is the hardest thing in the room to sit
      // through — and notably harder than being LOOKED at, so the responses
      // here are a step further along than on the defendant tab. Someone who
      // merely tenses under a reading appeals under testimony.
      if (!room.witnessSpeaking) return 'tense';
      switch (tell) {
        case 'hardens':
          return 'defiant';
        case 'looks_away':
          return 'ashamed';
        case 'appeals':
          return 'pleading';
        case 'flinches':
          return 'pleading';
      }

    case 'arguments':
      // Counsel talk past them, and they know it.
      return 'neutral';
  }
}

/** The witness's own face. They are performing too, and one of them is lying. */
export function witnessExpression(seed: number, room: RoomState): Expression {
  if (room.tab !== 'witnesses') return 'neutral';
  const tell = tellFor(seed);
  // Deliberately NOT correlated with `lie` — the client is never told which
  // witness is lying, and if it were, this would be the tell that gave it
  // away. A witness who looks shifty is as likely to be honest as not, which
  // is the same bet the game makes about the defendant's face.
  return tell === 'hardens' ? 'defiant' : tell === 'looks_away' ? 'ashamed' : 'tense';
}

/**
 * Posture, from the body-language channel.
 *
 * Separate from expression on purpose: a face and a body are two different
 * readings and the game measures them separately, so they must be able to
 * disagree. A defendant can hold an open posture and a hard face, and a juror
 * who convicts on one and not the other tells the record something specific.
 *
 * Returned in scene units for the renderer to apply to the figure as a whole.
 */
export interface Posture {
  /** Shoulders forward and inward. Positive is hunched. */
  shoulderRoll: number;
  /** How far the whole figure sinks. Positive is withdrawn. */
  slump: number;
  /** Head carried low. Positive is chin-down. */
  headDrop: number;
}

export function postureFor(room: RoomState): Posture {
  // 0 closed .. 100 open, mapped to -1 (hunched) .. +1 (level).
  const openness = (Math.max(0, Math.min(100, room.demeanour)) - 50) / 50;
  const closed = -openness;

  // Under the clock everyone closes up a little, whatever they started as.
  const pressure = room.remaining <= room.tensionAt && room.remaining > 0
    ? (1 - room.remaining / room.tensionAt) * 0.35
    : 0;

  const tighten = Math.max(-1, Math.min(1, closed + pressure));
  return {
    shoulderRoll: tighten * 5.0,
    slump: tighten * 3.4,
    headDrop: tighten * 2.2,
  };
}

/**
 * The uncanny, as offsets nobody can name.
 *
 * Deliberately small, and deliberately NOT geometric deformity. A game that
 * made a misshapen face the tell for guilt would be saying something vile by
 * accident — and it would also break the measurement, because the player would
 * be reacting to a signal rather than to strangeness.
 *
 * What it does instead is timing and aim: eyes that converge slightly in front
 * of or behind you, and a blink that comes too rarely. Nobody consciously
 * notices either. Everybody feels both.
 */
export interface Uncanny {
  /** Horizontal gaze error, in eye-widths. Never large enough to read as a squint. */
  gazeError: number;
  /** Multiplier on the blink period. >1 is the unblinking stare. */
  blinkStretch: number;
  /** How much the idle sway is suppressed. 1 is a person who does not move. */
  stillness: number;
}

export function uncannyFor(seed: number, room: RoomState): Uncanny {
  const o = Math.max(0, Math.min(100, room.oddity)) / 100;
  // Which way this particular person is off. Seeded, so it is the same person
  // every time — a returning echo is uncanny in exactly the way they were.
  const direction = rand(seed, 53) > 0.5 ? 1 : -1;
  return {
    gazeError: direction * o * 0.22,
    blinkStretch: 1 + o * 1.6,
    stillness: o * 0.75,
  };
}

/** Interpolate between two expressions, for a transition rather than a cut. */
export function blend(
  from: ExpressionDeltas,
  to: ExpressionDeltas,
  t: number,
): ExpressionDeltas {
  const k = Math.max(0, Math.min(1, t));
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    browAngle: mix(from.browAngle, to.browAngle),
    browRaise: mix(from.browRaise, to.browRaise),
    lidDrop: mix(from.lidDrop, to.lidDrop),
    mouthCurve: mix(from.mouthCurve, to.mouthCurve),
    mouthOpen: mix(from.mouthOpen, to.mouthOpen),
    headTilt: mix(from.headTilt, to.headTilt),
    gazeX: mix(from.gazeX, to.gazeX),
    gazeY: mix(from.gazeY, to.gazeY),
  };
}

/**
 * Blink timing, per person.
 *
 * A fast blinker and a slow blinker are different people, and it costs nothing
 * to make that true. Purely decorative, and it is most of what separates "a
 * face" from "someone waiting to be judged".
 */
export function blinkPeriodMs(seed: number): number {
  return 2600 + rand(seed, 41) * 3200;
}
