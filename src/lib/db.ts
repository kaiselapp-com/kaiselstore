import type {
  DbShape, Application, ApplicationVersion, Artifact, Category, Developer,
  DownloadEvent, DeviceProfile, InstalledApp, ProcessingJob, Review, User,
  AppReport, FeaturedEntry,
} from "./types";
import { detectBrowserProfile, DEVICE_PRESETS } from "./device";

/* ============================================================
   Kaisel Store — persistence layer (web build)
   In production this maps 1:1 onto PostgreSQL repositories.
   Here: localStorage (documents) + IndexedDB (binary vault).
   ============================================================ */

const DB_KEY = "kaisel.db.v4";

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
   Seeded artifacts are served from a deterministic byte generator so that
   SHA-256 verification genuinely round-trips. Uploaded artifacts are stored
   verbatim in IndexedDB. */

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

/* ---------- seed data ---------- */

const DAY = 86400000;
const now = Date.now();

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
  { id: "dev_northwind", userId: "u_rin", name: "Northwind Labs", slug: "northwind-labs", bio: "Small team shipping fast, private-by-default Android apps since 2016. We publish reproducible builds and full split sets.", website: "northwind.example", country: "Netherlands", verified: true, hue: 158, joinedAt: now - 1400 * DAY },
  { id: "dev_copperleaf", userId: "u_copper", name: "Copperleaf Studio", slug: "copperleaf-studio", bio: "Games with soul. Hand-painted worlds, zero ads, offline first.", website: "copperleaf.example", country: "Canada", verified: true, hue: 28, joinedAt: now - 1100 * DAY },
  { id: "dev_bitforge", userId: "u_bitforge", name: "Bitforge Collective", slug: "bitforge-collective", bio: "Developer tools and utilities. Open source at heart, split-friendly binaries.", website: "bitforge.example", country: "Germany", verified: true, hue: 205, joinedAt: now - 950 * DAY },
  { id: "dev_aurora", userId: "u_aurora", name: "Aurora Fields", slug: "aurora-fields", bio: "Wellness, health and learning apps designed calm.", website: "aurorafields.example", country: "Sweden", verified: false, hue: 270, joinedAt: now - 700 * DAY },
  { id: "dev_hexline", userId: "u_hexline", name: "Hexline Systems", slug: "hexline-systems", bio: "Networking, security and infrastructure tooling for Android power users.", website: "hexline.example", country: "South Korea", verified: true, hue: 340, joinedAt: now - 620 * DAY },
  { id: "dev_kaisel", userId: "u_kaisel", name: "Kaisel Works", slug: "kaisel-works", bio: "First-party utilities from the Kaisel Store team.", website: "kaisel.store", country: "—", verified: true, hue: 130, joinedAt: now - 1600 * DAY },
];

const PERM_POOL: Record<string, string> = {
  INTERNET: "Sync data and fetch content",
  ACCESS_NETWORK_STATE: "Pause downloads on metered networks",
  POST_NOTIFICATIONS: "Alerts for downloads and updates",
  CAMERA: "Capture photos and scan codes",
  RECORD_AUDIO: "Voice input and calls",
  ACCESS_FINE_LOCATION: "Location-aware features you enable",
  READ_MEDIA_IMAGES: "Pick images from your library",
  VIBRATE: "Haptic feedback",
  FOREGROUND_SERVICE: "Keep long downloads running",
  BLUETOOTH_CONNECT: "Pair with accessories",
  SCHEDULE_EXACT_ALARM: "Timely reminders",
  WRITE_EXTERNAL_STORAGE: "Save files where you choose",
};

/* name, pkg, devId, cats, hue, glyph, style, tagline, artifactProfile, minSdk, maxSdk, baseDownloads, createdDaysAgo */
type AppSpec = [string, string, string, string[], number, string, "duo" | "solid" | "ring", string, "splits-full" | "splits-arm" | "universal" | "arm64-only", number, number | null, number, number];

