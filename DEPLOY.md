# Deploying FAULT

Two halves: the API (`server/`, a Node service with Postgres and Redis) and the
app (`mobile/`, Expo SDK 54, built with EAS). The API must be live first — the
app's release builds refuse to run against a placeholder host.

---

## 1. The API on Render

`render.yaml` at the repo root is a Render Blueprint: one Docker web service
(`server/Dockerfile`), one Postgres, one Key Value (Redis) instance.

1. Push the repo to GitHub.
2. Render dashboard → **New → Blueprint** → select the repo. Render reads
   `render.yaml` and asks for every `sync: false` variable:

   | Variable | What to put there |
   | --- | --- |
   | `JWT_SECRET` | 48+ chars: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `CORS_ORIGINS` | The service's own URL, e.g. `https://fault-api.onrender.com` (the app sends no Origin; this list is for browsers and must be non-empty in production) |
   | `PUBLIC_BASE_URL` | Empty on Render (it uses `RENDER_EXTERNAL_URL`). Set when a custom domain is attached |
   | `SUPPORT_EMAIL` | The address players and reviewers write to |
   | `GROQ_API_KEYS` | Comma-separated Groq keys. Without them the server serves the hand-authored fallback docket |
   | `GOOGLE_CLIENT_IDS` | iOS, Android and Web OAuth client ids, comma-separated (empty = Google sign-in off) |
   | `APPLE_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY` | A **Sign in with Apple** key — see §3 |
   | `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | App Store Connect **In-App Purchase** key (receipt verification) |
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | Play Developer API service account (receipt verification) |

3. First deploy: the container runs `prisma migrate deploy` before starting,
   so the schema is created automatically. A failed migration exits the
   container and Render keeps the previous release serving.
4. Check `https://<service>/health` returns `{"ok":true,...}` and
   `https://<service>/legal/privacy` renders.
5. **`TRUST_PROXY_HOPS`** is set to 1. Verify it against Render's current
   proxy chain (log `req.ips` once) before trusting per-IP rate limits — see
   `server/.env.example`.

The full list of variables, with the reasoning for each, is in
`server/.env.example`. New in this release:

- `ALLOW_GUEST_AUTH` (default `true`) — "Play as guest"; safe in production.
- `ADS_SERVER_VERIFIED` (default `false`) — set `true` once AdMob's
  server-side verification callback is configured on the rewarded ad units
  (section 5). Until then the store offers no rewarded views. Rewarded views
  are paid ONLY by Google's signed callback (`GET /api/store/ssv`); the
  client-claim route exists for development and 404s in production.
- `PUBLIC_BASE_URL` — origin used to build the privacy/terms URLs.
- `APPLE_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY`,
  `APPLE_CLIENT_ID` — Sign in with Apple token revocation on account deletion.
- `PRIVACY_POLICY_URL` / `TERMS_URL` are now optional overrides; production
  no longer refuses to boot without them.

### Running the image yourself

```sh
cd server
docker build -t fault-api .
docker run --env-file .env.production -p 4000:4000 fault-api
```

---

## 2. The app on EAS

```sh
cd mobile
npm i -g eas-cli
eas login
eas init                       # links the project, writes extra.eas.projectId to app.json
```

1. **Set the API host.** In `mobile/eas.json`, replace
   `https://api.example.invalid` (production) and
   `https://staging.example.invalid` (preview) with the real origins.
   **TODO(owner): the host is not known yet.** Until it is replaced, a
   release build shows "This build cannot reach its server" naming
   `EXPO_PUBLIC_API_URL` — it does not ship silently broken.
2. Optional Google sign-in: add `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS`,
   `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`, `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`
   to each profile's `env`. Without them the button is hidden; Apple (iOS) and
   Play as guest (everywhere) remain.
3. Build: `eas build --platform ios --profile production` and
   `eas build --platform android --profile production`. Let EAS generate and
   hold the credentials (distribution certificate, provisioning profile,
   Android upload keystore) — do not keep the only keystore on a laptop.
4. Submit: `eas submit --platform ios` / `--platform android`. Fill in
   `submit.production` in `eas.json` (`appleId`, `ascAppId`, `appleTeamId`;
   Play service-account key path — never commit the key).

Local native builds: `ios/` and `android/` are generated (CNG) and ignored.
After changing `app.json` (permissions, plugins, privacy manifest) run
`npx expo prebuild --clean` before a local `expo run:*`.

---

## 3. Apple and Google consoles

**Apple Developer / App Store Connect**

