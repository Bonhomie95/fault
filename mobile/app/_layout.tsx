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
import { Palette } from '@/constants/theme';
import { initSound } from '@/lib/sound';
import { useGame } from '@/store/game';
import { useSettings } from '@/store/settings';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const bootstrap = useGame((s) => s.bootstrap);
  const bootstrapping = useGame((s) => s.bootstrapping);
  const loadSettings = useSettings((s) => s.load);

  const [fontsLoaded] = useFonts({
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

  if (!fontsLoaded || bootstrapping) return null;

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
        <Stack.Screen name="career" />
        <Stack.Screen name="boards" />
        <Stack.Screen name="store" options={{ presentation: 'modal', gestureEnabled: true }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', gestureEnabled: true }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
