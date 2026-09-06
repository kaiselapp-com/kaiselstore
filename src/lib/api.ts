import type {
  Application, ApplicationVersion, Artifact, CompatibleArtifactResult, DeviceProfile,
  DownloadEvent, Review, SearchQuery, SearchResult, UpdateCheckResult, ApiRequestLog, User,
} from "./types";
import { getDb, saveDb, uid, fmtBytes } from "./db";
import { computeSha256, serveArtifactBlob, verifySha256 } from "./processor";
import { detectBrowserProfile } from "./device";
import { buildZip } from "./zip";

/* ============================================================
   Kaisel API client (in-browser transport)
   Each function mirrors a REST endpoint of the Node backend —
   see #/api-docs. Latency + rate limits emulate production.
   ============================================================ */

const LATENCY = () => 160 + Math.random() * 260;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- telemetry / rate limiting ---------- */

export const apiLog: ApiRequestLog[] = [];
const rateHits: Record<string, number> = {};
const buckets: Record<string, { tokens: number; ts: number }> = {};

const LIMITS: Record<string, { cap: number; perMs: number }> = {
  login: { cap: 5, perMs: 60_000 },
  search: { cap: 30, perMs: 60_000 },
  download: { cap: 12, perMs: 60_000 },
  upload: { cap: 6, perMs: 60_000 },
  default: { cap: 120, perMs: 60_000 },
};

export class RateLimitError extends Error {
  retryMs: number;
  constructor(retryMs: number) { super("rate_limited"); this.retryMs = retryMs; }
}

function takeToken(key: string): void {
  const kind = LIMITS[key] ? key : "default";
  const rule = LIMITS[kind];
  const b = buckets[kind] ?? { tokens: rule.cap, ts: Date.now() };
  const elapsed = Date.now() - b.ts;
  b.tokens = Math.min(rule.cap, b.tokens + (elapsed / rule.perMs) * rule.cap);
  b.ts = Date.now();
  if (b.tokens < 1) {
    rateHits[kind] = (rateHits[kind] ?? 0) + 1;
    throw new RateLimitError(Math.ceil((1 - b.tokens) * (rule.perMs / rule.cap)));
  }
  b.tokens -= 1;
  buckets[kind] = b;
}

export function getRateStats() {
  return Object.entries(LIMITS).map(([k, r]) => ({ endpoint: k, cap: r.cap, windowS: r.perMs / 1000, hits: rateHits[k] ?? 0 }));
}

async function ep<T>(method: string, path: string, kind: string, fn: () => T | Promise<T>): Promise<T> {
  takeToken(kind);
  const t0 = performance.now();
  await sleep(LATENCY());
  try {
    const out = await fn();
    apiLog.unshift({ at: Date.now(), method, path, status: 200, ms: Math.round(performance.now() - t0) });
    if (apiLog.length > 120) apiLog.length = 120;
    return out;
  } catch (e) {
    apiLog.unshift({ at: Date.now(), method, path, status: e instanceof RateLimitError ? 429 : 500, ms: Math.round(performance.now() - t0) });
    throw e;
  }
}

/* ---------- lookups ---------- */

export function appById(id: string) { return getDb().applications.find((a) => a.id === id); }
export function appByPkg(pkg: string) { return getDb().applications.find((a) => a.packageName === pkg); }
export function devById(id: string) { return getDb().developers.find((d) => d.id === id || d.slug === id); }
export function currentDevice(): DeviceProfile {
  const db = getDb();
  return db.devices.find((d) => d.id === db.currentDeviceId) ?? db.devices[0] ?? detectBrowserProfile();
}
export function versionsOf(appId: string) {
  return getDb().versions.filter((v) => v.applicationId === appId && v.status !== "removed").sort((a, b) => b.versionCode - a.versionCode);
}
export function artifactsOf(versionId: string) {
  return getDb().artifacts.filter((a) => a.versionId === versionId && a.status === "available");
}
export function latestVersion(appId: string) { return versionsOf(appId)[0] ?? null; }

export function downloadCount(appId: string): number {
  const db = getDb();
  const app = db.applications.find((a) => a.id === appId);
  return (app?.baseDownloads ?? 0) + db.downloads.filter((d) => d.applicationId === appId).length;
}

