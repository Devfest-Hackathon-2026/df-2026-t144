import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DiscoveryMap from './src/components/Map';
import InterestPicker from './src/components/InterestPicker';
import RelatedTeaser from './src/components/RelatedTeaser';
import { SPOTS, DESTINATIONS, DEMO_ORIGIN, STORIES, TOPICS } from './src/data/spots';
import { addDiscovery, createDemoRoutes, getUnlockState, sanitizeDiscoveries } from './src/domain';
import { pickStory, rankSpots, topicScore } from './src/interests';
import { useLocation } from './src/useLocation';
import { fetchRoutes } from './src/routesClient';
import { apiConfigured } from './src/apiClient';
import { colors as c, radius, text as t } from './src/theme';
import { Button, Icon, installWebStyles } from './src/ui';
import type { Budget, Discovery, LocationFix, Mode, RouteOption, Spot } from './src/types';

installWebStyles();
const STORAGE_KEY = 'michi.discoveries.v1';
const minute = (seconds: number) => Math.ceil(seconds / 60);

/** "？" before discovery, a check after. Shape and symbol differ, not only color. */
function SpotMark({ done, size = 40 }: { done: boolean; size?: number }) {
  return <View style={[s.mark, { width: size, height: size, borderRadius: size / 2 }, done && s.markDone]}>
    {done ? <Icon name="check" color={c.key} size={size * 0.55} /> : <Text style={[t.std20B150, s.markText]}>？</Text>}
  </View>;
}
function Tag({ label, tone = 'key' }: { label: string; tone?: 'key' | 'gray' }) {
  return <View style={[s.tag, tone === 'gray' && s.tagGray]}><Text style={[t.note14B150, { color: tone === 'key' ? c.key : c.sub }]}>{label}</Text></View>;
}
function Progress({ value, total }: { value: number; total: number }) {
  return <View style={s.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: value }}>
    <View style={[s.progressFill, { width: `${total ? value / total * 100 : 0}%` }]} />
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
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); setDiscoveries(updated); setNotice('図鑑に記録しました。'); }
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
  const locationHelp = mode === 'gps' && location.error ? <View style={s.alert}>
    <Text style={[t.std16B170, s.textColor]}>現在地を使えません</Text><Text style={[t.std16N170, s.bodyText]}>{location.error}</Text>
    {location.needsSettings && (Platform.OS === 'web' ? <Text style={[t.std16N170, s.bodyText]}>ブラウザのサイト設定から、位置情報の許可を変更できます。</Text> : <Button label="位置情報の設定を開く" variant="secondary" onPress={() => void openLocationSettings()} />)}
    <Button label="位置情報を使わずデモで試す" variant="secondary" onPress={() => changeMode('demo')} />
  </View> : null;

  const gpsStatus = location.loading ? '現在地を取得しています。' : location.fix ? `${location.fix.accuracy === null ? 'GPSの精度は不明です。' : `GPSの精度は約${Math.round(location.fix.accuracy)}mです。`}現在地はアプリの利用中だけ取得します。` : location.error ? '現在地を利用できません。' : '現在地を待っています。';

  return <View style={s.desktop}><View style={[s.app, width > 600 && s.desktopApp]}>
    <StatusBar style="dark" />
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Text style={[t.std24B150, s.brand]} accessibilityRole="header">MICHI<Text style={{ color: c.key }}>?</Text></Text>
        <Text style={[t.note14N150, s.subText]}>京都・三条周辺の寄り道案内</Text>
      </View>
      <View style={s.segment} accessibilityRole="radiogroup" accessibilityLabel="使い方の切り替え">{(['demo', 'gps'] as Mode[]).map(value => {
        const active = mode === value;
        return <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={() => changeMode(value)} style={[s.segmentItem, active && s.segmentActive]}>
          {active && <Icon name="check" color={c.white} size={18} />}<Text style={[active ? t.std16B170 : t.std16N170, { color: active ? c.white : c.body }]}>{value === 'demo' ? '体験デモ' : '現地で歩く'}</Text>
        </Pressable>;
      })}</View>

      {tab === 'walk' ? <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[t.std28B150, s.textColor, s.pageTitle]} accessibilityRole="header">{walking ? '寄り道中' : '寄り道ルートを探す'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`目的地 ${destination.name}。変更する`} onPress={() => setDestinationPicker(true)} style={({ pressed }) => [s.field, pressed && s.rowPressed]}>
          <Icon name="pin" color={c.key} />
          <View style={{ flex: 1 }}><Text style={[t.note14N150, s.subText]}>{mode === 'demo' ? '三条京阪付近（デモ）' : '現在地'}から</Text><Text style={[t.std18B160, s.textColor]}>{destination.name}</Text></View>
          <Text style={[t.std16N170, s.link]}>変更</Text>
        </Pressable>
        <View style={s.mapFrame}><DiscoveryMap spots={visibleSpots} discoveredIds={discoveredIds} route={route} destination={destination} position={currentFix} selectedId={selectedId ?? undefined} onSelect={setSelectedId} /></View>
        <View style={s.section}>
          {mode === 'demo' ? <Text style={[t.note14N150, s.subText]}>デモでは、位置と所要時間に体験用の仮データを使います。</Text>
            : <View style={s.rowBetween}><Text style={[t.note14N150, s.subText, { flex: 1 }]}>{gpsStatus}</Text><Button label="再取得" variant="text" onPress={() => void location.retry()} /></View>}
          {locationHelp}
          {mode === 'demo' && loaded && modeDiscoveries.length === 0 && !walking && <View style={s.notice}>
            <Text style={[t.std18B160, s.textColor]}>はじめての方へ</Text>
            {['地図かリストの「？」を選ぶ', '「デモでこの場所へ移動」を押す', '「発見する」を押すと解説が開き、図鑑に記録される'].map((label, index) => <View key={label} style={s.step}><Text style={[t.std16B170, { color: c.key }]}>{index + 1}.</Text><Text style={[t.std16N170, s.bodyText, { flex: 1 }]}>{label}</Text></View>)}
            <Button label="最初の「？」を試す" onPress={startFirstDiscovery} disabled={Boolean(storageError)} />
            <Text style={[t.note14N150, s.subText]}>今いる場所から移動しなくても試せます。</Text>
          </View>}
          {!walking ? <>
            <InterestPicker topics={TOPICS} selected={topicIds} onChange={setTopicIds} />
            <Text style={[t.std20B150, s.textColor, s.sectionTitle]} accessibilityRole="header">寄り道できる時間</Text>
            <View style={s.choiceRow} accessibilityRole="radiogroup">{([5, 10] as Budget[]).map(value => {
              const active = budget === value;
              return <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`追加${value}分まで`} accessibilityState={{ checked: active }} onPress={() => setBudget(value)} style={[s.choice, active && s.choiceActive]}>
                {active && <Icon name="check" color={c.key} size={18} />}<Text style={[active ? t.std16B170 : t.std16N170, { color: active ? c.key : c.body }]}>追加{value}分まで</Text>
              </Pressable>;
            })}</View>
            {routes.length > 0 ? <>
              <View style={s.routeCards} accessibilityRole="radiogroup">{routes.map(option => {
                const active = route?.id === option.id;
                return <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={`${option.kind === 'discovery' ? '寄り道する' : '寄り道しない'} ${minute(option.totalSeconds)}分`} accessibilityState={{ checked: active }} onPress={() => setSelectedKind(option.kind)} style={[s.routeCard, active && s.routeActive]}>
                  <View style={s.rowBetween}><Text style={[t.std16B170, s.textColor]}>{option.kind === 'discovery' ? '寄り道する' : '寄り道しない'}</Text><View style={[s.radio, active && s.radioActive]}>{active && <View style={s.radioDot} />}</View></View>
                  <Text style={[t.std28B150, s.textColor]}>{minute(option.totalSeconds)}<Text style={t.std16N170}>分</Text></Text>
                  <Text style={[t.note14N150, s.subText]}>{option.kind === 'discovery' ? `「？」${option.spotIds.length}か所（見学${minute(option.visitSeconds)}分を含む）\n直行より${minute(option.extraSeconds)}分長い` : '目的地まで直行'}</Text>
                </Pressable>;
              })}</View>
              <Button label="このルートで歩き始める" onPress={() => { setWalking(true); setDemoPosition(DEMO_ORIGIN); }} />
              {mode === 'gps' && <Button label={routesLoading ? '経路を計算しています' : '現在地からルートを再計算する'} variant="text" onPress={() => void loadRoutes()} disabled={routesLoading} />}
            </> : mode === 'gps' && <View style={s.card}>
              <Text style={[t.std18B160, s.textColor]}>{apiConfigured ? '現在地から寄り道ルートを探す' : '近くの「？」を探す'}</Text>
              <Text style={[t.std16N170, s.bodyText]}>{apiConfigured ? '現在地をGoogleの経路計算に送り、見学時間を含めて所要時間を比べます。' : 'GPSで近くの「？」を発見できます。徒歩ルートの比較は、経路サーバーにつないだ後に使えます。'}</Text>
              {apiConfigured ? <Button label="ルートを探す" onPress={() => void loadRoutes()} loading={routesLoading} disabled={!location.fix} /> : <Button label="体験デモでルートを比べる" variant="secondary" onPress={() => changeMode('demo')} />}
            </View>}
          </> : <View style={s.card}>
            <View style={s.rowBetween}><Text style={[t.std18B160, s.textColor, { flex: 1 }]}>{routeCompleted ? 'このルートの「？」をすべて発見しました' : route?.kind === 'direct' ? '目的地へ向かっています' : '次の「？」'}</Text><Text style={[t.std16B170, s.textColor]}>{progress} / {route?.spotIds.length ?? 0}か所</Text></View>
            {route?.kind === 'discovery' && <Progress value={progress} total={route.spotIds.length} />}
            {nextSpot ? <Pressable accessibilityRole="button" accessibilityLabel={`次の「？」のヒント。${nextSpot.hint}`} onPress={() => setSelectedId(nextSpot.id)} style={({ pressed }) => [s.nextCard, pressed && s.rowPressed]}>
              <SpotMark done={false} /><View style={{ flex: 1 }}><Text style={[t.note14N150, s.subText]}>ヒント</Text><Text style={[t.std16N170, s.bodyText]}>{nextSpot.hint}</Text></View><Icon name="chevron" color={c.sub} size={20} />
            </Pressable> : <Text style={[t.std16N170, s.bodyText]}>{routeCompleted ? '発見した解説は、発見図鑑で読み返せます。' : '現在地を確かめながら進んでください。デモの線は道案内ではありません。'}</Text>}
            {routeCompleted && <Button label="発見図鑑を見る" onPress={() => setTab('book')} />}
            <Button label="ルートを選び直す" variant="text" onPress={() => setWalking(false)} />
          </View>}
          {route?.source === 'google' && <Text style={[t.note14N150, s.bodyText, { marginTop: 8 }]}>経路情報: Google Maps</Text>}
          {routeWarnings.map((warning, index) => <Text key={index} style={[t.note14N150, s.subText]}>{warning}</Text>)}
          {routeError && <View style={s.error}><Text style={[t.std16N170, { color: c.error }]}>{routeError}</Text></View>}
          <View style={[s.rowBetween, s.sectionTitle]}><Text style={[t.std20B150, s.textColor]} accessibilityRole="header">{walking ? 'このルートの「？」' : '周辺の「？」'}</Text><Text style={[t.std16N170, s.subText]}>{visibleSpots.length}か所</Text></View>
          {visibleSpots.map(spot => {
            const done = discoveredIds.includes(spot.id);
            const match = topicScore(spot, topicIds) > 0;
            return <Pressable key={spot.id} accessibilityRole="button" accessibilityLabel={`${done ? spot.name : '未発見の「？」'}、${spot.category}${match ? '、興味に一致' : ''}`} onPress={() => setSelectedId(spot.id)} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
              <SpotMark done={done} />
              <View style={{ flex: 1, gap: 4 }}>
                <View style={s.meta}><Text style={[t.note14N150, s.subText]}>{spot.category}</Text>{match && <Tag label="興味に一致" />}</View>
                <Text style={[t.std16N170, s.bodyText]} numberOfLines={2}>{done ? spot.name : spot.hint}</Text>
              </View>
              <Icon name="chevron" color={c.sub} size={20} />
            </Pressable>;
          })}
          <Text style={[t.note14N150, s.subText, s.footer]}>{'「？」の近くでは、歩道の端など安全な場所に立ち止まってから操作してください。'}{mode === 'gps' ? '\nスポットの位置は現地で未確認です。現地の案内表示を優先してください。' : ''}</Text>
        </View>
      </ScrollView> : <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, s.section]} showsVerticalScrollIndicator={false}>
        <Text style={[t.std28B150, s.textColor, s.pageTitle, { paddingHorizontal: 0 }]} accessibilityRole="header">発見図鑑</Text>
        <Text style={[t.std16N170, s.bodyText]}>発見した「？」の解説を読み返せます。</Text>
        <View style={s.summary}>
          <Text style={[t.std20B150, s.textColor]}>{SPOTS.length}か所中 {modeDiscoveries.length}か所を発見</Text>
          <Progress value={modeDiscoveries.length} total={SPOTS.length} />
          <Text style={[t.note14N150, s.subText]}>{mode === 'demo' ? 'デモの記録です。現地の記録とは別に保存しています。' : '現地で発見した記録です。'}</Text>
        </View>
        {!loaded && <ActivityIndicator color={c.key} />}
        {loaded && modeDiscoveries.length === 0 && <View style={s.card}>
          <Text style={[t.std18B160, s.textColor]}>まだ記録がありません</Text>
          <Text style={[t.std16N170, s.bodyText]}>{mode === 'demo' ? 'デモで「？」に近づき、「発見する」を押すと、ここに記録されます。' : '「？」に歩いて近づき、「発見する」を押すと記録されます。デモの記録はここには入りません。'}</Text>
          <Button label={mode === 'demo' ? '最初の「？」を試す' : 'ルートを探す'} onPress={mode === 'demo' ? startFirstDiscovery : () => setTab('walk')} disabled={Boolean(storageError)} />
        </View>}
        {SPOTS.map(spot => {
          const discovery = modeDiscoveries.find(d => d.spotId === spot.id);
          return <Pressable key={spot.id} accessibilityRole="button" accessibilityLabel={`${discovery ? spot.name : '未発見の「？」'}を開く`} onPress={() => setSelectedId(spot.id)} style={({ pressed }) => [s.collectionCard, pressed && s.rowPressed]}>
            <View style={s.rowBetween}><Text style={[t.note14N150, s.subText]}>{spot.category}</Text>{discovery ? <Tag label="発見済み" /> : <Tag label="未発見" tone="gray" />}</View>
            {discovery ? <>
              <Text style={[t.std18B160, s.textColor]}>{spot.name}</Text>
              <Text style={[t.std16N170, s.bodyText]} numberOfLines={2}>{spot.story}</Text>
              <Text style={[t.note14N150, s.subText]}>{new Date(discovery.discoveredAt).toLocaleDateString('ja-JP')}に発見（{mode === 'demo' ? 'デモ' : '現地'}）</Text>
            </> : <Text style={[t.std16N170, s.bodyText]}>{spot.hint}</Text>}
          </Pressable>;
        })}
        <Text style={[t.note14N150, s.subText, s.footer]}>{'記録はこの端末だけに保存されます。アプリを削除すると消えることがあります。'}</Text>
      </ScrollView>}
      {storageError && <Text style={[t.note14N150, s.storageError]}>{storageError}</Text>}
      <SafeAreaView edges={['bottom']} style={s.tabSafe}><View style={s.tabBar} accessibilityRole="tablist">{([{ id: 'walk', label: 'ルートを探す', icon: 'map' }, { id: 'book', label: '発見図鑑', icon: 'book' }] as const).map(item => {
        const active = tab === item.id;
        return <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(item.id)} style={[s.tab, active && s.tabActive]}>
          <Icon name={item.icon} color={active ? c.key : c.sub} /><Text style={[active ? t.note14B150 : t.note14N150, { color: active ? c.key : c.sub }]}>{item.label}</Text>
        </Pressable>;
      })}</View></SafeAreaView>
    </SafeAreaView>
    {notice && <View style={s.toast} pointerEvents="none" accessibilityLiveRegion="polite"><Text style={[t.std16N170, { color: c.white, textAlign: 'center' }]}>{notice}</Text></View>}

    <Modal visible={destinationPicker} animationType="slide" transparent onRequestClose={() => setDestinationPicker(false)}>
      <View style={s.scrim}><View style={s.sheet}>
        <View style={s.sheetHeader}><Text style={[t.std20B150, s.textColor]} accessibilityRole="header">目的地を選ぶ</Text><Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => setDestinationPicker(false)} style={s.close}><Icon name="close" /></Pressable></View>
        <Text style={[t.std16N170, s.bodyText]}>京都・三条周辺の2か所から選べます。</Text>
        {DESTINATIONS.map(d => <Pressable accessibilityRole="radio" accessibilityState={{ checked: d.id === destinationId }} key={d.id} onPress={() => { setDestinationId(d.id); setDestinationPicker(false); }} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
          <Icon name="pin" color={c.key} /><View style={{ flex: 1 }}><Text style={[t.std16B170, s.textColor]}>{d.name}</Text><Text style={[t.note14N150, s.subText]}>{d.subtitle}</Text></View>{d.id === destinationId && <Icon name="check" color={c.key} />}
        </Pressable>)}
        <SafeAreaView edges={['bottom']} />
      </View></View>
    </Modal>
    <Modal visible={Boolean(selected)} animationType="slide" transparent onRequestClose={() => { if (!saving) setSelectedId(null); }}>
      <View style={s.scrim}><View style={[s.sheet, s.detailSheet]}>
        {notice && <View style={s.modalNotice}><Text style={[t.std16N170, { color: c.white }]}>{notice}</Text></View>}
        {selected && <SpotDetail spot={selected} mode={mode} discovered={discoveredIds.includes(selected.id)} fix={currentFix} saving={saving} loaded={loaded && !storageError} onClose={() => { if (!saving) setSelectedId(null); }} onDiscover={() => void discover(selected)} onMove={() => { setDemoPosition(selected.coordinate); setNow(Date.now()); }} onRelated={setSelectedId} onSource={url => void openSource(url)} discoveredIds={discoveredIds} onOpenBook={() => { setSelectedId(null); setTab('book'); }} locationHelp={locationHelp} topicIds={topicIds} />}
      </View></View>
    </Modal>
  </View></View>;
}

