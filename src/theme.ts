import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';

// Art direction: night navy + vermilion red + washi paper (see the key visual).
// Readability rules kept from the Digital Agency Design System: body text 16px,
// notes 14px minimum, text contrast 4.5:1 or more against its background.
export const colors = {
  navy: '#0B1631', // app background
  navyCard: '#14223F', // cards on navy
  navyRaised: '#1D2D52', // inputs, pressed rows
  line: '#33456E', // borders on navy (3:1 vs navy)
  red: '#D7192F', // key color; white text on it is 5.2:1
  redDark: '#A30F22',
  redText: '#FF6B7C', // red used as text on navy (5.4:1)
  white: '#FFFFFF',
  mist: '#C9D1E3', // secondary text on navy
  muted: '#9AA6C4', // notes on navy (6:1)
  paper: '#F3EADA', // discovery cards
  paperDeep: '#E2D2B4',
  ink: '#2B2219', // text on paper
  sepia: '#6E5233', // secondary text on paper (5.9:1)
  link: '#A9C2FF',
  focus: '#FFD43D', // DADS focus ring color, with black
  black: '#000000',
  user: '#3D8BFF', // current position
  mapRoad: '#2A3A60',
  mapGround: '#101D3B',
  mapWater: '#1E3E6E',
};

export const radius = { s: 4, m: 8, l: 16, full: 9999 };

const bodyFamily = Platform.select({ web: "'Noto Sans JP', sans-serif", default: undefined });
// Native loads DelaGothicOne_400Regular with expo-font (App.tsx); web uses Google Fonts.
export const displayFamily = Platform.select({ web: "'Dela Gothic One', 'Noto Sans JP', sans-serif", default: 'DelaGothicOne_400Regular' });

const body = (fontSize: number, bold: boolean, lineHeight: number): TextStyle => ({
  fontFamily: bodyFamily, fontSize, fontWeight: bold ? '700' : '400', lineHeight: Math.round(fontSize * lineHeight), letterSpacing: fontSize * 0.02,
});
const display = (fontSize: number, lineHeight = 1.3): TextStyle => ({
  fontFamily: displayFamily, fontSize, lineHeight: Math.round(fontSize * lineHeight), letterSpacing: fontSize * 0.02,
});

export const text = {
  display40: display(40, 1.15),
  display32: display(32),
  display26: display(26),
  display22: display(22),
  display18: display(18, 1.4),
  std20B150: body(20, true, 1.5),
  std18B160: body(18, true, 1.6),
  std16B170: body(16, true, 1.7),
  std16N170: body(16, false, 1.7),
  oln16B100: body(16, true, 1.25),
  note14N150: body(14, false, 1.5),
  note14B150: body(14, true, 1.5),
};
