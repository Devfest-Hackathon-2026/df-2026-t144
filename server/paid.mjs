// Guards for the paid Google APIs (Gemini on Vertex AI, Routes, the browser
// Maps key). Fail closed: without an explicit, valid PAID_API_UNTIL, or after
// it, no paid call is made and the app runs on demo data and fixed text.
// These are in-process guards, not a billing ceiling: counters reset when the
// instance restarts, and Cloud Build, storage and Maps loads are not counted.

export const PAID_API_MAX_PER_DAY = 50;

/** Epoch ms of PAID_API_UNTIL, or null when missing or ambiguous. The offset is required (e.g. +09:00). */
export function paidApiDeadline(env = process.env) {
  const value = typeof env.PAID_API_UNTIL === 'string' ? env.PAID_API_UNTIL.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function paidApiOpen(env = process.env, now = Date.now) {
  const deadline = paidApiDeadline(env);
  return deadline !== null && now() <= deadline;
}

/** Daily ceiling from env, never above PAID_API_MAX_PER_DAY. Env can only lower it. */
export function dailyLimit(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, PAID_API_MAX_PER_DAY) : PAID_API_MAX_PER_DAY;
}
