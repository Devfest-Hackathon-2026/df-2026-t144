// One base URL for the MICHI server (routes + Gemini).
// - empty: not connected; the app runs on fixed demo data only
// - "same-origin": the web build served by the same Cloud Run service
// - otherwise: e.g. http://192.168.0.10:8787 from a phone on the same Wi-Fi
const raw = (process.env.EXPO_PUBLIC_API_URL || process.env.EXPO_PUBLIC_ROUTES_URL || '').trim();
export const apiConfigured = raw !== '';
export const apiBaseUrl = raw === 'same-origin' ? '' : raw.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, readonly code: string) { super(message); }
}

export async function postJson<T>(path: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  if (!apiConfigured) throw new ApiError('サーバーが未接続です。', 'NOT_CONNECTED');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error?.message || '通信に失敗しました。', data?.error?.code || `HTTP_${response.status}`);
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new ApiError('応答に時間がかかっています。もう一度お試しください。', 'TIMEOUT');
    throw new ApiError('サーバーに接続できませんでした。', 'NETWORK');
  } finally { clearTimeout(timeout); }
}

let configRequest: Promise<{ mapsApiKey: string | null }> | null = null;
/** Public runtime settings from the server, e.g. the browser Maps key (restricted by HTTP referrer). */
export function fetchConfig(): Promise<{ mapsApiKey: string | null }> {
  if (!apiConfigured) return Promise.resolve({ mapsApiKey: null });
  configRequest ??= fetch(`${apiBaseUrl}/v1/config`).then((response) => response.json())
    .then((data) => ({ mapsApiKey: typeof data?.mapsApiKey === 'string' && data.mapsApiKey ? data.mapsApiKey : null }))
    .catch(() => ({ mapsApiKey: null }));
  return configRequest;
}

export type RecognitionResult = { matched: boolean; matchedWord: string | null; readText: string | null; scene: string | null };
/** Sends one photo (base64 JPEG) for text reading. The server forwards it to Gemini and keeps nothing. */
export const fetchRecognition = (spotId: string, image: string, mimeType = 'image/jpeg') =>
  postJson<RecognitionResult>('/v1/recognize', { spotId, image, mimeType }, 30_000);

export type InterestResult = { topicIds: string[]; reply: string | null; source: 'gemini' | 'keywords' };
export type TeaserResult = { text: string | null; usedFactIds: string[]; source: 'gemini' | 'fixed' };

export const fetchInterests = (text: string) => postJson<InterestResult>('/v1/interests', { text });
export const fetchTeaser = (fromSpotId: string, toSpotId: string, topicIds: string[]) =>
  postJson<TeaserResult>('/v1/teaser', { fromSpotId, toSpotId, topicIds }, 12_000);
