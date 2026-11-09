import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { pinParts, PIN_BOX } from './pins';
import { colors as c, displayFamily, radius, text as t } from './theme';

const nativeDriver = Platform.OS !== 'web';

export type IconName = 'map' | 'book' | 'chevron' | 'pin' | 'close' | 'check' | 'share' | 'bookmark' | 'calendar' | 'back' | 'user' | 'walk' | 'camera';

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
    {name === 'calendar' && <><Rect x={3} y={5} width={18} height={16} rx={2} /><Path d="M 3 10 H 21 M 8 3 V 7 M 16 3 V 7" /></>}
    {name === 'camera' && <><Path d="M 3 8 H 7 L 9 5 H 15 L 17 8 H 21 V 19 H 3 Z" /><Circle cx={12} cy={13} r={3.5} /></>}
    {name === 'user' && <><Circle cx={12} cy={8} r={4} /><Path d="M 4 21 C 4 16 8 14 12 14 C 16 14 20 16 20 21" /></>}
    {name === 'walk' && <><Circle cx={13} cy={4} r={2} /><Path d="M 9 21 L 11 15 L 14 17 V 21 M 11 15 L 12 9 L 16 12 L 19 12 M 12 9 L 8 11 L 6 14" /></>}
  </Svg>;
}

/** The map token's shapes (see src/pins.ts), for use inside any <Svg> or <G>. */
export function PinShapes({ done = false, category = '', selected = false }: { done?: boolean; category?: string; selected?: boolean }) {
  return <>{pinParts(done, category, selected).map((part, index) => {
    const paint = { fill: part.fill ?? 'none', stroke: part.stroke, strokeWidth: part.strokeWidth, opacity: part.opacity, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    return part.kind === 'circle' ? <Circle key={index} cx={part.cx} cy={part.cy} r={part.r} {...paint} /> : <Path key={index} d={part.d} {...paint} />;
  })}</>;
}

/** Map token: red coin with "?" (undiscovered) or a gold coin with the category glyph (discovered). size is the width. */
export function QPin({ done = false, category = '', selected = false, size = 44 }: { done?: boolean; category?: string; selected?: boolean; size?: number }) {
  return <Svg width={size} height={size * PIN_BOX.height / PIN_BOX.width} viewBox={`0 0 ${PIN_BOX.width} ${PIN_BOX.height}`}>
    <PinShapes done={done} category={category} selected={selected} />
  </Svg>;
}

/** The token's coin alone: "?" by default, or a short label such as a step number. */
export function QCoin({ size = 32, label, tone = 'red' }: { size?: number; label?: string; tone?: 'red' | 'gold' }) {
  const body = tone === 'gold' ? c.gold : c.red;
  if (label === undefined) return <Svg width={size} height={size} viewBox="3.5 3.5 37 37">
    <Circle cx={22} cy={22} r={18} fill={c.white} /><Circle cx={22} cy={22} r={14.5} fill={body} />
    <Path d="M 11.2 18.5 A 11.5 11.5 0 0 1 18.5 11.2" stroke={c.white} strokeWidth={2.5} opacity={0.4} fill="none" strokeLinecap="round" />
    <Path d="M 17.6 18.2 C 17.6 12.8 26.4 12.8 26.4 18.2 C 26.4 21.6 22 21.9 22 25.2 M 22 29.6 L 22 29.7" stroke={tone === 'gold' ? c.navy : c.white} strokeWidth={3.4} fill="none" strokeLinecap="round" />
  </Svg>;
  return <View style={[coin.base, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, Math.round(size * 0.09)), backgroundColor: body }]}>
    <Text style={{ fontFamily: displayFamily, fontSize: Math.max(14, Math.round(size * 0.48)), lineHeight: Math.round(size * 0.62), color: tone === 'gold' ? c.navy : c.white }}>{label}</Text>
  </View>;
}
const coin = StyleSheet.create({ base: { borderColor: c.white, alignItems: 'center', justifyContent: 'center' } });

/** Section heading inside a screen. Display type is kept for the logo, page titles and reward moments. */
export function SectionTitle({ title, count, page = false }: { title: string; count?: string; page?: boolean }) {
  return <View style={heading.row}>
    <Text accessibilityRole="header" style={[page ? t.display26 : t.std20B150, { color: c.white, flexShrink: 1 }]}>{title}</Text>
    {count !== undefined && <View style={heading.count}><Text style={[t.note14B150, { color: c.mist }]}>{count}</Text></View>}
  </View>;
}
const heading = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  count: { backgroundColor: c.navyRaised, borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 2 },
});

