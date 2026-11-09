// Web map. With a browser key it shows a real Google Map (Maps JavaScript API,
// dark color scheme, Advanced Markers). Without one it falls back to a labelled schematic.
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import type { MapProps } from './Map.types';
import { fetchConfig } from '../apiClient';
import { colors as c, radius, text as t } from '../theme';

const PIN_SVG = (done: boolean) => `<svg width="40" height="46" viewBox="0 0 40 46" xmlns="http://www.w3.org/2000/svg">
  <path d="M 4 4 H 36 V 32 H 24 L 20 42 L 16 32 H 4 Z" fill="${done ? c.paper : c.red}" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
  ${done ? `<path d="M 12 18 L 18 24 L 29 12" stroke="${c.red}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : '<path d="M 15 13 C 15 8 25 8 25 13 C 25 17 20 17 20 21 M 20 25.5 L 20 26" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>'}
</svg>`;

// Five-story pagoda for the destination (32x40), shared by the Google map and the schematic.
const PAGODA_ROOFS = [0, 1, 2, 3].map((i) => { const y = 6 + i * 7; const w = 8 + i * 2.5; return `M ${16 - w} ${y + 4} Q 16 ${y - 2} ${16 + w} ${y + 4} L ${16 + w * 0.6} ${y + 7} H ${16 - w * 0.6} Z`; });
const PAGODA_SVG = `<svg width="38" height="48" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
  <path d="M 16 1 V 6" stroke="#fff" stroke-width="1.5"/>
  ${PAGODA_ROOFS.map((d) => `<path d="${d}" fill="${c.navy}" stroke="#fff" stroke-width="1.2"/>`).join('')}
  <rect x="9" y="34" width="14" height="4" fill="${c.red}" stroke="#fff" stroke-width="1.2"/>
</svg>`;

let mapsLoader: Promise<any> | null = null;
function loadGoogleMaps(key: string): Promise<any> {
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  mapsLoader ??= new Promise((resolve, reject) => {
    w.__michiMapsReady = () => resolve(w.google.maps);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=marker&language=ja&region=JP&callback=__michiMapsReady`;
    script.async = true;
    script.onerror = () => { mapsLoader = null; reject(new Error('Google Maps failed to load')); };
    document.head.appendChild(script);
  });
  return mapsLoader;
}

function useMapsKey() {
  const [key, setKey] = useState<string | null | undefined>(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || undefined);
  useEffect(() => {
    if (key !== undefined) return;
    let alive = true;
    void fetchConfig().then((config) => { if (alive) setKey(config.mapsApiKey); });
    return () => { alive = false; };
  }, [key]);
  return key;
}

