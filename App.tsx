import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import DiscoveryMap from './src/components/Map';
import InterestPicker from './src/components/InterestPicker';
import RelatedTeaser from './src/components/RelatedTeaser';
import { SPOTS, DESTINATIONS, DEMO_ORIGIN, STORIES, TOPICS } from './src/data/spots';
import { addDiscovery, createDemoRoutes, getUnlockState, sanitizeDiscoveries } from './src/domain';
import { pickStory, rankSpots, topicScore } from './src/interests';
import { useLocation } from './src/useLocation';
import { fetchRoutes } from './src/routesClient';
import { apiConfigured } from './src/apiClient';
import { colors as c } from './src/theme';
import type { Budget, Discovery, LocationFix, Mode, RouteOption, Spot } from './src/types';

const STORAGE_KEY = 'michi.discoveries.v1';
const minute = (seconds: number) => Math.ceil(seconds / 60);

function Icon({ name, color = c.ink, size = 22 }: { name: 'map' | 'book' | 'arrow' | 'pin' | 'close' | 'check'; color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {name === 'map' && <><Path d="M 3 6 L 9 3 L 15 6 L 21 3 V 18 L 15 21 L 9 18 L 3 21 Z" /><Path d="M 9 3 V 18 M 15 6 V 21" /></>}
    {name === 'book' && <><Rect x={4} y={3} width={16} height={18} rx={3} /><Path d="M 9 3 V 21 M 13 8 H 17 M 13 12 H 16" /></>}
    {name === 'arrow' && <Path d="M 5 12 H 19 M 13 6 L 19 12 L 13 18" />}
    {name === 'pin' && <><Path d="M 12 22 S 4 14 4 9 A 8 8 0 0 1 20 9 C 20 14 12 22 12 22 Z" /><Circle cx={12} cy={9} r={2.5} /></>}
    {name === 'close' && <Path d="M 6 6 L 18 18 M 18 6 L 6 18" />}
    {name === 'check' && <Path d="M 5 12 L 10 17 L 20 6" />}
  </Svg>;
}
function Button({ label, onPress, disabled, secondary, loading }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; loading?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [s.button, secondary && s.secondaryButton, (disabled || loading) && s.disabled, pressed && s.pressed]}>
    {loading ? <ActivityIndicator color={secondary ? c.ink : c.white} /> : <><Text style={[s.buttonText, secondary && { color: c.ink }]}>{label}</Text><Icon name="arrow" color={secondary ? c.ink : c.lime} size={20} /></>}
  </Pressable>;
}
function Artwork({ category }: { category: string }) {
  return <View style={s.artwork}>
    <Svg width="100%" height="140" viewBox="0 0 340 140">
      <Circle cx="265" cy="32" r="19" fill="#D5E3B3" />
      <Path d="M -10 118 Q 45 91 92 115 T 190 112 T 350 105" fill="none" stroke="#A4CAC2" strokeWidth="22" />
      <Path d="M -10 138 Q 45 111 92 135 T 190 132 T 350 125" fill="none" stroke="#C7DED5" strokeWidth="6" />
      {category === '水路' ? <><Path d="M 91 80 H 218 L 198 105 H 115 Z" fill={c.ink} /><Path d="M 127 78 V 55 H 178 V 78" fill="#D3B38E" /><Path d="M 119 55 L 154 40 L 187 55 Z" fill={c.ink} /></> : category === '建築' ? <><Path d="M 60 93 Q 170 43 280 93" stroke={c.ink} fill="none" strokeWidth="9" /><Path d="M 80 84 V 62 M 125 70 V 44 M 170 66 V 38 M 215 70 V 44 M 260 84 V 62" stroke={c.ink} strokeWidth="5" /><Path d="M 60 64 Q 170 15 280 64" stroke={c.ink} fill="none" strokeWidth="4" /></> : <><Rect x="139" y="37" width="54" height="69" rx="4" fill="#B8C6AD" /><Path d="M 130 108 H 205 M 151 51 V 89 M 169 52 V 90 M 183 53 V 91" stroke={c.ink} strokeWidth="3" /><Path d="M 75 100 V 54 M 62 65 L 75 45 L 90 65 M 60 81 L 75 62 L 92 81" fill="none" stroke="#839C7A" strokeWidth="4" /></>}
    </Svg>
    <Text style={s.artworkLabel}>街の記憶を、ひとつ。</Text>
  </View>;
}

