import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors as c, radius, text as t } from './theme';

export type IconName = 'map' | 'book' | 'chevron' | 'pin' | 'close' | 'check';

export function Icon({ name, color = c.text, size = 24 }: { name: IconName; color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {name === 'map' && <><Path d="M 3 6 L 9 3 L 15 6 L 21 3 V 18 L 15 21 L 9 18 L 3 21 Z" /><Path d="M 9 3 V 18 M 15 6 V 21" /></>}
    {name === 'book' && <><Rect x={4} y={3} width={16} height={18} rx={2} /><Path d="M 9 3 V 21" /></>}
    {name === 'chevron' && <Path d="M 9 6 L 15 12 L 9 18" />}
    {name === 'pin' && <><Path d="M 12 22 S 4 14 4 9 A 8 8 0 0 1 20 9 C 20 14 12 22 12 22 Z" /><Circle cx={12} cy={9} r={2.5} /></>}
    {name === 'close' && <Path d="M 6 6 L 18 18 M 18 6 L 6 18" />}
    {name === 'check' && <Path d="M 5 12 L 10 17 L 20 6" />}
  </Svg>;
}

type ButtonProps = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'secondary' | 'text' };

/** DADS-style button: centered label, no decorative icon, 48px minimum height. */
export function Button({ label, onPress, disabled, loading, variant = 'primary' }: ButtonProps) {
  const inactive = disabled || loading;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: inactive, busy: loading }} disabled={inactive} onPress={onPress}
    style={({ pressed }) => [s.base, s[variant], pressed && !inactive && (variant === 'primary' ? s.primaryPressed : s.lightPressed), inactive && s.inactive]}>
    {loading ? <ActivityIndicator color={variant === 'primary' ? c.white : c.key} />
      : <Text style={[t.oln16B100, variant === 'primary' ? s.primaryText : s.lightText, variant === 'text' && s.underline, inactive && s.inactiveText]}>{label}</Text>}
  </Pressable>;
}

const s = StyleSheet.create({
  base: { minHeight: 48, borderRadius: radius.m, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: c.key },
  secondary: { backgroundColor: c.white, borderWidth: 1, borderColor: c.key },
  text: { backgroundColor: 'transparent' },
  primaryPressed: { backgroundColor: c.keyDark },
  lightPressed: { backgroundColor: c.keyBg },
  // Disabled: light gray with dark gray text so the label stays readable (white on gray is not).
  inactive: { backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.divider },
  inactiveText: { color: c.sub },
  primaryText: { color: c.white, textAlign: 'center' },
  lightText: { color: c.key, textAlign: 'center' },
  underline: { textDecorationLine: 'underline' },
});

/** Web only: Noto Sans JP and the DADS focus indicator (black outline + yellow-300 ring). */
export function installWebStyles() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('michi-web-styles')) return;
  const font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap';
  document.head.appendChild(font);
  const style = document.createElement('style');
  style.id = 'michi-web-styles';
  style.textContent = `
    [role="button"]:focus-visible, [role="tab"]:focus-visible, [role="link"]:focus-visible, a:focus-visible, input:focus-visible {
      outline: 4px solid ${c.black} !important; outline-offset: 2px !important; box-shadow: 0 0 0 2px ${c.focus} !important;
    }`;
  document.head.appendChild(style);
}
