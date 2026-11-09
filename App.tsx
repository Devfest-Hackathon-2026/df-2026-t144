import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { DelaGothicOne_400Regular } from '@expo-google-fonts/dela-gothic-one';
import Art from './src/components/Art';
import CameraScan from './src/components/CameraScan';
import DesktopIntro from './src/components/DesktopIntro';
import DiscoveryCard from './src/components/DiscoveryCard';
import DiscoveryMap, { useGoogleMapAvailable } from './src/components/Map';
import InterestPicker, { InterestExamples } from './src/components/InterestPicker';
import RelatedTeaser from './src/components/RelatedTeaser';
import { SPOTS, DESTINATIONS, DEMO_ORIGIN, STORIES, TOPICS } from './src/data/spots';
import { addDiscovery, createDemoRoutes, distanceMeters, formatDistance, getAreaStatus, getCameraUnlockState, getUnlockState, pathBetween, pointAlong, sanitizeDiscoveries } from './src/domain';
import { useRoadPath } from './src/useRoadPath';
import { nextUndiscovered, pickStory, rankSpots, topicScore } from './src/interests';
import { useLocation } from './src/useLocation';
import { fetchRoutes } from './src/routesClient';
import { apiBaseUrl, apiConfigured } from './src/apiClient';
import { colors as c, radius, text as t } from './src/theme';
import { Button, Celebrate, Icon, QCoin, QPin, SectionTitle, Tag, installWebStyles } from './src/ui';
import type { Budget, Discovery, LocationFix, Mode, RouteOption, Spot } from './src/types';

installWebStyles();
const STORAGE_KEY = 'michi.discoveries.v1';
const minute = (seconds: number) => Math.ceil(seconds / 60);
const topicLabels = (spot: Spot) => TOPICS.filter(topic => spot.topics.includes(topic.id)).map(topic => topic.label);
const cardNumber = (spot: Spot) => SPOTS.findIndex(item => item.id === spot.id) + 1;
// Straight-line estimate at 80 m/min, labelled "約". Not a route time.
const walkMinutes = (a: Spot, b: Spot) => Math.max(1, Math.round(distanceMeters(a.coordinate, b.coordinate) / 80));
type Tab = 'walk' | 'book' | 'me';
/** Link added to shared posts so readers can open the app: this page on the web, the API host (same Cloud Run service) in the native app. HTTPS only, so dev URLs are never shared. */
function shareUrl(): string {
  const candidate = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : apiBaseUrl;
  return /^https:\/\//.test(candidate) ? candidate : '';
}

export default function App() {
  // Native needs the display font loaded first; web gets it from Google Fonts.
  const [fontsLoaded] = useFonts(Platform.OS === 'web' ? {} : { DelaGothicOne_400Regular });
  return <SafeAreaProvider>{fontsLoaded ? <Michi /> : <View style={{ flex: 1, backgroundColor: c.navy }} />}</SafeAreaProvider>;
}

