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
batches of three, and buffered in Redis so the player never waits on the model.

**Check the model still exists.** Groq retires models, and when
`llama-3.3-70b-versatile` was retired every generation began returning 404,
every juror silently received the same six fallback cases, and `/health` went
on reporting `groq: true` with five keys available — because the keys were
fine. The server now probes the model list at boot and logs
`CASE GENERATION IS DEGRADED` with the models that do exist. Watch for it.

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
Redis buffering, trial gate at 10 cases, ambient sound, 218 tests.

Also done since: the expression system (faces react to the room —
`mobile/components/scene2d/expression.ts`), name moderation and content
reporting, the case archive screen, server-issued sign-in nonces, and
index-backed leaderboard ranking.

Not done, from the roadmap: the 50-case campaign and chapter structure, the
shared daily case (which is what the "63% of jurors convicted" beat on the
verdict screen needs — it is written and currently unreachable), the portrait
library (silhouettes are generated procedurally from the seed rather than
pre-rendered), and verdict PDF export.

**Seams, not stubs.** Payments and advertising are wired end to end on the
server and up to a single interface on the client — `lib/purchases.ts` and
`lib/ads.ts`. Neither has an SDK behind it, because choosing one is a product
decision (AdMob pulls in Play Services and wants IDFA; the tracking prompt that
implies is not a refactor). Registering a backend is one implementation of
`PurchaseBackend` / `AdBackend`; everything around it, including receipt
verification against Apple and Google, is finished. The same is true of error
reporting: `lib/report.ts` and `log.onError` are the seams, and wiring Sentry
is one function each.

**The model is a reasoning model, and that changes the token maths.** On
`openai/gpt-oss-120b` at `reasoning_effort: 'low'` a case costs about 830
tokens end to end, not the ~3,000 the old comments assumed — so a free key is
roughly 120 cases a day rather than 33. Reasoning tokens count against
`max_tokens` *before* any answer is emitted, which is why the cap is 6,000: at
2,000 the model thought, ran out mid-object, and Groq returned
`json_validate_failed` with an empty completion.

**Three channels, not one.** A juror reads a defendant's face, their body and
their strangeness, and none of the three mean anything. `appearance`,
`demeanour` and `oddity` are all rolled server-side by `domain/presentation`,
which cannot see the verdict — the model's own numbers are overwritten before
they reach a case, because a model asked to be uncorrelated with guilt will
quietly make the guilty shifty and sincerely report that it did not. The Juror
Record scores all three (`appearance_bias`, `demeanour_bias`, `oddity_bias`)
and `tests/presentation.test.ts` asserts the independence over ten thousand
cases.

### The accused in 3D

The courtroom and the verdict screen draw a real model, not a picture of one.

```bash
# fetch the assets it dresses from (see below)
python3 tools/suspect/fetch_assets.py \
  --want '^clothes/(male_elegantsuit01|female_elegantsuit01)/' \
  --want '^skins/' --want '^hair/(short01|short02|bob01|long01)/'

blender --background --python tools/suspect/export_suspect.py -- \
  --out mobile/assets/suspect
```

Six `.glb` files, about 4.5MB each: an upper body — head, neck, shoulders, arms
and hands — with eyes, brows, lashes, hair and a garment, each carrying sixteen
morph targets. Five are the verdict reactions, five are the trial expressions
that mirror `scene2d/expression`, and six are channels the client dials rather
than picks: `blink`, four `gaze*` directions, and `slump`.

`tools/suspect/preview.html` renders one straight, at any size, with any morph
dialled in — `?m=m_mid_ca&s=smirk&h=0.3`, and `&hide=eyebrow` to find out which
mesh owns an artefact. `tools/suspect/sheet.html` renders a contact sheet: every
archetype at once (`?cols=3`), or one archetype across every morph
(`?m=m_mid_ca&s=,broken,smirk,relief`). Serve the repo root over HTTP and open
them:

