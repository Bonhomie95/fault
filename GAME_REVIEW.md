# Game review — 30 September 2026

Reviewed the mobile onboarding, country resolution, case serving/generation/fallbacks, country profiles, naming, daily trial, aftermath/news, ads, storefront, receipt verification, economy, legal documents, and the server test suite.

## Changes

- Country resolution now uses device GPS first, a country-only local IP lookup second, and device region last. The API uses Express’s configured trusted proxy chain; it does not accept arbitrary geolocation headers. Coordinates remain on the phone. Existing career seats remain stable, including deliberately unlocked foreign seats.
- Missing country information uses a neutral setting rather than silently assigning Norway. Unlisted countries display their country name, with generic settings where a dedicated profile is unavailable. Country lookup does not establish a player’s real city; in-game districts remain assigned locations within their country.
- Fallback cases now use coherent given-name/surname registers across the country. Generated cases request everyday national names without ethnic labels, stereotypes or ethnic clues. Existing character identities are preserved.
- Generation instructions prohibit adapting real news, trials and incidents. All narrative fields are screened for story disclosures and the existing content restrictions. Generated follow-ups use the case country and reject story disclosures. The fiction disclosure lives in Terms, outside playable stories. This is a generation safeguard, not proof that an AI output cannot accidentally resemble a real event; the existing report/withdrawal flow remains necessary.
- Authored fallback files now carry their local court, matching their already localised setting.
- Existing interstitial placement remains after the aftermath, before continuing, at a server-selected cadence of 2–3 completed cases. Fixed a timeout that could resume play behind an open native advert, preload failure recovery, and duplicate completion handling.
- Every current native build uses Google’s test publisher/app IDs and test interstitial/rewarded units, ignoring old live credentials. Test units do not earn revenue. Test ads also skip the tracking request. A native rebuild is required for the app-ID configuration change.
- Permanent No Adverts is now earnable at 4,500 Merit or purchasable immediately. Unlimited Docket remains earnable at 6,000 Merit or purchasable immediately. Ordinary case rewards are 60–85 Merit, so these take roughly 53–75 and 71–100 cases respectively before mission/streak rewards. Existing cosmetic and special-docket upgrades remain earnable. No purchase changes verdicts, evidence, rank, trust or case clocks.
- Updated Privacy to describe IP country estimation, updated Terms, bumped the legal version and regenerated both bundled legal copies.
- Updated compatible dependency fixes and pinned the new geolocation dependency’s IP parser to a patched version.

## Validation

- Server suite: 460 tests passed, including country resolution, national fallback name coverage, story disclosure screening, economy, receipt/auth security, cases and gameplay routes.
- Server and mobile TypeScript checks passed.
- Expo lint passed.
- Git diff whitespace check passed.
- Legal source/bundle synchronization verified by the compliance suite.
- No native build, physical-device ad playback, live model evaluation, store purchase or deployment was performed.

## Remaining work before public release

1. Test full-screen ad dismissal, no-fill behavior, rewarded completion and purchase/restore on physical iOS and Android devices. Test ads send no signed reward callback; the test API must explicitly enable ADS_TRUST_CLIENT to exercise rewards. Keep that shortcut disabled on a public API.
2. Replace the testing-only app IDs and units together before public launch. Confirm rewarded server verification and native consent forms using the live publisher. Existing localized storefront prices come from Apple/Google; configure those products in both store consoles.
3. Verify TRUST_PROXY_HOPS against the actual hosting proxy chain, then confirm IP country resolution from several countries and a VPN. Maintain the bundled GeoIP database as dependencies are updated. GPS/IP estimates and device regions can all be wrong.
4. Expand dedicated profiles for countries currently receiving generic names, money and district settings. The neutral fallback prevents Nigeria/Norway leakage but does not provide full cultural localization for every country.
5. Fill the DMCA agent placeholders in legal/dmca.md. Privacy also contains an EU/UK representative placeholder conditional on whether a representative is required. Legal text has not been lawyer-reviewed.
6. Four high dependency advisories remain in Prisma’s tooling graph (deepmerge-ts/mysql2 and their parent packages). The automatic fix proposes a breaking Prisma downgrade; this review did not apply that downgrade. The game uses PostgreSQL, but the tooling dependency graph still needs a compatible upstream fix.
7. Measure ad fill, actual impressions, store conversion, daily return rate and generation cost in an internal beta before tuning prices or increasing ad frequency. The 72-hour starter bundle already offers permanent unlimited play and ad removal for $4.99; compare its revenue against recurring pass uptake before changing its contents.

References: [GeoIP country library](https://github.com/sapics/geoip-country), [Ad SDK testing documentation](https://docs.page/invertase/react-native-google-mobile-ads/testing).