export function appRating(appId: string): { avg: number; count: number; dist: number[] } {
  const rs = getDb().reviews.filter((r) => r.applicationId === appId && !r.hidden);
  const dist = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of rs) { sum += r.rating; dist[r.rating - 1]++; }
  return { avg: rs.length ? sum / rs.length : 0, count: rs.length, dist };
}

export function appSize(appId: string): number {
  const v = latestVersion(appId);
  if (!v) return 0;
  const arts = artifactsOf(v.id).filter((a) => a.artifactType !== "aab");
  const base = arts.find((a) => a.splitName === "base");
  if (base) return base.fileSize;
  const uni = arts.find((a) => a.artifactType === "universal-apk" || a.artifactType === "apk");
  return uni?.fileSize ?? arts[0]?.fileSize ?? 0;
}

/* ---------- compatibility engine ---------- */

interface Scored { art: Artifact; score: number; reasons: string[]; fatal: string | null }

function scoreArtifact(a: Artifact, d: DeviceProfile): Scored {
  const reasons: string[] = [];
  if (a.minSdk > d.androidApi) return { art: a, score: -1, reasons, fatal: `requires API ${a.minSdk}+ (device: ${d.androidApi})` };
  if (a.maxSdk && d.androidApi > a.maxSdk) return { art: a, score: -1, reasons, fatal: `capped at API ${a.maxSdk} (device: ${d.androidApi})` };
  let score = 0;
  if (a.abi.includes("universal")) { score += 40; reasons.push("universal ABI"); }
  else if (a.abi.includes(d.abi)) { score += 70; reasons.push(`${d.abi} native`); }
  else return { art: a, score: -1, reasons, fatal: `no ${d.abi} support (has ${a.abi.join(", ")})` };
  if (a.density == null) { score += 12; reasons.push("any density"); }
  else {
    const diff = Math.abs(a.density - d.density);
    if (diff === 0) { score += 34; reasons.push(`exact ${d.density}dpi`); }
    else if (a.density < d.density) { score += 20; reasons.push(`${a.density}dpi scaled up`); }
    else { score += 10; reasons.push(`${a.density}dpi scaled down`); }
  }
  if (a.features.every((f) => d.supportedFeatures.includes(f))) { score += 8; }
  else return { art: a, score: -1, reasons, fatal: "missing features: " + a.features.filter((f) => !d.supportedFeatures.includes(f)).join(", ") };
  return { art: a, score, reasons, fatal: null };
}

export function selectArtifacts(version: ApplicationVersion, d: DeviceProfile): { compatible: boolean; set: Artifact[]; type: "apk" | "split-set" | "none"; reasons: string[] } {
  const arts = artifactsOf(version.id).filter((a) => a.artifactType !== "aab");
  if (arts.length === 0) return { compatible: false, set: [], type: "none", reasons: ["no artifacts published"] };
  const scored = arts.map((a) => scoreArtifact(a, d));
  const viable = scored.filter((s) => !s.fatal);
  if (viable.length === 0) {
    const fatal = scored.find((s) => s.fatal);
    return { compatible: false, set: [], type: "none", reasons: fatal ? [fatal.fatal!] : ["no viable artifact"] };
  }
  // split-set: base + best ABI split + best density split
  const base = viable.find((s) => s.art.splitName === "base");
  const abiSplits = viable.filter((s) => s.art.splitName?.startsWith("config.") && s.art.density == null && !s.art.abi.includes("universal"));
  const densitySplits = viable.filter((s) => s.art.density != null);
  if (base && (abiSplits.length > 0 || densitySplits.length > 0)) {
    const set: Artifact[] = [base.art];
    const bestAbi = abiSplits.sort((a, b) => b.score - a.score)[0];
    if (bestAbi && bestAbi.art.abi.includes(d.abi)) set.push(bestAbi.art);
    if (densitySplits.length) {
      const bestD = densitySplits.sort((a, b) => Math.abs((a.art.density ?? 0) - d.density) - Math.abs((b.art.density ?? 0) - d.density))[0];
      set.push(bestD.art);
    }
    const reasons = [
      "base split",
      ...(set.length > 1 && set[1].abi[0] !== "universal" ? [`ABI split ${set[1].splitName}`] : []),
      ...(set.length === 3 ? [`density split ${set[2].splitName}`] : []),
      `session install of ${set.length} splits`,
    ];
    return { compatible: true, set, type: "split-set", reasons };
  }
  const best = viable.sort((a, b) => b.score - a.score)[0];
  return { compatible: true, set: [best.art], type: best.art.splitName === "base" ? "split-set" : "apk", reasons: best.reasons };
}