type ButtonProps = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'light' | 'ghost'; icon?: IconName };

/** Chunky game button: a darker bottom edge that sinks when pressed. 52px tall in both states. */
export function Button({ label, onPress, disabled, loading, variant = 'primary', icon }: ButtonProps) {
  const inactive = disabled || loading;
  const fg = inactive ? c.muted : variant === 'light' ? c.navy : c.white;
  const pressedStyle = { primary: s.primaryPressed, light: s.lightPressed, ghost: s.ghostPressed }[variant];
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: inactive, busy: loading }} aria-disabled={inactive} aria-busy={loading} disabled={inactive} onPress={onPress}
    style={({ pressed }) => [s.base, s[variant], inactive && s.inactive, pressed && !inactive && [s.sunk, pressedStyle]]}>
    {loading ? <ActivityIndicator color={fg} /> : <>{icon && <Icon name={icon} color={fg} size={20} />}<Text style={[t.oln16B100, { color: fg }]}>{label}</Text></>}
  </Pressable>;
}

const s = StyleSheet.create({
  base: { minHeight: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.m, borderBottomWidth: 4 },
  primary: { backgroundColor: c.red, borderBottomColor: c.redDark },
  primaryPressed: { backgroundColor: c.redDark },
  light: { backgroundColor: c.white, borderBottomColor: c.mist },
  lightPressed: { backgroundColor: c.paper },
  ghost: { backgroundColor: 'transparent', borderWidth: 2, borderBottomWidth: 4, borderColor: c.line },
  ghostPressed: { backgroundColor: c.navyRaised },
  inactive: { backgroundColor: c.navyRaised, borderColor: c.line, borderBottomColor: c.line },
  sunk: { minHeight: 49, marginTop: 3, borderBottomWidth: 1 },
});

export function Tag({ label, tone = 'red' }: { label: string; tone?: 'red' | 'line' | 'paper' | 'gold' }) {
  return <View style={[tag.base, tone === 'line' && tag.line, tone === 'paper' && tag.paper, tone === 'gold' && tag.gold]}>
    <Text style={[t.note14B150, { color: tone === 'paper' ? c.sepia : tone === 'gold' ? c.navy : c.white }]}>{label}</Text>
  </View>;
}
const tag = StyleSheet.create({
  base: { backgroundColor: c.red, paddingHorizontal: 10, borderRadius: radius.full, alignSelf: 'flex-start' },
  line: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.line },
  paper: { backgroundColor: c.paperDeep },
  gold: { backgroundColor: c.gold },
});

// Fixed confetti layout (no randomness, so every discovery looks the same in the demo video).
const CONFETTI_COLORS = [c.red, c.gold, c.white, c.link];
const CONFETTI = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.17;
  const reach = 92 + ((i * 37) % 64);
  return { x: Math.cos(angle) * reach * 1.45, y: Math.sin(angle) * reach * 0.62, color: CONFETTI_COLORS[i % 4], round: i % 3 === 0, size: 8 + (i % 3) * 2, rotate: `${(i * 47) % 180}deg` };
});

/** Reward moment: children pop in with a spring while colored confetti bursts behind them. Static when reduced motion is on. */
export function Celebrate({ children }: { children: React.ReactNode }) {
  const burst = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduce) => {
      if (!alive) return;
      if (reduce) { burst.setValue(1); pop.setValue(1); return; }
      Animated.parallel([
        Animated.timing(burst, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }),
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: nativeDriver }),
      ]).start();
    });
    return () => { alive = false; };
  }, [burst, pop]);
  return <View style={celebrate.wrap}>
    <View pointerEvents="none" style={celebrate.layer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {CONFETTI.map((piece, index) => <Animated.View key={index} style={[celebrate.piece, {
        width: piece.size, height: piece.round ? piece.size : piece.size * 0.5, borderRadius: piece.round ? piece.size / 2 : 2, backgroundColor: piece.color,
        opacity: burst.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, piece.x] }) },
          { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, piece.y] }) },
          { rotate: piece.rotate },
          { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.3, 1.25, 1] }) },
        ],
      }]} />)}
    </View>
    <Animated.View style={{ alignItems: 'center', gap: 6, opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }), transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }] }}>
      {children}
    </Animated.View>
  </View>;
}
const celebrate = StyleSheet.create({
  // Clipped so confetti never lands on the text around the moment.
  wrap: { alignSelf: 'stretch', minHeight: 150, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, overflow: 'hidden' },
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  piece: { position: 'absolute' },
});

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
