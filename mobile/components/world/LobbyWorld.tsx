import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Accents, Elevation, Fonts, Palette, Radius, Space, Type } from '@/constants/theme';
import { api, type Mission, type NewsStory, type Standing } from '@/lib/api';
import * as haptic from '@/lib/haptics';
import { play } from '@/lib/sound';
import { INK, INK_MUTED, Masthead, paper, Story } from './Papers';

/**
 * The lobby's reasons to come back: today's summons, today's missions, and
 * the front page of a city that kept going while you were gone.
 */

/* ------------------------------------------------------------------ *
 * The front page.
 * ------------------------------------------------------------------ */

export function FrontPage({ district, refreshKey }: { district: string | null; refreshKey: number }) {
  const [items, setItems] = useState<NewsStory[] | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let live = true;
    api
      .news()
      .then((r) => {
        if (!live) return;
        setItems(r.items.slice(0, 3));
        setUnread(r.unread);
      })
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, [refreshKey]);

  if (!items) return null;

  const title = district ? `The ${district} Herald` : 'The Herald';
  return (
    <Pressable
      onPress={() => router.push('/news')}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${unread} unread stories. Read the papers.`}
      style={[paper.sheet, styles.front]}
    >
      <Masthead title={title} sub={unread > 0 ? `${unread} UNREAD` : 'THE CITY, THIS WEEK'} />
      {items.length === 0 ? (
        <Text style={styles.empty}>
          Nothing in the papers yet. Sit a case — the city will have something to say about it.
        </Text>
      ) : (
        items.map((s, i) => <Story key={s.id} story={s} lead={i === 0} withBody={i === 0} />)
      )}
      <Text style={styles.more}>READ THE PAPERS →</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * The daily summons.
 * ------------------------------------------------------------------ */

export function DailySummons({
  standing,
  onCollected,
}: {
  standing: Standing | null;
  onCollected: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState<number | null>(null);
  const daily = standing?.daily;
  if (!daily || (!daily.available && paid === null)) return null;

  const collect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.collectDaily();
      setPaid(r.merit);
      play('stamp');
      haptic.stamped();
      onCollected();
    } catch {
      setPaid(0);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.summons}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.summonsEyebrow}>TODAY’S SUMMONS</Text>
        <Text style={styles.summonsText}>
          {paid !== null
            ? paid > 0
              ? `Answered. +${paid} Merit.`
              : 'Already answered today.'
            : `Answer the court’s call for +${daily.merit} Merit.${
                (standing?.currentStreak ?? 0) > 1 ? ` Day ${standing?.currentStreak} of your streak.` : ''
              }`}
        </Text>
      </View>
      {paid === null && (
        <Button label="Answer" onPress={collect} variant="primary" busy={busy} accent={Accents.systemic} />
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Today's missions, in brief.
 * ------------------------------------------------------------------ */

export function MissionStrip({ refreshKey, onClaimed }: { refreshKey: number; onClaimed: () => void }) {
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .missions()
      .then((r) => setMissions(r.missions))
      .catch(() => setMissions([]));
  }, []);
  useEffect(load, [load, refreshKey]);

  if (!missions || missions.length === 0) return null;
  // Dailies first, then anything claimable from the rest.
  const shown = [
    ...missions.filter((m) => m.kind === 'daily'),
    ...missions.filter((m) => m.kind !== 'daily' && m.complete && !m.claimed),
  ].slice(0, 5);

  const claim = async (key: string) => {
    if (claiming) return;
    setClaiming(key);
    try {
      await api.claimMission(key);
      play('stamp');
      onClaimed();
      load();
    } catch {
      load();
    } finally {
      setClaiming(null);
    }
  };

  return (
    <View style={styles.missions}>
      <View style={styles.missionsHead}>
        <Text style={styles.missionsTitle}>TODAY’S ORDERS</Text>
        <Pressable onPress={() => router.push('/career')} hitSlop={10} accessibilityRole="link">
          <Text style={styles.missionsAll}>ALL MISSIONS →</Text>
        </Pressable>
      </View>
      {shown.map((m) => (
        <View key={m.key} style={styles.mission}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.missionTitle}>{m.title}</Text>
            <Text style={styles.missionDesc}>{m.description}</Text>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(100, (m.progress / m.target) * 100)}%` },
                  m.complete && { backgroundColor: Accents.systemic },
                ]}
              />
            </View>
            <Text style={styles.missionMeta}>
              {m.progress}/{m.target} · +{m.xp} XP{m.merit ? ` · +${m.merit} Merit` : ''}
            </Text>
          </View>
          {m.complete && !m.claimed && (
            <Button
              label="Claim"
              onPress={() => claim(m.key)}
              variant="primary"
              busy={claiming === m.key}
              accent={Accents.systemic}
            />
          )}
          {m.claimed && <Text style={styles.done}>DONE</Text>}
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * While you were away.
 * ------------------------------------------------------------------ */

export function AwayReport({ stories, onClose }: { stories: NewsStory[]; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[paper.sheet, styles.awaySheet]}>
          <Masthead title="While you were away" sub="THE CITY DID NOT WAIT" />
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: Space.sm }}>
            {stories
              .slice()
              .reverse()
              .map((s, i) => (
                <Story key={s.id} story={s} lead={i === 0} />
              ))}
          </ScrollView>
          <Text style={styles.awayFoot}>
            The docket is how you answer. Every verdict moves the city back — or further.
          </Text>
          <Pressable onPress={onClose} style={styles.awayBtn} accessibilityRole="button">
            <Text style={styles.awayBtnText}>BACK TO THE COURT</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  front: { ...Elevation.card },
  empty: { fontFamily: Fonts.displayRegular, fontSize: Type.small, color: INK_MUTED, lineHeight: 20 },
  more: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.6, color: INK, textAlign: 'right' },

  summons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Accents.systemic + '66',
    padding: Space.lg,
  },
  summonsEyebrow: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 2, color: Accents.systemic },
  summonsText: { fontFamily: Fonts.ui, fontSize: Type.small, lineHeight: 20, color: Palette.text },

  missions: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.hairline,
    padding: Space.lg,
    borderRadius: Radius.lg,
    gap: Space.md,
    ...Elevation.card,
  },
  missionsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  missionsTitle: { fontFamily: Fonts.uiBold, fontSize: Type.micro, letterSpacing: 2.4, color: Palette.textMuted },
  missionsAll: { fontFamily: Fonts.mono, fontSize: Type.micro, letterSpacing: 1.4, color: Palette.textMuted },
  mission: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  missionTitle: { fontFamily: Fonts.uiBold, fontSize: Type.small, color: Palette.text },
  missionDesc: { fontFamily: Fonts.ui, fontSize: Type.micro + 1, color: Palette.textMuted, lineHeight: 17 },
  missionMeta: { fontFamily: Fonts.mono, fontSize: Type.micro, color: Palette.textFaint },
  track: { height: 4, borderRadius: 2, backgroundColor: Palette.surfaceHigh, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Accents.financial },
  done: { fontFamily: Fonts.monoBold, fontSize: Type.micro, letterSpacing: 1.4, color: Accents.systemic },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    padding: Space.lg,
  },
  awaySheet: { gap: Space.md },
  awayFoot: { fontFamily: Fonts.displayRegular, fontSize: Type.small, fontStyle: 'italic', color: INK_MUTED, lineHeight: 20 },
  awayBtn: { backgroundColor: INK, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  awayBtnText: { fontFamily: Fonts.uiBold, fontSize: Type.small, letterSpacing: 2, color: Palette.text },
});
