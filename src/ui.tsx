import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors as c, radius, text as t } from './theme';

export type IconName = 'map' | 'book' | 'chevron' | 'pin' | 'close' | 'check' | 'share' | 'bookmark' | 'sparkle' | 'calendar' | 'back' | 'user' | 'walk' | 'camera';

export function Icon({ name, color = c.white, size = 24 }: { name: IconName; color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {name === 'map' && <><Path d="M 3 6 L 9 3 L 15 6 L 21 3 V 18 L 15 21 L 9 18 L 3 21 Z" /><Path d="M 9 3 V 18 M 15 6 V 21" /></>}
    {name === 'book' && <><Rect x={4} y={3} width={16} height={18} rx={2} /><Path d="M 9 3 V 21" /></>}
    {name === 'chevron' && <Path d="M 9 6 L 15 12 L 9 18" />}
    {name === 'back' && <Path d="M 15 6 L 9 12 L 15 18" />}
    {name === 'pin' && <><Path d="M 12 22 S 4 14 4 9 A 8 8 0 0 1 20 9 C 20 14 12 22 12 22 Z" /><Circle cx={12} cy={9} r={2.5} /></>}
    {name === 'close' && <Path d="M 6 6 L 18 18 M 18 6 L 6 18" />}
    {name === 'check' && <Path d="M 5 12 L 10 17 L 20 6" />}
    {name === 'share' && <><Circle cx={18} cy={5} r={2.5} /><Circle cx={6} cy={12} r={2.5} /><Circle cx={18} cy={19} r={2.5} /><Path d="M 8.2 10.8 L 15.8 6.2 M 8.2 13.2 L 15.8 17.8" /></>}
    {name === 'bookmark' && <Path d="M 6 3 H 18 V 21 L 12 16 L 6 21 Z" />}
    {name === 'sparkle' && <Path d="M 12 2 L 14 10 L 22 12 L 14 14 L 12 22 L 10 14 L 2 12 L 10 10 Z" fill={color} />}
    {name === 'calendar' && <><Rect x={3} y={5} width={18} height={16} rx={2} /><Path d="M 3 10 H 21 M 8 3 V 7 M 16 3 V 7" /></>}
    {name === 'camera' && <><Path d="M 3 8 H 7 L 9 5 H 15 L 17 8 H 21 V 19 H 3 Z" /><Circle cx={12} cy={13} r={3.5} /></>}
    {name === 'user' &&<><Circle cx={12} cy={8} r={4} /><Path d="M 4 21 C 4 16 8 14 12 14 C 16 14 20 16 20 21" /></>}
    {name === 'walk' && <><Circle cx={13} cy={4} r={2} /><Path d="M 9 21 L 11 15 L 14 17 V 21 M 11 15 L 12 9 L 16 12 L 19 12 M 12 9 L 8 11 L 6 14" /></>}
  </Svg>;
}

/** Red speech-bubble pin with "?" (undiscovered) or a check (discovered). */
export function QPin({ done = false, size = 44 }: { done?: boolean; size?: number }) {
  return <Svg width={size} height={size * 1.15} viewBox="0 0 40 46">
    <Path d="M 4 4 H 36 V 32 H 24 L 20 42 L 16 32 H 4 Z" fill={done ? c.paper : c.red} stroke={c.white} strokeWidth={2.5} strokeLinejoin="round" />
    {done ? <Path d="M 12 18 L 18 24 L 29 12" stroke={c.red} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      : <Path d="M 15 13 C 15 8 25 8 25 13 C 25 17 20 17 20 21 M 20 25.5 L 20 26" stroke={c.white} strokeWidth={4} fill="none" strokeLinecap="round" />}
  </Svg>;
}

/** A slanted label strip, the main graphic device of the key visual. */
export function Slant({ children, color = c.white, style, skew = -12 }: { children: React.ReactNode; color?: string; style?: StyleProp<ViewStyle>; skew?: number }) {
  return <View style={[{ backgroundColor: color, transform: [{ skewX: `${skew}deg` }], paddingHorizontal: 14, paddingVertical: 4, alignSelf: 'flex-start' }, style]}>
    <View style={{ transform: [{ skewX: `${-skew}deg` }] }}>{children}</View>
  </View>;
}

type ButtonProps = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'light' | 'ghost'; icon?: IconName };