```bash
python3 -m http.server 8790 --bind 127.0.0.1
```

Every model bug in this section was found in one of the two, because a face
behind a dossier card and a scrim tells you nothing. Both use the SAME framing
arithmetic the app does, so what they show is what ships.

**Why a model and not a render.** The Cycles stills in `tools/portraits` look
better than anything a phone GPU will draw, and they cannot be used here: the
reaction depends on the verdict AND on whether the juror was right, the person
depends on `portraitSeed`, and the two multiply into thousands of images. Six
small files cover every combination, because the combination happens at
runtime.

**Why identity is baked and expression is not.** MPFB expresses gender, age and
ancestry as COMBINATION shape keys — the set of keys changes with the values,
so there is no fixed list a client could drive. Identity is therefore one file
per archetype, with skin tone applied at runtime so six files cover far more
than six people. Expressions are the opposite: every face unit is the same
target on the same topology whatever the body, so those ship as morph targets.

The units are the MakeHuman `faceunits01` pack, which is the ARKit blendshape
set. That is what makes the smirk work: `mouthSmileLeft` at 0.85 against
`mouthSmileRight` at 0.15. No symmetric deformation gets there.

Each reaction also carries **body language** — head, shoulders, arms — folded
into the same target, so the client cannot put a smirk on a man with his head
in his hands. There is no armature: the joints are read off the base mesh's
own `joint-*` vertex groups and the rotations are kept under thirty degrees,
which is the range where a linearly-interpolated morph target is
indistinguishable from a real rotation.

**Order is everything in the exporter**, and each step is forced by the next.
MakeHuman assets are fitted by base-mesh vertex INDEX, so nothing may add or
remove a vertex until the last one is attached — which rules out cropping first
and rules out decimating at all. `shape_key_add(from_mix=True)` captures the
current mix, so the macro keys must be flattened before any expression is baked
or the body is applied twice. And Blender will not apply a modifier to a mesh
with shape keys, so the crop is a bmesh vertex delete and it comes last.

#### The framing contract

**One model unit is EYES TO CROWN, and the origin is the eyes.** Both cameras
are then written in head units — `AccusedReaction` asks for a head filling 15.5%
of the viewport with the eyes 45% down; `SuspectStage` asks for the 66 scene
units and the (200, 246) mark that `CourtroomScene` draws its vector accused at,
so whichever of the two the device can show stands in the same place at the same
size. Normalising by the whole figure instead makes the face size depend on how
much chest is in the file.

The eyes are FOUND, not assumed: the exporter names the eyeball mesh `eyes` and
the client takes the centre of its bounds. The exporter does also sit the model
with its eyes on the origin, but the crop, the parenting and the Z-up to Y-up
conversion each move the root a little, and an error there is invisible until
something is scaled by it.

#### The one tab that is about a face

The defendant tab pushes the camera in on the accused, and for a while the only
part of him you could actually see was the chin. Three things stack in that
band: the header, the plea bubble that hangs off the measured bottom of it, and
the first dossier card. A fixed camera anchor cleared the plea on a one-line
case title and sat behind it on a two-line one.

So the room is told where the eyes go in SCREEN pixels — `eyesY={headerBottom +
FACE_BELOW_HEADER}` — and `eyesFrame` inverts the scene mapping to find the
anchor that puts them there. The dossier's first card is pushed down to match
(`panelBelowTheFace`), which the panel can absorb because it scrolls and the
lower half of that tab was empty anyway.

#### In the courtroom

`components/suspect/SuspectStage` puts the model on the accused's mark and keeps
it there as the camera moves between dossier tabs.

The obvious way — a canvas inside a view transformed by the same Reanimated
values — does not survive contact. A CSS transform on the canvas's ancestor
leaves react-three-fiber measuring its default 300x150, and `transformOrigin`,
which is needed because the room scales about the origin and React Native scales
about the centre, is dropped by the web renderer as an unknown DOM property. So
the canvas sits still and full-screen and the MODEL moves, placed each frame
from the same three shared values the room reads. Three floats a frame is
nothing, the two cannot drift because there is one source of truth, and the
render stays at native resolution at every zoom instead of being a magnified
bitmap.

