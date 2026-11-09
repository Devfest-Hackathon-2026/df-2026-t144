// One definition of the map token, drawn three ways: react-native-svg (native
// map, web sketch map, lists) and an SVG string for Google Maps Advanced Markers.
// Undiscovered: red coin with "?". Discovered: gold coin with the category
// glyph and a red check badge. Coordinates are in a 44 x 48 box; the tip of
// the pointer (22, 46) is the spot's location.
import { colors as c } from './theme';

export type PinPart =
  | { kind: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
  | { kind: 'path'; d: string; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number };

export const PIN_BOX = { width: 44, height: 48, tipX: 22, tipY: 46 };

// Line glyphs per catalog category, already placed inside the coin.
const GLYPHS: Record<string, string> = {
  水路: 'M13.5 17.5 q2 -2.6 4 0 t4 0 t4 0 t4 0 M13.5 22.5 q2 -2.6 4 0 t4 0 t4 0 t4 0 M16.5 27.5 q2 -2.6 4 0 t4 0 t3 0',
  歴史: 'M18.5 29.5 V16 a3.5 3.5 0 0 1 7 0 V29.5 M15.5 29.5 H28.5 M22 18 V25',
  建築: 'M12.5 25.5 Q22 15 31.5 25.5 M15.5 22.6 V29.5 M22 20 V29.5 M28.5 22.6 V29.5 M12.5 29.5 H31.5',
  文化: 'M17 31 V13 M17 14 H29 L26 18 L29 22 H17',
};
const QUESTION = 'M17.6 18.2 C17.6 12.8 26.4 12.8 26.4 18.2 C26.4 21.6 22 21.9 22 25.2 M22 29.6 L22 29.7';

export function pinParts(done: boolean, category = '', selected = false): PinPart[] {
  const body = done ? c.gold : c.red;
  const parts: PinPart[] = [
    { kind: 'circle', cx: 22, cy: 25.5, r: 17, fill: '#000000', opacity: 0.35 },
    { kind: 'path', d: 'M15.5 34 L22 46 L28.5 34 Z', fill: body, stroke: '#FFFFFF', strokeWidth: 2 },
    { kind: 'circle', cx: 22, cy: 22, r: 18, fill: '#FFFFFF' },
    { kind: 'circle', cx: 22, cy: 22, r: 14.5, fill: body },
    { kind: 'path', d: 'M11.2 18.5 A11.5 11.5 0 0 1 18.5 11.2', stroke: '#FFFFFF', strokeWidth: 2.5, opacity: 0.4 },
  ];
  if (selected) parts.unshift({ kind: 'circle', cx: 22, cy: 22, r: 21, stroke: '#FFFFFF', strokeWidth: 2, opacity: 0.7 });
  if (!done) {
    parts.push({ kind: 'path', d: QUESTION, stroke: '#FFFFFF', strokeWidth: 3.4 });
  } else {
    parts.push({ kind: 'path', d: GLYPHS[category] ?? GLYPHS['歴史'], stroke: c.navy, strokeWidth: 2.2 });
    parts.push({ kind: 'circle', cx: 34.5, cy: 9.5, r: 6.5, fill: c.red, stroke: '#FFFFFF', strokeWidth: 2 });
    parts.push({ kind: 'path', d: 'M31.5 9.6 L33.6 11.7 L37.4 7.6', stroke: '#FFFFFF', strokeWidth: 2 });
  }
  return parts;
}

/** The same token as an SVG string, for DOM markers (Google Maps on the web). */
export function pinSvgMarkup(done: boolean, category = '', selected = false, scale = 1): string {
  const body = pinParts(done, category, selected).map((part) => {
    const paint = `fill="${part.fill ?? 'none'}"${part.stroke ? ` stroke="${part.stroke}" stroke-width="${part.strokeWidth ?? 1}" stroke-linecap="round" stroke-linejoin="round"` : ''}${part.opacity !== undefined ? ` opacity="${part.opacity}"` : ''}`;
    return part.kind === 'circle' ? `<circle cx="${part.cx}" cy="${part.cy}" r="${part.r}" ${paint}/>` : `<path d="${part.d}" ${paint}/>`;
  }).join('');
  return `<svg width="${PIN_BOX.width * scale}" height="${PIN_BOX.height * scale}" viewBox="0 0 ${PIN_BOX.width} ${PIN_BOX.height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}