const APP_SPECS: AppSpec[] = [
  ["Rift Racers", "com.copperleaf.riftracers", "dev_copperleaf", ["games"], 158, "game", "duo", "Anti-gravity racing across shattered dune worlds", "splits-arm", 30, null, 4820000, 540],
  ["Emberfall", "com.copperleaf.emberfall", "dev_copperleaf", ["games"], 18, "game", "solid", "A hand-painted tactical RPG with permadeath seasons", "splits-full", 26, null, 2110000, 420],
  ["Pocket Cosmos", "com.aurora.pocketcosmos", "dev_aurora", ["games", "education"], 262, "game", "ring", "Relaxing gravity puzzles set in a living starfield", "universal", 23, null, 940000, 300],
  ["Dune Drifters", "com.copperleaf.dunedrifters", "dev_copperleaf", ["games"], 40, "game", "duo", "Endless desert rally with procedural sandstorms", "splits-arm", 28, null, 655000, 210],
  ["Tidal Notes", "com.northwind.tidalnotes", "dev_northwind", ["productivity"], 195, "prod", "duo", "Offline-first notes that sync like water finding its level", "splits-full", 26, null, 3480000, 660],
  ["Sprintboard", "com.bitforge.sprintboard", "dev_bitforge", ["productivity"], 210, "prod", "solid", "Kanban for small teams — fast, keyboard-first, honest", "universal", 24, null, 1260000, 480],
  ["Ledgerly", "com.northwind.ledgerly", "dev_northwind", ["finance", "productivity"], 140, "fin", "duo", "Double-entry personal finance without the cloud leash", "splits-full", 26, null, 2870000, 590],
  ["Signal Compass", "com.hexline.signalcompass", "dev_hexline", ["tools"], 200, "tools", "ring", "Measure cell, Wi-Fi and GPS signal quality on a map", "splits-arm", 26, null, 720000, 350],
  ["Vaultkey", "com.hexline.vaultkey", "dev_hexline", ["tools", "utilities"], 130, "shield", "solid", "Offline password vault with hardware-key unlock", "arm64-only", 26, null, 1930000, 500],
  ["AirShare", "com.northwind.airshare", "dev_northwind", ["tools", "utilities"], 185, "cloud", "duo", "Send files between nearby devices — no account, no cloud", "splits-full", 24, null, 5230000, 720],
  ["Lingua Loop", "com.aurora.lingualoop", "dev_aurora", ["education"], 280, "book", "duo", "Spaced-repetition language learning in 10 minute loops", "universal", 21, null, 6110000, 800],
  ["Orbit Academy", "com.aurora.orbitacademy", "dev_aurora", ["education", "entertainment"], 230, "edu", "ring", "Interactive astronomy courses with a real sky engine", "splits-arm", 26, null, 830000, 260],
  ["Wavechat", "com.bitforge.wavechat", "dev_bitforge", ["communication", "social"], 320, "comm", "duo", "E2E-encrypted messaging that works over Wi-Fi mesh", "splits-full", 26, null, 3920000, 610],
  ["Campfire", "com.northwind.campfire", "dev_northwind", ["social"], 24, "social", "solid", "Small-group circles with voice rooms and shared notes", "splits-arm", 28, null, 1540000, 380],
  ["Chordcast", "com.bitforge.chordcast", "dev_bitforge", ["music"], 270, "music", "duo", "Lossless streaming with local-first caching and EQ", "splits-full", 26, null, 2650000, 520],
  ["Reelhouse", "com.copperleaf.reelhouse", "dev_copperleaf", ["video", "entertainment"], 350, "video", "solid", "A cozy cinema client for your own media shelves", "splits-arm", 29, null, 1180000, 330],
  ["Lumenframe", "com.northwind.lumenframe", "dev_northwind", ["photography"], 46, "photo", "duo", "RAW editor with film-grade tone curves, fully offline", "splits-full", 26, null, 2290000, 570],
  ["Pulsepath", "com.aurora.pulsepath", "dev_aurora", ["health"], 2, "health", "ring", "Heart-rate guided running plans and recovery tracking", "splits-arm", 26, null, 990000, 290],
  ["Wayfare", "com.hexline.wayfare", "dev_hexline", ["travel"], 215, "travel", "duo", "Offline maps and trip boards for slow travel", "splits-full", 24, null, 1720000, 450],
  ["Themecraft", "com.bitforge.themecraft", "dev_bitforge", ["personalization"], 290, "pers", "duo", "Icon packs, wallpapers and widgets that compose themselves", "universal", 26, null, 3140000, 640],
  ["Fileharbor", "com.kaisel.fileharbor", "dev_kaisel", ["utilities", "tools"], 100, "util", "solid", "A calm, honest file manager with checksum tools built in", "splits-full", 24, null, 4460000, 760],
  ["Batterysmith", "com.kaisel.batterysmith", "dev_kaisel", ["utilities"], 80, "bolt", "ring", "Charge-limit scheduling and battery wear insights", "universal", 23, 33, 2080000, 700],
];

