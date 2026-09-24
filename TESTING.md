# Putting FAULT in front of testers

The courts run on Render (`https://fault-api-3l28.onrender.com`), so a tester's
phone only needs the internet — your Mac is just where they get the app from.

## Android — anyone on your Wi-Fi

1. Serve the build (from the repo root):

   ```bash
   cd dist-test && python3 -m http.server 8080 --bind 0.0.0.0
   ```

2. Tell people to open **http://192.168.8.145:8080** on their phone (that is
   this Mac's address on the current network — check it with
   `ipconfig getifaddr en7` if the network changes). The page has the download
   button, a QR code and the three steps Android makes them go through.
3. Leave the terminal running while they download. After that the app no
   longer needs your Mac at all.

Rebuild the APK after a code change:

```bash
cd mobile/android && ANDROID_HOME=$HOME/Library/Android/sdk \
  EXPO_PUBLIC_API_URL=https://fault-api-3l28.onrender.com \
  EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL=ca-app-pub-3940256099942544/1033173712 \
  EXPO_PUBLIC_ADMOB_ANDROID_REWARDED=ca-app-pub-3940256099942544/5224354917 \
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  && cp app/build/outputs/apk/release/app-release.apk ../../dist-test/fault-test.apk
```

Two things that will bite otherwise:

- **The bundle caches.** If you change a native dependency, delete
  `mobile/android/app/build/generated` and `.../intermediates/assets` before
  rebuilding, or the APK ships yesterday's JavaScript against today's native
  code. That is exactly how the first test build crashed on launch.
- `-PreactNativeArchitectures=arm64-v8a` halves the APK (72 MB instead of
  128 MB) and covers every phone made in the last several years. Drop it if
  someone turns up with an older 32-bit device.

## iPhone — on hardware you can plug in

There is no link-and-install for iOS. Either a device cabled to this Mac, or
TestFlight (needs the $99/yr Apple Developer Program).

1. `open mobile/ios/FAULT.xcworkspace`
2. Plug the iPhone in and pick it as the run destination.
3. Target **FAULT** → *Signing & Capabilities* → Team: your Apple ID. A free
   account works and the app lasts **7 days** before it must be re-installed.
4. Product → Scheme → Edit Scheme → Run → Arguments → **Environment
   Variables**, add:
   - `EXPO_PUBLIC_API_URL` = `https://fault-api-3l28.onrender.com`
   - `EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL` = `ca-app-pub-3940256099942544/4411468910`
   - `EXPO_PUBLIC_ADMOB_IOS_REWARDED` = `ca-app-pub-3940256099942544/1712485313`

   Without the first one a release build refuses to start and says so — that
   is deliberate, so nobody ships a build pointed at a laptop.
5. Set the scheme's Build Configuration to **Release** so it runs without a
   Metro server, then Run.

## Signing in

Guest works everywhere and needs nothing. The other two doors have conditions.

**Google.** The three OAuth client ids are in `mobile/.env` and on Render, each
one identified against Google's own endpoint rather than guessed:

| Platform | Client id |
| --- | --- |
| iOS | `831982871130-s7poee6m9opjpptd6ppid43ql4r9pttm` |
| Android | `831982871130-gqhj3ifdgil3g9d70dnufb7pa7imjil6` |
| Web | `831982871130-6k0v9seov080ojeumbpmhutgq4b8tq3f` |

Two things had to change for the button to work at all. The app asked for an
id_token directly (the implicit flow); Google answers
`unsupported_response_type` to that for iOS and Android clients, so it is now
authorization code + PKCE. And the redirect is no longer `fault://` — Google
only accepts the reversed client id as a scheme, which `app.config.js` now
registers natively from the same variables.

**Android still needs one change only you can make:** Google Cloud Console →
Credentials → the Android client → tick **Enable Custom URI scheme**. Until
then Google answers "Custom URI scheme is not enabled for your Android
client" and the button fails. iOS needs nothing.

**Apple.** Needs a paid Apple Developer Program membership — the Sign in with
Apple entitlement cannot be provisioned under free signing, so on a personal
team the button is there but the sheet will not complete. `APPLE_BUNDLE_ID`
(`com.bonhomie95.fault`) is already set on both sides for when it is.

## Running it on this Mac

```bash
cd mobile && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios
```

The locale is not decoration. Homebrew's Ruby 4 defaults to US-ASCII without
one, and CocoaPods then dies inside `unicode_normalize` with
`Encoding::CompatibilityError` before it even reads the Podfile. Export it in
your shell and you can drop the prefix.

If pods still fail with `invalid byte sequence in UTF-8` from the post-install
hook, delete `mobile/ios/build` and `mobile/ios/build-release` first: React
Native's hook walks every Info.plist under `ios/`, and the compiled binary
plists left behind by an old build are not text.

`mobile/.env` points at Render, so this build talks to the deployed server and
no local Postgres, Redis or Groq key is needed.

## What is fake during the test

| Thing | State |
| --- | --- |
| Adverts | Google's **test** adverts. They earn nothing and are labelled "Test mode". |
| Rewarded Merit | Paid on the app's word (`ADS_TRUST_CLIENT=true` on Render), because test adverts send no verification callback. **Turn this off before launch.** |
| Purchases | Not available — no products exist in App Store Connect or Play Console yet. Everything paid is still reachable with Merit. |
| The server | Render's free plan. It sleeps after 15 minutes idle; the first request wakes it and the app now waits through that (three tries) instead of saying "check your connection". Roughly $7/month removes the sleeping. |
| The database | Free plan, deleted **21 October 2026**. Everyone's careers go with it. |

## What to ask testers

The things worth watching, because they are new and unproven:

- Does the first case arrive fast enough to hold attention?
- The Daily Trial: do they come back for it the next day?
- Is the docket limit (6 free cases) felt as generous or as a wall?
- Do the defendants look like people from their own country?
- Anything in a case file that reads as wrong, offensive, or gives the answer
  away — there is a REPORT THIS FILE link on every case.
