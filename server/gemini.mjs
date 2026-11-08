// Gemini on Vertex AI over REST. No SDK and no API key: on Cloud Run the
// access token comes from the metadata server for the service account.
// Locally, set GEMINI_ACCESS_TOKEN (`gcloud auth print-access-token`) and
// GOOGLE_CLOUD_PROJECT to try real calls; otherwise callers fall back.

// Every caller (server and scripts) goes through here, so the paid-API window
// (PAID_API_UNTIL, see paid.mjs) is enforced here as well.
import { paidApiOpen } from './paid.mjs';

const METADATA = 'http://metadata.google.internal/computeMetadata/v1';
export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const MAX_OUTPUT_TOKENS = 2048;

export class GeminiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function vertexEndpoint({ project, location, model }) {
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;
}

export function createGemini({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const location = env.GEMINI_LOCATION || 'global';
  const onCloudRun = Boolean(env.K_SERVICE);
  const enabled = env.GEMINI_ENABLED !== 'false' && paidApiOpen(env, now)
    && (onCloudRun || Boolean(env.GEMINI_ACCESS_TOKEN && env.GOOGLE_CLOUD_PROJECT));
  let project = env.GOOGLE_CLOUD_PROJECT || null;
  let token = null;

  async function metadata(path) {
    let response;
    try {
      response = await fetchImpl(`${METADATA}/${path}`, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2_000) });
    } catch {
      throw new GeminiError('NO_CREDENTIALS', 'Cloud Runのサービスアカウント情報を取得できません。');
    }
    if (!response.ok) throw new GeminiError('NO_CREDENTIALS', 'Cloud Runのサービスアカウント情報を取得できません。');
    return response;
  }

  async function accessToken() {
    if (env.GEMINI_ACCESS_TOKEN) return env.GEMINI_ACCESS_TOKEN;
    if (token && token.expiresAt - now() > 60_000) return token.value;
    const body = await (await metadata('instance/service-accounts/default/token')).json();
    if (typeof body?.access_token !== 'string' || !Number.isFinite(body?.expires_in)) {
      throw new GeminiError('NO_CREDENTIALS', 'アクセストークンの形式が不正です。');
    }
    token = { value: body.access_token, expiresAt: now() + body.expires_in * 1_000 };
    return token.value;
  }

  async function projectId() {
    if (project) return project;
    const value = (await (await metadata('project/project-id')).text()).trim();
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)) throw new GeminiError('NO_CREDENTIALS', 'プロジェクトIDを取得できません。');
    project = value;
    return project;
  }

  /**
   * Returns the parsed JSON object that Gemini produced under `schema`. Callers must still validate it.
   * `images` are sent inline ({ mimeType, data: base64 }) and are not stored anywhere.
   */
  async function generateJson({ system, prompt, schema, temperature = 0.3, timeoutMs = 12_000, images = [] }) {
    if (!enabled) throw new GeminiError('NOT_CONFIGURED', 'Geminiが未設定です。');
    if (!paidApiOpen(env, now)) throw new GeminiError('PAID_API_CLOSED', '有料APIの利用期間が終わりました。');
    if (images.length > 1) throw new GeminiError('INVALID_INPUT', '写真は1枚までです。');
    const url = vertexEndpoint({ project: await projectId(), location, model });
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map((image) => ({ inlineData: { mimeType: image.mimeType, data: image.data } }))] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature, maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new GeminiError('GEMINI_UNAVAILABLE', 'Geminiに接続できませんでした。');
    }
    if (!response.ok) throw new GeminiError('GEMINI_UNAVAILABLE', `Geminiの応答がエラーでした(${response.status})。`);
    let body;
    try { body = await response.json(); } catch { throw new GeminiError('INVALID_OUTPUT', 'Geminiの応答を読めませんでした。'); }
    const text = body?.candidates?.[0]?.content?.parts?.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
    if (!text) throw new GeminiError('INVALID_OUTPUT', 'Geminiの応答が空でした。');
    try { return JSON.parse(text); } catch { throw new GeminiError('INVALID_OUTPUT', 'GeminiがJSON以外を返しました。'); }
  }

  return { enabled, model, location, generateJson };
}