export default function App() { return <SafeAreaProvider><Michi /></SafeAreaProvider>; }
function Michi() {
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<'walk' | 'book'>('walk');
  const [mode, setMode] = useState<Mode>('demo');
  const [budget, setBudget] = useState<Budget>(5);
  const [destinationId, setDestinationId] = useState(DESTINATIONS[0].id);
  const [destinationPicker, setDestinationPicker] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const location = useLocation(mode === 'gps');
  const destination = DESTINATIONS.find(d => d.id === destinationId)!;
  const demoRoutes = useMemo(() => createDemoRoutes(destination, budget, SPOTS, DEMO_ORIGIN, topicIds), [destinationId, budget, topicIds]);
  const routes = mode === 'demo' ? demoRoutes : googleRoutes ?? [];
  const route = routes.find(r => r.kind === selectedKind) ?? routes[0] ?? null;
  const modeDiscoveries = discoveries.filter(d => d.mode === mode);
  const discoveredIds = modeDiscoveries.map(d => d.spotId);
  const selected = SPOTS.find(spot => spot.id === selectedId);
  const currentFix: LocationFix | null = mode === 'demo' ? { ...demoPosition, accuracy: 0, timestamp: now } : location.fix;
  const visibleSpots = walking && route?.kind === 'discovery' ? SPOTS.filter(spot => route.spotIds.includes(spot.id)) : rankSpots(SPOTS, topicIds);
  const nextSpot = walking && route ? route.spotIds.map(id => SPOTS.find(spot => spot.id === id)).find(spot => spot && !discoveredIds.includes(spot.id)) : undefined;
  const routeCompleted = walking && route?.kind === 'discovery' && route.spotIds.every(id => discoveredIds.includes(id));
  const progress = route?.spotIds.filter(id => discoveredIds.includes(id)).length ?? 0;

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
  useEffect(() => { routeRequest.current++; setGoogleRoutes(null); setRouteWarnings([]); setRouteError(null); setRoutesLoading(false); setWalking(false); setSelectedId(null); }, [mode, destinationId, budget, topicIds]);

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
  async function discover(spot: Spot) {
    if (saving || !loaded || storageError) return;
    // Recheck on press: never trust an earlier enabled button after a stale GPS fix.
    const pressFix = mode === 'demo' ? { ...demoPosition, accuracy: 0, timestamp: Date.now() } : location.fix;
    if (!getUnlockState(spot, pressFix).eligible) { setNotice('現在地をもう一度確認してください。'); return; }
    setSaving(true);
    const updated = addDiscovery(discoveries, spot.id, mode);
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); setDiscoveries(updated); setNotice('発見を図鑑に記録しました'); }
    catch { setNotice('保存できませんでした。空き容量などを確認して、もう一度お試しください。'); }
    finally { setSaving(false); }
  }
  async function openSource(url: string) {
    try { await Linking.openURL(url); } catch { setNotice('出典を開けませんでした。ネット接続を確認してください。'); }
  }
  const changeMode = (value: Mode) => { if (saving) return; setMode(value); setDemoPosition(DEMO_ORIGIN); };
  function startFirstDiscovery() {
    const firstId = demoRoutes.find(option => option.kind === 'discovery')?.spotIds[0];
    if (!firstId) return;
    setTab('walk'); setSelectedKind('discovery'); setWalking(true);
    setDemoPosition(DEMO_ORIGIN); setSelectedId(firstId);
  }
  async function openLocationSettings() {
    try { await Linking.openSettings(); }
    catch { setNotice('設定を開けませんでした。端末の設定から位置情報の許可を確認してください。'); }
  }
  const locationHelp = mode === 'gps' && location.error ? <View style={s.locationHelp}>
    <Text style={s.sectionLabel}>現在地が使えなくても、大丈夫。</Text><Text style={s.body}>{location.error}</Text>
    {location.needsSettings && (Platform.OS === 'web' ? <Text style={s.body}>ブラウザのサイト設定から位置情報の許可を変更できます。</Text> : <Button label="位置情報の設定を開く" secondary onPress={() => void openLocationSettings()} />)}
    <Button label="位置情報を使わずデモで試す" secondary onPress={() => changeMode('demo')} />
  </View> : null;

  return <View style={s.desktop}><View style={[s.app, width > 600 && s.desktopApp]}>
    <StatusBar style="dark" />
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}><View style={s.brandRow}><Text style={s.brand}>MICHI<Text style={{ color: '#8EA552' }}>?</Text></Text><View style={s.edition}><Text style={s.editionText}>KYOTO / SANJO</Text></View></View><Text style={s.brandCaption}>いつもの道の、その先へ。</Text></View>
      <View style={s.modeRow}>{(['demo', 'gps'] as Mode[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => changeMode(value)} style={[s.modeButton, mode === value && s.modeActive]}><View style={[s.modeDot, { backgroundColor: mode === value ? c.ink : '#BCC5B7' }]} /><Text style={[s.modeText, mode === value && s.modeTextActive]}>{value === 'demo' ? '体験デモ' : '現地で歩く'}</Text></Pressable>)}</View>

      {tab === 'walk' ? <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.intro}><Text style={s.eyebrow}>{walking ? 'ON THE WAY' : 'A LITTLE DETOUR'}</Text><Text style={s.heading}>{walking ? '道の途中に、\nまだ知らない物語。' : 'あと少し、\n遠回りしてみよう。'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="目的地を選ぶ" onPress={() => setDestinationPicker(true)} style={s.destination}><View style={s.destinationIcon}><Icon name="pin" size={21} /></View><View style={{ flex: 1 }}><Text style={s.smallLabel}>{mode === 'demo' ? '三条京阪から' : '現在地から'}、ここまで</Text><Text style={s.destinationName}>{destination.name}</Text></View><Text style={s.chevron}>⌄</Text></Pressable>
        <View style={s.mapFrame}><DiscoveryMap spots={visibleSpots} discoveredIds={discoveredIds} route={route} destination={destination} position={currentFix} selectedId={selectedId ?? undefined} onSelect={setSelectedId} /></View>
        <View style={s.belowMap}>
          {mode === 'demo' ? <Text style={s.contextNote}>DEMO · 位置と所要時間は体験用の仮データです</Text> : <View style={s.gpsRow}><Text style={s.contextNote}>{location.loading ? '現在地を取得しています…' : location.fix ? `${location.fix.accuracy === null ? 'GPS精度不明' : `GPS精度 ±${Math.round(location.fix.accuracy)}m`} · 利用中のみ取得` : location.error ? '現在地を利用できません' : '現在地を待っています'}</Text><Pressable accessibilityRole="button" onPress={() => void location.retry()}><Text style={s.textLink}>再取得</Text></Pressable></View>}
          {locationHelp}
          {mode === 'demo' && loaded && modeDiscoveries.length === 0 && !walking && <View style={s.firstGuide}>
            <Text style={s.eyebrow}>YOUR FIRST DISCOVERY</Text><Text style={s.setupTitle}>まずは、1つ見つけてみよう。</Text>
            <View style={s.guideSteps}>{['「？」を開く', 'デモで近づく', '発見して図鑑へ'].map((label, index) => <View key={label} style={s.guideStep}><Text style={s.guideNumber}>0{index + 1}</Text><Text style={s.guideLabel}>{label}</Text></View>)}</View>
            <Button label="最初の「？」を体験する" onPress={startFirstDiscovery} disabled={Boolean(storageError)} />
            <Text style={s.guideNote}>今いる場所から、移動せずに試せます。</Text>
          </View>}
          {!walking ? <>
            <InterestPicker topics={TOPICS} selected={topicIds} onChange={setTopicIds} />
            <View style={s.budgetRow}><Text style={s.sectionLabel}>寄り道できる時間</Text><View style={s.budgetControls}>{([5, 10] as Budget[]).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`追加${value}分`} accessibilityState={{ selected: budget === value }} onPress={() => setBudget(value)} style={[s.budgetChip, budget === value && s.budgetSelected]}><Text style={[s.budgetText, budget === value && { color: c.white }]}>＋{value}分</Text></Pressable>)}</View></View>
            {routes.length > 0 ? <><View style={s.routeCards}>{routes.map(option => <Pressable key={option.id} accessibilityRole="button" accessibilityLabel={`${option.label} ${minute(option.totalSeconds)}分`} accessibilityState={{ selected: route?.id === option.id }} onPress={() => setSelectedKind(option.kind)} style={[s.routeCard, route?.id === option.id && s.routeSelected]}><View style={s.routeTop}><Text style={s.routeLabel}>{option.label}</Text><View style={[s.radio, route?.id === option.id && s.radioSelected]}>{route?.id === option.id && <View style={s.radioInner} />}</View></View><View style={s.timeRow}><Text style={s.routeMinutes}>{minute(option.totalSeconds)}</Text><Text style={s.minutesUnit}>分</Text>{option.kind === 'discovery' && <Text style={s.extra}>＋{minute(option.extraSeconds)}分</Text>}</View><Text style={s.routeSub}>{option.kind === 'discovery' ? `${option.spotIds.length}つの発見 · 見学${minute(option.visitSeconds)}分込み` : '寄り道せず、目的地へ'}</Text></Pressable>)}</View>
              <Button label={route?.kind === 'discovery' ? 'この道で、発見しよう' : 'このルートを選ぶ'} onPress={() => { setWalking(true); setDemoPosition(DEMO_ORIGIN); }} />
              {mode === 'gps' && <Pressable style={s.centerLink} accessibilityRole="button" onPress={() => void loadRoutes()}><Text style={s.textLink}>{routesLoading ? '経路を更新中…' : '現在地からルートを更新'}</Text></Pressable>}
            </> : mode === 'gps' && <View style={s.setupCard}><Text style={s.setupTitle}>{apiConfigured ? '今いる場所から、寄り道へ。' : '近くの「？」を探してみよう。'}</Text><Text style={s.body}>{apiConfigured ? '現在地をGoogleの経路計算へ送り、見学時間を含めて比べます。' : 'GPSで近くのスポットを発見できます。実際の徒歩ルート比較は、Google経路サービスの接続後に使えます。'}</Text>{apiConfigured ? <Button label="ルートを探す" onPress={() => void loadRoutes()} loading={routesLoading} disabled={!location.fix} /> : <Button label="体験デモでルートを比べる" secondary onPress={() => changeMode('demo')} />}</View>}
          </> : <View style={s.walkCard}>
            <View style={s.rowBetween}><Text style={s.sectionLabel}>{routeCompleted ? 'この道の発見、コンプリート。' : route?.kind === 'direct' ? '目的地へ、気をつけて。' : '次の「？」を見つけよう'}</Text><Text style={s.progressText}>{progress} / {route?.spotIds.length ?? 0}</Text></View>
            {route?.kind === 'discovery' && <View style={s.progressTrack}><View style={[s.progressFill, { width: `${route.spotIds.length ? progress / route.spotIds.length * 100 : 0}%` }]} /></View>}
            {nextSpot ? <Pressable accessibilityRole="button" onPress={() => setSelectedId(nextSpot.id)} style={s.nextCard}><View style={s.question}><Text style={s.questionText}>?</Text></View><View style={{ flex: 1 }}><Text style={s.smallLabel}>NEXT DISCOVERY</Text><Text style={s.hintText}>{nextSpot.hint}</Text></View><Icon name="arrow" /></Pressable> : <Text style={s.body}>{routeCompleted ? 'いつもの景色が、少し違って見えるかも。図鑑で今日の発見を振り返れます。' : '現在地を確かめながら進みましょう。デモの線は実際の道路案内ではありません。'}</Text>}
            {routeCompleted && <Button label="発見図鑑を見る" onPress={() => setTab('book')} />}
            <Pressable accessibilityRole="button" onPress={() => setWalking(false)} style={s.centerLink}><Text style={s.textLink}>ルートを選び直す</Text></Pressable>
          </View>}
          {route?.source === 'google' && <Text style={s.attribution}>経路情報: Google Maps</Text>}
          {routeWarnings.map((warning, index) => <Text key={index} style={s.contextNote}>{warning}</Text>)}
          {routeError && <Text style={s.error}>{routeError}</Text>}
          <View style={s.spotListHeader}><Text style={s.sectionLabel}>{walking ? 'この道の発見' : '近くの、知らない話'}</Text><Text style={s.countLabel}>{visibleSpots.length} SPOTS</Text></View>
          {visibleSpots.map((spot, index) => <Pressable key={spot.id} accessibilityRole="button" accessibilityLabel={`${discoveredIds.includes(spot.id) ? spot.name : `未発見スポット${index + 1}`}を開く`} onPress={() => setSelectedId(spot.id)} style={s.spotRow}><Text style={s.spotIndex}>{String(index + 1).padStart(2, '0')}</Text><View style={[s.smallQuestion, discoveredIds.includes(spot.id) && { backgroundColor: c.light }]}><Text style={s.smallQuestionText}>{discoveredIds.includes(spot.id) ? '✓' : '?'}</Text></View><View style={{ flex: 1 }}><Text style={s.category}>{spot.category}{topicScore(spot, topicIds) > 0 ? ' · あなた向け' : ''}</Text><Text style={s.spotRowText} numberOfLines={2}>{discoveredIds.includes(spot.id) ? spot.name : spot.hint}</Text></View><Icon name="arrow" size={18} /></Pressable>)}
          <Text style={s.footerNote}>「？」に近づいたら、安全な場所で立ち止まって。{mode === 'gps' ? '\n位置は現地未検証です。周囲の案内を優先してください。' : ''}</Text>
        </View>
      </ScrollView> : <ScrollView style={s.scroll} contentContainerStyle={s.bookContent} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>YOUR LITTLE DISCOVERIES</Text><Text style={s.heading}>発見図鑑</Text><Text style={s.body}>知るほどに、この街が好きになる。</Text>
        <View style={s.collectionHero}><View><Text style={s.collectionNumber}>{String(modeDiscoveries.length).padStart(2, '0')}<Text style={s.collectionTotal}> / 05</Text></Text><Text style={s.category}>{mode === 'demo' ? 'デモで見つけた、街の物語' : '現地で見つけた、街の物語'}</Text></View><View style={s.stamp}><Text style={s.stampSmall}>MICHI?</Text><Text style={s.stampBig}>発見</Text><Text style={s.stampSmall}>KYOTO</Text></View></View>
        <Text style={s.contextNote}>{mode === 'demo' ? 'デモの記録です。現地の発見とは分けて保存されます。' : 'この端末に保存した現地の記録です。'}</Text>
        {!loaded && <ActivityIndicator color={c.ink} />}
        {loaded && modeDiscoveries.length === 0 && <View style={s.emptyCard}><Text style={s.setupTitle}>最初の「？」が、待っています。</Text><Text style={s.body}>{mode === 'demo' ? 'デモで近づき、物語を開いてみましょう。最初の発見から、この図鑑に残ります。' : '近くの「？」に歩いて近づくと、物語を発見できます。デモの記録はここには入りません。'}</Text><Button label={mode === 'demo' ? '最初の「？」を体験する' : '道を探しにいく'} onPress={mode === 'demo' ? startFirstDiscovery : () => setTab('walk')} disabled={Boolean(storageError)} /></View>}
        {SPOTS.map((spot, index) => {
          const discovery = modeDiscoveries.find(d => d.spotId === spot.id);
          return <Pressable key={spot.id} accessibilityRole="button" accessibilityLabel={`${discovery ? spot.name : `未発見の図鑑${index + 1}`}を開く`} onPress={() => setSelectedId(spot.id)} style={[s.collectionCard, !discovery && s.lockedCard]}>
            <View style={s.rowBetween}><Text style={s.eyebrow}>NO. {String(index + 1).padStart(2, '0')} / {spot.category}</Text><Text style={s.category}>{discovery ? '発見済み ✓' : 'まだ知らない'}</Text></View>
            {discovery ? <><Text style={s.collectionTitle}>{spot.name}</Text><Text style={s.body} numberOfLines={2}>{spot.story}</Text><Text style={s.dateText}>{new Date(discovery.discoveredAt).toLocaleDateString('ja-JP')} · {mode === 'demo' ? 'DEMO' : '現地で発見'}</Text></> : <><Text style={s.lockedTitle}>?</Text><Text style={s.body}>{spot.hint}</Text></>}
          </Pressable>;
        })}
        <Text style={s.footerNote}>{'記録はこの端末に保存されます。\nアプリを削除すると失われる場合があります。'}</Text>
      </ScrollView>}
      {storageError && <Text style={s.storageError}>{storageError}</Text>}
      <SafeAreaView edges={['bottom']} style={s.tabSafe}><View style={s.tabBar}>{([{ id: 'walk', label: '道を探す', icon: 'map' }, { id: 'book', label: '発見図鑑', icon: 'book' }] as const).map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: tab === item.id }} onPress={() => setTab(item.id)} style={s.tab}><View style={[s.tabIcon, tab === item.id && { backgroundColor: c.lime }]}><Icon name={item.icon} color={tab === item.id ? c.ink : c.muted} /></View><Text style={[s.tabLabel, tab === item.id && { color: c.ink }]}>{item.label}</Text></Pressable>)}</View></SafeAreaView>
    </SafeAreaView>
    {notice && <View style={s.toast} pointerEvents="none"><Text style={s.toastText}>{notice}</Text></View>}

    <Modal visible={destinationPicker} animationType="slide" transparent onRequestClose={() => setDestinationPicker(false)}>
      <View style={s.scrim}><View style={s.sheet}><View style={s.sheetHandle} /><View style={s.sheetHeader}><Text style={s.sheetTitle}>今日は、どこまで？</Text><Pressable accessibilityRole="button" accessibilityLabel="目的地選択を閉じる" onPress={() => setDestinationPicker(false)} style={s.close}><Icon name="close" /></Pressable></View><Text style={s.body}>まずは京都・三条周辺の2つの目的地から。</Text>{DESTINATIONS.map(d => <Pressable accessibilityRole="button" key={d.id} onPress={() => { setDestinationId(d.id); setDestinationPicker(false); }} style={s.destinationOption}><Icon name="pin" /><View style={{ flex: 1 }}><Text style={s.destinationName}>{d.name}</Text><Text style={s.optionSubtitle}>{d.subtitle}</Text></View>{d.id === destinationId && <Icon name="check" />}</Pressable>)}<SafeAreaView edges={['bottom']} /></View></View>
    </Modal>
    <Modal visible={Boolean(selected)} animationType="slide" transparent onRequestClose={() => { if (!saving) setSelectedId(null); }}>
      <View style={s.scrim}><View style={[s.sheet, s.detailSheet]}><View style={s.sheetHandle} />
        {notice && <View style={s.modalNotice}><Text style={s.toastText}>{notice}</Text></View>}
        {selected && <SpotDetail spot={selected} mode={mode} discovered={discoveredIds.includes(selected.id)} fix={currentFix} now={now} saving={saving} loaded={loaded && !storageError} onClose={() => { if (!saving) setSelectedId(null); }} onDiscover={() => void discover(selected)} onMove={() => { setDemoPosition(selected.coordinate); setNow(Date.now()); }} onRelated={setSelectedId} onSource={url => void openSource(url)} discoveredIds={discoveredIds} onOpenBook={() => { setSelectedId(null); setTab('book'); }} locationHelp={locationHelp} topicIds={topicIds} />}
      </View></View>
    </Modal>
  </View></View>;
}