const CHANGELOGS = [
  "Faster cold start and lower memory use on mid-range devices.",
  "New split-APK delivery: smaller downloads per device.",
  "Fixed a crash when resuming from background on Android 14.",
  "Refreshed onboarding, added per-app language picker.",
  "Security hardening pass; all native libs rebuilt with stack protector.",
  "Download manager rewritten — resume support and SHA-256 checks.",
];

const REVIEW_NAMES = ["Mara J.", "Tobias R.", "Priya K.", "Jonas W.", "Elif A.", "Marcus T.", "Ines P.", "Dario M.", "Hana S.", "Leo F.", "Amina B.", "Piotr Z.", "Sofia L.", "Kenji O.", "Nora V.", "Sam D."];
const REVIEW_BODIES = [
  ["Does exactly what it says", "Installed via split APKs — download was tiny and it just works. No ads, no nonsense."],
  ["Solid update cycle", "Devs push fixes fast. The version history here is transparent, which I appreciate."],
  ["Great, small quirk", "Love it. Occasionally the sync hiccups on hotel Wi-Fi but a restart fixes it."],
  ["Replaced two apps for me", "Clean UI, respects battery, and the permissions list is refreshingly short."],
  ["Good but wants more themes", "Core features are excellent. Would love deeper personalization options."],
  ["Privacy done right", "Checked the manifest — no tracker permissions I didn't expect. Rare these days."],
  ["Crash on old tablet", "Works great on my phone but crashes on a 2018 tablet. Devs replied same day."],
  ["Best in category", "Tried every alternative on Kaisel. This one feels the most finished."],
  ["Fast delivery, literal", "The device-matched download finished in seconds. SHA matched, installed clean."],
  ["Decent, needs offline mode", "Mostly smooth. Offline support would make it a five star for me."],
];