- App ID `com.bonhomie95.fault` with the **Sign in with Apple** capability.
- **Keys → +** → enable *Sign in with Apple*, configure with the app's primary
  App ID, download the `.p8` once. Its Key ID → `APPLE_SIGNIN_KEY_ID`, the file
  contents (newlines as `\n`) → `APPLE_SIGNIN_PRIVATE_KEY`, your Team ID →
  `APPLE_TEAM_ID`. This is what lets account deletion revoke the player's
  Apple authorisation (guideline 5.1.1(v)).
- **Users and Access → Integrations → In-App Purchase** key → the three
  `APPLE_ISSUER_ID/KEY_ID/PRIVATE_KEY` variables (a different key).
- Create the in-app products — see section 5 for the exact list. A product
  that is not approved/active is simply not offered for money in the app.

**Google Play Console**

- Create the app `com.bonhomie95.fault`; enrol in Play App Signing.
- OAuth clients (Google Cloud console) for iOS, Android (with the Play
  signing SHA-1) and Web → `GOOGLE_CLIENT_IDS` and the `EXPO_PUBLIC_*` vars.
- A service account with Play Developer API access →
  `GOOGLE_SERVICE_ACCOUNT_JSON`.

---

## 4. Store listing checklist

Copy for both stores is in `store/listing.md`.

**Legal URLs** (both stores require them):
Privacy Policy `https://<api-host>/legal/privacy`, Terms
`https://<api-host>/legal/terms`. Before submitting, fill every
`[BRACKETED PLACEHOLDER]` in `legal/*.md` (governing law, company address,
support email, DMCA agent), run `node tools/legal/sync.mjs`, confirm `node tools/legal/check.mjs` passes, and redeploy.
Register the DMCA agent with the U.S. Copyright Office if you rely on the
safe harbour. The documents are not lawyer-reviewed — get them reviewed.

**Age rating**

- Apple: answer the questionnaire honestly — *Infrequent/Mild Realistic
  Violence* (violence is referenced, never depicted graphically), *Infrequent/
  Mild Mature/Suggestive Themes* (crime, courts). No gambling, no user-to-user
  chat. Expect **12+**. The Terms set a 13+ minimum.
- Google (IARC): crime themes, referenced violence, no graphic content,
  users cannot interact except via public usernames (juror names) → expect
  **Teen**. Answer "yes" to user-generated content (juror names) and describe
  the filter, report and hide tools.

**AI-generated content disclosure**

- Google Play: declare that the app generates content with AI (the case files
  and juror profile) and that players can report offensive AI output in-app
  (Report button on every case; reported cases are withdrawn immediately).
- Apple: mention in the review notes that case text is AI-generated, that all
  people are fictional and real institutions are setting only (Terms §3),
  and where the report button is.

**App Store privacy "nutrition label"** — must match `legal/privacy.md` and
the privacy manifest in `app.json`. Data *linked to the user*, used for *App
Functionality*, *not* used for tracking:

| Category | Data type | Why |
| --- | --- | --- |
| Identifiers | User ID | account (guest hash / Apple / Google subject) |
| Contact Info | Email Address | only if Apple/Google shares it |
| User Content | Other User Content | juror name (public) and reports |
| User Content | Gameplay Content | verdicts, city, missions, news |
| Purchases | Purchase History | IAP records |
| Location | Coarse Location | country only; coordinates never leave the device |

Plus, for **Google AdMob** (third-party advertising, *not* linked to the
user, **used for tracking** when the player allows it through ATT):

| Category | Data type | Why |
| --- | --- | --- |
| Identifiers | Device ID | advertising (IDFA, only with ATT permission) |
| Usage Data | Advertising Data | adverts shown/tapped |
| Usage Data | Product Interaction | ad measurement |

Tracking: **Yes** — the app shows the ATT prompt (text in `app.json`,
`expo-tracking-transparency`) after Google's consent form, and
`NSPrivacyTracking` is true in the privacy manifest.

**Google Play Data safety form**

- Collected: Personal info → *User IDs*, *Email address* (optional),
  *Other info* (juror name); App activity → *Other actions* / in-game
  activity; Financial info → *Purchase history*; Location → *Approximate
  location*.
- Also collected and **shared** for advertising (Google AdMob): *Device or
  other IDs* (advertising ID), *App interactions*. Declare "Advertising or
  marketing" as the purpose, and that the app contains ads.
- Groq, hosting and Apple/Google act as service providers/processors, which
  Play does not count as sharing — but re-check Google's current definition.
- Play Console → Policy → **Ads**: "Yes, my app contains ads". Advertising ID
  declaration: used for advertising (the AdMob SDK adds the permission).
- Encrypted in transit: **Yes**. Users can request deletion: **Yes**
  (in-app, Settings → Delete this juror; also provide the web URL Play asks
  for — `https://<api-host>/legal/privacy` (section "Your rights and choices") or a
  support email).