function SpotDetail({ spot, mode, discovered, fix, now, saving, loaded, onClose, onDiscover, onMove, onRelated, onSource, discoveredIds, onOpenBook, locationHelp, topicIds }: { spot: Spot; mode: Mode; discovered: boolean; fix: LocationFix | null; now: number; saving: boolean; loaded: boolean; onClose: () => void; onDiscover: () => void; onMove: () => void; onRelated: (id: string) => void; onSource: (url: string) => void; discoveredIds: string[]; onOpenBook: () => void; locationHelp: React.ReactNode; topicIds: string[] }) {
  const unlock = getUnlockState(spot, fix, Date.now());
  const story = pickStory(spot, topicIds, STORIES);
  const storyTopic = story.variant ? TOPICS.find(topic => topic.id === story.variant?.topicId)?.label : null;
  return <>
    <View style={s.sheetHeader}><Text style={s.eyebrow}>{discovered ? 'DISCOVERY FOUND' : 'A STORY IS HIDING HERE'}</Text><Pressable accessibilityRole="button" accessibilityLabel="スポットを閉じる" onPress={onClose} disabled={saving} style={s.close}><Icon name="close" /></Pressable></View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.detailContent}>
      <View style={s.detailTag}><Text style={s.category}>{spot.category} · {mode === 'demo' ? 'デモ' : '現地'}</Text></View>
      {discovered ? <><Text style={s.detailTitle}>{spot.name}</Text><Artwork category={spot.category} />{storyTopic && <Text style={[s.category, { marginBottom: 8 }]}>「{storyTopic}」の視点で · Geminiの下書きを出典と照合済み</Text>}<Text style={s.story}>{story.text}</Text><View style={s.lookCard}><Text style={s.sectionLabel}>ここを、見てみよう</Text><Text style={s.body}>{spot.lookFor}</Text></View>
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>この話のつづき</Text>{spot.relatedSpotIds.map(id => { const related = SPOTS.find(s => s.id === id)!; return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`関連する${discoveredIds.includes(id) ? related.name : '未発見スポット'}を開く`} onPress={() => onRelated(id)} style={s.related}><View style={s.smallQuestion}><Text style={s.smallQuestionText}>{discoveredIds.includes(id) ? '✓' : '?'}</Text></View><View style={{ flex: 1 }}><Text style={s.category}>{related.category}</Text>{discoveredIds.includes(id) ? <Text style={s.hintText}>{related.name}</Text> : <RelatedTeaser from={spot} to={related} topicIds={topicIds} />}</View><Icon name="arrow" size={18} /></Pressable>; })}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>物語の出典</Text>{spot.sources.map(source => <Pressable key={source.url} accessibilityRole="link" onPress={() => onSource(source.url)} style={s.sourceLink}><Text style={[s.textLink, { flex: 1 }]}>{source.title}</Text><Text style={s.textLink}>↗</Text></Pressable>)}<Text style={s.coordinateNote}>{spot.coordinateNote}</Text><View style={s.savedBadge}><Icon name="check" size={18} /><Text style={s.savedText}>図鑑に記録しました{mode === 'demo' ? '（デモ）' : ''}</Text></View>
      </> : <><View style={s.mysteryArt}><View style={s.mysteryRing}><Text style={s.mysteryQuestion}>?</Text></View><Text style={s.mysteryLabel}>まだ知らない、この街の話。</Text></View><Text style={s.detailHint}>{spot.hint}</Text><View style={s.distanceRow}><Icon name="pin" size={18} /><Text style={s.distanceText}>{unlock.distanceMeters === null ? '現在地を待っています' : unlock.eligible ? '発見できる場所に着きました' : `発見スポットまで 約${Math.round(unlock.distanceMeters)}m`}</Text></View><Text style={s.body}>{unlock.reason}</Text>{locationHelp}
        {mode === 'demo' && !unlock.eligible && <View style={{ marginTop: 18 }}><Button label="デモでここへ移動" secondary onPress={onMove} /><Text style={s.centerNote}>実際の移動や現地訪問にはなりません。</Text></View>}
        <View style={{ marginTop: 18 }}><Button label="立ち止まって、発見する" onPress={onDiscover} disabled={!unlock.eligible || !loaded} loading={saving} /></View><Text style={s.centerNote}>出典のある短い物語が開き、図鑑に残ります。</Text>
      </>}
      {discovered && <View style={{ marginBottom: 12 }}><Button label="発見図鑑で見る" onPress={onOpenBook} /></View>}
      <Button label={discovered ? '街歩きに戻る' : '地図に戻る'} secondary onPress={onClose} disabled={saving} />
      <SafeAreaView edges={['bottom']} />
    </ScrollView>
  </>;
}