/** Slanted button. Label stays upright and centered; 52px tall. */
export function Button({ label, onPress, disabled, loading, variant = 'primary', icon }: ButtonProps) {
  const inactive = disabled || loading;
  const fg = inactive ? c.muted : variant === 'light' ? c.navy : c.white;
  const pressedStyle = { primary: s.primaryPressed, light: s.lightPressed, ghost: s.ghostPressed }[variant];
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: inactive, busy: loading }} aria-disabled={inactive} aria-busy={loading} disabled={inactive} onPress={onPress}
    style={({ pressed }) => [s.base, s[variant], pressed && !inactive && pressedStyle, inactive && s.inactive]}>
    <View style={s.unskew}>
      {loading ? <ActivityIndicator color={fg} /> : <>{icon && <Icon name={icon} color={fg} size={20} />}<Text style={[t.oln16B100, { color: fg }]}>{label}</Text></>}
    </View>
  </Pressable>;
}

const s = StyleSheet.create({
  base: { minHeight: 52, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', transform: [{ skewX: '-10deg' }], borderRadius: 2 },
  unskew: { transform: [{ skewX: '10deg' }], flexDirection: 'row', alignItems: 'center', gap: 8 },
  primary: { backgroundColor: c.red },
  primaryPressed: { backgroundColor: c.redDark },
  light: { backgroundColor: c.white },
  lightPressed: { backgroundColor: c.paper },
  ghost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: c.mist },
  ghostPressed: { backgroundColor: c.navyRaised },
  inactive: { backgroundColor: c.navyRaised, borderWidth: 1, borderColor: c.line },
});

export function Tag({ label, tone = 'red' }: { label: string; tone?: 'red' | 'line' | 'paper' }) {
  return <View style={[tag.base, tone === 'line' && tag.line, tone === 'paper' && tag.paper]}>
    <Text style={[t.note14B150, { color: tone === 'paper' ? c.sepia : c.white }]}>{label}</Text>
  </View>;
}
const tag = StyleSheet.create({
  base: { backgroundColor: c.red, paddingHorizontal: 8, borderRadius: radius.s, alignSelf: 'flex-start' },
  line: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.line },
  paper: { backgroundColor: c.paperDeep },
});

/** Angular red brush shards used as background decoration. Purely visual. */
export function Shards({ width = 400, height = 160, opacity = 1 }: { width?: number; height?: number; opacity?: number }) {
  return <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMaxYMin slice" style={{ position: 'absolute', top: 0, left: 0, right: 0, opacity }} pointerEvents="none">
    <Path d={`M ${width * 0.55} 0 L ${width} 0 L ${width} ${height * 0.35} L ${width * 0.7} ${height * 0.12} Z`} fill={c.red} />
    <Path d={`M ${width * 0.78} ${height * 0.42} L ${width} ${height * 0.3} L ${width} ${height * 0.5} Z`} fill={c.red} opacity={0.85} />
    <Path d={`M ${width * 0.62} ${height * 0.05} L ${width * 0.9} ${height * 0.02} L ${width * 0.66} ${height * 0.1} Z`} fill={c.white} opacity={0.5} />
    <Path d={`M 0 ${height * 0.86} L ${width * 0.18} ${height * 0.78} L ${width * 0.05} ${height * 0.95} Z`} fill={c.red} opacity={0.7} />
  </Svg>;
}

