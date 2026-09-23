import { Anton_400Regular } from '@expo-google-fonts/anton';
import {
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import { Inter_500Medium, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
  useFonts,
} from '@expo-google-fonts/playfair-display';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { ConsentGate } from '@/components/ConsentGate';
import { CourtError } from '@/components/CourtError';
import { MisconfiguredBuild } from '@/components/MisconfiguredBuild';
import { Palette } from '@/constants/theme';
import { API_CONFIG_ERROR } from '@/lib/api';
import { reportFatal } from '@/lib/report';
import { initSound } from '@/lib/sound';
import { setAdUser, startAds } from '@/lib/admob';
import { startPurchases } from '@/lib/iap';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const bootstrap = useGame((s) => s.bootstrap);
  const bootstrapping = useGame((s) => s.bootstrapping);
  const loadSettings = useSettings((s) => s.load);

  // Every family named in constants/theme must be loaded here. The layout
  // renders null until they are, so a face referenced but not loaded is not a
  // fallback font — it is a black screen forever.
  const [fontsLoaded] = useFonts({
    Anton_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
    Inter_500Medium,
    Inter_700Bold,
  });

  useEffect(() => {
    void bootstrap();
    // Preferences before audio: the players read the volume when they are
    // created, and a bed that starts at the default and corrects itself a
    // frame later is a bed the player hears jump.
    void loadSettings().then(() => initSound());
  }, [bootstrap, loadSettings]);

  useEffect(() => {
    if (fontsLoaded && !bootstrapping) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, bootstrapping]);

  // The store and the ad network, once there is a juror to pay and they have
  // accepted the terms. Purchases first: an interrupted purchase is money the
  // player is owed, and restoring it must not wait on an advert's consent form.
  const jurorId = useGame((s) => s.jurorId);
  const consentRequired = useGame((s) => s.consentRequired);
  useEffect(() => {
    if (!jurorId || consentRequired) return;
    setAdUser(jurorId);
    startPurchases();
    void startAds();
  }, [jurorId, consentRequired]);

  if (!fontsLoaded || bootstrapping) return null;

  // A release build pointed at no server, or at the eas.json placeholder.
  // Say so plainly rather than failing every request as "check your
  // connection" (see lib/api).
  if (API_CONFIG_ERROR) return <MisconfiguredBuild reason={API_CONFIG_ERROR} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Palette.bg }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Palette.bg },
          animation: 'fade',
          // There is no going back from a verdict. The stack reflects that.
          gestureEnabled: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="briefing" />
        <Stack.Screen name="lobby" />
        <Stack.Screen name="case" />
        <Stack.Screen name="verdict" />
        <Stack.Screen name="review" />
        <Stack.Screen name="record" />
        <Stack.Screen name="archive" />
        <Stack.Screen name="career" />
        <Stack.Screen name="boards" />
        <Stack.Screen name="store" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', gestureEnabled: true }} />
        {/* Reachable before sign-in: the cold open asks for agreement to these. */}
        <Stack.Screen name="legal" options={{ presentation: 'modal', gestureEnabled: true }} />
      </Stack>
      {/* Blocks play for a signed-in juror who has not accepted the current
          Terms and Privacy Policy. Renders nothing otherwise. */}
      <ConsentGate />
    </GestureHandlerRootView>
  );
}

/**
 * expo-router renders this instead of a subtree that threw.
 *
 * Exported from the root layout, so it covers every screen in the app. Without
 * it a render error is a blank screen in a release build with no way back.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  // The boundary was correct and silent. In a release build a render crash
  // showed the player a recovery screen and told nobody else anything at all.
  reportFatal(error);
  return <CourtError error={error} retry={retry} />;
}