function Michi() {
  const { width, height } = useWindowDimensions();
  const mapHeight = Math.round(Math.min(580, Math.max(420, height * 0.62)));
  const [tab, setTab] = useState<Tab>('walk');
  const [confirmReset, setConfirmReset] = useState(false);
  const [mode, setMode] = useState<Mode>('demo');
  const [budget, setBudget] = useState<Budget>(5);
  const [destinationId, setDestinationId] = useState(DESTINATIONS[0].id);
  const [destinationPicker, setDestinationPicker] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cardView, setCardView] = useState(false);
  const [selectedKind, setSelectedKind] = useState<'direct' | 'discovery'>('discovery');
  const [walking, setWalking] = useState(false);
  const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [demoPosition, setDemoPosition] = useState(DEMO_ORIGIN);
  const [now, setNow] = useState(Date.now());
  const [googleRoutes, setGoogleRoutes] = useState<RouteOption[] | null>(null);
  const [routeWarnings, setRouteWarnings] = useState<string[]>([]);
  const [routesLoading, setRoutesLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const routeRequest = useRef(0);
  // Demo walk: the blue dot walks to a "?" on the map instead of jumping there.
  const walkTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const walkScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const [walkTarget, setWalkTarget] = useState<Spot | null>(null);
  useEffect(() => () => { if (walkTimer.current) clearInterval(walkTimer.current); }, []);
  const location = useLocation(mode === 'gps');
  const destination = DESTINATIONS.find(d => d.id === destinationId)!;
  const demoRoutes = useMemo(() => createDemoRoutes(destination, budget, SPOTS, DEMO_ORIGIN, topicIds), [destinationId, budget, topicIds]);
  const routes = mode === 'demo' ? demoRoutes : googleRoutes ?? [];
  const route = routes.find(r => r.kind === selectedKind) ?? routes[0] ?? null;
  // On a Google map the demo route follows the roads (same stops and times).
  const mapRoute = useRoadPath(mode === 'demo' ? route : null, DEMO_ORIGIN, destinationId, useGoogleMapAvailable()) ?? route;
  const direct = routes.find(r => r.kind === 'direct');
  const discoveryRoute = routes.find(r => r.kind === 'discovery');
  const modeDiscoveries = discoveries.filter(d => d.mode === mode);
  const discoveredIds = modeDiscoveries.map(d => d.spotId);
  const selected = SPOTS.find(spot => spot.id === selectedId);
  const currentFix: LocationFix | null = mode === 'demo' ? { ...demoPosition, accuracy: 0, timestamp: now } : location.fix;
  const area = mode === 'gps' ? getAreaStatus(location.fix, SPOTS) : null;
  const visibleSpots = walking && route?.kind === 'discovery' ? SPOTS.filter(spot => route.spotIds.includes(spot.id)) : rankSpots(SPOTS, topicIds);
  const nextSpot = walking && route ? route.spotIds.map(id => SPOTS.find(spot => spot.id === id)).find(spot => spot && !discoveredIds.includes(spot.id)) : undefined;
  const routeCompleted = walking && route?.kind === 'discovery' && route.spotIds.every(id => discoveredIds.includes(id));
  const progress = route?.spotIds.filter(id => discoveredIds.includes(id)).length ?? 0;
  // After a discovery, offer the next "?": the walking route's next stop, or the next one in the ranked list.
  const nextPool = walking && route?.kind === 'discovery' ? SPOTS.filter(spot => route.spotIds.includes(spot.id)).sort((a, b) => route.spotIds.indexOf(a.id) - route.spotIds.indexOf(b.id)) : rankSpots(SPOTS, topicIds);
  const completeText = routeCompleted ? 'このルートの「？」を、すべて見つけました。' : discoveredIds.length >= SPOTS.length ? `${SPOTS.length}か所すべての「？」を見つけました。` : null;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!alive) return;
      try { setDiscoveries(sanitizeDiscoveries(raw ? JSON.parse(raw) : [], SPOTS.map(s => s.id))); }
      catch { setStorageError('保存データを読めませんでした。この起動中は保存を止めています。'); }
      setLoaded(true);
    }).catch(() => { if (alive) { setStorageError('図鑑の保存領域を開けませんでした。アプリを再起動してください。'); setLoaded(true); } });
    return () => { alive = false; };
  }, []);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(null), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { routeRequest.current++; setGoogleRoutes(null); setRouteWarnings([]); setRouteError(null); setRoutesLoading(false); setWalking(false); setSelectedId(null); setSelectedKind('discovery'); }, [mode, destinationId, budget, topicIds]);

  async function loadRoutes() {
    const fix = location.fix;
    if (!fix || Date.now() - fix.timestamp > 60000 || fix.accuracy === null || fix.accuracy > 60) { setRouteError('精度のよい現在地を取得してから、ルートを探してください。'); return; }
    const request = ++routeRequest.current;
    setRoutesLoading(true); setRouteError(null);
    try {
      const result = await fetchRoutes({ latitude: fix.latitude, longitude: fix.longitude }, destinationId, budget, topicIds);
      if (request !== routeRequest.current) return;
      setGoogleRoutes(result.routes); setRouteWarnings(result.warnings); setWalking(false);
      if (!result.routes.some(r => r.kind === 'discovery')) { setSelectedKind('direct'); setRouteError('この追加時間に収まる寄り道が見つかりませんでした。時間や目的地を変えて試せます。'); }
    } catch (error) { if (request === routeRequest.current) setRouteError(error instanceof Error ? error.message : '経路の取得に失敗しました。'); }
    finally { if (request === routeRequest.current) setRoutesLoading(false); }
  }
  /** viaCamera: the server found the spot's marker words in a photo; the camera rule replaces the GPS radius. */
  async function discover(spot: Spot, viaCamera = false) {
    if (saving || !loaded || storageError) return;
    // Recheck on press: never trust an earlier enabled button after a stale GPS fix.
    const pressFix = mode === 'demo' ? { ...demoPosition, accuracy: 0, timestamp: Date.now() } : location.fix;
    if (viaCamera) {
      const rule = getCameraUnlockState(spot, mode, pressFix);
      if (!rule.allowed) { setNotice(rule.reason); return; }
    } else if (!getUnlockState(spot, pressFix).eligible) { setNotice('現在地をもう一度確認してください。'); return; }
    setSaving(true);
    const updated = addDiscovery(discoveries, spot.id, mode);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); setDiscoveries(updated); }
    catch { setNotice('保存できませんでした。空き容量などを確認して、もう一度お試しください。'); }
    finally { setSaving(false); }
  }
  async function openSource(url: string) {
    try { await Linking.openURL(url); } catch { setNotice('出典を開けませんでした。ネット接続を確認してください。'); }
  }
  async function share(spot: Spot) {
    const message = `MICHI?で「${spot.name}」を発見！ いつもの道に、まだ知らない物語がある。${shareUrl() ? ` ${shareUrl()}` : ''} #MICHI #ミチハテナ #京都`;
    try { await Share.share({ message }); }
    catch {
      try { await Linking.openURL(`https://x.com/intent/post?text=${encodeURIComponent(message)}`); }
      catch { setNotice('シェアできませんでした。'); }
    }
  }
  async function resetRecords() {
    if (!confirmReset) { setConfirmReset(true); return; }
    const kept = discoveries.filter(d => d.mode !== mode);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(kept)); setDiscoveries(kept); setNotice(`${mode === 'demo' ? 'デモ' : '現地'}の記録を消しました。`); }
    catch { setNotice('記録を消せませんでした。'); }
    finally { setConfirmReset(false); }
  }
  const stopDemoWalk = () => { if (walkTimer.current) clearInterval(walkTimer.current); walkTimer.current = null; setWalkTarget(null); };
  const changeMode = (value: Mode) => { if (saving) return; stopDemoWalk(); setMode(value); setDemoPosition(DEMO_ORIGIN); setConfirmReset(false); };
  // Opening any spot (a tap, or a demo walk arriving) ends a walk in progress.
  const openSpot = (id: string, card = false) => { stopDemoWalk(); setCardView(card); setSelectedId(id); };
  const startWalk = () => { stopDemoWalk(); setWalking(true); setDemoPosition(DEMO_ORIGIN); };
  /** Demo only: close the sheet, walk the blue dot to the "?" on the map, then reopen it. Instant when the OS asks for reduced motion. */
  async function demoWalkTo(spot: Spot) {
    stopDemoWalk();
    const from = demoPosition;
    const to = spot.coordinate;
    const meters = distanceMeters(from, to);
    const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
    if (reduce || !Number.isFinite(meters) || meters < 5) { setDemoPosition(to); setNow(Date.now()); return; }
    setSelectedId(null); setCardView(false); setTab('walk');
    walkScroll.current?.scrollTo({ y: 0, animated: true });
    setWalkTarget(spot);
    const duration = Math.min(3500, Math.max(1800, meters * 18));
    const started = Date.now();
    // Walk along the drawn line when it follows the roads; otherwise straight.
    const path = mapRoute?.source === 'google' ? pathBetween(mapRoute.coordinates, from, to) : [from, to];
    walkTimer.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - started) / duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
      setDemoPosition(pointAlong(path, eased));
      if (progress >= 1) { setNow(Date.now()); openSpot(spot.id); }
    }, 80);
  }
  const skipDemoWalk = () => { if (!walkTarget) return; setDemoPosition(walkTarget.coordinate); setNow(Date.now()); openSpot(walkTarget.id); };
  function startFirstDiscovery() {
    const firstId = demoRoutes.find(option => option.kind === 'discovery')?.spotIds[0];
    if (!firstId) return;
    setTab('walk'); setSelectedKind('discovery'); setWalking(true);
    setDemoPosition(DEMO_ORIGIN); openSpot(firstId);
  }
  async function openLocationSettings() {
    try { await Linking.openSettings(); }
    catch { setNotice('設定を開けませんでした。端末の設定から位置情報の許可を確認してください。'); }
  }
  const locationHelp = mode === 'gps' && location.error ? <View style={s.alert}>
    <Text style={[t.std16B170, { color: c.white }]}>現在地を使えません</Text><Text style={[t.std16N170, { color: c.mist }]}>{location.error}</Text>
    {location.needsSettings && (Platform.OS === 'web' ? <Text style={[t.std16N170, { color: c.mist }]}>ブラウザのサイト設定から、位置情報の許可を変更できます。</Text> : <Button label="位置情報の設定を開く" variant="ghost" onPress={() => void openLocationSettings()} />)}
    <Button label="位置情報を使わずデモで試す" variant="light" onPress={() => changeMode('demo')} />
  </View> : null;
  const gpsStatus = location.loading ? '現在地を取得しています。' : location.fix ? `${location.fix.accuracy === null ? 'GPSの精度は不明です。' : `GPSの精度は約${Math.round(location.fix.accuracy)}m。`}現在地はアプリの利用中だけ取得します。` : location.error ? '現在地を利用できません。' : '現在地を待っています。';
  const closeSpot = () => { if (!saving) { setSelectedId(null); setCardView(false); } };

  return <View style={s.desktop}>{Platform.OS === 'web' && width >= 1280 && <DesktopIntro width={(width - 480) / 2} />}<View style={[s.app, width > 600 && s.desktopApp]}>
    <StatusBar style="light" />
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <View style={s.rowBetween}>
          <View style={s.brand} accessibilityRole="header" accessibilityLabel="MICHI? ミチハテナ">
            <View style={s.inline}><Text style={[t.display32, { color: c.white }]}>MICHI</Text><QCoin size={34} /></View>
            <Text style={[t.note14B150, { color: c.mist }]}>ミチハテナ</Text>
          </View>
          <View style={s.modeSwitch} accessibilityRole="radiogroup" accessibilityLabel="使い方">{(['demo', 'gps'] as Mode[]).map(value => {
            const active = mode === value;
            return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: active }} aria-checked={active} onPress={() => changeMode(value)} style={[s.modeItem, active && s.modeActive]}>
              <Text style={[active ? t.note14B150 : t.note14N150, { color: active ? c.navy : c.mist }]}>{value === 'demo' ? 'デモ' : '現地'}</Text>
            </Pressable>;
          })}</View>
        </View>
        <View style={s.tabs} accessibilityRole="tablist">{([{ id: 'walk', label: '探索', icon: 'map' }, { id: 'book', label: '図鑑', icon: 'book' }, { id: 'me', label: 'マイページ', icon: 'user' }] as const).map(item => {
          const active = tab === item.id;
          return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} aria-selected={active} onPress={() => setTab(item.id)} style={[s.tab, active && s.tabActive]}>
            <Icon name={item.icon} color={active ? c.navy : c.mist} size={18} /><Text style={[active ? t.note14B150 : t.note14N150, { color: active ? c.navy : c.mist }]}>{item.label}</Text>
          </Pressable>;
        })}</View>
      </View>

      {tab === 'walk' ? <ScrollView ref={walkScroll} style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[s.mapBlock, { height: mapHeight }]}>
          <DiscoveryMap spots={visibleSpots} discoveredIds={discoveredIds} route={mapRoute} destination={destination} position={currentFix} selectedId={selectedId ?? undefined} onSelect={id => openSpot(id)} />
          <View style={s.routeCard}>
            <Pressable accessibilityRole="button" accessibilityLabel={`目的地 ${destination.name}。変更する`} onPress={() => setDestinationPicker(true)} style={s.destinationRow}>
              <Icon name="pin" color={c.navy} size={20} /><Text style={[t.std16B170, { color: c.navy, flex: 1 }]} numberOfLines={1}>目的地：{destination.name}</Text><Text style={[t.note14B150, { color: c.red }]}>変更</Text>
            </Pressable>
            {walking ? <View style={s.compareRow}><Text style={[t.std16B170, { color: c.navy }]}>{routeCompleted ? 'このルートの「？」をすべて発見' : `発見 ${progress} / ${route?.spotIds.length ?? 0}`}</Text></View> : <>
              {direct && <Pressable accessibilityRole="radio" accessibilityState={{ checked: route?.kind === 'direct' }} aria-checked={route?.kind === 'direct'} onPress={() => setSelectedKind('direct')} style={[s.compareRow, route?.kind === 'direct' && s.compareDirectActive]}>
                <Text style={[t.std16N170, { color: c.navy, width: 96 }]}>通常ルート</Text><Text style={[t.std16B170, { color: c.navy }]}>{minute(direct.totalSeconds)}分</Text>
                {route?.kind === 'direct' && <View style={{ marginLeft: 'auto' }}><Icon name="check" color={c.navy} size={18} /></View>}
              </Pressable>}
              {discoveryRoute && <Pressable accessibilityRole="radio" accessibilityState={{ checked: route?.kind === 'discovery' }} aria-checked={route?.kind === 'discovery'} onPress={() => setSelectedKind('discovery')} style={[s.compareRow, s.compareDiscovery, route?.kind !== 'discovery' && s.compareDiscoveryIdle]}>
                <Text style={[t.std16B170, { color: c.white, width: 96 }]}>発見ルート</Text><Text style={[t.std16B170, { color: c.white }]}>{minute(discoveryRoute.totalSeconds)}分（+{minute(discoveryRoute.extraSeconds)}分）</Text>
                {route?.kind === 'discovery' && <View style={{ marginLeft: 'auto' }}><Icon name="check" color={c.white} size={18} /></View>}
              </Pressable>}
            </>}
          </View>
          <View style={s.mapBar}>
            {walkTarget ? <>
              <View pointerEvents="none" style={s.mapBarCount} accessibilityLiveRegion="polite">
                <Text style={[t.note14B150, { color: c.mist }]}>「？」へ歩いています（デモ）</Text>
                <Text style={[t.display26, { color: c.gold }]}><Text style={[t.std16B170, { color: c.white }]}>残り </Text>{formatDistance(distanceMeters(demoPosition, walkTarget.coordinate))}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="移動をスキップする" onPress={skipDemoWalk} style={({ pressed }) => [s.barCta, s.barSkip, pressed && s.barSunk]}>
                <Text style={[t.oln16B100, { color: c.navy }]}>スキップ</Text>
              </Pressable>
            </> : <View pointerEvents="none" style={s.mapBarCount}>
              <Text style={[t.note14B150, { color: c.mist }]}>{walking ? 'このルートの残り' : 'このルートの発見'}</Text>
              <Text style={[t.display26, { color: c.gold }]}>{walking ? (route?.spotIds.length ?? 0) - progress : route?.spotIds.length ?? 0}<Text style={[t.std16B170, { color: c.white }]}> 件</Text></Text>
            </View>}
            {!walkTarget && !walking && routes.length > 0 &&<Pressable accessibilityRole="button" accessibilityLabel={route?.kind === 'discovery' ? '発見ルートで出発する' : '通常ルートで出発する'} onPress={startWalk} style={({ pressed }) => [s.barCta, pressed && s.barSunk]}>
              <Text style={[t.oln16B100, { color: c.white }]}>出発する</Text><Icon name="chevron" size={18} />
            </Pressable>}
            {!walkTarget && walking && nextSpot && <Pressable accessibilityRole="button" accessibilityLabel={`次の「？」を開く。${nextSpot.hint}`} onPress={() => openSpot(nextSpot.id)} style={({ pressed }) => [s.barCta, pressed && s.barSunk]}>
              <Text style={[t.oln16B100, { color: c.white }]}>次の「？」へ</Text><Icon name="chevron" size={18} />
            </Pressable>}
          </View>
        </View>

        <View style={s.section}>
          {mode === 'demo' ? <Text style={[t.note14N150, { color: c.muted }]}>DEMO：位置と所要時間は体験用の仮データです。</Text>
            : <View style={s.rowBetween}><Text style={[t.note14N150, { color: c.muted, flex: 1 }]}>{gpsStatus}</Text><Pressable accessibilityRole="button" onPress={() => void location.retry()} style={s.textButton}><Text style={[t.note14B150, s.link]}>再取得</Text></Pressable></View>}
          {locationHelp}
          {area && !area.inArea && <View style={s.alert}>
            <Text style={[t.std16B170, { color: c.white }]}>現在地は、対象エリアの外です</Text>
            <Text style={[t.std16N170, { color: c.mist }]}>{`いちばん近い「？」（${area.nearestSpot.name}）まで約${formatDistance(area.distanceMeters)}。今は京都三条・高瀬川周辺で発見できます。現地に着くまでは、デモで同じ体験ができます。`}</Text>
            <Button label="体験デモで試す" variant="light" onPress={() => changeMode('demo')} />
          </View>}

          {mode === 'demo' && loaded && modeDiscoveries.length === 0 && !walking && <View style={s.guide}>
            <View style={s.hero}>
              <Text style={[t.display26, { color: c.white }]} accessibilityRole="header">いつもの道に、{'\n'}まだ知らない<Text style={{ color: c.redText }}>物語</Text>がある。</Text>
            </View>
            {[['ルートを選ぶ', '目的地までの道に「？」を表示'], ['見つける', '「？」に近づいて正体を探す'], ['物語を知る', '隠れた歴史や背景を読む'], ['カードを集める', '発見カードを図鑑に保存']].map(([title, body], index) => <View key={title} style={s.guideStep}>
              <QCoin size={34} label={String(index + 1)} tone={index === 3 ? 'gold' : 'red'} />
              <View style={{ flex: 1 }}><Text style={[t.std16B170, { color: c.white }]}>{title}</Text><Text style={[t.note14N150, { color: c.mist }]}>{body}</Text></View>
            </View>)}
            <View style={s.guideInterest}>
              <Text style={[t.std16B170, { color: c.white }]}>まず、気になるものを1つ選ぶ</Text>
              <Text style={[t.note14N150, { color: c.mist }]}>選んだ言葉をGeminiが読み取り、発見ルートの「？」を選び直します。</Text>
              <InterestExamples topics={TOPICS} onChange={setTopicIds} />
            </View>
            <Button label="最初の「？」を体験する" onPress={startFirstDiscovery} disabled={Boolean(storageError)} />
            <Text style={[t.note14N150, { color: c.muted, textAlign: 'center' }]}>今いる場所から移動しなくても試せます。</Text>
          </View>}

          {!walking ? <>
            <InterestPicker topics={TOPICS} selected={topicIds} onChange={setTopicIds} />
            <SectionTitle title="寄り道できる時間" />
            <View style={s.choiceRow} accessibilityRole="radiogroup">{([5, 10] as Budget[]).map(value => {
              const active = budget === value;
              return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`追加${value}分まで`} accessibilityState={{ checked: active }} aria-checked={active} onPress={() => setBudget(value)} style={({ pressed }) => [s.choice, active && s.choiceActive, pressed && s.choiceSunk]}>
                {active && <Icon name="check" color={c.white} size={18} />}<Text style={[t.std16B170, { color: active ? c.white : c.mist }]}>＋{value}分まで</Text>
              </Pressable>;
            })}</View>
            {routes.length > 0 ? <>
              <Button label={route?.kind === 'discovery' ? '発見ルートで出発する' : '通常ルートで出発する'} onPress={startWalk} />
              {mode === 'gps' && <Button label={routesLoading ? '経路を計算しています' : '現在地からルートを再計算する'} variant="ghost" onPress={() => void loadRoutes()} disabled={routesLoading} />}
            </> : mode === 'gps' && <View style={s.card}>
              <Text style={[t.std18B160, { color: c.white }]}>{apiConfigured ? '現在地から寄り道ルートを探す' : '近くの「？」を探す'}</Text>
              <Text style={[t.std16N170, { color: c.mist }]}>{apiConfigured ? '現在地をGoogleの経路計算に送り、見学時間を含めて所要時間を比べます。' : 'GPSで近くの「？」を発見できます。徒歩ルートの比較は、経路サーバーにつないだ後に使えます。'}</Text>
              {apiConfigured ? <Button label="ルートを探す" onPress={() => void loadRoutes()} loading={routesLoading} disabled={!location.fix} /> : <Button label="体験デモでルートを比べる" variant="light" onPress={() => changeMode('demo')} />}
            </View>}
          </> : <View style={s.card}>
            <SectionTitle title={routeCompleted ? 'コンプリート！' : route?.kind === 'direct' ? '目的地へ' : '次の「？」'} count={`${progress} / ${route?.spotIds.length ?? 0}`} />
            {route?.kind === 'discovery' && <View style={s.progressTrack}><View style={[s.progressFill, { width: `${route.spotIds.length ? progress / route.spotIds.length * 100 : 0}%` }]} /></View>}
            {nextSpot ? <Pressable accessibilityRole="button" accessibilityLabel={`次の「？」のヒント。${nextSpot.hint}`} onPress={() => openSpot(nextSpot.id)} style={({ pressed }) => [s.nextCard, pressed && s.pressed]}>
              <QPin category={nextSpot.category} size={40} /><View style={{ flex: 1, gap: 4 }}><Tag label="ヒント" /><Text style={[t.std16N170, { color: c.white }]}>{nextSpot.hint}</Text></View><Icon name="chevron" color={c.mist} size={20} />
            </Pressable> : <Text style={[t.std16N170, { color: c.mist }]}>{routeCompleted ? '集めた発見カードは、図鑑でいつでも見返せます。' : '現在地を確かめながら進んでください。デモの線は道案内ではありません。'}</Text>}
            {routeCompleted && <Button label="図鑑を見る" icon="book" onPress={() => setTab('book')} />}
            <Button label="ルートを選び直す" variant="ghost" onPress={() => setWalking(false)} />
          </View>}
          {route?.source === 'google' && <Text style={[t.note14N150, { color: c.mist }]}>経路情報: Google Maps</Text>}
          {routeWarnings.map((warning, index) => <Text key={index} style={[t.note14N150, { color: c.muted }]}>{warning}</Text>)}
          {routeError && <View style={s.error}><Text style={[t.std16N170, { color: c.white }]}>{routeError}</Text></View>}

          <View style={{ marginTop: 8 }}><SectionTitle title={walking ? 'このルートの「？」' : '周辺の「？」'} count={`${visibleSpots.length}か所`} /></View>
          {visibleSpots.map(spot => {
            const done = discoveredIds.includes(spot.id);
            const match = topicScore(spot, topicIds) > 0;
            return <Pressable key={spot.id} accessibilityRole="button" accessibilityLabel={`${done ? spot.name : '未発見の「？」'}、${spot.category}${match ? '、興味に一致' : ''}`} onPress={() => openSpot(spot.id, done)} style={({ pressed }) => [s.row, pressed && s.pressed]}>
              <QPin done={done} category={spot.category} size={40} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={s.meta}><Tag label={spot.category} tone="line" />{match && <Tag label="興味に一致" />}</View>
                <Text style={[t.std16N170, { color: c.white }]} numberOfLines={2}>{done ? spot.name : spot.hint}</Text>
              </View>
              <Icon name="chevron" color={c.mist} size={20} />
            </Pressable>;
          })}
          <Text style={[t.note14N150, s.footer]}>{'「？」の近くでは、歩道の端など安全な場所に立ち止まってから操作してください。'}{mode === 'gps' ? '\nスポットの位置は現地で未確認です。現地の案内表示を優先してください。' : ''}</Text>
        </View>
      </ScrollView> : tab === 'book' ? <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, s.section]} showsVerticalScrollIndicator={false}>
        <View style={[s.rowBetween, { marginTop: 16 }]}>
          <Text style={[t.display26, { color: c.white }]} accessibilityRole="header">発見図鑑</Text>
          <Text style={[t.display32, { color: c.gold }]}>{modeDiscoveries.length}<Text style={[t.std16B170, { color: c.mist }]}> / {SPOTS.length}枚</Text></Text>
        </View>
        <View style={s.progressTrack}><View style={[s.progressFill, { width: `${modeDiscoveries.length / SPOTS.length * 100}%` }]} /></View>
        <Text style={[t.note14N150, { color: c.muted }]}>{mode === 'demo' ? 'デモで集めたカードです。現地の記録とは別に保存しています。' : '現地で集めたカードです。'}</Text>
        {!loaded && <ActivityIndicator color={c.red} />}
        {loaded && modeDiscoveries.length === 0 && <View style={s.card}>
          <Text style={[t.std18B160, { color: c.white }]}>まだカードがありません</Text>
          <Text style={[t.std16N170, { color: c.mist }]}>{mode === 'demo' ? 'デモで「？」に近づいて発見すると、発見カードがここに入ります。' : '「？」に歩いて近づき発見すると、カードが入ります。デモのカードはここには入りません。'}</Text>
          <Button label={mode === 'demo' ? '最初の「？」を体験する' : 'ルートを探す'} onPress={mode === 'demo' ? startFirstDiscovery : () => setTab('walk')} disabled={Boolean(storageError)} />
        </View>}
        <View style={s.grid}>{SPOTS.map(spot => {
          const discovery = modeDiscoveries.find(d => d.spotId === spot.id);
          return <Pressable key={spot.id} accessibilityRole="button" accessibilityLabel={discovery ? `発見カード ${spot.name}を開く` : `未発見の「？」No.${String(cardNumber(spot)).padStart(3, '0')}を開く`} onPress={() => openSpot(spot.id, Boolean(discovery))} style={({ pressed }) => [s.gridItem, pressed && { opacity: .85 }]}>
            {discovery ? <DiscoveryCard spot={spot} number={cardNumber(spot)} discoveredAt={discovery.discoveredAt} compact />
              : <View style={s.lockedCard}>
                <Text style={[t.note14B150, { color: c.muted }]}>No.{String(cardNumber(spot)).padStart(3, '0')}</Text>
                <View style={{ alignItems: 'center', paddingVertical: 8 }}><QPin size={48} /></View>
                <Text style={[t.note14N150, { color: c.mist }]} numberOfLines={3}>{spot.hint}</Text>
              </View>}
          </Pressable>;
        })}</View>
        <Text style={[t.note14N150, s.footer]}>{'カードはこの端末だけに保存されます。アプリを削除すると消えることがあります。'}</Text>
      </ScrollView> : <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, s.section]} showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: 16 }}><SectionTitle page title="マイページ" /></View>
        <View style={s.statRow}>{[['発見カード', String(modeDiscoveries.length), `/ ${SPOTS.length}枚`], ['興味のタグ', String(topicIds.length), '個'], ['モード', mode === 'demo' ? 'デモ' : '現地', '']].map(([label, value, unit], index) => <View key={label} style={s.stat}>
          <Text style={[t.note14N150, { color: c.muted }]}>{label}</Text>
          <Text style={[t.display22, { color: index === 0 ? c.gold : c.white }]}>{value}{unit ? <Text style={[t.note14B150, { color: c.mist }]}> {unit}</Text> : null}</Text>
        </View>)}</View>
        {topicIds.length > 0 && <View style={s.meta}>{TOPICS.filter(topic => topicIds.includes(topic.id)).map(topic => <Tag key={topic.id} label={`#${topic.label}`} />)}</View>}
        <View style={s.card}>
          <Text style={[t.std18B160, { color: c.white }]}>使い方の切り替え</Text>
          <Text style={[t.std16N170, { color: c.mist }]}>体験デモは位置情報なしで、会場からでも全部の流れを試せます。現地で歩くは、GPSで実際に近づいたときだけ発見できます。記録は別々に残ります。</Text>
          <View style={s.choiceRow} accessibilityRole="radiogroup">{(['demo', 'gps'] as Mode[]).map(value => {
            const active = mode === value;
            return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: active }} aria-checked={active} onPress={() => changeMode(value)} style={({ pressed }) => [s.choice, active && s.choiceActive, pressed && s.choiceSunk]}>
              {active && <Icon name="check" size={18} />}<Text style={[t.std16B170, { color: active ? c.white : c.mist }]}>{value === 'demo' ? '体験デモ' : '現地で歩く'}</Text>
            </Pressable>;
          })}</View>
        </View>
        <View style={s.card}>
          <Text style={[t.std18B160, { color: c.white }]}>Geminiが担当していること</Text>
          {[
            ['興味を読み取る', '「水路が好き」のような言葉を6つの視点に分け、関係する「？」を先に並べます。並び順は視点の一致数で決めています。'],
            ['次の「？」へ誘う', '関連する「？」への一文を作ります。答えは明かさず、出典を確認した事実だけを使います。'],
            ['解説を下書きする', '視点ごとの解説を事前に下書きし、人が出典と照合したものだけを表示します。'],
          ].map(([title, body], index) => <View key={title} style={s.aiRow}>
            <QCoin size={28} label={String(index + 1)} />
            <View style={{ flex: 1 }}><Text style={[t.std16B170, { color: c.white }]}>{title}</Text><Text style={[t.note14N150, { color: c.mist }]}>{body}</Text></View>
          </View>)}
          <Text style={[t.note14N150, { color: c.muted }]}>Geminiの出力は、表示する前に「使った事実」「数字」「答えのネタバレ」をプログラムで検査しています。通らなかったときは、用意した文章を出します。</Text>
        </View>
        <View style={s.card}>
          <Text style={[t.std18B160, { color: c.white }]}>この端末の記録</Text>
          <Text style={[t.std16N170, { color: c.mist }]}>{`${mode === 'demo' ? 'デモ' : '現地'}のカード${modeDiscoveries.length}枚を、この端末だけに保存しています。カードの記録はサーバーに送りません。`}</Text>
          <Button label={confirmReset ? 'もう一度押すと消えます' : `${mode === 'demo' ? 'デモ' : '現地'}の記録を消す`} variant="ghost" onPress={() => void resetRecords()} disabled={modeDiscoveries.length === 0} />
        </View>
        <Text style={[t.note14N150, s.footer]}>{'MICHI?（ミチハテナ）\nDevFest GDGoC Japan Hackathon 2026 出展作品'}</Text>
      </ScrollView>}
      {storageError && <Text style={[t.note14N150, s.storageError]}>{storageError}</Text>}
    </SafeAreaView>
    {notice && <View style={s.toast} pointerEvents="none" accessibilityLiveRegion="polite"><Text style={[t.std16N170, { color: c.white, textAlign: 'center' }]}>{notice}</Text></View>}

    <Modal visible={destinationPicker} animationType="slide" transparent onRequestClose={() => setDestinationPicker(false)}>
      <View style={s.scrim}><View style={s.sheet}>
        <View style={s.sheetHeader}><SectionTitle title="目的地を選ぶ" /><Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => setDestinationPicker(false)} style={s.close}><Icon name="close" /></Pressable></View>
        <Text style={[t.std16N170, { color: c.mist }]}>京都・三条周辺の2か所から選べます。</Text>
        {DESTINATIONS.map(d => <Pressable accessibilityRole="radio" accessibilityState={{ checked: d.id === destinationId }} aria-checked={d.id === destinationId} key={d.id} onPress={() => { setDestinationId(d.id); setDestinationPicker(false); }} style={({ pressed }) => [s.row, pressed && s.pressed]}>
          <Icon name="pin" color={c.redText} /><View style={{ flex: 1 }}><Text style={[t.std16B170, { color: c.white }]}>{d.name}</Text><Text style={[t.note14N150, { color: c.muted }]}>{d.subtitle}</Text></View>{d.id === destinationId && <Icon name="check" color={c.white} />}
        </Pressable>)}
        <SafeAreaView edges={['bottom']} />
      </View></View>
    </Modal>
    <Modal visible={Boolean(selected)} animationType="slide" transparent onRequestClose={closeSpot}>
      <View style={s.scrim}><View style={[s.sheet, s.detailSheet]}>
        {notice && <View style={s.modalNotice}><Text style={[t.std16N170, { color: c.white }]}>{notice}</Text></View>}
        {selected && (cardView && discoveredIds.includes(selected.id)
          ? <CardReveal spot={selected} discovery={modeDiscoveries.find(d => d.spotId === selected.id)!} next={nextUndiscovered(nextPool, discoveredIds, selected.id)} complete={completeText} onNext={id => openSpot(id)} onShare={() => void share(selected)} onStory={() => setCardView(false)} onBook={() => { closeSpot(); setTab('book'); }} onClose={closeSpot} />
          : <SpotDetail spot={selected} mode={mode} discovered={discoveredIds.includes(selected.id)} fix={currentFix} saving={saving} loaded={loaded && !storageError} onClose={closeSpot} onDiscover={() => void discover(selected)} onCameraMatch={() => void discover(selected, true)} camera={getCameraUnlockState(selected, mode, currentFix)} onMove={() => void demoWalkTo(selected)} onRelated={id => openSpot(id)} onSource={url => void openSource(url)} discoveredIds={discoveredIds} onCard={() => setCardView(true)} locationHelp={locationHelp} topicIds={topicIds} />)}
      </View></View>
    </Modal>
  </View></View>;
}

