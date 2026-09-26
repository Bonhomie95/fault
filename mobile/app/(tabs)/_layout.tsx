import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { Fonts, Palette, Type } from '@/constants/theme';

/**
 * The court's five rooms.
 *
 * Everything under here already existed — the papers, the career, the cities,
 * the juror's own record — but the only way in was a list of seven text links
 * at the BOTTOM of the docket, under the day's cases, the Daily Trial, the
 * offers and the City Pulse. A player had to scroll past everything they came
 * for to discover the rest of the game existed, and nothing told them it did.
 *
 * A route group is the right shape for this: `(tabs)` does not appear in any
 * URL, so `/lobby`, `/news`, `/career` and `/boards` still resolve exactly as
 * they did and every existing `router.push` keeps working.
 *
 * What stays OUT of the bar, deliberately:
 *  - the case, the verdict and the review, which are full-screen by design —
 *    a juror under a 120-second clock is not offered four other rooms;
 *  - the store and settings, which are modals over whatever you were doing;
 *  - the archive and the juror record, which are rank-locked, and a tab that
 *    is usually locked is a tab that teaches players to ignore the bar.
 */

const GOLD = '#D4A017';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: GOLD,
        tabBarInactiveTintColor: Palette.textMuted,
        tabBarStyle: styles.bar,
        tabBarLabelStyle: styles.label,
        tabBarItemStyle: styles.item,
        sceneStyle: { backgroundColor: Palette.bg },
      }}
    >
      <Tabs.Screen
        name="lobby"
        options={{
          title: 'DOCKET',
          tabBarIcon: ({ color }) => <Feather name="folder" size={20} color={color} />,
          tabBarAccessibilityLabel: 'The docket. Today’s cases and the Daily Trial.',
        }}
      />
      <Tabs.Screen
        name="news"
        options={{
          title: 'PAPERS',
          tabBarIcon: ({ color }) => <Feather name="file-text" size={20} color={color} />,
          tabBarAccessibilityLabel: 'The papers. What your city printed about your verdicts.',
        }}
      />
      <Tabs.Screen
        name="career"
        options={{
          title: 'CAREER',
          tabBarIcon: ({ color }) => <Feather name="award" size={20} color={color} />,
          tabBarAccessibilityLabel: 'Your career. Rank, courts and standing orders.',
        }}
      />
      <Tabs.Screen
        name="boards"
        options={{
          title: 'CITIES',
          tabBarIcon: ({ color }) => <Feather name="globe" size={20} color={color} />,
          tabBarAccessibilityLabel: 'The cities. How every juror’s city compares.',
        }}
      />
      <Tabs.Screen
        name="juror"
        options={{
          title: 'JUROR',
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
          tabBarAccessibilityLabel: 'Your chambers. Record, past cases, the store and settings.',
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: Palette.bg,
    borderTopColor: Palette.hairline,
    borderTopWidth: 1,
    // The room has no windows, and the bar is part of the room.
    elevation: 0,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: 8,
  },
  label: {
    fontFamily: Fonts.uiBold,
    // Five tabs share a phone's width, so every label is ONE SHORT WORD.
    // "CHAMBERS" was measured on a 393pt screen and came back "CHAMBE…";
    // six characters is the practical ceiling here, so the room is called
    // Chambers and the tab that opens it is called JUROR.
    // Type.micro is the floor the type scale allows; anything smaller is a
    // label nobody over forty can read on a phone.
    fontSize: Type.micro,
    letterSpacing: 0.8,
    marginTop: 3,
  },
  item: { paddingVertical: 4 },
});
