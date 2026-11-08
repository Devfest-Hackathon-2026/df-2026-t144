import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';

// Values copied from the Digital Agency Design System tokens
// (@digital-go-jp/design-tokens 2.1.0, MIT). Use these names instead of raw hex.
// Key color: DADS green-800 (5.4:1 on white), so white text on it and green text on white both pass 4.5:1.
export const colors = {
  key: '#197A4B', // green-800
  keyDark: '#115A36', // green-900, pressed state
  keyBg: '#E6F5EC', // green-50, selected / notice background
  keyLine: '#C2E5D1', // green-100
  text: '#1A1A1A', // solid-gray-900, headings
  body: '#333333', // solid-gray-800, body text
  sub: '#666666', // solid-gray-600, secondary text (5.7:1)
  border: '#949494', // solid-gray-420, boundaries of inputs and controls (3:1)
  divider: '#CCCCCC', // solid-gray-200
  surface: '#FFFFFF',
  surfaceAlt: '#F2F2F2', // solid-gray-50
  link: '#00118F', // blue-1000
  error: '#CE0000', // red-900
  errorBg: '#FDEEEE', // red-50
  focus: '#FFD43D', // yellow-300, with black (DADS focus indicator)
  black: '#000000',
  white: '#FFFFFF',
  water: '#C0E4FF', // light-blue-200, map only
  road: '#FFFFFF',
  ground: '#E6E6E6', // solid-gray-100, map only
  user: '#0031D8', // blue-800, current position on the map
};

export const radius = { s: 4, m: 8, l: 16, full: 9999 };

const family = Platform.select({ web: "'Noto Sans JP', sans-serif", default: undefined });
const style = (fontSize: number, bold: boolean, lineHeight: number, spacing = 0.02): TextStyle => ({
  fontFamily: family, fontSize, fontWeight: bold ? '700' : '400', lineHeight: Math.round(fontSize * lineHeight), letterSpacing: fontSize * spacing,
});

// DADS text styles: Std-<size><N|B>-<line height %>. 14px only for notes, as DADS allows.
export const text = {
  std28B150: style(28, true, 1.5, 0.01),
  std24B150: style(24, true, 1.5),
  std20B150: style(20, true, 1.5),
  std18B160: style(18, true, 1.6),
  std16B170: style(16, true, 1.7),
  std16N170: style(16, false, 1.7),
  dns16N130: style(16, false, 1.3, 0),
  oln16B100: style(16, true, 1.25),
  note14N150: style(14, false, 1.5),
  note14B150: style(14, true, 1.5),
};
