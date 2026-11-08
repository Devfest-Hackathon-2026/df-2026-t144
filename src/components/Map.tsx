// Web preview uses a clearly labelled schematic. Native resolves Map.native.tsx.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import type { MapProps } from './Map.types';
import { colors as c, radius, text as t } from '../theme';

export default function DiscoveryMap(props: MapProps) {
  const project = (lat: number, lng: number) => ({ x: 35 + (lng - 135.7678) / .0067 * 340, y: 330 - (lat - 35.0030) / .0107 * 300 });
  if (props.route?.source === 'google') return <View style={styles.fallback}><Text style={[t.std18B160, { color: c.text }]}>Google Maps の徒歩ルート</Text><Text style={[t.std16N170, { color: c.body }]}>下のルート一覧で、実際の所要時間を比べられます。</Text><Text style={[t.note14N150, { color: c.sub }]}>Google Maps</Text></View>;
  const destination = project(props.destination.coordinate.latitude, props.destination.coordinate.longitude);
  const position = props.position ? project(props.position.latitude, props.position.longitude) : null;
  return <View style={styles.frame}>
    <Svg width="100%" height="100%" viewBox="0 0 420 360" preserveAspectRatio="xMidYMid slice">
      <Rect width="420" height="360" fill={c.ground} />
      {[45, 99, 155, 210, 272, 330, 389].map(x => <Path key={`v${x}`} d={`M ${x} 0 V 360`} stroke={c.road} strokeWidth={12} />)}
      {[25, 72, 125, 175, 235, 295, 347].map(y => <Path key={`h${y}`} d={`M 0 ${y} H 420`} stroke={c.road} strokeWidth={10} />)}
      <Path d="M 304 -10 C 301 90 292 140 303 225 S 308 310 300 375" stroke={c.water} strokeWidth="39" fill="none" />
      <Path d="M 163 -10 L 163 105 L 173 145 L 173 360" stroke={c.water} strokeWidth="8" fill="none" />
      <Path d="M 270 175 H 330" stroke={c.road} strokeWidth="12" />
      <SvgText x="318" y="94" fontSize="14" fill={c.sub}>鴨川</SvgText>
      <SvgText x="178" y="46" fontSize="14" fill={c.sub}>高瀬川</SvgText>
      <SvgText x="20" y="168" fontSize="14" fill={c.sub}>三条通</SvgText>
      <SvgText x="20" y="276" fontSize="14" fill={c.sub}>河原町</SvgText>
      {props.route && <Polyline points={props.route.coordinates.map(p => { const q = project(p.latitude, p.longitude); return `${q.x},${q.y}`; }).join(' ')} fill="none" stroke={c.key} strokeWidth="4" strokeDasharray="6 6" strokeLinejoin="round" />}
      <Rect x={destination.x - 10} y={destination.y - 10} width="20" height="20" rx="2" fill={c.text} stroke={c.white} strokeWidth="3" />
      {props.spots.map(spot => {
        const actual = project(spot.coordinate.latitude, spot.coordinate.longitude);
        // The bridge and relay monument share a small area; separate pins in this schematic.
        const p = spot.id === 'ekiden-monument' ? { x: actual.x + 22, y: actual.y - 28 } : actual;
        const done = props.discoveredIds.includes(spot.id);
        const selected = props.selectedId === spot.id;
        return <g key={spot.id} role="button" tabIndex={0} aria-label={`${done ? spot.name : '未発見の「？」'}を地図で開く`} style={{ cursor: 'pointer' }} onClick={() => props.onSelect(spot.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelect(spot.id); } }}>
          {spot.id === 'ekiden-monument' && <Path d={`M ${actual.x} ${actual.y} L ${p.x} ${p.y}`} stroke={c.sub} strokeWidth="1" strokeDasharray="2 3" />}
          <Circle cx={p.x} cy={p.y} r={selected ? 20 : 17} fill={done ? c.white : c.key} stroke={selected ? c.black : done ? c.key : c.white} strokeWidth="3" />
          <SvgText x={p.x} y={p.y + 7} textAnchor="middle" fill={done ? c.key : c.white} fontWeight="700" fontSize="20">{done ? '✓' : '？'}</SvgText>
        </g>;
      })}
      {position && <G><Circle cx={position.x} cy={position.y} r="14" fill="#0031D833" /><Circle cx={position.x} cy={position.y} r="7" fill={c.user} stroke={c.white} strokeWidth="3" /></G>}
    </Svg>
    <View style={styles.legend}><Text style={[t.note14N150, { color: c.text }]}>略図です。道案内には使えません。</Text></View>
    <View style={styles.north}><Text style={[t.note14B150, { color: c.text }]}>北↑</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  frame: { flex: 1, overflow: 'hidden' },
  legend: { position: 'absolute', top: 8, left: 8, backgroundColor: c.white, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.s, borderWidth: 1, borderColor: c.divider },
  north: { position: 'absolute', right: 8, top: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.s, backgroundColor: c.white, borderWidth: 1, borderColor: c.divider },
  fallback: { flex: 1, justifyContent: 'center', padding: 24, gap: 8, backgroundColor: c.surfaceAlt },
});
