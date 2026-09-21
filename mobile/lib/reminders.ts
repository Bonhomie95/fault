import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { useSettings } from '@/store/settings';

/**
 * Reminders, scheduled on the phone.
 *
 * Three kinds, and only three, because a game that nags is a game that gets
 * its notifications switched off:
 *
 *   summons   this evening, if today's summons has not been answered
 *   streak    late evening, if the streak is alive and nothing was sat today
 *   city      a day after the last visit, carrying the latest headline — the
 *             city kept going, and the paper says how
 *
 * All LOCAL: nothing is sent to a server, there is no push token, and there
 * is nothing to track. Everything is cleared and re-planned from scratch on
 * each call, so a reminder can never outlive the state that justified it.
 *
 * Loaded lazily and optionally, like lib/say: a build compiled before the
 * native module existed simply has no reminders, rather than a red screen.
 */

type NotificationsModule = typeof import('expo-notifications');

let mod: NotificationsModule | null | undefined;

function notifications(): NotificationsModule | null {
  if (mod !== undefined) return mod;
  mod = null;
  try {
    if (Platform.OS !== 'web' && requireOptionalNativeModule('ExpoNotificationScheduler')) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, see above
      mod = require('expo-notifications') as NotificationsModule;
      mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }),
      });
    }
  } catch {
    mod = null;
  }
  return mod;
}

export function remindersAvailable(): boolean {
  return notifications() !== null;
}

/**
 * Ask once, at a moment that makes sense — after the first verdict, when the
 * player has seen what the game is — never at launch.
 */
export async function askForReminders(): Promise<boolean> {
  const n = notifications();
  if (!n || !useSettings.getState().reminders) return false;
  try {
    const current = await n.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await n.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

export interface ReminderState {
  /** Today's summons is still waiting. */
  summonsWaiting: boolean;
  /** Current streak, and whether a case has been sat today. */
  streak: number;
  satToday: boolean;
  /** The newest headline, for the "the city kept going" reminder. */
  headline?: { outlet: string; text: string } | null;
  district?: string | null;
}

function at(hour: number, minute = 0, dayOffset = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Clear everything this app scheduled and plan the next few days again. */
export async function planReminders(state: ReminderState): Promise<void> {
  const n = notifications();
  if (!n) return;
  try {
    await n.cancelAllScheduledNotificationsAsync();
    if (!useSettings.getState().reminders) return;
    const perm = await n.getPermissionsAsync();
    if (!perm.granted) return;

    const now = Date.now();
    const plan: { when: Date; title: string; body: string }[] = [];
    const court = state.district ? `${state.district} court` : 'The court';

    // Tonight's summons, or tomorrow's.
    const summonsAt = state.summonsWaiting && at(19).getTime() > now ? at(19) : at(19, 0, 1);
    plan.push({
      when: summonsAt,
      title: `${court} is calling`,
      body: 'Your summons is waiting. Answer it, and sit a case while you are there.',
    });

    // A living streak that nothing has kept alive today.
    if (state.streak > 0 && !state.satToday && at(21, 30).getTime() > now) {
      plan.push({
        when: at(21, 30),
        title: `Day ${state.streak + 1} of your streak ends at midnight`,
        body: 'One case keeps it. The clock is two minutes.',
      });
    }

    // The city, a day on — with whatever the papers last printed.
    plan.push({
      when: new Date(now + 26 * 3_600_000),
      title: state.headline ? state.headline.outlet : 'The city kept going without you',
      body: state.headline
        ? `${state.headline.text}. The docket is open.`
        : 'Crime does not wait for a juror. See what the papers say.',
    });

    for (const p of plan) {
      if (p.when.getTime() <= now + 60_000) continue;
      await n.scheduleNotificationAsync({
        content: { title: p.title, body: p.body },
        trigger: { type: n.SchedulableTriggerInputTypes.DATE, date: p.when },
      });
    }
  } catch {
    // A reminder that cannot be scheduled is a reminder the player never sees;
    // nothing else depends on it.
  }
}

/** Turned off in settings: clear everything now. */
export async function clearReminders(): Promise<void> {
  try {
    await notifications()?.cancelAllScheduledNotificationsAsync();
  } catch {
    /* nothing scheduled */
  }
}