#### Twenty-six things that were silently wrong

None of these raised an error. Each is worth not rediscovering.

- **Helper geometry ships.** MakeHuman's fitting helpers and joint cubes — 5,778
  vertices — are hidden by a MASK modifier, and glTF is exported WITHOUT
  applying modifiers. All of them came through, and the first model was a face
  behind flat beige panels. It looked like a hair bug for an hour.
- **There is not always one mask.** Fitting a garment adds a SECOND, and
  `evaluated_points` disabled only the first. The evaluated mesh then had fewer
  vertices than the base, every index past the first hidden one referred to the
  wrong vertex, and the body came out in shards. There is now a count check
  that refuses rather than writing mismatched positions.
- **Everything exported as alphaMode BLEND**, including the body, the lips and
  the eyeballs — MPFB's MakeSkin materials are node GROUPS with the texture's
  alpha wired through. A BLEND material in three writes no depth and is sorted
  per object, so the teeth showed through the cheeks and the eyebrow cards
  painted black across the nose. `material.blend_method = "OPAQUE"` does not
  fix it: since Blender 4.2 that property is vestigial and the assignment
  silently does nothing. The file is retagged after export instead.
- **Assets are parented to the body**, so offsetting the model AND each asset
  applied the shift twice. The hair ended up at world y −3.2 instead of −1.6,
  below the chin where it was invisible. That one read as an alpha problem, and
  the alpha was fine all along.
- **`fit_clothes_to_human` leaves a `temporary_fitting_key` behind** on every
  call. Eighteen of them exported as morph targets and gave a two-metre model a
  bounding box of ±1273. The fitter is no longer used per-expression at all —
  assets follow the body through a KD-tree instead.
- **`hash()` is randomised per process** in Python, so seeding asset choice with
  it gave the same archetype different hair on every export. `zlib.crc32`.
- **The clothes delete-mask is a viewport effect.** Every MakeHuman garment
  ships the body vertices it covers, and MPFB honours that with a MASK
  modifier — which glTF export ignores, exactly like the helpers. The suit was
  correct in Blender and wore a torn patch of bare chest through its own lapel
  in the app. The crop reads every mask on the object and deletes what it says.
- **Calling the eyes solid blinded everybody.** A MakeHuman eyeball is a sclera
  and iris under a cornea that is transparent except for its highlight. Tagging
  it OPAQUE dropped the alpha channel so the exporter could write JPEG, and the
  cornea became an opaque black cap over the iris — every suspect in the game
  had two empty sockets. It read as a lighting problem for a while, because a
  shadowed eye and a missing eye look alike at a distance. Eyes are a cut-out.
- **One alpha cutoff does not fit every cut-out.** Hair is carried by a soft map
  and cutting at 0.4 tore the hairline into a coastline; the lash maps fade out
  into individual hairs and keeping those gave every defendant black spider legs
  across the eye. They are cut per kind now — hair 0.22, brows 0.55,
  lashes 0.6.
- **Alpha TESTING hair is what tore the hairline.** glTF MASK becomes an alpha
  test in three: a pixel is fully drawn or fully discarded. A quarter of the
  MakeHuman hair map is partial alpha — the soft tips of the strands — so the
  test threw all of it away and left a boundary that followed the noise in the
  map instead of the shape of a hairline. It got worse the smaller the model was
  drawn, because minification averages the fringe toward zero and the test then
  eats it, which is why it looked bitten in the room and merely rough in the
  viewer. Lowering the threshold does not fix it — 0.22, 0.10 and 0.05 are
  indistinguishable, because moving a hard edge is not the same as softening
  one, and going lower bloats every brow into a bar at the same time.
  `softenCutout` blends the fringe instead, keeping a hairline alpha test at
  0.02 so a fully clear pixel still writes no depth, and keeping `depthWrite` so
  the old BLEND bug does not come back with it. `alphaToCoverage`, the other
  textbook answer, did nothing here.
