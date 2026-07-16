# FAULT

*Every verdict has a next case.*

A mobile legal drama in which you are the jury of one. 120 seconds per case.
The city remembers what you decide.

See `fault_gdd.md` for the design. This repo implements the core loop.

## Layout

```
mobile/   Expo SDK 54 + React Native + TypeScript — the game
server/   Node + Express 5 + Prisma 7 + Redis + Groq — the city
```

## Running it

You need Postgres and Redis running locally.

```bash
# 1. the city
cd server
cp .env.example .env          # set DATABASE_URL's user; GROQ_API_KEY optional
npx prisma migrate dev
npm run dev                   # :4000 — check /health

# 2. the game
cd ../mobile
npx expo start --ios          # or --android
```

The mobile client discovers the API from Metro's own host, so a physical device
works without configuration. Override with `EXPO_PUBLIC_API_URL` if needed.

```bash
cd server && npm test          # city engine + authored docket
```

## Without a Groq key

The game is fully playable with `GROQ_API_KEY` empty. Case generation falls
back to the six hand-authored cases in `server/src/services/seedCases.ts`, and
the juror profile is written by a deterministic writer in the same voice. This
is the GDD's "emergency buffer" (§12) doing double duty as the dev default.

With a key set, cases are generated from the live city state, pre-generated in
batches of five, and buffered in Redis so the player never waits on the model.

## Decisions worth knowing

**The clock is 120 seconds.** The GDD says 120 in §1/§2.1 and 60 in §2.2/§6/§8;
120 was chosen. Because §6 also lists 90s/120s as the *accessibility* tiers —
which would no longer extend anything — those tiers are 180s/240s. One constant,
`Clock` in `mobile/constants/theme.ts`, and `clockSeconds` per user server-side.

**3D objects, native text.** Scenes are real three.js (react-three-fiber over
expo-gl): a courtroom the camera walks through, exhibits as physical objects,
faceless deterministic figures, and a city model that expresses the six city
dials as skyline, darkness, fog and light. Typography is React Native layered
over the GL canvas — `drei`'s troika text is unreliable on RN, and this is a
game about reading dense text under a clock.

**The client is never told the answer.** `correct_verdict`, `evidence_strength`,
`is_planted`, and each witness's `lie`/`lie_tell` exist server-side and are
stripped in `toClientCase`. The dossier you hold is the dossier a juror holds.

**Forced verdicts are the server's coin flip.** At 0 seconds the client submits
no verdict; the server chooses and records it as hung. A consequence is not the
client's to author.

**A person's name is their identity key.** The Echo System matches returning
characters by exact name and seeds their silhouette from it, so names carry no
titles or descriptors — `name: "Musa Danjuma"`, `role: "sergeant"`. Two tests
enforce this; getting it wrong silently kills the echo.

**three.js is pinned to one build** in `mobile/metro.config.js`. r3f's native
entry requires the CJS build while app imports resolve the ESM one, which loads
the library twice and breaks `instanceof` across the boundary.

## State of it

Done: the full loop (cold open → briefing → lobby → case → verdict → review →
record), city state engine, juror profile, echo system, Groq generation with
Redis buffering, trial gate at 10 cases, 32 tests.

Not done, from the roadmap: the 50-case campaign and chapter structure, daily
mode and leaderboard, ambient sound, the portrait library (silhouettes are
generated procedurally from the seed rather than pre-rendered), verdict PDF
export, and IAP.

### Verifying 3D changes

`xcrun simctl io booted screenshot` captures a **stale** GL surface — two
identical screenshots do not mean the scene is frozen. To check a scene is
live, log from inside `useFrame` and read Metro's output.