function GoogleMap(props: MapProps & { apiKey: string; onFail: () => void }) {
  const element = useRef<HTMLDivElement | null>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const dot = useRef<any>(null);
  const [maps, setMaps] = useState<any>(null);
  const spotsKey = props.spots.map((spot) => spot.id).join(',');
  const doneKey = props.discoveredIds.join(',');

  useEffect(() => {
    const w = window as any;
    w.gm_authFailure = props.onFail; // invalid key or referrer not allowed
    loadGoogleMaps(props.apiKey).then(setMaps, props.onFail);
  }, [props.apiKey]);

  useEffect(() => {
    if (!maps || !element.current || map.current) return;
    map.current = new maps.Map(element.current, {
      center: { lat: 35.0098, lng: 135.771 }, zoom: 16, mapId: 'DEMO_MAP_ID', colorScheme: 'DARK',
      disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: 'greedy',
    });
  }, [maps]);

  // Fit only when the route changes. The app re-renders every 10 s (and the demo
  // position is a new object each time), which must not undo the user's pan/zoom.
  useEffect(() => {
    if (!maps || !map.current || !props.route?.coordinates.length) return;
    const bounds = new maps.LatLngBounds();
    props.route.coordinates.forEach((p) => bounds.extend({ lat: p.latitude, lng: p.longitude }));
    map.current.fitBounds(bounds, { top: 190, bottom: 70, left: 40, right: 40 });
  }, [maps, props.route]);

  useEffect(() => {
    if (!maps || !map.current) return;
    overlays.current.forEach((item) => (item.setMap ? item.setMap(null) : (item.map = null)));
    overlays.current = [];
    const add = (item: any) => overlays.current.push(item);
    const position = (p: { latitude: number; longitude: number }) => ({ lat: p.latitude, lng: p.longitude });
    if (props.route?.coordinates.length) {
      const path = props.route.coordinates.map(position);
      add(new maps.Polyline({ map: map.current, path, strokeColor: c.red, strokeOpacity: 1, strokeWeight: 7 }));
      add(new maps.Polyline({ map: map.current, path, strokeOpacity: 0, icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: '#FFFFFF', scale: 2 }, offset: '0', repeat: '12px' }] }));
    }
    for (const spot of props.spots) {
      const done = props.discoveredIds.includes(spot.id);
      const content = document.createElement('button');
      content.type = 'button';
      content.innerHTML = PIN_SVG(done);
      content.setAttribute('aria-label', `${done ? spot.name : '未発見の「？」'}を開く`);
      content.style.cssText = `background:none;border:0;padding:0;cursor:pointer;transform:scale(${props.selectedId === spot.id ? 1.2 : 1})`;
      content.addEventListener('click', () => props.onSelect(spot.id));
      add(new maps.marker.AdvancedMarkerElement({ map: map.current, position: position(spot.coordinate), content, zIndex: props.selectedId === spot.id ? 10 : 1 }));
    }
    const flag = document.createElement('div');
    flag.innerHTML = PAGODA_SVG;
    flag.setAttribute('aria-label', `目的地 ${props.destination.name}`);
    add(new maps.marker.AdvancedMarkerElement({ map: map.current, position: position(props.destination.coordinate), content: flag, zIndex: 5 }));
    // The arrays are new on every render; rebuild only when their contents change.
  }, [maps, spotsKey, doneKey, props.route, props.destination, props.selectedId]);

  // The current-position dot moves on its own, so the demo walk (12 updates a second)
  // only shifts one marker instead of rebuilding every pin.
  useEffect(() => {
    if (!maps || !map.current) return;
    if (!props.position) {
      if (dot.current) dot.current.map = null;
      dot.current = null;
      return;
    }
    const at = { lat: props.position.latitude, lng: props.position.longitude };
    if (dot.current) { dot.current.position = at; return; }
    const content = document.createElement('div');
    content.style.cssText = `width:18px;height:18px;border-radius:50%;background:${c.user};border:3px solid #fff;box-shadow:0 0 0 8px ${c.user}44`;
    dot.current = new maps.marker.AdvancedMarkerElement({ map: map.current, position: at, content, zIndex: 20 });
  }, [maps, props.position?.latitude, props.position?.longitude]);

  return <View style={styles.frame}>
    <div ref={element} style={{ width: '100%', height: '100%' }} />
    {!maps && <View style={[StyleSheet.absoluteFill, styles.loading]}><Text style={[t.note14N150, { color: c.muted }]}>地図を読み込んでいます</Text></View>}
  </View>;
}

