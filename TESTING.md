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
