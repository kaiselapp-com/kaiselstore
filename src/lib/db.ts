import type { DbShape, Category, Developer, User, DeviceProfile } from "./types";
import { detectBrowserProfile, DEVICE_PRESETS } from "./device";

/* ============================================================
   Kaisel Store — persistence layer (web build)
   In production this maps 1:1 onto PostgreSQL repositories.
   Here: localStorage (documents) + IndexedDB (binary vault).

   The store ships EMPTY. Every application, version, artifact,
   review and download that exists was published or performed
   through this build — nothing is pre-populated.
   ============================================================ */

const DB_KEY = "kaisel.db.v5";

/* ---------- deterministic PRNG + hashing helpers ---------- */

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hexFromSeed(seed: string, len: number): string {
  const rnd = mulberry32(hashStr(seed));
  let out = "";
  while (out.length < len) out += Math.floor(rnd() * 0xffff).toString(16).padStart(4, "0");
  return out.slice(0, len);
}

export function fmtInt(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
  return n + " B";
}
export function timeAgo(t: number): string {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  if (s < 86400 * 365) return `${Math.floor(s / 86400 / 30)}mo ago`;
  return `${Math.floor(s / 86400 / 365)}y ago`;
}
export function fmtDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------- payload vault ----------
   Every artifact the processor stores is served from a deterministic
   byte generator (seed artifacts) or from IndexedDB (uploads), so that
   SHA-256 verification genuinely round-trips. */

export function sampleBytesFor(fileSize: number): number {
  return Math.max(64 * 1024, Math.min(fileSize, 1024 * 1024));
}

export function genPayload(key: string, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes);
  const rnd = mulberry32(hashStr("kaisel::" + key));
  const head = `KAISEL-ARTIFACT ${key} `;
  for (let i = 0; i < head.length && i < bytes; i++) out[i] = head.charCodeAt(i);
  const u32 = new Uint32Array(out.buffer, Math.floor(head.length / 4) * 4);
  for (let i = 0; i < u32.length; i++) u32[i] = (rnd() * 0xffffffff) >>> 0;
  return out;
}

let memVault = new Map<string, Blob>();
let idbPromise: Promise<IDBDatabase | null> | null = null;
function openVault(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  idbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open("kaisel-vault", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("blobs");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return idbPromise;
}
export async function vaultPut(key: string, blob: Blob): Promise<void> {
  memVault.set(key, blob);
  const db = await openVault();
  if (!db) return;
  await new Promise<void>((res) => {
    try {
      const tx = db.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put(blob, key);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch { res(); }
  });
}
export async function vaultGet(key: string): Promise<Blob | null> {
  const mem = memVault.get(key);
  if (mem) return mem;
  const db = await openVault();
  if (!db) return null;
  return new Promise((res) => {
    try {
      const tx = db.transaction("blobs", "readonly");
      const rq = tx.objectStore("blobs").get(key);
      rq.onsuccess = () => res((rq.result as Blob) ?? null);
      rq.onerror = () => res(null);
    } catch { res(null); }
  });
}

/* ---------- store infrastructure (catalog ships empty) ---------- */

const CATEGORIES: Category[] = [
  { id: "games", name: "Games", slug: "games", hue: 152, glyph: "game" },
  { id: "productivity", name: "Productivity", slug: "productivity", hue: 200, glyph: "prod" },
  { id: "tools", name: "Tools", slug: "tools", hue: 28, glyph: "tools" },
  { id: "education", name: "Education", slug: "education", hue: 262, glyph: "edu" },
  { id: "social", name: "Social", slug: "social", hue: 330, glyph: "social" },
  { id: "communication", name: "Communication", slug: "communication", hue: 190, glyph: "comm" },
  { id: "entertainment", name: "Entertainment", slug: "entertainment", hue: 12, glyph: "ent" },
  { id: "music", name: "Music", slug: "music", hue: 276, glyph: "music" },
  { id: "video", name: "Video", slug: "video", hue: 350, glyph: "video" },
  { id: "photography", name: "Photography", slug: "photography", hue: 44, glyph: "photo" },
  { id: "finance", name: "Finance", slug: "finance", hue: 140, glyph: "fin" },
  { id: "health", name: "Health", slug: "health", hue: 2, glyph: "health" },
  { id: "travel", name: "Travel", slug: "travel", hue: 210, glyph: "travel" },
  { id: "personalization", name: "Personalization", slug: "personalization", hue: 288, glyph: "pers" },
  { id: "utilities", name: "Utilities", slug: "utilities", hue: 96, glyph: "util" },
];

const DEVELOPERS: Developer[] = [
  { id: "dev_northwind", userId: "u_rin", name: "Northwind Labs", slug: "northwind-labs", bio: "Small team shipping fast, private-by-default Android apps. Reproducible builds and full split sets.", website: "northwind.example", country: "Netherlands", verified: true, hue: 215, joinedAt: Date.now() - 40 * 86400000 },
  { id: "dev_copperleaf", userId: "u_sam", name: "Copperleaf Studio", slug: "copperleaf-studio", bio: "Games with soul. Hand-painted worlds, zero ads, offline first.", website: "copperleaf.example", country: "Canada", verified: true, hue: 24, joinedAt: Date.now() - 31 * 86400000 },
  { id: "dev_bitforge", userId: "u_ops", name: "Bitforge Collective", slug: "bitforge-collective", bio: "Developer tools and utilities. Open source at heart, split-friendly binaries.", website: "bitforge.example", country: "Germany", verified: true, hue: 205, joinedAt: Date.now() - 22 * 86400000 },
];

function buildSeeds(): DbShape {
  const users: User[] = [
    { uid: "u_sam", email: "sam@postbox.dev", displayName: "Sam Reyes", role: "developer", provider: "password", avatarHue: 210, createdAt: Date.now() - 31 * 86400000 },
    { uid: "u_rin", email: "rin@northwind.dev", displayName: "Rin Halden", role: "developer", provider: "password", avatarHue: 222, createdAt: Date.now() - 40 * 86400000 },
    { uid: "u_ops", email: "admin@kaisel.store", displayName: "Kaisel Ops", role: "admin", provider: "password", avatarHue: 262, createdAt: Date.now() - 60 * 86400000 },
  ];

  const detected = detectBrowserProfile();
  const devices: DeviceProfile[] = [detected, ...DEVICE_PRESETS];

  return {
    v: 5, users, developers: DEVELOPERS, categories: CATEGORIES,
    applications: [], versions: [], artifacts: [], jobs: [], reviews: [],
    downloads: [], devices, currentDeviceId: "detected", installed: [],
    featured: [], reports: [],
  };
}

/* ---------- store ---------- */

let cache: DbShape | null = null;

export function getDb(): DbShape {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DbShape;
      if (parsed.v === 5) {
        // refresh detected device each load
        parsed.devices = [detectBrowserProfile(), ...parsed.devices.filter((d) => d.id !== "detected")];
        if (!parsed.devices.some((d) => d.id === parsed.currentDeviceId)) parsed.currentDeviceId = "detected";
        cache = parsed;
        return cache;
      }
    }
  } catch { /* fall through to seed */ }
  cache = buildSeeds();
  saveDb();
  return cache;
}

export function saveDb(): void {
  if (!cache) return;
  try { localStorage.setItem(DB_KEY, JSON.stringify(cache)); } catch { /* quota — keep in memory */ }
}

export function resetDb(): void {
  cache = buildSeeds();
  saveDb();
}