function Schematic(props: MapProps) {
  const project = (lat: number, lng: number) => ({ x: 35 + (lng - 135.7678) / .0067 * 340, y: 330 - (lat - 35.0030) / .0107 * 300 });
  const destination = project(props.destination.coordinate.latitude, props.destination.coordinate.longitude);
  const position = props.position ? project(props.position.latitude, props.position.longitude) : null;
  // Google route geometry may only be drawn on a Google map (Routes API policy).
  const points = props.route && props.route.source !== 'google' ? props.route.coordinates.map(p => { const q = project(p.latitude, p.longitude); return `${q.x},${q.y}`; }).join(' ') : null;
  return <View style={styles.frame}>
    <Svg width="100%" height="100%" viewBox="0 -130 420 490" preserveAspectRatio="xMidYMid slice">
      <Rect y="-130" width="420" height="490" fill={c.mapGround} />
      {[45, 99, 155, 210, 272, 330, 389].map(x => <Path key={`v${x}`} d={`M ${x} -130 V 360`} stroke={c.mapRoad} strokeWidth={9} />)}
      {[-110, -60, -15, 25, 72, 125, 175, 235, 295, 347].map(y => <Path key={`h${y}`} d={`M 0 ${y} H 420`} stroke={c.mapRoad} strokeWidth={7} />)}
      <Path d="M 300 -140 C 306 -60 304 0 304 -10 C 301 90 292 140 303 225 S 308 310 300 375" stroke={c.mapWater} strokeWidth="39" fill="none" />
      <Path d="M 163 -140 L 163 105 L 173 145 L 173 360" stroke={c.mapWater} strokeWidth="8" fill="none" />
      <SvgText x="318" y="94" fontSize="14" fill={c.muted}>鴨川</SvgText>
      <SvgText x="178" y="46" fontSize="14" fill={c.muted}>高瀬川</SvgText>
      <SvgText x="20" y="164" fontSize="14" fill={c.muted}>三条通</SvgText>
      {points && <><Polyline points={points} fill="none" stroke={c.red} strokeWidth="7" strokeLinejoin="round" /><Polyline points={points} fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeDasharray="4 7" strokeLinejoin="round" /></>}
      <G transform={`translate(${destination.x - 19} ${destination.y - 44}) scale(1.2)`}>
        <Path d="M 16 1 V 6" stroke="#FFFFFF" strokeWidth={1.5} />
        {PAGODA_ROOFS.map((d) => <Path key={d} d={d} fill={c.navy} stroke="#FFFFFF" strokeWidth={1.2} />)}
        <Rect x={9} y={34} width={14} height={4} fill={c.red} stroke="#FFFFFF" strokeWidth={1.2} />
      </G>
      {props.spots.map(spot => {
        const actual = project(spot.coordinate.latitude, spot.coordinate.longitude);
        const p = spot.id === 'ekiden-monument' ? { x: actual.x + 26, y: actual.y - 22 } : actual;
        const done = props.discoveredIds.includes(spot.id);
        const scale = props.selectedId === spot.id ? 1.2 : 1;
        return <g key={spot.id} role="button" tabIndex={0} aria-label={`${done ? spot.name : '未発見の「？」'}を地図で開く`} style={{ cursor: 'pointer' }} onClick={() => props.onSelect(spot.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelect(spot.id); } }}>
          <G transform={`translate(${p.x - 20 * scale} ${p.y - 44 * scale}) scale(${scale})`}>
            <Path d="M 4 4 H 36 V 32 H 24 L 20 42 L 16 32 H 4 Z" fill={done ? c.paper : c.red} stroke="#FFFFFF" strokeWidth={2.5} strokeLinejoin="round" />
            {done ? <Path d="M 12 18 L 18 24 L 29 12" stroke={c.red} strokeWidth={4} fill="none" strokeLinecap="round" />
              : <Path d="M 15 13 C 15 8 25 8 25 13 C 25 17 20 17 20 21 M 20 25.5 L 20 26" stroke="#FFFFFF" strokeWidth={4} fill="none" strokeLinecap="round" />}
          </G>
        </g>;
      })}
      {position && <G><Circle cx={position.x} cy={position.y} r="14" fill={`${c.user}44`} /><Circle cx={position.x} cy={position.y} r="7" fill={c.user} stroke="#FFFFFF" strokeWidth="3" /></G>}
    </Svg>
    <View style={styles.legend}><Text style={[t.note14N150, { color: c.white }]}>{props.route?.source === 'google' ? 'Googleの経路線は、Googleマップ表示のときだけ出します。' : '略図です。道案内には使えません。'}</Text></View>
  </View>;
}

export default function DiscoveryMap(props: MapProps) {
  const key = useMapsKey();
  const [failed, setFailed] = useState(false);
  if (key && !failed) return <GoogleMap {...props} apiKey={key} onFail={() => setFailed(true)} />;
  return <Schematic {...props} />;
}

const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden', backgroundColor: c.mapGround },
  loading: { alignItems: 'center', justifyContent: 'center' },
  legend: { position: 'absolute', left: 8, bottom: 92, backgroundColor: 'rgba(11, 22, 49, 0.85)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.s },
});