const s = StyleSheet.create({
  firstGuide: { backgroundColor: '#EDF2DC', borderWidth: 1, borderColor: '#D8E3BE', borderRadius: 18, padding: 18, marginTop: 18, gap: 10 },
  guideSteps: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 5, gap: 8 }, guideStep: { flex: 1, gap: 5 }, guideNumber: { color: '#7D9465', fontSize: 18, fontWeight: '700' }, guideLabel: { color: c.ink, fontSize: 10, lineHeight: 17, fontWeight: '600' }, guideNote: { color: c.muted, fontSize: 10, textAlign: 'center', lineHeight: 17 },
  locationHelp: { backgroundColor: '#FAEFE5', borderRadius: 16, padding: 16, gap: 12, marginVertical: 12 },
  desktop: { flex: 1, backgroundColor: '#DFE5D9', alignItems: 'center' }, app: { width: '100%', maxWidth: 480, flex: 1, backgroundColor: c.paper, overflow: 'hidden' }, desktopApp: { marginVertical: 22, borderRadius: 30, borderWidth: 1, borderColor: '#CCD4C6', boxShadow: '0px 20px 80px #193C3415' }, safe: { flex: 1 }, modalNotice: { backgroundColor: c.ink, padding: 12, borderRadius: 12, marginBottom: 10 },
  header: { paddingHorizontal: 24, paddingTop: 15, paddingBottom: 12 }, brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: c.ink, fontWeight: '900', fontSize: 32, letterSpacing: -1.5 }, brandCaption: { color: c.muted, fontSize: 10, marginTop: 3, letterSpacing: 1.5 }, edition: { borderWidth: 1, borderColor: c.line, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 11 }, editionText: { color: c.ink, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  modeRow: { marginHorizontal: 24, marginBottom: 4, flexDirection: 'row', backgroundColor: '#ECEFE5', padding: 4, borderRadius: 12 }, modeButton: { flex: 1, minHeight: 35, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }, modeActive: { backgroundColor: c.white }, modeDot: { width: 5, height: 5, borderRadius: 3 }, modeText: { fontSize: 12, color: c.muted, fontWeight: '600' }, modeTextActive: { color: c.ink },
  scroll: { flex: 1 }, scrollContent: { paddingBottom: 16 }, intro: { paddingHorizontal: 24, paddingTop: 25, paddingBottom: 20 }, eyebrow: { color: c.muted, fontSize: 9, letterSpacing: 1.6, fontWeight: '700' }, heading: { color: c.ink, fontSize: 29, lineHeight: 42, fontWeight: '800', letterSpacing: .3, marginTop: 9 },
  destination: { marginHorizontal: 24, marginBottom: 20, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, backgroundColor: c.white, borderWidth: 1, borderColor: c.line }, destinationIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.light, alignItems: 'center', justifyContent: 'center' }, smallLabel: { color: c.muted, fontSize: 9, letterSpacing: .6, marginBottom: 5 }, destinationName: { color: c.ink, fontSize: 15, fontWeight: '700' }, chevron: { color: c.ink, fontSize: 22 },
  mapFrame: { height: 270, marginHorizontal: 12, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#DEE5D8' }, belowMap: { paddingHorizontal: 24 }, contextNote: { fontSize: 10, lineHeight: 18, color: c.muted, marginTop: 10 }, gpsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  budgetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 23, marginBottom: 14 }, sectionLabel: { fontSize: 13, fontWeight: '700', color: c.ink }, budgetControls: { flexDirection: 'row', gap: 7 }, budgetChip: { borderRadius: 20, backgroundColor: c.light, paddingHorizontal: 14, minHeight: 34, justifyContent: 'center' }, budgetSelected: { backgroundColor: c.ink }, budgetText: { fontSize: 12, color: c.ink, fontWeight: '700' },
  routeCards: { flexDirection: 'row', gap: 10, marginBottom: 17 }, routeCard: { flex: 1, borderWidth: 1.5, borderColor: c.line, borderRadius: 16, backgroundColor: c.white, padding: 13 }, routeSelected: { borderColor: c.ink, backgroundColor: '#EDF2DC' }, routeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }, routeLabel: { fontSize: 11, color: c.ink, fontWeight: '700' }, radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#BAC5B5', alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: c.ink }, radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.ink }, timeRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 12, gap: 3 }, routeMinutes: { color: c.ink, fontSize: 34, fontWeight: '800', letterSpacing: -1.5 }, minutesUnit: { fontSize: 12, color: c.ink, marginRight: 3 }, extra: { fontSize: 10, fontWeight: '700', color: '#638342' }, routeSub: { fontSize: 9, color: c.muted, marginTop: 5, lineHeight: 15 },
  button: { minHeight: 53, backgroundColor: c.ink, borderRadius: 14, paddingHorizontal: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, buttonText: { color: c.white, fontWeight: '700', fontSize: 14 }, secondaryButton: { backgroundColor: c.light, borderWidth: 1, borderColor: c.line }, disabled: { opacity: .4 }, pressed: { opacity: .8 },
  spotListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 29, marginBottom: 7 }, countLabel: { fontSize: 9, color: c.muted, letterSpacing: 1 }, spotRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 16, borderBottomWidth: 1, borderColor: c.line }, spotIndex: { fontSize: 10, color: '#9BA894' }, smallQuestion: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.lime, alignItems: 'center', justifyContent: 'center' }, smallQuestionText: { fontSize: 21, fontWeight: '800', color: c.ink }, category: { fontSize: 10, color: c.muted, letterSpacing: .5 }, spotRowText: { fontSize: 12, color: c.ink, lineHeight: 19, marginTop: 4 }, footerNote: { textAlign: 'center', fontSize: 10, lineHeight: 19, color: c.muted, marginTop: 25, marginBottom: 10 },
  tabSafe: { borderTopWidth: 1, borderColor: c.line, backgroundColor: c.paper }, tabBar: { flexDirection: 'row', paddingVertical: 8 }, tab: { flex: 1, alignItems: 'center', gap: 3 }, tabIcon: { paddingVertical: 5, paddingHorizontal: 22, borderRadius: 20 }, tabLabel: { fontSize: 10, color: c.muted, fontWeight: '700' },
  setupCard: { backgroundColor: c.white, borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 18, gap: 15 }, setupTitle: { fontSize: 16, fontWeight: '700', color: c.ink, lineHeight: 25 }, body: { fontSize: 12, lineHeight: 22, color: c.muted }, error: { color: '#9C4D33', backgroundColor: '#FAEFE5', fontSize: 11, lineHeight: 20, padding: 12, borderRadius: 12, marginVertical: 10 }, textLink: { color: c.ink, fontSize: 11, lineHeight: 18, textDecorationLine: 'underline' }, centerLink: { alignItems: 'center', padding: 15 },
  walkCard: { marginTop: 20, gap: 16 }, rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, progressText: { fontSize: 12, fontWeight: '700', color: c.ink }, progressTrack: { height: 5, backgroundColor: c.line, borderRadius: 4, overflow: 'hidden' }, progressFill: { backgroundColor: '#8BA75A', height: 5, borderRadius: 4 }, nextCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.white, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: c.line }, question: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: c.lime }, questionText: { color: c.ink, fontSize: 30, fontWeight: '800' }, hintText: { color: c.ink, fontSize: 12, lineHeight: 22 }, attribution: { fontSize: 12, fontWeight: '500', color: c.ink, marginTop: 12 },
  bookContent: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24 }, collectionHero: { marginTop: 25, marginBottom: 9, backgroundColor: '#EAF0DB', padding: 24, borderRadius: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, collectionNumber: { fontSize: 52, color: c.ink, fontWeight: '800', letterSpacing: -2, marginBottom: 5 }, collectionTotal: { fontSize: 21, color: '#90A080', letterSpacing: 0 }, stamp: { width: 80, height: 80, borderRadius: 40, borderWidth: 1, borderColor: '#8DA173', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-13deg' }] }, stampBig: { fontSize: 22, color: '#7D9465', fontWeight: '700' }, stampSmall: { fontSize: 7, letterSpacing: 1.8, color: '#7D9465' }, emptyCard: { marginTop: 20, gap: 12, paddingVertical: 10 }, collectionCard: { marginTop: 16, padding: 20, backgroundColor: c.white, borderRadius: 18, borderWidth: 1, borderColor: c.line }, lockedCard: { backgroundColor: '#F1F2E9' }, collectionTitle: { fontSize: 19, fontWeight: '700', color: c.ink, marginTop: 13, marginBottom: 8 }, dateText: { fontSize: 10, color: c.muted, marginTop: 16 }, lockedTitle: { color: '#9BA98D', fontSize: 33, fontWeight: '800', marginVertical: 6 },
  scrim: { flex: 1, backgroundColor: '#102A2366', justifyContent: 'flex-end', alignItems: 'center' }, sheet: { width: '100%', maxWidth: 480, backgroundColor: c.paper, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 24, paddingBottom: 20 }, detailSheet: { maxHeight: '91%', paddingBottom: 0 }, sheetHandle: { width: 35, height: 4, borderRadius: 2, backgroundColor: '#CBD3C5', alignSelf: 'center', marginTop: 12, marginBottom: 11 }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, sheetTitle: { fontSize: 19, color: c.ink, fontWeight: '700' }, close: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.light, alignItems: 'center', justifyContent: 'center' }, destinationOption: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 22, borderBottomWidth: 1, borderColor: c.line }, optionSubtitle: { marginTop: 6, color: c.muted, fontSize: 10, lineHeight: 18 },
  detailContent: { paddingBottom: 24 }, detailTag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: c.light, marginBottom: 12 }, detailTitle: { fontSize: 27, color: c.ink, fontWeight: '800', lineHeight: 37, marginBottom: 20 }, artwork: { height: 170, backgroundColor: '#EAF0E1', borderRadius: 18, overflow: 'hidden', marginBottom: 22 }, artworkLabel: { textAlign: 'center', color: '#7D9476', fontSize: 9, letterSpacing: 2 }, story: { fontSize: 15, color: c.ink, lineHeight: 29, marginBottom: 21 }, lookCard: { gap: 8, backgroundColor: '#EDF1DF', padding: 17, borderRadius: 14 }, related: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: c.line }, sourceLink: { paddingVertical: 11, flexDirection: 'row', gap: 10 }, coordinateNote: { fontSize: 10, lineHeight: 18, color: c.muted, marginTop: 10 }, savedBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 22 }, savedText: { fontSize: 12, color: c.ink, fontWeight: '600' },
  mysteryArt: { alignItems: 'center', paddingVertical: 25, marginBottom: 15, borderRadius: 20, backgroundColor: '#EAF0DF' }, mysteryRing: { width: 105, height: 105, borderWidth: 1, borderColor: '#CEDAB9', borderRadius: 53, justifyContent: 'center', alignItems: 'center' }, mysteryQuestion: { color: c.ink, fontSize: 70, fontWeight: '800' }, mysteryLabel: { fontSize: 10, color: '#7A8F69', letterSpacing: 1.3, marginTop: 16 }, detailHint: { fontSize: 21, lineHeight: 34, color: c.ink, fontWeight: '700', marginVertical: 12 }, distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9, marginBottom: 12 }, distanceText: { fontSize: 12, color: c.ink, fontWeight: '600' }, centerNote: { fontSize: 10, color: c.muted, textAlign: 'center', lineHeight: 19, marginTop: 9, marginBottom: 18 }, toast: { position: 'absolute', bottom: 95, left: 22, right: 22, borderRadius: 14, padding: 15, backgroundColor: c.ink }, toastText: { color: c.white, fontSize: 12, textAlign: 'center', lineHeight: 20 }, storageError: { padding: 10, color: '#9C4D33', backgroundColor: '#FAEFE5', fontSize: 11 },
});