function SpotDetail({ spot, mode, discovered, fix, saving, loaded, onClose, onDiscover, onMove, onRelated, onSource, discoveredIds, onOpenBook, locationHelp, topicIds }: { spot: Spot; mode: Mode; discovered: boolean; fix: LocationFix | null; saving: boolean; loaded: boolean; onClose: () => void; onDiscover: () => void; onMove: () => void; onRelated: (id: string) => void; onSource: (url: string) => void; discoveredIds: string[]; onOpenBook: () => void; locationHelp: React.ReactNode; topicIds: string[] }) {
  const unlock = getUnlockState(spot, fix, Date.now());
  const story = pickStory(spot, topicIds, STORIES);
  const storyTopic = story.variant ? TOPICS.find(topic => topic.id === story.variant?.topicId)?.label : null;
  return <>
    <View style={s.sheetHeader}>
      <View style={s.meta}><Tag label={spot.category} tone="gray" /><Tag label={mode === 'demo' ? 'デモ' : '現地'} tone="gray" /></View>
      <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={onClose} disabled={saving} style={s.close}><Icon name="close" /></Pressable>
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.detailContent}>
      {discovered ? <>
        <Text style={[t.std24B150, s.textColor]} accessibilityRole="header">{spot.name}</Text>
        {storyTopic && <Text style={[t.note14N150, s.subText]}>「{storyTopic}」の視点の解説です。Geminiが下書きし、出典と照合しました。</Text>}
        <Text style={[t.std16N170, s.bodyText]}>{story.text}</Text>
        <View style={s.notice}><Text style={[t.std16B170, s.textColor]}>現地で見るもの</Text><Text style={[t.std16N170, s.bodyText]}>{spot.lookFor}</Text></View>
        <Text style={[t.std20B150, s.textColor, s.sectionTitle]} accessibilityRole="header">関連する「？」</Text>
        {spot.relatedSpotIds.map(id => { const related = SPOTS.find(item => item.id === id)!; const done = discoveredIds.includes(id); return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`関連する${done ? related.name : '未発見の「？」'}を開く`} onPress={() => onRelated(id)} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
          <SpotMark done={done} /><View style={{ flex: 1, gap: 4 }}><Text style={[t.note14N150, s.subText]}>{related.category}</Text>{done ? <Text style={[t.std16N170, s.bodyText]}>{related.name}</Text> : <RelatedTeaser from={spot} to={related} topicIds={topicIds} />}</View><Icon name="chevron" color={c.sub} size={20} />
        </Pressable>; })}
        <Text style={[t.std20B150, s.textColor, s.sectionTitle]} accessibilityRole="header">出典</Text>
        {spot.sources.map(source => <Pressable key={source.url} accessibilityRole="link" accessibilityLabel={`${source.title}（外部サイト）`} onPress={() => onSource(source.url)} style={s.sourceLink}><Text style={[t.std16N170, s.link]}>{source.title}（外部サイト）</Text></Pressable>)}
        <Text style={[t.note14N150, s.subText]}>{spot.coordinateNote}</Text>
        <View style={s.saved}><Icon name="check" color={c.key} size={20} /><Text style={[t.std16B170, { color: c.key }]}>図鑑に記録済み{mode === 'demo' ? '（デモ）' : ''}</Text></View>
        <Button label="発見図鑑で見る" onPress={onOpenBook} />
      </> : <>
        <Text style={[t.std24B150, s.textColor]} accessibilityRole="header">未発見の「？」</Text>
        <View style={s.hintBox}><Text style={[t.note14N150, s.subText]}>ヒント</Text><Text style={[t.std18B160, s.textColor]}>{spot.hint}</Text></View>
        <View style={s.meta}><Icon name="pin" color={c.key} size={20} /><Text style={[t.std16B170, s.textColor]}>{unlock.distanceMeters === null ? '現在地を待っています' : unlock.eligible ? '発見できる場所に着きました' : `「？」まで約${Math.round(unlock.distanceMeters)}m`}</Text></View>
        <Text style={[t.std16N170, s.bodyText]}>{unlock.reason}</Text>
        {locationHelp}
        {mode === 'demo' && !unlock.eligible && <View style={{ gap: 8 }}><Button label="デモでこの場所へ移動" variant="secondary" onPress={onMove} /><Text style={[t.note14N150, s.subText]}>実際には移動しません。体験用に現在地を動かします。</Text></View>}
        <View style={{ gap: 8 }}><Button label="発見する" onPress={onDiscover} disabled={!unlock.eligible || !loaded} loading={saving} /><Text style={[t.note14N150, s.subText]}>押すと解説が開き、図鑑に記録されます。</Text></View>
      </>}
      <Button label="閉じる" variant="secondary" onPress={onClose} disabled={saving} />
      <SafeAreaView edges={['bottom']} />
    </ScrollView>
  </>;
}

