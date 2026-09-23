<!--
  NOT LAWYER-CERTIFIED. Every statement below was checked against the code
  (server/src/routes/auth.ts, services/caseGenerator.ts, services/jurorProfile.ts,
  mobile/lib/location.ts, mobile/lib/say.ts, mobile/lib/admob.ts, services/adSsv.ts) when it was written. If the code
  changes what it collects or sends, this document must change with it — and
  so must the App Store privacy label and the Play data-safety form
  (see DEPLOY.md). Replace every [BRACKETED PLACEHOLDER] before launch.
-->
# Privacy Policy

This policy explains what FAULT (the "Service"), provided by [COMPANY NAME] ("we", "us"), collects, why, who it is shared with, and what you can do about it. We collect as little as the game needs to work.

## What we collect

**Account identifiers.**

- If you play as a **guest**, your device creates a random secret and keeps it in the device's secure storage. We store only a one-way hash of it — never the secret itself.
- If you sign in with **Apple** or **Google**, we store the provider's stable account identifier. If the provider shares your email address, we store it; Apple may give a private relay address instead. We never use your provider display name.
- If you sign in with Apple, we also store a token Apple issues so that we can revoke our access with Apple when you delete your account.

**Your juror name.** The name you choose is shown publicly on the leaderboards, next to your country and your city's standing.

**Country and district.** When you first swear in, the app may ask for your approximate location. It is used **on your device** only to work out which country you are in; your coordinates are never sent to us or stored. If you decline, the app uses your device's region setting. We store the country code. Your in-game district is assigned by the game within that country — it is not your real address or neighbourhood.

**Time zone.** Your device's time zone (for example, "Europe/Oslo"), so daily missions and streaks end at your midnight.

**Gameplay records.** The cases you are served, your verdicts, how long you took, your rank, trust, Merit balance and ledger, missions, streaks, the state of your in-game city, and the in-game news generated about it.

**Juror statistics.** From your verdicts we compute statistics about your judging — for example your conviction rate, how closely you follow the evidence, and whether things like a defendant's appearance or wealth seem to sway you. These are shown to you and used to shape future cases. They are not used for advertising.

**Purchases.** For real-money purchases we store the product, price, platform and the store's transaction id, and we send the receipt to Apple or Google to verify it. We never receive your card or payment details.

**Advertising.** If you have not removed advertisements, the app shows adverts from **Google AdMob** between cases (never during one). Google's software in the app may collect your device's advertising identifier, your IP address, and information about the adverts you see and interact with, to deliver and measure adverts and prevent fraud. Where the law requires it (for example in the EEA, the UK and Switzerland), you are asked for consent through Google's consent form before any advert is requested, and on iPhone and iPad the app asks the system's permission before using your advertising identifier for tracking. If you decline, you may still see adverts, but they will not be personalised. When you watch an optional rewarded advert, Google tells our server that the view was completed, together with your account's internal id, so that the reward can be credited.

**Reports.** If you report a case or a juror name, we store the report, the reason, any text you add, and which account filed it.

**Technical logs.** Our servers keep short-lived request logs (such as time, route, response status, and IP address) for security, rate limiting and debugging.

We do **not** collect your contacts, photos, microphone or precise location. Apart from the advertising described above — which you can decline, or remove entirely with a purchase — we do not track you across other companies' apps or websites. Courtroom voices are synthesised on your device; no audio is recorded or sent.

## Why we use it

- To run the game: to create and sign you in to your account, generate cases, keep your career and city, and show leaderboards.
- To personalise cases to your country and your judging history.
- To process and verify purchases and subscriptions, and restore them.
- To show advertisements, and to credit optional rewarded adverts.
- To moderate names and generated content, and act on reports.
- To keep the Service secure and working (fraud prevention, rate limiting, fixing faults).
- To meet legal obligations.

Where the law requires a legal basis (for example in the EEA and UK), we rely on performing our contract with you (running the game you asked to play), our legitimate interests (security, moderation, improving the game), your consent (personalised advertising), and legal obligation.

## Who we share it with

We do not sell your personal information in exchange for money. Advertising works as described below.

- **Google (AdMob).** Google provides the adverts in the app and processes the data described under "Advertising" as an independent controller under its own policies (https://policies.google.com/privacy and https://policies.google.com/technologies/partner-sites). Your juror statistics, verdicts and case history are never shared with Google or any advertiser.

- **Hosting providers.** Our servers, database and cache run with a cloud hosting provider ([HOSTING PROVIDER, e.g. Render]) which processes data on our behalf.
- **Groq (AI case generation).** To write each case, we send Groq a prompt describing the setting — your country, the in-game district, court and police service — the state of your in-game city, the names of fictional characters from your earlier cases, and a short summary of your juror statistics (for example, "conviction rate 62%, 14 cases heard") and which bias to probe. After a verdict, we send the fictional case details and your verdict so it can write the follow-up news line. When your written juror profile is generated, we send your juror name and your juror statistics. We do **not** send your account identifiers, email address, time zone, purchases or IP address to Groq.
- **Apple and Google.** To verify sign-in tokens, verify and restore purchases, and revoke Sign in with Apple on account deletion.
- **Legal and safety.** If required by law, or to protect the rights, property or safety of our players, the public, or us.
- **Business transfers.** If our business is sold or merged, your information may transfer to the new owner under this policy.

Your data may be processed in countries other than your own. Where required, we use appropriate safeguards (such as standard contractual clauses) for those transfers.

## How long we keep it

- Your account, career, city and statistics: until you delete your account.
- Sign-in sessions: refresh tokens expire and are deleted with your account.
- Purchase records: until you delete your account, except where tax or accounting law requires us to keep transaction records longer.
- Reports you filed: kept after your account is deleted as a moderation record, with your account link removed.
- Server logs: kept for a short period (typically no more than 30 days) and then deleted.

## Your rights and choices

- **Delete.** Settings → Delete this juror deletes your account and everything linked to it, immediately and permanently. If you signed in with Apple, we also ask Apple to revoke our access.
- **Export.** Settings → Download my data gives you a copy of your account data in a machine-readable (JSON) format.
- **Correct.** You can change your juror name in Settings (once a day).
- **Location.** You can decline or revoke location permission at any time in your device settings; the game still works.
- **Advertising.** You can change your advertising consent at any time from Settings → Ad privacy choices (where it applies), turn off tracking in your device's privacy settings, or remove interstitial adverts entirely with a purchase.
- Depending on where you live (for example under the GDPR, UK GDPR, or California law), you may also have the right to access, restrict or object to processing, and to complain to your local data protection authority. Contact us to exercise any right; we will respond within the time the law requires.

## Children

The Service is not directed at children under 13 and they may not create an account. Adverts in the app are restricted to content suitable for teenagers. If you believe a child under 13 has created an account, contact us and we will delete it.

## Security

Access tokens are short-lived and signed; refresh tokens and guest secrets are stored only as hashes; data is encrypted in transit. No system is perfectly secure, but we work to protect your information and will notify you and regulators of a breach where the law requires.

## Changes

If we change this policy in a material way, we will ask you to review and accept it in the app. The date at the top of the in-app copy shows which version you are reading.

## Contact

[COMPANY NAME], [COMPANY ADDRESS]. Email: **[SUPPORT EMAIL]**. If you are in the EEA or UK and we are required to appoint a representative there, their details are: [EU/UK REPRESENTATIVE, if required].