- **Cutting the brows low gave everyone a mole.** The MakeHuman brow maps
  carry a faint patch of alpha between the two brows. At 0.3 it survived as a
  black dot in the middle of every defendant's forehead, while the brows
  themselves thickened into two painted bars. One number does both, in
  opposite directions, which is why it took hiding the mesh to find.
- **Setting a Principled node's Base Color is silently a no-op here.** MPFB
  wires the diffuse texture into that socket through a mix node, and a linked
  socket ignores its default — so the hair tint that stops the African and Asian
  archetypes arriving blonde is written as `baseColorFactor` in the glTF, where
  it multiplies the texture by definition.
- **`"male"` is a substring of `"female"`,** and both places that tested for it
  were wrong. The skin scorer gave `young_african_female` the same score as
  `young_african_male` for a male archetype and `max` broke the tie
  alphabetically, so the male African suspect wore a woman's skin; the garment
  filter would have dressed him in her clothes for the same reason. A skin now
  needs ancestry AND gender or the plain shader is used instead — age may be
  missing, gender may not.
- **One MakeHuman garment has the logo printed on the shirt.**
  `male_casualsuit06` carries it across the chest, which is exactly where the
  courtroom camera looks. Most assets put their credit in an unused corner of
  the UV sheet, where nothing samples it; this one does not, so it is excluded.
- **Reanimated leaves a conditionally-mounted notice at `visibility: hidden`
  on web.** The lobby's paywall message, the store's and the career screen's all
  used `Animated.Text entering={FadeIn}`; all three were mounted, laid out,
  given their colour and never shown. On the lobby that meant tapping OPEN THE
  FILE did nothing at all and said nothing — the case was refused with a 402 and
  the explanation was invisible. Adding a duration does not fix it. They are
  plain `Text` now: a message a player has to read does not get to depend on an
  animation running.
- **MakeHuman builds everyone in a T-pose.** Arms straight out from the
  shoulders, horizontal, palms down — the right rest pose for fitting clothes
  and the wrong one for standing in a dock. Because the camera frames head and
  chest, nothing in the game ever showed it; what the game showed was the
  consequence, which was that the crop plane ran through both forearms and the
  arms ended in two flat stumps at the edge of frame. `settle_arms` brings them
  down into the BASE MESH rather than into a morph target: a rotation that size
  interpolates along a chord and would visibly shorten the limb through the
  middle of the arc, which is the whole reason POSES keeps under thirty
  degrees. It also makes `spread` mean what its name says — from a T-pose that
  number swung the arm up and down.
- **The forearm is its own segment, and the wrist has to turn over.** Rotating
  everything past the shoulder by one angle keeps the forearm at whatever angle
  it made with the upper arm in the T-pose, which left both hands held out as
  though he were asking a question; and the T-pose has the palms facing DOWN,
  so bringing the arms to the sides leaves them facing front — hands open to
  the room, which reads as a shrug. Both are measured off the joint markers and
  corrected, the twist from the line across the knuckles.
- **"Is this vertex part of the arm" has to survive both poses.** It began as a
  hard sideways test — more than two centimetres inboard of the shoulder is
  chest — and a hard test is a cliff the sleeve straddles, because a garment
  takes its motion from the four body vertices nearest it. It came apart into a
  fan of loose triangles across both shoulders. Softening the cliff fixed the
  T-pose and broke the reactions, because SIDEWAYS only means "arm" while the
  arms stick out sideways: once they hang, every vertex on them scored nearly
  zero and the reactions tore the sleeves open along the forearm instead. It is
  distance to the bone chain now, which is the same question in any pose — and
  the chain has to run to the FINGERTIPS, or the hand measures as something
  hanging near the arm and gets pulled out into claws.