**Reviewer notes** (App Store Connect → App Review Information):
"Tap PLAY AS GUEST to start without an account. The game is free: six
cases a day plus the Daily Trial. In-app purchases and the Juror Pass
subscription are in the lobby → The Clerk's Office; Restore Purchases is at
the bottom of that screen and in Settings. Settings → Delete this juror
removes the account; Settings → Download my data exports it. Long-press any
name on THE CITIES to report or hide it."

**Permissions** now requested: iOS *location when in use* only. Android:
coarse location, internet, vibrate. Microphone, background location, overlay
and external storage are blocked in `app.json`.

---

## 5. Money: in-app purchases, the Juror Pass and adverts

The catalogue lives in `server/src/domain/store.ts` (`SKUS`). Product ids in
the stores must match it exactly. `mobile/store-testing/FAULT.storekit`
mirrors it for simulator testing.

**App Store Connect → In-App Purchases**

| Product id | Type | Price tier (USD) |
| --- | --- | --- |
| `starter_bundle` | Non-consumable | 4.99 |
| `campaign` | Non-consumable | 4.99 |
| `no_ads` | Non-consumable | 3.99 |
| `pack_corporate`, `pack_cold_case`, `pack_political` | Non-consumable | 1.99 |
| `room_oak`, `room_marble`, `room_concrete`, `room_night` | Non-consumable | 1.99 |
| `seal_brass`, `seal_obsidian`, `seal_ivory` | Non-consumable | 1.99 |
| `patron` | Non-consumable | 19.99 |
| `shield_pack` | Consumable | 0.99 |
| `merit_small` / `merit_medium` / `merit_large` | Consumable | 1.99 / 4.99 / 9.99 |

**Subscriptions**: one group, *Juror Pass*, with `pass_monthly` (1 month,
4.99) and `pass_yearly` (1 year, 29.99). A 7-day free trial on the yearly
plan converts well; configure it as an introductory offer — the app shows
whatever the store returns. Add the subscription's terms to the App Store
description (auto-renewal wording is also shown in the store screen and in
Terms §5a) and link the Terms of Use (EULA) in App Store Connect.

**Google Play Console → Monetise**: the same ids as *in-app products*
(consumable vs non-consumable is decided by the app, which consumes
`shield_pack` and the Merit packs); `pass_monthly` and `pass_yearly` as
*subscriptions*, each with one auto-renewing base plan. Link the Play
service account (`GOOGLE_SERVICE_ACCOUNT_JSON`) with "View financial data"
and "Manage orders and subscriptions".

**Server variables** for verification: `APPLE_BUNDLE_ID`, `APPLE_ISSUER_ID`,
`APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `ANDROID_PACKAGE_NAME`,
`GOOGLE_SERVICE_ACCOUNT_JSON`. Without them every purchase is refused (the
safe default). Never set `ALLOW_FAKE_PURCHASES` in production — the server
refuses to boot with it.

**Google AdMob**

1. Create the app for iOS and for Android in AdMob. Create four ad units:
   iOS interstitial, iOS rewarded, Android interstitial, Android rewarded.
2. On **both rewarded units** turn on *Server-side verification* with the URL
   `https://<api-host>/api/store/ssv`. Then set `ADS_SERVER_VERIFIED=true` on
   Render — and set `ADS_TRUST_CLIENT=false`, which is the internal-test
   switch that pays rewarded views on the client's word because Google's TEST
   ad units send no callback. Leaving it on at launch is an open Merit tap.
3. **Privacy & messaging**: publish a *GDPR* message (EEA/UK/Switzerland) and
   an *IDFA explainer* message for iOS. The app calls Google's consent form
   before any ad request and offers *Ad privacy choices* in Settings.
4. Put the ids in EAS (Project → Environment variables, or `eas.json` env for
   the production profile):
   - `ADMOB_IOS_APP_ID`, `ADMOB_ANDROID_APP_ID` (native, read by
     `app.config.js`; without them builds get Google's TEST app ids)
   - `EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL`, `EXPO_PUBLIC_ADMOB_IOS_REWARDED`,
     `EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL`,
     `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED` (without them a release build shows
     no adverts at all — never test ads)
5. Publish `app-ads.txt` on the developer website listed in both stores.
6. Optional: `EXPO_PUBLIC_SHARE_URL` — the link added to shared Daily Trial
   verdicts (your store page or website).

**Pricing and economy knobs** (all server-side, no app release needed):
`DOCKET.freePerDay` (6), `DOCKET.adCasesPerDay` (3), `MERIT.*`,
`PASS_MERIT_MULTIPLIER`, `STARTER_WINDOW_HOURS` in `domain/store.ts`.