const s = StyleSheet.create({
  desktop: { flex: 1, backgroundColor: c.surfaceAlt, alignItems: 'center' },
  app: { width: '100%', maxWidth: 480, flex: 1, backgroundColor: c.surface, overflow: 'hidden' },
  desktopApp: { marginVertical: 24, borderRadius: radius.l, borderWidth: 1, borderColor: c.divider },
  safe: { flex: 1 },
  textColor: { color: c.text }, bodyText: { color: c.body }, subText: { color: c.sub }, link: { color: c.link, textDecorationLine: 'underline' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  brand: { color: c.text },
  segment: { marginHorizontal: 16, marginBottom: 8, flexDirection: 'row', borderWidth: 1, borderColor: c.key, borderRadius: radius.m, overflow: 'hidden' },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, backgroundColor: c.white },
  segmentActive: { backgroundColor: c.key },
  scroll: { flex: 1 }, scrollContent: { paddingBottom: 24 },
  pageTitle: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  section: { paddingHorizontal: 16, gap: 16 },
  sectionTitle: { marginTop: 16 },
  field: { marginHorizontal: 16, marginBottom: 16, padding: 16, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.m, backgroundColor: c.white, borderWidth: 1, borderColor: c.border },
  mapFrame: { height: 280, marginHorizontal: 16, marginBottom: 8, borderRadius: radius.m, overflow: 'hidden', borderWidth: 1, borderColor: c.divider },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  card: { borderWidth: 1, borderColor: c.divider, borderRadius: radius.m, padding: 16, gap: 16, backgroundColor: c.white },
  notice: { backgroundColor: c.keyBg, borderRadius: radius.m, padding: 16, gap: 8 },
  alert: { backgroundColor: c.surfaceAlt, borderLeftWidth: 4, borderLeftColor: c.key, borderRadius: radius.s, padding: 16, gap: 12 },
  error: { backgroundColor: c.errorBg, borderLeftWidth: 4, borderLeftColor: c.error, borderRadius: radius.s, padding: 16 },
  step: { flexDirection: 'row', gap: 8 },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, minHeight: 48, borderRadius: radius.m, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, backgroundColor: c.white },
  choiceActive: { borderWidth: 2, borderColor: c.key, backgroundColor: c.keyBg },
  routeCards: { flexDirection: 'row', gap: 8 },
  routeCard: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: radius.m, backgroundColor: c.white, padding: 12, gap: 4 },
  routeActive: { borderWidth: 2, borderColor: c.key, backgroundColor: c.keyBg },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center', backgroundColor: c.white },
  radioActive: { borderColor: c.key }, radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: c.key },
  progressTrack: { height: 8, backgroundColor: c.surfaceAlt, borderRadius: radius.full, overflow: 'hidden', borderWidth: 1, borderColor: c.divider },
  progressFill: { backgroundColor: c.key, height: '100%' },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.m, borderWidth: 1, borderColor: c.border, backgroundColor: c.white },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64, borderBottomWidth: 1, borderColor: c.divider },
  rowPressed: { backgroundColor: c.surfaceAlt },
  mark: { backgroundColor: c.key, alignItems: 'center', justifyContent: 'center' },
  markDone: { backgroundColor: c.white, borderWidth: 2, borderColor: c.key },
  markText: { color: c.white, lineHeight: 26 },
  tag: { borderWidth: 1, borderColor: c.key, borderRadius: radius.s, paddingHorizontal: 6, backgroundColor: c.white },
  tagGray: { borderColor: c.border },
  footer: { marginTop: 8, marginBottom: 8 },
  summary: { backgroundColor: c.surfaceAlt, borderRadius: radius.m, padding: 16, gap: 8, marginTop: 8 },
  collectionCard: { padding: 16, gap: 8, borderRadius: radius.m, borderWidth: 1, borderColor: c.divider, backgroundColor: c.white },
  storageError: { padding: 12, color: c.error, backgroundColor: c.errorBg },
  tabSafe: { borderTopWidth: 1, borderColor: c.divider, backgroundColor: c.white },
  tabBar: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderTopWidth: 3, borderTopColor: 'transparent', minHeight: 56 },
  tabActive: { borderTopColor: c.key },
  toast: { position: 'absolute', bottom: 96, left: 16, right: 16, borderRadius: radius.m, padding: 16, backgroundColor: c.text },
  scrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 480, backgroundColor: c.white, borderTopLeftRadius: radius.l, borderTopRightRadius: radius.l, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 8 },
  detailSheet: { maxHeight: '92%', paddingBottom: 0 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  close: { width: 48, height: 48, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center' },
  modalNotice: { backgroundColor: c.text, padding: 12, borderRadius: radius.m },
  detailContent: { paddingBottom: 24, gap: 16 },
  hintBox: { borderLeftWidth: 4, borderLeftColor: c.key, paddingLeft: 12, paddingVertical: 4, gap: 4 },
  sourceLink: { minHeight: 44, justifyContent: 'center' },
  saved: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
});
