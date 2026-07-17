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
import { useGame } from '@/store/game';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const bootstrap = useGame((s) => s.bootstrap);
  const bootstrapping = useGame((s) => s.bootstrapping);

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
  }, [bootstrap]);

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