/** Kyoto skyline silhouette (pagoda, roofs, pines) for headers. Purely visual. */
export function Skyline({ height = 90, color = c.navyRaised }: { height?: number; color?: string }) {
  return <Svg width="100%" height={height} viewBox="0 0 400 90" preserveAspectRatio="xMaxYMax slice" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="none">
    <Path d="M 0 90 V 70 L 18 62 L 36 70 V 64 L 58 56 L 80 64 V 72 L 104 66 L 126 72 V 90 Z" fill={color} />
    <Path d="M 120 90 V 76 Q 140 60 160 74 Q 172 58 190 72 V 90 Z" fill={color} opacity={0.8} />
    <G transform="translate(318 0)">
      <Path d="M 22 4 V 14" stroke={color} strokeWidth={2} />
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 14 + i * 14; const w = 18 + i * 5;
        return <G key={i}><Path d={`M ${22 - w} ${y + 6} Q ${22} ${y - 4} ${22 + w} ${y + 6} Z`} fill={color} /><Rect x={22 - w * 0.55} y={y + 6} width={w * 1.1} height={8} fill={color} /></G>;
      })}
      <Rect x={2} y={84} width={40} height={6} fill={color} />
    </G>
    <Path d="M 196 90 V 74 L 226 64 L 256 74 V 68 L 290 58 L 316 68 V 90 Z" fill={color} opacity={0.9} />
    <Path d="M 372 90 V 66 Q 384 52 396 66 V 90 Z M 380 90 V 60 Q 392 46 400 58 V 90 Z" fill={color} opacity={0.7} />
  </Svg>;
}

/** Radiating rays and sparkles behind the "発見！" headline. Purely visual. */
export function Burst({ size = 220 }: { size?: number }) {
  const rays = Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2; const b = a + Math.PI / 18;
    return `M 100 100 L ${100 + Math.cos(a) * 100} ${100 + Math.sin(a) * 100} L ${100 + Math.cos(b) * 100} ${100 + Math.sin(b) * 100} Z`;
  });
  return <Svg width={size} height={size} viewBox="0 0 200 200" pointerEvents="none">
    {rays.map((d, i) => <Path key={i} d={d} fill={i % 2 ? c.white : c.red} opacity={i % 2 ? 0.12 : 0.35} />)}
    {[[38, 46, 9], [168, 64, 7], [150, 168, 6]].map(([x, y, r]) => <Path key={`${x}`} d={`M ${x} ${y - r * 2} L ${x + r * 0.5} ${y - r * 0.5} L ${x + r * 2} ${y} L ${x + r * 0.5} ${y + r * 0.5} L ${x} ${y + r * 2} L ${x - r * 0.5} ${y + r * 0.5} L ${x - r * 2} ${y} L ${x - r * 0.5} ${y - r * 0.5} Z`} fill={c.white} />)}
  </Svg>;
}

/** Small five-story pagoda used as the destination marker. */
export function Pagoda({ size = 34 }: { size?: number }) {
  return <Svg width={size} height={size * 1.25} viewBox="0 0 32 40">
    <Path d="M 16 1 V 6" stroke={c.white} strokeWidth={1.5} />
    {[0, 1, 2, 3].map((i) => { const y = 6 + i * 7; const w = 8 + i * 2.5; return <Path key={i} d={`M ${16 - w} ${y + 4} Q 16 ${y - 2} ${16 + w} ${y + 4} L ${16 + w * 0.6} ${y + 7} H ${16 - w * 0.6} Z`} fill={c.navy} stroke={c.white} strokeWidth={1.2} />; })}
    <Rect x={9} y={34} width={14} height={4} fill={c.red} stroke={c.white} strokeWidth={1.2} />
  </Svg>;
}

/** Web only: fonts and the DADS focus indicator (black outline + yellow ring). */
export function installWebStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('michi-web-styles')) return;
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Noto+Sans+JP:wght@400;700&display=swap';
  document.head.appendChild(font);
  const style = document.createElement('style');
  style.id = 'michi-web-styles';
  style.textContent = `
    body { background: ${c.navy}; }
    [role="button"]:focus-visible, [role="tab"]:focus-visible, [role="link"]:focus-visible, [role="radio"]:focus-visible, [role="checkbox"]:focus-visible, a:focus-visible, input:focus-visible {
      outline: 4px solid ${c.black} !important; outline-offset: 2px !important; box-shadow: 0 0 0 2px ${c.focus} !important;
    }`;
  document.head.appendChild(style);
}