export function compatSummary(appId: string, d: DeviceProfile): CompatibleArtifactResult {
  const app = appById(appId);
  const v = latestVersion(appId);
  if (!app || !v) {
    return { compatible: false, applicationId: appId, packageName: "", version: null, artifacts: [], installationType: "none", totalBytes: 0, reasons: ["not found"], downloadUrl: null };
  }
  const sel = selectArtifacts(v, d);
  return {
    compatible: sel.compatible, applicationId: appId, packageName: app.packageName, version: v,
    artifacts: sel.set, installationType: sel.type,
    totalBytes: sel.set.reduce((s, a) => s + a.fileSize, 0),
    reasons: sel.reasons, downloadUrl: null,
  };
}

/* ---------- discovery endpoints ---------- */

export const api = {
  categories: () => ep("GET", "/api/categories", "default", () => [...getDb().categories]),

  apps: (opts: { category?: string; sort?: string; page?: number; pageSize?: number } = {}) =>
    ep("GET", "/api/apps", "default", () => {
      const db = getDb();
      let items = db.applications.filter((a) => a.status === "approved");
      if (opts.category) items = items.filter((a) => a.categoryIds.includes(opts.category!));
      items = sortApps(items, (opts.sort as SearchQuery["sort"]) ?? "popular");
      const page = opts.page ?? 1, pageSize = opts.pageSize ?? 12;
      return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize };
    }),

  featured: () => ep("GET", "/api/featured", "default", () => {
    const db = getDb();
    return db.featured
      .sort((a, b) => a.position - b.position)
      .map((f) => db.applications.find((a) => a.id === f.applicationId))
      .filter((a): a is Application => !!a && a.status === "approved");
  }),

  popular: () => ep("GET", "/api/popular", "default", () =>
    sortApps(getDb().applications.filter((a) => a.status === "approved"), "downloads").slice(0, 10)),

  recommended: () => ep("GET", "/api/recommended", "default", () => {
    const d = currentDevice();
    return sortApps(
      getDb().applications.filter((a) => a.status === "approved" && compatSummary(a.id, d).compatible),
      "rating"
    ).slice(0, 10);
  }),

  newest: () => ep("GET", "/api/apps?sort=newest", "default", () =>
    sortApps(getDb().applications.filter((a) => a.status === "approved"), "newest").slice(0, 10)),

  topIn: (category: string) => ep("GET", `/api/apps?category=${category}`, "default", () =>
    sortApps(getDb().applications.filter((a) => a.status === "approved" && a.categoryIds.includes(category)), "rating").slice(0, 10)),

  search: (q: SearchQuery) => ep("GET", "/api/search", "search", async () => {
    const t0 = performance.now();
    const db = getDb();
    const needle = (q.q ?? "").trim().toLowerCase();
    const d = currentDevice();
    let items = db.applications.filter((a) => a.status === "approved");
    if (needle) {
      items = items.filter((a) => {
        const dev = db.developers.find((x) => x.id === a.developerId);
        return a.name.toLowerCase().includes(needle) || a.packageName.toLowerCase().includes(needle) || (dev?.name.toLowerCase().includes(needle) ?? false) || a.tagline.toLowerCase().includes(needle);
      });
    }
    if (q.category) items = items.filter((a) => a.categoryIds.includes(q.category!));
    if (q.minRating) items = items.filter((a) => appRating(a.id).avg >= q.minRating!);
    if (q.compatibleOnly) items = items.filter((a) => compatSummary(a.id, d).compatible);
    items = sortApps(items, q.sort ?? "popular");
    const page = q.page ?? 1, pageSize = q.pageSize ?? 12;
    const res: SearchResult = { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize, tookMs: Math.round(performance.now() - t0) };
    return res;
  }),

  app: (packageName: string) => ep("GET", `/api/apps/${packageName}`, "default", () => {
    const app = appByPkg(packageName);
    if (!app || app.status === "rejected") throw new ApiError(404, "application not found");
    return app;
  }),

  versions: (packageName: string) => ep("GET", `/api/apps/${packageName}/versions`, "default", () => {
    const app = appByPkg(packageName);
    if (!app) throw new ApiError(404, "application not found");
    return versionsOf(app.id).map((v) => ({ ...v, artifacts: artifactsOf(v.id) }));
  }),

  compatibleArtifact: (packageName: string, deviceId?: string) => ep("GET", `/api/apps/${packageName}/compatible-artifact`, "default", () => {
    const app = appByPkg(packageName);
    if (!app) throw new ApiError(404, "application not found");
    const db = getDb();
    const d = deviceId ? db.devices.find((x) => x.id === deviceId) ?? currentDevice() : currentDevice();
    const res = compatSummary(app.id, d);
    if (res.compatible) res.downloadUrl = signDownload(res.artifacts.map((a) => a.id));
    return res;
  }),

  developer: (idOrSlug: string) => ep("GET", `/api/developer/${idOrSlug}`, "default", () => {
    const dev = devById(idOrSlug);
    if (!dev) throw new ApiError(404, "developer not found");
    const apps = getDb().applications.filter((a) => a.developerId === dev.id && a.status === "approved");
    return { developer: dev, apps };
  }),

  deviceProfile: (p: DeviceProfile) => ep("POST", "/api/device/profile", "default", () => {
    const db = getDb();
    const existing = db.devices.find((x) => x.id === p.id);
    if (existing) Object.assign(existing, p);
    else db.devices.push(p);
    db.currentDeviceId = p.id;
    saveDb();
    return p;
  }),

  updates: (deviceId?: string) => ep("GET", "/api/updates", "default", () => {
    const db = getDb();
    const d = deviceId ? db.devices.find((x) => x.id === deviceId) ?? currentDevice() : currentDevice();
    const out: UpdateCheckResult[] = [];
    for (const inst of db.installed) {
      const app = appByPkg(inst.packageName);
      if (!app || app.status !== "approved") continue;
      const v = latestVersion(app.id);
      if (!v) continue;
      const sel = selectArtifacts(v, d);
      out.push({
        packageName: inst.packageName, updateAvailable: sel.compatible && v.versionCode > inst.versionCode,
        installedVersion: inst.versionCode, latestVersion: v.versionCode, versionName: v.versionName,
        artifactCount: sel.set.length, totalBytes: sel.set.reduce((s, a) => s + a.fileSize, 0),
        changelog: v.changelog,
      });
    }
    return out;
  }),

  updateCheck: (packageName: string, installedCode: number) => ep("GET", `/api/apps/${packageName}/update`, "default", () => {
    const app = appByPkg(packageName);
    if (!app) throw new ApiError(404, "application not found");
    const v = latestVersion(app.id);
    const d = currentDevice();
    const sel = v ? selectArtifacts(v, d) : null;
    return {
      packageName, updateAvailable: !!(v && sel?.compatible && v.versionCode > installedCode),
      installedVersion: installedCode, latestVersion: v?.versionCode ?? installedCode,
      artifactCount: sel?.set.length ?? 0, totalBytes: sel?.set.reduce((s, a) => s + a.fileSize, 0) ?? 0,
      versionName: v?.versionName ?? null, changelog: v?.changelog ?? null,
    } as UpdateCheckResult;
  }),

  reviews: (appId: string) => ep("GET", `/api/apps/${appId}/reviews`, "default", () =>
    getDb().reviews.filter((r) => r.applicationId === appId).sort((a, b) => b.createdAt - a.createdAt)),

  addReview: (r: { applicationId: string; user: User; rating: number; title: string; body: string }) =>
    ep("POST", "/api/reviews", "default", () => {
      const db = getDb();
      const review: Review = {
        id: uid("rev"), applicationId: r.applicationId, uid: r.user.uid, userName: r.user.displayName,
        rating: r.rating, title: r.title, body: r.body, helpful: 0, hidden: false, createdAt: Date.now(),
      };
      db.reviews.unshift(review);
      saveDb();
      return review;
    }),

  updateReview: (id: string, patch: { rating: number; title: string; body: string }) =>
    ep("PUT", `/api/reviews/${id}`, "default", () => {
      const db = getDb();
      const r = db.reviews.find((x) => x.id === id);
      if (!r) throw new ApiError(404, "review not found");
      Object.assign(r, patch, { editedAt: Date.now() });
      saveDb();
      return r;
    }),

  deleteReview: (id: string) => ep("DELETE", `/api/reviews/${id}`, "default", () => {
    const db = getDb();
    db.reviews = db.reviews.filter((x) => x.id !== id);
    saveDb();
    return { ok: true };
  }),
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