- **A hand is rigid, and a forearm must turn about the elbow's NEW position.**
  Letting the falloff run through the hand drew the thumb into a spike and
  flattened the palm into a blade. And the forearm used to be rotated about the
  elbow where it started, after the vertices had already been carried away by
  the shoulder — fine while the shoulder barely moves, and the single line that
  made a large elbow look impossible: it put a skin-coloured ribbon out of each
  fist, which is what "morph targets cannot hold an elbow" turned out to mean.
  It was a stale pivot.
- **Straight-line distance cannot tell an arm from a torso.** With the arms
  hanging, the side of a jacket is five centimetres from the wrist bone — so
  every distance-based "is this the arm" test that caught the sleeve also
  caught the hem, and the whole lower half of the jacket ballooned outward
  whenever the hands came up. Inheriting the weights from the body did not help
  either, because the body has the same problem: its hip is also five
  centimetres from its own wrist. `geodesic_field` measures along the SURFACE
  instead, where the two are nowhere near each other, because the only path
  from a hand to a hip is up the arm, over the shoulder and back down. The arm
  joins the body at exactly one place and that is the fact worth using.
- **A gesture must not be inferred.** Everything worn used to work out its own
  motion from the four body vertices nearest it, which is right for an
  expression — it arrives as an MPFB shape key that exists only on the body, so
  a brow can only know to rise by watching the ridge under it — and hopeless
  for a gesture. A sleeve vertex at the armpit has neighbours on the torso,
  which does not move, and on the arm, which moves thirty centimetres;
  averaging those puts it nowhere, and the jacket came apart into a cone of
  shards over both shoulders every single time. It read as "morph targets
  cannot hold a gesture" for a long time. They can. A pose is arithmetic on a
  position, so the sleeve now goes through the same arithmetic as the arm
  inside it and lands exactly where the arm lands. Only the WEIGHTS are
  inherited, and interpolating a scalar cannot tear anything.
- **`Box3.setFromObject` includes morph target extents.** Three expands a mesh's
  bounds by every morph at full influence, which is right for culling and wrong
  for framing: the "crown" came back eleven centimetres above the actual skull,
  and the scale derived from it drifted whenever a pose changed. Nothing renders
  up there — it is the shape of a shrug that is never fully applied. The model
  measures its own position attribute instead.
- **Deleting vertices does not cut a straight line.** The upper-body crop
  removed whole vertices below the floor, which leaves the edge wherever the
  vertices happened to be — on a body mesh a zigzag two centimetres deep, and on
  screen a row of shark's teeth across the chest that no amount of scrim hid. It
  is a `bisect_plane` now, which adds the vertices needed to end the mesh exactly
  on the floor and interpolates the shape keys onto them.
- **The texture cap never ran.** `prepare_materials` walked `tree.nodes` for
  TEX_IMAGE nodes, and MakeSkin wraps its shader in a node GROUP — so the loop
  had nothing to iterate over and a 2048px face shipped in every file. Nothing
  failed; the cap was simply never reached. It recurses now.
- **Picking eye colour evenly is not neutral.** MakeHuman ships brown, deepblue,
  green and grey, and a uniform draw gave both African archetypes bright green
  eyes on dark skin — which occurs, and is rare enough that twice in a cast of
  six reads as a costume rather than a person. The draw is weighted by
  archetype, and the rarer colours stay reachable rather than being cut.
- **A callback in the loader's dependencies never finishes loading.** The
  courtroom re-renders once a second for the clock and passed a fresh closure
  each time, so the cleanup cancelled the in-flight parse a moment before it
  finished, every time. The screen showed the drawn fallback and nothing
  anywhere reported a failure, because nothing had failed.

#### The assets