function buildSeeds(): DbShape {
  const applications: Application[] = [];
  const versions: ApplicationVersion[] = [];
  const artifacts: Artifact[] = [];
  const jobs: ProcessingJob[] = [];
  const reviews: Review[] = [];
  const downloads: DownloadEvent[] = [];

  APP_SPECS.forEach((spec, ai) => {
    const [name, pkg, devId, cats, hue, glyph, style, tagline, profile, minSdk, maxSdk, baseDl, ageDays] = spec;
    const appId = "app_" + pkg.split(".").pop();
    const created = now - ageDays * DAY;
    const rnd = mulberry32(hashStr(pkg));
    const permKeys = Object.keys(PERM_POOL);
    const perms = Array.from({ length: 3 + Math.floor(rnd() * 4) }, (_, i) => {
      const k = permKeys[Math.floor(rnd() * permKeys.length)];
      return { name: "android.permission." + k, purpose: PERM_POOL[k] };
    }).filter((p, i, arr) => arr.findIndex((x) => x.name === p.name) === i);

    applications.push({
      id: appId, packageName: pkg, name, tagline, developerId: devId, categoryIds: cats,
      description: [
        `${name} — ${tagline.toLowerCase()}.`,
        `Built by ${DEVELOPERS.find((d) => d.id === devId)?.name ?? "its team"} with device efficiency in mind: Kaisel Store delivers a build matched to your exact ABI and screen density, so you never download code your device can't run.`,
        `The app ships with reproducible builds, an auditable permission set, and full version history. Everything runs on your hardware; your data stays yours.`,
      ],
      features: [
        "Device-targeted delivery (ABI + density matched)",
        "Offline-first core",
        "SHA-256 verified artifacts",
        "No third-party ad trackers",
      ],
      whatsNew: CHANGELOGS[ai % CHANGELOGS.length] + " " + CHANGELOGS[(ai + 3) % CHANGELOGS.length],
      icon: { hue, glyph, style },
      status: "approved", featured: false,
      createdAt: created, updatedAt: now - Math.floor(rnd() * 20) * DAY,
      baseDownloads: baseDl, permissions: perms,
      screenshots: Array.from({ length: 4 }, (_, i) => ({ id: `${appId}_s${i}`, variant: i, label: ["Home", "Detail", "Insights", "Settings"][i] })),
    });

    // --- versions: 2–3 per app, latest is "ready" ---
    const versionCount = 2 + (ai % 2);
    const latestCode = 40 + ai * 3 + Math.floor(rnd() * 20);
    for (let v = 0; v < versionCount; v++) {
      const isLatest = v === versionCount - 1;
      const code = latestCode - (versionCount - 1 - v) * (2 + (ai % 3));
      const vId = `${appId}_v${code}`;
      const released = now - Math.floor(rnd() * 30 + (versionCount - 1 - v) * 90) * DAY;
      versions.push({
        id: vId, applicationId: appId,
        versionName: `${1 + Math.floor(code / 20)}.${code % 20}.${v}`,
        versionCode: code, minSdk, targetSdk: Math.min(35, 30 + (ai % 6)),
        changelog: CHANGELOGS[(ai + v) % CHANGELOGS.length],
        releasedAt: released, status: "ready",
        signingFingerprint: hexFromSeed(pkg + ":cert", 64).toUpperCase(),
        jobId: `job_seed_${appId}_${code}`,
      });

      const baseSize = Math.floor((6 + rnd() * 26) * 1024 * 1024);
      const push = (a: Omit<Artifact, "id" | "applicationId" | "versionId" | "packageName" | "versionCode" | "versionName" | "createdAt" | "status" | "source" | "sampleBytes" | "filePath" | "sha256"> & { fileSize: number }) => {
        const artId = `art_${appId}_${code}_${a.splitName ?? "uni"}`;
        artifacts.push({
          ...a, id: artId, applicationId: appId, versionId: vId, packageName: pkg,
          versionCode: code, versionName: `${1 + Math.floor(code / 20)}.${code % 20}.${v}`,
          filePath: `/vault/${pkg}/${code}/${artId}${a.artifactType === "aab" ? ".aab" : ".apk"}`,
          sampleBytes: sampleBytesFor(a.fileSize),
          sha256: "", source: "seed", status: "available", createdAt: released,
        } as Artifact);
      };
      const common = { minSdk, maxSdk, features: [] as string[], glVersion: null as string | null };

      if (isLatest) {
        if (profile === "universal") {
          push({ artifactType: "universal-apk", splitName: null, abi: ["universal"], density: null, ...common, fileSize: baseSize });
        } else if (profile === "arm64-only") {
          push({ artifactType: "split-apk", splitName: "base", abi: ["universal"], density: null, ...common, fileSize: Math.floor(baseSize * 0.55) });
          push({ artifactType: "split-apk", splitName: "config.arm64_v8a", abi: ["arm64-v8a"], density: null, ...common, fileSize: Math.floor(baseSize * 0.4) });
        } else {
          push({ artifactType: "split-apk", splitName: "base", abi: ["universal"], density: null, ...common, fileSize: Math.floor(baseSize * 0.5) });
          push({ artifactType: "split-apk", splitName: "config.arm64_v8a", abi: ["arm64-v8a"], density: null, ...common, fileSize: Math.floor(baseSize * 0.28) });
          if (profile === "splits-full" || profile === "splits-arm")
            push({ artifactType: "split-apk", splitName: "config.armeabi_v7a", abi: ["armeabi-v7a"], density: null, ...common, fileSize: Math.floor(baseSize * 0.26) });
          if (profile === "splits-full")
            push({ artifactType: "split-apk", splitName: "config.x86_64", abi: ["x86_64"], density: null, ...common, fileSize: Math.floor(baseSize * 0.3) });
          push({ artifactType: "split-apk", splitName: "config.xxhdpi", abi: ["universal"], density: 480, ...common, fileSize: Math.floor(baseSize * 0.16) });
          push({ artifactType: "split-apk", splitName: "config.xhdpi", abi: ["universal"], density: 320, ...common, fileSize: Math.floor(baseSize * 0.13) });
          if (profile === "splits-full" && ai % 2 === 0)
            push({ artifactType: "universal-apk", splitName: null, abi: ["universal"], density: null, ...common, fileSize: baseSize });
        }
        if (ai % 3 === 0)
          push({ artifactType: "aab", splitName: null, abi: ["universal"], density: null, ...common, fileSize: Math.floor(baseSize * 1.15) });
      } else {
        push({ artifactType: "universal-apk", splitName: null, abi: ["universal"], density: null, ...common, fileSize: baseSize });
      }

      jobs.push({
        id: `job_seed_${appId}_${code}`, applicationId: appId, versionId: vId,
        fileName: `${appId}-${code}.${isLatest && profile !== "universal" ? "aab" : "apk"}`,
        fileKind: isLatest && profile !== "universal" ? "aab" : "apk",
        fileSize: baseSize, state: "READY", progress: 100,
        logs: [
          { t: released, level: "info", msg: `Artifact ${appId}-${code}.${profile !== "universal" && isLatest ? "aab" : "apk"} received into intake vault` },
          { t: released + 400, level: "ok", msg: "Container signature valid · ZIP structure parsed" },
          { t: released + 900, level: "info", msg: `Manifest parsed · minSdk ${minSdk} · targetSdk ${Math.min(35, 30 + (ai % 6))}` },
          ...(isLatest && profile !== "universal"
            ? [
                { t: released + 1400, level: "info" as const, msg: "AabExpander: generating device APK set from bundle" },
                { t: released + 2100, level: "ok" as const, msg: "APK set stored · compatibility index rebuilt" },
              ]
            : [{ t: released + 1300, level: "ok" as const, msg: "Universal APK registered · compatibility index rebuilt" }]),
        ],
        bundletool: "embedded", createdAt: released, finishedAt: released + 2600,
      });
    }

    // --- reviews ---
    const rc = 6 + Math.floor(rnd() * 9);
    for (let r = 0; r < rc; r++) {
      const pick = REVIEW_BODIES[Math.floor(rnd() * REVIEW_BODIES.length)];
      const skew = rnd();
      const rating = skew > 0.82 ? 3 + Math.floor(rnd() * 2) : 4 + Math.floor(rnd() * 2);
      reviews.push({
        id: `rev_${appId}_${r}`, applicationId: appId,
        uid: `seed_user_${Math.floor(rnd() * 50)}`,
        userName: REVIEW_NAMES[Math.floor(rnd() * REVIEW_NAMES.length)],
        rating, title: pick[0], body: pick[1],
        helpful: Math.floor(rnd() * 90), hidden: false,
        createdAt: now - Math.floor(rnd() * 120) * DAY,
      });
    }
  });

  // --- featured ---
  const featured: FeaturedEntry[] = [
    { applicationId: "app_riftracers", position: 1 },
    { applicationId: "app_lumenframe", position: 2 },
    { applicationId: "app_chordcast", position: 3 },
  ];
  const art: Record<string, [string, string]> = {
    app_riftracers: ["https://image.qwenlm.ai/generated-images/6853ae4e-2414-4770-a306-aa1e8cf5caf4/_result.png", "The dune-shattering racer, rebuilt for every ABI."],
    app_lumenframe: ["https://image.qwenlm.ai/generated-images/da788b2e-8258-404d-bd39-1af61efd8b89/_result.png", "Film-grade RAW editing, delivered density-perfect."],
    app_chordcast: ["https://image.qwenlm.ai/generated-images/7daa768a-33ed-4a3c-9ff8-9b45e6088b40/_result.png", "Lossless audio with device-matched native codecs."],
  };
  for (const f of featured) {
    const a = applications.find((x) => x.id === f.applicationId);
    if (a && art[f.applicationId]) { a.featured = true; a.featuredArt = art[f.applicationId][0]; a.featuredBlurb = art[f.applicationId][1]; }
  }

  // --- download events ---
  const devNames = ["Pixel 9 Pro", "Galaxy S23", "Kaisel K1", "Nova A3", "x86 Emulator"];
  for (let i = 0; i < 42; i++) {
    const a = applications[Math.floor(mulberry32(i * 7 + 3)() * applications.length)];
    const lat = versions.filter((v) => v.applicationId === a.id).sort((x, y) => y.versionCode - x.versionCode)[0];
    const arts = artifacts.filter((x) => x.versionId === lat.id && x.status === "available");
    const pickArt = arts[Math.floor(mulberry32(i * 13 + 1)() * arts.length)];
    downloads.push({
      id: `dl_seed_${i}`, sessionId: `sess_seed_${i}`, artifactId: pickArt.id,
      applicationId: a.id, versionCode: lat.versionCode,
      uid: i % 3 === 0 ? "u_sam" : null,
      deviceLabel: devNames[i % devNames.length],
      bytes: pickArt.sampleBytes, sha256: "computed by vault", verified: true,
      at: now - Math.floor(mulberry32(i + 99)() * 6 * DAY),
    });
  }
  downloads.sort((a, b) => b.at - a.at);

  // --- installed library (drives Updates) ---
  const installedPkgs = ["com.northwind.tidalnotes", "com.bitforge.wavechat", "com.northwind.airshare", "com.aurora.lingualoop", "com.hexline.vaultkey", "com.kaisel.fileharbor", "com.bitforge.chordcast", "com.copperleaf.riftracers", "com.northwind.ledgerly"];
  const installed: InstalledApp[] = installedPkgs.map((pkg, i) => {
    const a = applications.find((x) => x.packageName === pkg)!;
    const vs = versions.filter((v) => v.applicationId === a.id).sort((x, y) => x.versionCode - y.versionCode);
    const v = vs[Math.max(0, vs.length - 2)]; // one behind latest
    return { packageName: pkg, versionCode: v.versionCode, versionName: v.versionName, installedAt: now - (30 + i * 12) * DAY };
  });

  const users: User[] = [
    { uid: "u_sam", email: "sam@postbox.dev", displayName: "Sam Reyes", role: "user", provider: "password", avatarHue: 210, createdAt: now - 200 * DAY },
    { uid: "u_rin", email: "rin@northwind.dev", displayName: "Rin Halden", role: "developer", provider: "password", avatarHue: 222, createdAt: now - 400 * DAY },
    { uid: "u_ops", email: "ops@kaisel.store", displayName: "Kaisel Ops", role: "admin", provider: "password", avatarHue: 262, createdAt: now - 800 * DAY },
  ];

  const reports: AppReport[] = [
    { id: "rep_1", applicationId: "app_batterysmith", reason: "Bug report", detail: "Charge limit toggle resets after reboot on Android 13.", reporter: "sam@postbox.dev", status: "open", createdAt: now - 2 * DAY },
    { id: "rep_2", applicationId: "app_dunedrifters", reason: "Misleading metadata", detail: "Screenshots show a mode that is now paid.", reporter: "anon", status: "open", createdAt: now - 5 * DAY },
    { id: "rep_3", applicationId: "app_themecraft", reason: "Other", detail: "Requesting dark icon pack variant.", reporter: "tobias@example.com", status: "dismissed", createdAt: now - 9 * DAY },
  ];

  const detected = detectBrowserProfile();
  const devices: DeviceProfile[] = [detected, ...DEVICE_PRESETS];

  return {
    v: 4, users, developers: DEVELOPERS, categories: CATEGORIES,
    applications, versions, artifacts, jobs, reviews, downloads,
    devices, currentDeviceId: "detected", installed, featured, reports,
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
      if (parsed.v === 4) {
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