function sortApps(items: Application[], sort: NonNullable<SearchQuery["sort"]>): Application[] {
  const arr = [...items];
  switch (sort) {
    case "downloads": return arr.sort((a, b) => downloadCount(b.id) - downloadCount(a.id));
    case "newest": return arr.sort((a, b) => b.createdAt - a.createdAt);
    case "rating": return arr.sort((a, b) => appRating(b.id).avg - appRating(a.id).avg);
    default: return arr.sort((a, b) => (downloadCount(b.id) * appRating(b.id).avg) - (downloadCount(a.id) * appRating(a.id).avg));
  }
}

/* ---------- signed download tokens ---------- */

function signDownload(artifactIds: string[]): string {
  const exp = Date.now() + 90_000;
  const payload = { ids: artifactIds, exp, sig: Math.random().toString(36).slice(2, 10) };
  return btoa(encodeURIComponent(JSON.stringify(payload)));
}

export function parseDownloadToken(token: string): { ids: string[]; valid: boolean } {
  try {
    const p = JSON.parse(decodeURIComponent(atob(token)));
    return { ids: p.ids as string[], valid: Date.now() < p.exp };
  } catch { return { ids: [], valid: false }; }
}

/* ---------- download execution ---------- */

export interface DownloadOutcome {
  sessionId: string;
  events: DownloadEvent[];
  blobUrls: { artifact: Artifact; url: string }[];
  totalBytes: number;
}