`tools/suspect/fetch_assets.py` pulls individual members out of the 268MB
MakeHuman system pack using HTTP range requests, rather than downloading it —
the mirror serves at about 8KB/s, so the difference is four minutes against
three hours. `files.makehumancommunity.org` answers a direct download with an
HTML "Access Forbidden" page that is a valid 200; `files2.` serves the bytes.

`tools/suspect/optimise_glb.py` runs after the export and re-encodes solid
textures as JPEG, which is what takes the six files from 45MB to 21MB. It
is a separate script because Blender's bundled Python has no Pillow. Cut-outs
are left alone: hair, brows and lashes ARE their alpha channel.

Where a real garment has not been downloaded the exporter builds a procedural
one — the torso duplicated, cut at a shaped neckline and pushed out along its
own normals, in five variants from a suit to a singlet. It is a shell, not a
garment, and it exists so a suspect is never bare-chested in a courtroom.

Hair colour is a per-archetype tint rather than a per-asset texture, because
every MakeHuman hair asset ships one and `long01` ships a blonde one. Skin is a
photograph chosen to match the archetype, so the runtime tone in
`components/suspect/skin` is a MODULATION — near-white multipliers about a
fifth of a stop apart. It was a spread of absolute skin colours until the models
started carrying real skins, at which point a dark-skinned texture multiplied by
a dark brown came out almost black.

**On the client**, `components/suspect/SuspectModel` loads the archetype for a
seed, modulates the skin tone, and eases each named morph toward its target every frame
at one of two speeds — a blink is over in a tenth of a second and a reaction
dawns over most of one, and running both at a single rate makes the blink a
slow swoon or the reaction a flinch. `AccusedReaction` and `SuspectStage` each
mount it over the drawn vector face and retire that face only once the model
has actually parsed AND the GL context has proved it can paint (see
`glCapability`); where it cannot, the canvas is never mounted and the drawing
stands.

**Every shape has a body, not just a face.** `POSES` gives all sixteen a
posture and the five verdict reactions a gesture: `broken` bows the head and
brings both hands up to it, `stricken` clasps them at the chest, `relief` lifts
one to the breastbone, `smirk` barely moves — which is the tell. The trial
expressions get a smaller version of the same, because a body holding perfectly
still through two minutes of being read is its own kind of wrong.

Two numbers govern how far it can go. `raise_` and `elbow` turn on the SAME
axis and compound — the hand takes the sum — so thirty degrees at the shoulder
on top of eighty at the elbow put both hands above his head reaching backwards;
almost the whole budget belongs to the elbow, which is the joint a person
actually folds. And the elbow stops around sixty because a JACKET has to fold
with it: past that the sleeve crushes at the crease and shows its own inside,
and no amount of feathering fixes a tube folded double. A person can bend
further than their clothes can be made to.

**The body is cropped below the HANDS, not below the chest.** The crop plane
is measured off the finger joints rather than set to a number, because a plane
anywhere above them cuts a hand in half — the old fixed height left two flat
stumps at the wrists. It costs vertices for a part of the body neither camera
frames, and it is the difference between a person and a mannequin the moment
anything is drawn wide.

**Eyebrows are cut high and then lifted.** The MakeHuman brow maps are painted
as individual hairs at low opacity, for a renderer that composites them at full
strength; blending them shows them as painted, which on the sparser maps is a
suggestion of an eyebrow rather than an eyebrow. `boost_alpha` multiplies the
alpha before export so the body of each hair is solid and its tip stays soft.
It runs once per image per run, because Blender shares an image datablock
between every archetype wearing the same asset and the second one to arrive got
it applied twice.

**Which archetype a seed is** comes from `archetypeFor`, and it reads the same
channel the drawn accused reads (`lib/seed`, channel 11) — presentation is a
property of the defendant, not of whichever renderer got there first. Indexing
the cast by the seed instead, which is what this did at first, meant the swap
from the drawing to the model could change someone's sex halfway through a
case. Skin tone is not decided there: `suspect/skin` modulates it at runtime
from its own channel, so six files do not mean six skin tones. `/dev-suspect` shows any archetype against any reaction without playing
a case.