function SpotDetail({ spot, mode, discovered, fix, saving, loaded, onClose, onDiscover, onCameraMatch, camera, onMove, onRelated, onSource, discoveredIds, onCard, locationHelp, topicIds }: { spot: Spot; mode: Mode; discovered: boolean; fix: LocationFix | null; saving: boolean; loaded: boolean; onClose: () => void; onDiscover: () => void; onCameraMatch: () => void; camera: { allowed: boolean; reason: string }; onMove: () => void; onRelated: (id: string) => void; onSource: (url: string) => void; discoveredIds: string[]; onCard: () => void; locationHelp: React.ReactNode; topicIds: string[] }) {
  const unlock = getUnlockState(spot, fix, Date.now());
  const story = pickStory(spot, topicIds, STORIES);
  const storyTopic = story.variant ? TOPICS.find(topic => topic.id === story.variant?.topicId)?.label : null;
  const header = <View style={s.sheetHeader}>
    <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} disabled={saving} style={s.close}><Icon name="back" /></Pressable>
    <Text style={[t.std16B170, { color: c.white }]}>{discovered ? `${spot.category}・${mode === 'demo' ? 'デモ' : '現地'}` : '発見中…'}</Text>
    <View style={s.headerSide}>{mode === 'demo' && <Tag label="DEMO" />}</View>
  </View>;

  if (!discovered) return <>
    {header}
    <ScrollView key={`seek-${spot.id}`} showsVerticalScrollIndicator={false} contentContainerStyle={s.detailContent}>
      <CameraScan spot={spot} eligible={unlock.eligible} camera={camera} saving={saving} loaded={loaded} onDiscover={onDiscover} onMatched={onCameraMatch}
        banner={<View style={[s.callout, unlock.eligible && s.calloutFound]}>
          <Text style={[t.display18, { color: c.white }]}>{unlock.eligible ? '何か見つかった…！' : unlock.distanceMeters === null ? '現在地を待っています' : `「？」まで約${Math.round(unlock.distanceMeters)}m`}</Text>
          <Text style={[t.std16N170, { color: c.white }]}>{unlock.eligible ? 'この場所の物語を解き明かそう。' : unlock.reason}</Text>
        </View>}>
        <View style={s.hintBox}><Tag label="ヒント" /><Text style={[t.std18B160, { color: c.white }]}>{spot.hint}</Text></View>
        {locationHelp}
        {mode === 'demo' && !unlock.eligible && <Button label="デモでここまで歩く" variant="light" icon="walk" onPress={onMove} />}
      </CameraScan>
    </ScrollView>
  </>;

  return <>
    {header}
    <ScrollView key={`found-${spot.id}`} showsVerticalScrollIndicator={false} contentContainerStyle={s.detailContent}>
      <Celebrate>
        <QPin done category={spot.category} size={72} />
        <Text style={[t.display40, { color: c.gold }]}>発見！</Text>
        <Text style={[t.display22, { color: c.white, textAlign: 'center' }]} accessibilityRole="header">{spot.name}</Text>
      </Celebrate>
      <View style={s.paper}>
        <View style={s.paperArt}><Art category={spot.category} height={180} /></View>
        <View style={{ padding: 16, gap: 10 }}>
          {storyTopic && <Text style={[t.note14N150, { color: c.sepia }]}>「{storyTopic}」の視点の解説です。Geminiが下書きし、出典と照合しました。</Text>}
          <Text style={[t.std16N170, { color: c.ink }]}>{story.text}</Text>
          <View style={s.meta}>{topicLabels(spot).map(label => <Tag key={label} label={`#${label}`} tone="paper" />)}</View>
        </View>
      </View>
      <View style={s.lookFor}><Text style={[t.std16B170, { color: c.white }]}>現地で見るもの</Text><Text style={[t.std16N170, { color: c.mist }]}>{spot.lookFor}</Text></View>
      <Button label="発見カードを受け取る" onPress={onCard} />
      <SectionTitle title="関連する発見" />
      {spot.relatedSpotIds.map(id => { const related = SPOTS.find(item => item.id === id)!; const done = discoveredIds.includes(id); return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`関連する${done ? related.name : '未発見の「？」'}を開く`} onPress={() => onRelated(id)} style={({ pressed }) => [s.relatedCard, pressed && { opacity: .85 }]}>
        <View style={s.thumb}>{done ? <Art category={related.category} height={64} /> : <View style={s.thumbLocked}><QPin size={34} /></View>}</View>
        <View style={{ flex: 1, gap: 2 }}><Text style={[t.note14B150, { color: c.sepia }]}>{related.category}・ここから徒歩約{walkMinutes(spot, related)}分</Text>{done ?<Text style={[t.std16B170, { color: c.ink }]}>{related.name}</Text> : <RelatedTeaser from={spot} to={related} topicIds={topicIds} />}</View>
        <Icon name="chevron" color={c.sepia} size={20} />
      </Pressable>; })}
      <Text style={[t.std16B170, { color: c.white, marginTop: 8 }]}>出典</Text>
      {spot.sources.map(source => <Pressable key={source.url} accessibilityRole="link" accessibilityLabel={`${source.title}（外部サイト）`} onPress={() => onSource(source.url)} style={s.textButton}><Text style={[t.std16N170, s.link]}>{source.title}（外部サイト）</Text></Pressable>)}
      {__DEV__ && spot.coordinateNote ? <Text style={[t.note14N150, { color: c.muted }]}>{spot.coordinateNote}</Text> : null}
      <Button label="閉じる" variant="ghost" onPress={onClose} />
      <SafeAreaView edges={['bottom']} />
    </ScrollView>
  </>;
}