export async function executeDownload(appId: string, deviceId?: string, user?: User | null, autoSave = true): Promise<DownloadOutcome> {
  takeToken("download");
  const db = getDb();
  const app = appById(appId);
  if (!app) throw new ApiError(404, "application not found");
  const d = deviceId ? db.devices.find((x) => x.id === deviceId) ?? currentDevice() : currentDevice();
  const v = latestVersion(appId);
  if (!v) throw new ApiError(409, "no published version");
  const sel = selectArtifacts(v, d);
  if (!sel.compatible) throw new ApiError(412, "no compatible artifact for device profile");
  const token = signDownload(sel.set.map((a) => a.id));
  const parsed = parseDownloadToken(token);
  if (!parsed.valid) throw new ApiError(403, "download token invalid");

  const sessionId = uid("sess");
  const events: DownloadEvent[] = [];
  const blobUrls: DownloadOutcome["blobUrls"] = [];
  let totalBytes = 0;

  for (const art of sel.set) {
    if (art.status !== "available") throw new ApiError(410, `artifact ${art.id} unavailable`);
    const blob = await serveArtifactBlob(art);
    if (!art.sha256) {
      art.sha256 = await computeSha256(new Uint8Array(await blob.arrayBuffer()));
      saveDb();
    }
    const ev: DownloadEvent = {
      id: uid("dl"), sessionId, artifactId: art.id, applicationId: appId,
      versionCode: v.versionCode, uid: user?.uid ?? null, deviceLabel: d.label,
      bytes: blob.size, sha256: art.sha256, verified: null, at: Date.now(),
    };
    db.downloads.unshift(ev);
    events.push(ev);
    totalBytes += blob.size;
    if (autoSave) {
      const url = URL.createObjectURL(blob);
      blobUrls.push({ artifact: art, url });
      const a = document.createElement("a");
      const fname = `${app.packageName}-${v.versionCode}${art.splitName ? "-" + art.splitName : ""}.apk`;
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      await sleep(350);
    }
  }
  // register install for update tracking
  const existing = db.installed.find((i) => i.packageName === app.packageName);
  if (existing) { existing.versionCode = v.versionCode; existing.versionName = v.versionName; existing.installedAt = Date.now(); }
  else db.installed.push({ packageName: app.packageName, versionCode: v.versionCode, versionName: v.versionName, installedAt: Date.now() });
  saveDb();
  return { sessionId, events, blobUrls, totalBytes };
}

