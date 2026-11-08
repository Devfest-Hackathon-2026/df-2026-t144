// Web preview uses a clearly labelled schematic. Native resolves Map.native.tsx.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import type { MapProps } from './Map.types';
import { colors } from '../theme';

export default function DiscoveryMap(props: MapProps) {
  const project = (lat: number, lng: number) => ({ x: 35 + (lng - 135.7678) / .0067 * 340, y: 330 - (lat - 35.0030) / .0107 * 300 });
  if (props.route?.source === 'google') return <View style={styles.fallback}><Text style={styles.title}>Google Maps の徒歩ルート</Text><Text style={styles.note}>下のカードで、実際の経路時間を比較できます。</Text><Text style={styles.note}>Google Maps</Text></View>;
  const destination = project(props.destination.coordinate.latitude, props.destination.coordinate.longitude);
  const position = props.position ? project(props.position.latitude, props.position.longitude) : null;
  return <View style={styles.frame}>
    <Svg width="100%" height="100%" viewBox="0 0 420 360" preserveAspectRatio="xMidYMid slice">
      <Rect width="420" height="360" fill="#E9EDE2" />
      {[45, 99, 155, 210, 272, 330, 389].map(x => <Path key={`v${x}`} d={`M ${x} 0 V 360`} stroke="#FAFBF5" strokeWidth={12} />)}
      {[25, 72, 125, 175, 235, 295, 347].map(y => <Path key={`h${y}`} d={`M 0 ${y} H 420`} stroke="#FAFBF5" strokeWidth={10} />)}
      <Path d="M 304 -10 C 301 90 292 140 303 225 S 308 310 300 375" stroke={colors.river} strokeWidth="39" fill="none" />
      <Path d="M 163 -10 L 163 105 L 173 145 L 173 360" stroke="#C3DAD1" strokeWidth="8" fill="none" />
      <Path d="M 270 175 H 330" stroke="#FCFCF7" strokeWidth="12" />
      <SvgText x="324" y="94" fontSize="12" fill="#7B9C9A" letterSpacing="5">鴨川</SvgText>
      <SvgText x="176" y="46" fontSize="10" fill="#8D9D91">高瀬川</SvgText>
      <SvgText x="32" y="169" fontSize="10" fill="#9AA494">三条通</SvgText>
      <SvgText x="43" y="277" fontSize="10" fill="#9AA494">河原町</SvgText>
      {props.route && <Polyline points={props.route.coordinates.map(c => { const p = project(c.latitude, c.longitude); return `${p.x},${p.y}`; }).join(' ')} fill="none" stroke={colors.ink} strokeWidth="3.5" strokeDasharray="5 6" strokeLinejoin="round" />}
      <Circle cx={destination.x} cy={destination.y} r="10" fill={colors.ink} stroke="white" strokeWidth="3" />
      {props.spots.map(spot => {
        const actual = project(spot.coordinate.latitude, spot.coordinate.longitude);
        // The bridge and relay monument share a small area; separate pins in this schematic.
        const p = spot.id === 'ekiden-monument' ? { x: actual.x + 22, y: actual.y - 28 } : actual;
        const done = props.discoveredIds.includes(spot.id);
        return <g key={spot.id} role="button" tabIndex={0} aria-label={`${done ? spot.name : spot.hint}を地図で開く`} style={{ cursor: 'pointer' }} onClick={() => props.onSelect(spot.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelect(spot.id); } }}>
          {spot.id === 'ekiden-monument' && <Path d={`M ${actual.x} ${actual.y} L ${p.x} ${p.y}`} stroke="#809780" strokeWidth="1" strokeDasharray="2 3" />}
          <Circle cx={p.x} cy={p.y} r={props.selectedId === spot.id ? 20 : 17} fill={done ? '#D5E3D1' : colors.lime} stroke={props.selectedId === spot.id ? colors.ink : 'white'} strokeWidth="3" />
          <SvgText x={p.x} y={p.y + 7} textAnchor="middle" fill={colors.ink} fontWeight="800" fontSize="22">{done ? '✓' : '?'}</SvgText>
        </g>;
      })}
      {position && <G><Circle cx={position.x} cy={position.y} r="14" fill="#527BD033" /><Circle cx={position.x} cy={position.y} r="7" fill="#527BD0" stroke="white" strokeWidth="3" /></G>}
    </Svg>
    <View style={styles.legend}><Text style={styles.legendText}>プレビュー用の略図 · ナビには使えません</Text></View>
    <View style={styles.north}><Text style={styles.northText}>↑ N</Text></View>
  </View>;
}
const styles = StyleSheet.create({ frame: { flex: 1, overflow: 'hidden' }, legend: { position: 'absolute', top: 14, left: 14, backgroundColor: '#FFFFFFEB', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 }, legendText: { fontSize: 10, color: colors.ink }, north: { position: 'absolute', right: 16, top: 14, width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFFFFFEB', alignItems: 'center', justifyContent: 'center' }, northText: { color: colors.ink, fontSize: 12, fontWeight: '700' }, fallback: { flex: 1, justifyContent: 'center', padding: 28, gap: 16, backgroundColor: colors.light }, title: { fontSize: 20, color: colors.ink, fontWeight: '700' }, note: { color: colors.muted, fontSize: 14 } });