const nativeDriver = Platform.OS !== 'web';

function CardReveal({ spot, discovery, next, complete, onNext, onShare, onStory, onBook, onClose }: { spot: Spot; discovery: Discovery; next: Spot | null; complete: string | null; onNext: (id: string) => void; onShare: () => void; onStory: () => void; onBook: () => void; onClose: () => void }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(pop, { toValue: 1, friction: 6, tension: 60, useNativeDriver: nativeDriver }).start(); }, [pop]);
  const cardMotion = { opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }, { rotate: pop.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '-1.5deg'] }) }] };
  return <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.detailContent}>
    <View style={s.sheetHeader}><View style={[s.headerSide, { alignItems: 'flex-start' }]}>{discovery.mode === 'demo' && <Tag label="DEMO" />}</View><View /><Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} style={s.close}><Icon name="close" /></Pressable></View>
    <Text style={[t.display22, { color: c.gold, textAlign: 'center' }]} accessibilityRole="header">発見カードを獲得！</Text>
    <View style={s.cardStack}>
      <View style={[s.cardBack, { transform: [{ rotate: '6deg' }] }]} />
      <View style={[s.cardBack, { transform: [{ rotate: '-4deg' }] }]} />
      <Animated.View style={cardMotion}><DiscoveryCard spot={spot} number={cardNumber(spot)} discoveredAt={discovery.discoveredAt} /></Animated.View>
    </View>
    <Text style={[t.note14N150, { color: c.muted, textAlign: 'center' }]}>カードは図鑑に保存済みです。{discovery.mode === 'demo' ? '（デモ）' : ''}</Text>
    {complete && !next && <View style={s.complete} accessibilityLiveRegion="polite">
      <Celebrate><Text style={[t.display32, { color: c.gold }]}>コンプリート！</Text></Celebrate>
      <Text style={[t.std16N170, { color: c.white, textAlign: 'center' }]}>{complete}集めたカードは図鑑でいつでも見返せます。</Text>
    </View>}
    {next ? <>
      <View style={s.nextHint}><Text style={[t.note14B150, { color: c.redText }]}>次の「？」のヒント</Text><Text style={[t.std16N170, { color: c.white }]}>{next.hint}</Text></View>
      <Button label="次の「？」へ" icon="pin" onPress={() => onNext(next.id)} />
      <Button label="SNSでシェア" icon="share" variant="light" onPress={onShare} />
      <Button label="図鑑で見る" icon="bookmark" variant="ghost" onPress={onBook} />
    </> : <>
      <Button label={complete ? '図鑑で見る' : 'SNSでシェア'} icon={complete ? 'bookmark' : 'share'} onPress={complete ? onBook : onShare} />
      <Button label={complete ? 'SNSでシェア' : '図鑑で見る'} icon={complete ? 'share' : 'bookmark'} variant="light" onPress={complete ? onShare : onBook} />
    </>}
    <Button label="物語をもう一度読む" variant="ghost" onPress={onStory} />
    <SafeAreaView edges={['bottom']} />
  </ScrollView>;
}

