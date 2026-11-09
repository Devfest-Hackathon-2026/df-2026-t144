// Ink-and-wash style scenes drawn with SVG, one per spot category. No external images.
import React from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

const INK = '#2B2219';
const SEPIA = '#8B6B47';
const SAND = '#CDB894';
const WATER = '#7FA7B0';
const RED = '#C8102E';

function Sky({ id }: { id: string }) {
  return <>
    <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#E9DCC2" /><Stop offset="1" stopColor="#F6EFE2" /></LinearGradient></Defs>
    <Rect width="320" height="180" fill={`url(#${id})`} />
    <Path d="M 0 92 L 40 70 L 78 84 L 120 58 L 168 80 L 210 62 L 262 82 L 320 66 V 110 H 0 Z" fill={SAND} opacity={0.55} />
    <Path d="M 0 104 L 52 88 L 96 100 L 150 84 L 204 98 L 250 88 L 320 100 V 120 H 0 Z" fill={SEPIA} opacity={0.35} />
  </>;
}

function Houses({ side }: { side: 'left' | 'right' }) {
  const flip = side === 'right' ? 'translate(320 0) scale(-1 1)' : undefined;
  return <G transform={flip}>
    {[0, 1, 2, 3].map((i) => {
      const x = 4 + i * 30; const h = 30 - i * 5; const y = 112 - i * 6;
      return <G key={i}>
        <Path d={`M ${x} ${y} L ${x + 15} ${y - 10} L ${x + 32} ${y} Z`} fill={INK} />
        <Rect x={x + 2} y={y} width={28} height={h} fill="#6B513A" />
        {[0, 1, 2, 3].map((k) => <Path key={k} d={`M ${x + 5 + k * 6} ${y + 3} V ${y + h - 3}`} stroke={SAND} strokeWidth={1.2} />)}
      </G>;
    })}
  </G>;
}

function Canal() {
  return <>
    <Sky id="sky-canal" />
    <Circle cx="262" cy="34" r="13" fill={RED} opacity={0.85} />
    <Houses side="left" /><Houses side="right" />
    <Path d="M 120 180 L 152 112 L 168 112 L 200 180 Z" fill={WATER} />
    <Path d="M 116 180 L 150 112 M 204 180 L 170 112" stroke={INK} strokeWidth={2} />
    {[128, 144, 160, 172].map((y) => <Path key={y} d={`M ${160 - (y - 100) * 0.3} ${y} H ${160 + (y - 100) * 0.3}`} stroke="#F6EFE2" strokeWidth={1} opacity={0.8} />)}
    <Path d="M 148 150 L 172 150 L 168 156 L 152 156 Z" fill={INK} />
    <Path d="M 160 150 V 138" stroke={INK} strokeWidth={1.5} />
  </>;
}

function Monument() {
  return <>
    <Sky id="sky-stone" />
    <Path d="M 0 30 C 40 20 70 34 96 26 M 10 44 C 40 36 60 46 84 40" stroke={INK} strokeWidth={3} fill="none" opacity={0.7} />
    {[[30, 24], [62, 32], [84, 22], [48, 44]].map(([x, y]) => <Path key={`${x}-${y}`} d={`M ${x} ${y} l 4 -6 l 4 6 l -4 6 z`} fill={RED} opacity={0.9} />)}
    <Houses side="right" />
    <Rect x="0" y="150" width="320" height="30" fill={SAND} opacity={0.6} />
    <Path d="M 136 54 L 184 54 L 186 160 L 134 160 Z" fill="#B7A48A" stroke={INK} strokeWidth={2.5} />
    <Path d="M 132 160 H 188 V 168 H 132 Z" fill={SEPIA} />
    {[70, 90, 110, 130].map((y) => <Path key={y} d={`M 160 ${y} h 0.1 M 154 ${y + 6} L 166 ${y + 4}`} stroke={INK} strokeWidth={3.2} strokeLinecap="round" />)}
  </>;
}