### Rendering the accused

`tools/portraits/build_accused.py` builds real humans in Blender with
[MPFB2](https://extensions.blender.org) — a genuine anatomical base mesh with
macro morphs for ancestry, age, build and proportion, driven deterministically
from `portraitSeed`.

```bash
blender --background --python tools/portraits/build_accused.py -- \
  --seeds 0-63 --appearance 15,50,85 --out mobile/assets/portraits
```

MPFB must be enabled in your **saved** Blender preferences — background renders
cannot enable it themselves (it reads its own addon preferences at import).

It renders ONE image per portrait, not layers. It used to render body / head /
eyes separately so the client could move the eyes at runtime, and that could
never have worked: the body is a single mesh, so `human` appeared in both the
body layer and the head layer, and compositing head over eyes painted the face
straight back over the eyeballs. Every defendant came out with two black slots
where their eyes should be. Gaze and blink stay runtime — they belong to the
vector overlay in `components/scene2d`, which draws over the top.

Three numbers in that file come from anatomy rather than from taste, and the
same three drive the vector face, so a defendant does not change shape between
the drawn version and the rendered one: the palpebral fissure is 30mm x 10mm,
the iris 11.8mm and the pupil 3.6mm. Getting them wrong is what makes a face
look like a doll — an iris sized by eye came out 18mm across, which on a 7mm
opening is simply a black slot, and lids drawn twice as open as a human's is
most of what separates a cartoon from a person.

#### The system assets

Skin textures, hair cards, eyebrows, eyelashes and eyeballs live in the
MakeHuman system asset pack. The pipeline uses them when they are installed and
falls back to procedural versions when they are not, per asset — so a partial
library still improves the render instead of failing it.

An asset is refused unless its diffuse texture is actually on disk. MPFB will
build a material around a missing image and Blender draws that magenta, so a
half-downloaded pack renders bright pink heads, which is considerably worse
than the procedural version it replaced.

The pack is a single 268MB zip and the mirror is slow, but it serves range
requests — so the zip's central directory can be read remotely and individual
members pulled out of it without fetching the whole archive. `files.` refuses
direct downloads; `files2.` serves them:

```
https://files2.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
```

Assets go under MPFB's user data root, which is
`~/Library/Application Support/Blender/<ver>/extensions/.user/user_default/mpfb/data`
on macOS — `LocationService.get_user_data()` reports it on any platform.

### What `npm audit` says, and what it means

Both halves report advisories that should not be "fixed", and the fix npm
offers would break the build. Checked rather than assumed:

**Client — 23 advisories, none of them shipped.** `brace-expansion`,
`js-yaml`, `postcss`, `image-size`, `nanoid` and `uuid` all arrive under Expo's
own tooling. Grepping a production bundle
(`entry.bundle?platform=ios&dev=false`) for each of them returns zero hits:
they run on the build machine, not the phone. `npm audit fix --force`
downgrades Expo SDK packages, which is a real break in exchange for nothing.
They clear when Expo ships an SDK update.

**Server — deepmerge-ts, via `@prisma/config`.** A stack exhaustion on
recursive object graphs, reachable only through Prisma's own config loading,
whose input is this repository's schema and config rather than anything a user
sends. Every Prisma 7.x pulls it; npm's only offer is a downgrade to Prisma 6,
which is a breaking change to the client, the adapter and the migration format.
Not worth it for an unreachable path.

`ioredis` 6.0 is likewise held at 5.11 — a major bump of the Redis client with
no feature we need behind it.

### Delivering a verdict is safe to retry

`POST /api/verdict` is idempotent. A duplicate returns the decision that was
recorded, not a 409.

This is not a nicety. On a phone the request WILL be retried — it succeeds, the
response is lost to a dropped connection or a backgrounded app, and the client
asks again. Answering 409 meant the client saw a failure while the case was in
fact decided: the clock was dead, every retry failed identically, and the
player was stuck on a screen with no way forward. It was found by playing one
case.

Two things must not happen on the retry, and both are asserted in
`tests/routes.test.ts`: no second record, and no second helping of merit or XP.
The verdict that stands is the first one — the test deliberately retries with
the OPPOSITE verdict to prove it.

The client half of the same failure lived in `app/case.tsx`. Delivering a
verdict clears `activeCase`, which fired the "no case in hand, go to the
docket" effect and raced `router.replace('/verdict')` — so the aftermath, which
is the payload of the entire case, could be skipped. And the catch reset the
submit guard unconditionally, including at zero seconds, where nothing was ever
going to call submit again.

### Running the client

`babel.config.js` is required, not optional. three@0.185 uses static class
initialisation blocks, `babel-preset-expo` does not enable that transform, and
Metro answers a transform error with a 500 for the whole bundle — so the app
shows a white screen and says nothing. Both `babel-preset-expo` and
`@babel/plugin-transform-class-static-block` are direct devDependencies for the
same reason: with a custom babel config, the preset has to resolve from the
project root, and it is otherwise only present nested under `expo`.

The debug build has no dev-client launcher, so it loads its bundle from
**port 8081** and will happily load whatever is being served there. If another
Expo project is running, this app will silently boot that project's JavaScript
— a red screen full of somebody else's stack traces. Serve this one on 8081.

### iPad is off on purpose

`ios.supportsTablet` is `false`. The courtroom uses `preserveAspectRatio="slice"`
against a 400x720 viewBox and the dossier is laid out as a phone column, so an
iPad crops the room hard and stretches the type. App Review tests on iPad when
you claim to support it. Set it back to `true` on the day there is an iPad
layout, not before.

This note lived in the config as a `"//"` key, which `app.json` has no way to
express — the Expo schema rejects any additional property, so `expo-doctor`
failed on it and prebuild reads a config the validator says is invalid. JSON
has no comments; the reasoning has to live somewhere that does.

### 3D, and when it is not there

`expo-gl` hands back contexts that look healthy and are not. The iOS Simulator
reports WebGL2, highp and 4096 textures, fires `onCreated`, ticks `useFrame` at
a clean 60fps — and is missing `EXT_color_buffer_float`. Without it:

- `<Canvas shadows>` takes every lit surface down with it. Not the shadows —
  the surfaces.
- `meshStandardMaterial` on a box shades its two front triangles differently
  and leaves half the mesh black along the diagonal.

None of it raises. `components/three/glCapability.ts` checks for that extension
and scenes stop drawing rather than drawing wrongly, because half a page is
worse than a clean flat one. Every device that reports WebGL2 has the
extension, so this changes nothing in players' hands.

Each 3D scene owns a native fallback and renders it BEHIND the canvas, with no
detection involved: an unpainted GLView is transparent, so the fallback shows
through exactly when there is nothing on top of it. This is not decoration.
The front page sets its masthead and headline in `Palette.bg` because they are
ink on paper, and the paper was coming from the 3D layer — with nothing painted
it rendered as a black screen with two invisible headings.

`xcrun simctl io booted screenshot` captures a **stale** GL surface — two
identical screenshots do not mean the scene is frozen. To check a scene is
live, log from inside `useFrame` and read Metro's output.

### Type that fits in its own line box

iOS clips a glyph that overflows its line box; it does not let it hang. Anton
has a 0.859em cap height and a 0.329em descender, so any `lineHeight` below
1.1885x the font size cuts the tops off capitals — and only on the first line,
which is what makes it read as a rendering fault rather than a leading value
somebody chose. Use `IMPACT_LEADING` from `constants/theme`.

Reanimated's `FadeIn` animates `opacity` to 1. A style that sets both
`entering={FadeIn}` and its own `opacity` ends up at 1, not at the value in the
style. Put the constant opacity on an inner view.