const s = StyleSheet.create({
  desktop: { flex: 1, backgroundColor: '#050B1C', alignItems: 'center' },
  app: { width: '100%', maxWidth: 480, flex: 1, backgroundColor: c.navy, overflow: 'hidden' },
  desktopApp: { marginVertical: 24, borderRadius: radius.l, borderWidth: 1, borderColor: c.line },
  safe: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10, borderBottomWidth: 1, borderColor: c.line },
  link: { color: c.link, textDecorationLine: 'underline' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  brand: { gap: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  modeSwitch: { flexDirection: 'row', borderWidth: 1, borderColor: c.line, borderRadius: radius.full, padding: 3, backgroundColor: c.navy },
  modeItem: { minWidth: 56, minHeight: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  modeActive: { backgroundColor: c.white },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, backgroundColor: c.navyCard, borderRadius: radius.full, borderWidth: 1, borderColor: c.line },
  tab: { flex: 1, minHeight: 40, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: c.navyCard, borderWidth: 1, borderColor: c.line, borderBottomWidth: 4, borderRadius: radius.m, padding: 12 },
  aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tabActive: { backgroundColor: c.white },
  scroll: { flex: 1 }, scrollContent: { paddingBottom: 32 },
  hero: { paddingBottom: 4 },
  mapBlock: { overflow: 'hidden' },
  routeCard: { position: 'absolute', top: 10, left: 10, right: 10, backgroundColor: c.white, borderRadius: radius.m, padding: 8, gap: 6, shadowColor: '#000', shadowOpacity: .35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  destinationRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: '#E3E3E3' },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 10, borderRadius: radius.full },
  compareDirectActive: { backgroundColor: '#ECEFF5' },
  compareDiscovery: { backgroundColor: c.red },
  compareDiscoveryIdle: { opacity: .75 },
  mapBar: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, backgroundColor: 'rgba(11, 22, 49, 0.94)', borderWidth: 1, borderColor: c.line, borderRadius: radius.l, paddingLeft: 16, paddingRight: 8, paddingVertical: 8 },
  mapBarCount: { flexShrink: 1 },
  barSkip: { backgroundColor: c.white, borderBottomColor: c.mist },
  barCta: { minHeight: 48, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: c.red, borderRadius: radius.m, borderBottomWidth: 4, borderBottomColor: c.redDark },
  barSunk: { minHeight: 45, marginTop: 3, borderBottomWidth: 1 },
  section: { paddingHorizontal: 16, paddingTop: 12, gap: 16 },
  guide: { backgroundColor: c.navyCard, borderWidth: 1, borderColor: c.line, borderRadius: radius.l, padding: 16, gap: 14 },
  guideInterest: { gap: 8, borderTopWidth: 1, borderColor: c.line, paddingTop: 12 },
  complete: { alignItems: 'center', gap: 4 },
  nextHint: { backgroundColor: c.navyCard, borderWidth: 1, borderColor: c.line, borderRadius: radius.m, padding: 14, gap: 6 },
  guideStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  card: { backgroundColor: c.navyCard, borderWidth: 1, borderColor: c.line, borderRadius: radius.m, padding: 16, gap: 14 },
  alert: { backgroundColor: c.navyCard, borderWidth: 2, borderColor: c.red, borderRadius: radius.m, padding: 16, gap: 12 },
  error: { backgroundColor: c.redDark, borderRadius: radius.m, padding: 14 },
  choiceRow: { flexDirection: 'row', gap: 10, marginTop: -6 },
  choice: { flex: 1, minHeight: 52, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: c.navyCard, borderWidth: 1, borderColor: c.line, borderBottomWidth: 4, borderRadius: radius.m },
  choiceActive: { backgroundColor: c.red, borderColor: c.red, borderBottomColor: c.redDark },
  choiceSunk: { minHeight: 49, marginTop: 3, borderBottomWidth: 1 },
  progressTrack: { height: 10, backgroundColor: c.navyRaised, borderRadius: radius.full, overflow: 'hidden' },
  progressFill: { backgroundColor: c.gold, height: '100%', borderRadius: radius.full },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.m, backgroundColor: c.navyRaised },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 72, borderRadius: radius.m, backgroundColor: c.navyCard, borderWidth: 1, borderColor: c.line, borderBottomWidth: 3 },
  pressed: { backgroundColor: c.navyRaised },
  textButton: { minHeight: 44, justifyContent: 'center' },
  footer: { color: c.muted, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  gridItem: { width: '48.5%' },
  lockedCard: { minHeight: 220, borderRadius: radius.m, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.line, backgroundColor: c.navyCard, padding: 12, gap: 4 },
  storageError: { padding: 12, color: c.white, backgroundColor: c.redDark },
  toast: { position: 'absolute', bottom: 32, left: 16, right: 16, borderRadius: radius.m, padding: 16, backgroundColor: c.red },
  scrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 480, backgroundColor: c.navy, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, borderWidth: 1, borderBottomWidth: 0, borderColor: c.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 8 },
  detailSheet: { maxHeight: '94%', paddingBottom: 0 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  headerSide: { minWidth: 48, alignItems: 'flex-end' },
  close: { width: 48, height: 48, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: c.navyCard },
  modalNotice: { backgroundColor: c.red, padding: 12, borderRadius: radius.m },
  detailContent: { paddingBottom: 24, gap: 16 },
  callout: { marginTop: -36, marginHorizontal: 12, backgroundColor: c.navy, borderRadius: radius.m, borderWidth: 2, borderColor: c.line, padding: 12, gap: 2 },
  calloutFound: { backgroundColor: c.red, borderColor: c.white },
  hintBox: { backgroundColor: c.navyCard, borderWidth: 1, borderColor: c.line, borderRadius: radius.m, padding: 14, gap: 6 },
  paper: { backgroundColor: c.paper, borderRadius: radius.m, overflow: 'hidden' },
  paperArt: { height: 180 },
  lookFor: { backgroundColor: c.navyCard, borderRadius: radius.m, padding: 14, gap: 4, borderWidth: 1, borderColor: c.line },
  relatedCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, backgroundColor: c.paper, borderRadius: radius.m },
  thumb: { width: 64, height: 64, borderRadius: radius.s, overflow: 'hidden' },
  thumbLocked: { flex: 1, backgroundColor: c.navy, alignItems: 'center', justifyContent: 'center' },
  cardStack: { paddingHorizontal: 24, paddingVertical: 12 },
  cardBack: { position: 'absolute', top: 20, bottom: 16, left: 30, right: 30, backgroundColor: c.paperDeep, borderRadius: radius.m, borderWidth: 2, borderColor: '#B89B6E' },
});