function Bridge() {
  return <>
    <Sky id="sky-bridge" />
    <Circle cx="64" cy="36" r="12" fill={RED} opacity={0.85} />
    <Rect x="0" y="126" width="320" height="54" fill={WATER} />
    {[138, 150, 164].map((y) => <Path key={y} d={`M 20 ${y} H 300`} stroke="#F6EFE2" strokeWidth={1} opacity={0.6} strokeDasharray="18 10" />)}
    <Path d="M 10 118 Q 160 74 310 118" stroke={INK} strokeWidth={9} fill="none" />
    <Path d="M 10 100 Q 160 56 310 100" stroke={INK} strokeWidth={4} fill="none" />
    {[40, 90, 160, 230, 280].map((x) => {
      const y = 100 - (1 - ((x - 160) / 150) ** 2) * 44 * 0.62;
      return <G key={x}>
        <Path d={`M ${x} ${y} V ${y + 20}`} stroke={INK} strokeWidth={4} />
        <Path d={`M ${x - 5} ${y - 2} Q ${x} ${y - 14} ${x + 5} ${y - 2} Z`} fill={SEPIA} stroke={INK} strokeWidth={1.5} />
      </G>;
    })}
    {[60, 120, 200, 260].map((x) => <Path key={x} d={`M ${x} ${118 - (1 - ((x - 160) / 150) ** 2) * 27} V 180`} stroke={INK} strokeWidth={5} />)}
  </>;
}

function Road() {
  return <>
    <Sky id="sky-road" />
    <Circle cx="160" cy="70" r="16" fill={RED} opacity={0.85} />
    <Path d="M 100 180 L 156 96 L 164 96 L 220 180 Z" fill={SAND} />
    <Path d="M 160 180 V 170 M 160 158 V 146 M 160 136 V 126 M 160 118 V 110 M 160 104 V 100" stroke="#F6EFE2" strokeWidth={2} />
    {[[70, 120, 0.8], [250, 120, 0.8], [40, 150, 1.1], [282, 150, 1.1]].map(([x, y, k]) => <G key={`${x}`} transform={`translate(${x} ${y}) scale(${k})`}>
      <Path d="M -10 0 L 0 -26 L 10 0 Z" fill={INK} /><Path d="M 0 0 V 8" stroke={INK} strokeWidth={3} />
    </G>)}
    <Path d="M 108 140 L 122 140 L 122 176 L 108 176 Z" fill="#B7A48A" stroke={INK} strokeWidth={2} />
    <Path d="M 188 120 L 210 112 L 206 124 Z" fill={RED} /><Path d="M 188 120 V 150" stroke={INK} strokeWidth={2} />
  </>;
}

// A bronze figure kneeling on a stone pedestal, bowing toward a distant roof line.
function Statue() {
  return <>
    <Sky id="sky-statue" />
    <Circle cx="262" cy="40" r="12" fill={RED} opacity={0.85} />
    <Path d="M 196 92 L 232 78 L 268 92 Z M 204 92 H 260 V 102 H 204 Z" fill={INK} opacity={0.35} />
    <Rect x="0" y="150" width="320" height="30" fill={SAND} opacity={0.6} />
    <Path d="M 70 112 H 170 V 160 H 70 Z" fill="#B7A48A" stroke={INK} strokeWidth={2.5} />
    <Path d="M 62 160 H 178 V 168 H 62 Z" fill={SEPIA} />
    <Path d="M 86 112 C 86 92 98 80 112 78 C 124 76 134 82 142 92 L 150 104 L 140 108 L 130 98 C 126 104 124 110 124 112 Z" fill="#5E6B5B" stroke={INK} strokeWidth={2} />
    <Circle cx="150" cy="86" r="9" fill="#5E6B5B" stroke={INK} strokeWidth={2} />
    <Path d="M 98 112 L 92 104 M 118 112 L 120 102" stroke={INK} strokeWidth={2} />
  </>;
}

export default function Art({ category, height = 180 }: { category: string; height?: number }) {
  return <Svg width="100%" height={height} viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
    {category === '水路' ? <Canal /> : category === '建築' ? <Bridge /> : category === '文化' ? <Road /> : category === '像' ? <Statue /> : <Monument />}
  </Svg>;
}
