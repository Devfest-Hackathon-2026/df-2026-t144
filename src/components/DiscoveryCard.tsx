import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Art from './Art';
import { colors as c, radius, text as t } from '../theme';
import { Icon } from '../ui';
import type { Spot } from '../types';

type Props = { spot: Spot; number: number; discoveredAt: string | null; compact?: boolean };

function Maple({ size = 26, rotate = 0, opacity = 1 }: { size?: number; rotate?: number; opacity?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" style={{ transform: [{ rotate: `${rotate}deg` }], opacity }}>
    <Path d="M 12 1 L 13.6 6.5 L 17.8 3.6 L 16.6 8.6 L 22.5 8 L 18.4 12 L 21 14.6 L 15 14.6 L 12.8 18 L 12.8 23 H 11.2 V 18 L 9 14.6 L 3 14.6 L 5.6 12 L 1.5 8 L 7.4 8.6 L 6.2 3.6 L 10.4 6.5 Z" fill={c.red} />
  </Svg>;
}

/** The collectible "発見カード" on washi paper with maple leaves and a red seal. */
export default function DiscoveryCard({ spot, number, discoveredAt, compact = false }: Props) {
  const date = discoveredAt ? new Date(discoveredAt) : null;
  const dateText = date ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` : '';
  return <View style={[s.card, compact && s.compact]} accessibilityLabel={`発見カード No.${String(number).padStart(3, '0')} ${spot.name}。${spot.tagline}`}>
    <View style={[s.inner, compact && s.innerCompact]}>
      {!compact && <View style={s.maples} pointerEvents="none"><Maple size={30} rotate={-20} /><Maple size={20} rotate={25} opacity={0.8} /></View>}
      <View style={s.number}><Text style={[t.note14B150, { color: c.navy }]}>No.{String(number).padStart(3, '0')}</Text></View>
      <Text style={[compact ? t.display16 : t.display26, s.title]} numberOfLines={2}>{spot.name}</Text>
      {!compact && <Text style={[t.note14N150, s.subtitle]}>— {spot.tagline} —</Text>}
      <View style={[s.art, compact && { height: 84 }]}><Art category={spot.category} height={compact ? 84 : 150} /></View>
      <View style={s.footer}>
        <View style={{ gap: 2 }}>
          <View style={s.meta}><Icon name="pin" color={c.sepia} size={16} /><Text style={[t.note14N150, s.metaText]}>京都・三条</Text></View>
          {!compact && date && <View style={s.meta}><Icon name="calendar" color={c.sepia} size={16} /><Text style={[t.note14N150, s.metaText]}>{dateText}</Text></View>}
        </View>
        <View style={[s.seal, compact && s.sealSmall]}><Text style={[compact ? t.note14B150 : t.display18, { color: c.red }]}>発見</Text></View>
      </View>
    </View>
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: c.paper, borderRadius: radius.m, padding: 8, borderWidth: 2, borderColor: c.paperDeep },
  compact: { padding: 4 },
  innerCompact: { padding: 8 },
  inner: { borderWidth: 1.5, borderColor: '#B89B6E', borderRadius: radius.s, padding: 12, gap: 6 },
  maples: { position: 'absolute', top: -6, right: -4, flexDirection: 'row', alignItems: 'flex-start' },
  number: { alignSelf: 'flex-start', backgroundColor: c.gold, borderRadius: radius.full, paddingHorizontal: 10 },
  title: { color: c.ink, textAlign: 'center' },
  subtitle: { color: c.sepia, textAlign: 'center' },
  art: { height: 150, borderRadius: radius.s, overflow: 'hidden', borderWidth: 1, borderColor: c.paperDeep, marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: c.ink },
  seal: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: c.red, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }], opacity: 0.9 },
  sealSmall: { width: 40, height: 40, borderRadius: 20, borderWidth: 2 },
});
