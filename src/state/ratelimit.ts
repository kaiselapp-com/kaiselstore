/* Login rate limiter — 5 attempts per 60s, mirroring the backend bucket. */
let tokens = 5;
let last = Date.now();
const CAP = 5;
const WINDOW = 60_000;

export function takeLoginToken(): void {
  const nowTs = Date.now();
  tokens = Math.min(CAP, tokens + ((nowTs - last) / WINDOW) * CAP);
  last = nowTs;
  if (tokens < 1) throw new Error("rate_limited");
  tokens -= 1;
}
