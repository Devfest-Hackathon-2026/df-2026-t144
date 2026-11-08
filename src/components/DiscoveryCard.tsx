import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Art from './Art';
import { colors as c, radius, text as t } from '../theme';
import { Icon } from '../ui';
import type { Spot } from '../types';

type Props = { spot: Spot; number: number; subtitle: string; discoveredAt: string | null; compact?: boolean };

/** The collectible "発見カード" on washi paper with a red seal. */
export default function DiscoveryCard({ spot, number, subtitle, discoveredAt, compact = false }: Props) {
  const date = discoveredAt ? new Date(discoveredAt) : null;
  const dateText = date ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}` : '';
  return <View style={[s.card, compact && s.compact]} accessibilityLabel={`発見カード No.${String(number).padStart(3, '0')} ${spot.name}`}>
    <View style={s.inner}>
      <Text style={[t.note14B150, s.number]}>No.{String(number).padStart(3, '0')}</Text>
      <Text style={[compact ? t.display18 : t.display26, s.title]} numberOfLines={2}>{spot.name}</Text>
      {!compact && <Text style={[t.note14N150, s.subtitle]}>— {subtitle} —</Text>}
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
  inner: { borderWidth: 1.5, borderColor: '#B89B6E', borderRadius: radius.s, padding: 12, gap: 6 },
  number: { color: c.sepia },
  title: { color: c.ink, textAlign: 'center' },
  subtitle: { color: c.sepia, textAlign: 'center' },
  art: { height: 150, borderRadius: radius.s, overflow: 'hidden', borderWidth: 1, borderColor: c.paperDeep, marginTop: 4 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { color: c.ink },
  seal: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: c.red, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }], opacity: 0.9 },
  sealSmall: { width: 40, height: 40, borderRadius: 20, borderWidth: 2 },
});