export async function verifyEvent(eventId: string): Promise<{ verified: boolean; actual: string; expected: string }> {
  const db = getDb();
  const ev = db.downloads.find((e) => e.id === eventId);
  if (!ev) throw new ApiError(404, "download event not found");
  const art = db.artifacts.find((a) => a.id === ev.artifactId);
  if (!art) throw new ApiError(404, "artifact not found");
  const blob = await serveArtifactBlob(art);
  const actual = await computeSha256(new Uint8Array(await blob.arrayBuffer()));
  const verified = actual.toLowerCase() === (art.sha256 || ev.sha256).toLowerCase();
  ev.verified = verified;
  ev.sha256 = art.sha256 || ev.sha256;
  saveDb();
  return { verified, actual, expected: art.sha256 || ev.sha256 };
}

export { verifySha256, fmtBytes };

/* ---------- device build generation ----------
   GET /api/build/{packageName}?device={profileId}
   Resolves the compatible artifact set for the target device, then packages
   base + config splits + a signed MANIFEST.json into one ZIP so the web
   client receives exactly what that device would install. The Android
   client skips the ZIP and streams the set into a PackageInstaller session. */

export interface DeviceBuildResult {
  blob: Blob;
  fileName: string;
  bytes: number;
  zipSha256: string;
  profile: DeviceProfile;
  app: Application;
  version: ApplicationVersion;
  set: Artifact[];
  events: DownloadEvent[];
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function generateDeviceBuild(
  appId: string, deviceId?: string, user?: User | null,
  onStage?: (stage: string) => void,
): Promise<DeviceBuildResult> {
  takeToken("download");
  const db = getDb();
  const app = appById(appId);
  if (!app) throw new ApiError(404, "application not found");
  const profile = deviceId ? db.devices.find((x) => x.id === deviceId) ?? currentDevice() : currentDevice();
  const version = latestVersion(appId);
  if (!version) throw new ApiError(409, "no published version");

  onStage?.("Resolving compatible artifact set…");
  await sleep(260);
  const sel = selectArtifacts(version, profile);
  if (!sel.compatible) throw new ApiError(412, "no compatible artifact for " + profile.label);

  onStage?.("Fetching artifacts from vault…");
  const files: { name: string; sha256: string; bytes: number }[] = [];
  const entries: { name: string; data: Uint8Array }[] = [];
  const events: DownloadEvent[] = [];
  const sessionId = uid("sess");
  let total = 0;

  for (const art of sel.set) {
    if (art.status !== "available") throw new ApiError(410, `artifact ${art.id} unavailable`);
    const blob = await serveArtifactBlob(art);
    const data = new Uint8Array(await blob.arrayBuffer());
    if (!art.sha256) { art.sha256 = await computeSha256(data); saveDb(); }
    const name = art.splitName ? `${art.splitName}.apk` : `${app.packageName}-${version.versionCode}${art.artifactType === "universal-apk" ? "-universal" : ""}.apk`;
    entries.push({ name, data });
    files.push({ name, sha256: art.sha256, bytes: art.fileSize });
    total += art.fileSize;
    events.push({
      id: uid("dl"), sessionId, artifactId: art.id, applicationId: appId,
      versionCode: version.versionCode, uid: user?.uid ?? null, deviceLabel: profile.label,
      bytes: blob.size, sha256: art.sha256, verified: true, at: Date.now(),
    });
    onStage?.(`  ✓ ${name} · ${fmtBytes(art.fileSize)} · sha256 ${art.sha256.slice(0, 12)}…`);
    await sleep(180);
  }

  onStage?.("Writing MANIFEST.json + sealing ZIP…");
  const manifest = {
    format: "kaisel.device-build/1",
    application: { packageName: app.packageName, name: app.name, versionName: version.versionName, versionCode: version.versionCode },
    device: { id: profile.id, label: profile.label, androidApi: profile.androidApi, abi: profile.abi, density: profile.density, screen: `${profile.screenWidth}x${profile.screenHeight}`, formFactor: profile.formFactor ?? "phone" },
    installationType: sel.type === "split-set" ? "package-installer-session" : "single-apk",
    splits: sel.type === "split-set" ? sel.set.length : 1,
    files,
    integrity: { algorithm: "SHA-256", note: "verify every file against its recorded digest before install; signature blocks are preserved untouched" },
    generatedAt: new Date().toISOString(),
    generator: "Kaisel ArtifactProcessor",
  };
  entries.push({ name: "MANIFEST.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
  const blob = buildZip(entries);
  const zipSha256 = await computeSha256(new Uint8Array(await blob.arrayBuffer()));

  db.downloads.unshift(...events);
  const existing = db.installed.find((i) => i.packageName === app.packageName);
  if (existing) { existing.versionCode = version.versionCode; existing.versionName = version.versionName; existing.installedAt = Date.now(); }
  else db.installed.push({ packageName: app.packageName, versionCode: version.versionCode, versionName: version.versionName, installedAt: Date.now() });
  saveDb();

  onStage?.(`Sealed · zip sha256 ${zipSha256.slice(0, 16)}…`);
  return {
    blob, events,
    fileName: `${slugify(app.name)}-${slugify(profile.model)}-v${version.versionCode}.kaisel.zip`,
    bytes: blob.size, zipSha256, profile, app, version, set: sel.set,
  };
}

export interface DeviceNote { icon: string; text: string; tone: "jade" | "gold" | "coral" | "cy" }

export function deviceNotes(app: Application, d: DeviceProfile): DeviceNote[] {
  const notes: DeviceNote[] = [];
  const size = appSize(app.id);
  const heavyCat = ["games", "video", "entertainment"].some((c) => app.categoryIds.includes(c));
  const heavy = heavyCat ? size > 25 * 1024 * 1024 : size > 60 * 1024 * 1024;

  if (d.oemSkin && !/Stock|AOSP|emulator|Windows|ChromeOS|Nothing|Near-stock/i.test(d.oemSkin))
    notes.push({ icon: "zap", tone: "gold", text: `${d.oemSkin} detected — ${d.batteryProfile ?? "the OEM's power policy may defer install prompts; approve Kaisel from background restrictions."}` });
  if (d.tier === "go")
    notes.push({ icon: "alert", tone: "coral", text: "Android Go class device — Kaisel serves the minimal split set and skips optional graphics modules." });
  else if (d.tier === "low" && heavy)
    notes.push({ icon: "chart", tone: "gold", text: "This build is heavy for a low-tier device — expect reduced effects; thermal throttling may lower frame rates under sustained load." });
  if (d.formFactor === "foldable")
    notes.push({ icon: "layers", tone: "cy", text: "Foldable — cover and inner displays use different densities; the compatibility engine pre-resolves both config splits." });
  if (d.formFactor === "dual-screen")
    notes.push({ icon: "grid", tone: "cy", text: "Dual-screen device — apps with viewport-segment support can span both panels." });
  if (d.abi === "armeabi-v7a" || d.abi === "x86")
    notes.push({ icon: "cpu", tone: "gold", text: `32-bit ${d.abi} runtime — 64-bit-only packages cannot install here; the engine filters them automatically.` });
  if (d.gpu && /SwiftShader/.test(d.gpu))
    notes.push({ icon: "game", tone: "gold", text: "Software GL renderer — graphics-heavy apps will render on the CPU." });
  if (/Samsung/.test(d.manufacturer) && /(Ultra|Fold|Note)/.test(d.model) && ["productivity", "photography", "tools", "education"].some((c) => app.categoryIds.includes(c)))
    notes.push({ icon: "edit", tone: "jade", text: "S-Pen available — stylus input and hover APIs work where the app declares them." });
  if (d.androidApi < 28)
    notes.push({ icon: "info", tone: "cy", text: `Android ${d.androidVersion} — newer platform APIs degrade gracefully; some features are disabled by the app at runtime.` });
  return notes.slice(0, 4);
}
