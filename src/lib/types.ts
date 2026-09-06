/* ============================================================
   Kaisel Store — shared domain types
   Mirrors the PostgreSQL schema in /database/schema.sql so a
   future Android client + Node backend can reuse the same DTOs.
   ============================================================ */

export type Role = "user" | "developer" | "admin";

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  provider: "password" | "google";
  avatarHue: number;
  createdAt: number;
}

export interface Developer {
  id: string;
  userId: string;
  name: string;
  slug: string;
  bio: string;
  website: string;
  country: string;
  verified: boolean;
  hue: number;
  joinedAt: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  hue: number;
  glyph: string;
}

export interface AppIconSpec {
  hue: number;
  glyph: string;
  style: "duo" | "solid" | "ring";
  url?: string; // developer-uploaded icon (data URL); procedural tile is the fallback
}

export interface ScreenshotSpec {
  id: string;
  variant: number; // index into the store's generated preview renderer
  label: string;
}

export interface AppPermission {
  name: string;
  purpose: string;
}

export type AppStatus = "approved" | "pending" | "rejected" | "disabled";

export interface Application {
  id: string;
  packageName: string;
  name: string;
  tagline: string;
  developerId: string;
  categoryIds: string[];
  description: string[];
  features: string[];
  whatsNew: string;
  icon: AppIconSpec;
  status: AppStatus;
  featured: boolean;
  featuredArt?: string;
  featuredBlurb?: string;
  createdAt: number;
  updatedAt: number;
  baseDownloads: number;
  permissions: AppPermission[];
  screenshots: ScreenshotSpec[];       // generated previews (always present)
  screenshotUrls?: string[];           // developer-uploaded screenshots take precedence
}

export type VersionStatus = "processing" | "ready" | "failed" | "removed";

export interface ApplicationVersion {
  id: string;
  applicationId: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  targetSdk: number;
  changelog: string;
  releasedAt: number;
  status: VersionStatus;
  jobId?: string;
  signingFingerprint: string; // SHA-256 of the APK signing certificate (hex)
}

export type ArtifactType = "apk" | "aab" | "universal-apk" | "split-apk";
export type ArtifactSource = "upload" | "seed" | "derived";
export type ArtifactStatus = "available" | "generating" | "failed";

export interface Artifact {
  id: string;
  applicationId: string;
  versionId: string;
  packageName: string;
  versionCode: number;
  versionName: string;
  artifactType: ArtifactType;
  splitName: string | null; // 'base' | 'config.arm64_v8a' | 'config.xxhdpi' ...
  abi: string[]; // ["universal"] or ["arm64-v8a"]
  minSdk: number;
  maxSdk: number | null;
  density: number | null; // null = any density
  features: string[];
  glVersion: string | null;
  filePath: string; // internal vault path — never exposed by the API
  fileSize: number; // declared artifact size (metadata)
  sampleBytes: number; // bytes actually stored/served by the local vault
  sha256: string; // SHA-256 over the served payload
  source: ArtifactSource;
  status: ArtifactStatus;
  createdAt: number;
}

export type JobState =
  | "UPLOADED"
  | "PROCESSING"
  | "ANALYZING"
  | "GENERATING_ARTIFACTS"
  | "READY"
  | "FAILED"
  | "REJECTED";

export interface JobLog {
  t: number;
  level: "info" | "ok" | "warn" | "error";
  msg: string;
}

export interface ProcessingJob {
  id: string;
  applicationId: string;
  versionId: string;
  fileName: string;
  fileKind: "apk" | "aab" | "apks" | "unknown";
  fileSize: number;
  state: JobState;
  progress: number; // 0..100
  logs: JobLog[];
  bundletool: "embedded" | "native";
  createdAt: number;
  finishedAt?: number;
}

export interface Review {
  id: string;
  applicationId: string;
  uid: string;
  userName: string;
  rating: number; // 1..5
  title: string;
  body: string;
  helpful: number;
  hidden: boolean;
  createdAt: number;
  editedAt?: number;
}

export interface DownloadEvent {
  id: string;
  sessionId: string; // groups split-APK sets of one install session
  artifactId: string;
  applicationId: string;
  versionCode: number;
  uid: string | null;
  deviceLabel: string;
  bytes: number;
  sha256: string;
  verified: boolean | null;
  at: number;
}

export type FormFactor = "phone" | "tablet" | "foldable" | "dual-screen" | "rollable" | "desktop";
export type PerfTier = "go" | "low" | "mid" | "high" | "flagship";

export interface DeviceProfile {
  id: string;
  label: string;
  manufacturer: string;
  model: string;
  androidApi: number;
  androidVersion: string;
  abi: string;
  density: number;
  screenWidth: number;
  screenHeight: number;
  supportedFeatures: string[];
  glVersion?: string;
  detected?: boolean;
  /* extended device intelligence */
  variant?: string;
  formFactor?: FormFactor;
  gpu?: string;
  cores?: number;
  ramGB?: number;
  tier?: PerfTier;
  oemSkin?: string;
  connectivity?: string[];  // NFC, Bluetooth, UWB, 5G, Wi-Fi 6E…
  sensors?: string[];       // accelerometer, gyroscope, barometer, magnetometer…
  biometrics?: string;      // platform authenticator capability
  batteryProfile?: string;  // OEM power-management note
  aspect?: string;          // e.g. "19.5:9"
  detectionLog?: string[];  // how each fact was determined
}

export interface InstalledApp {
  packageName: string;
  versionCode: number;
  versionName: string;
  installedAt: number;
}

export interface FeaturedEntry {
  applicationId: string;
  position: number;
}

export interface AppReport {
  id: string;
  applicationId: string;
  reason: string;
  detail: string;
  reporter: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: number;
}

/* ---------- API DTOs ---------- */

export interface CompatibleArtifactResult {
  compatible: boolean;
  applicationId: string;
  packageName: string;
  version: ApplicationVersion | null;
  artifacts: Artifact[];
  installationType: "apk" | "split-set" | "none";
  totalBytes: number;
  reasons: string[];
  downloadUrl: string | null; // signed, temporary
}

export interface UpdateCheckResult {
  packageName: string;
  updateAvailable: boolean;
  installedVersion: number;
  latestVersion: number;
  versionName: string | null;
  artifactCount: number;
  totalBytes: number;
  changelog: string | null;
}

export interface SearchQuery {
  q?: string;
  category?: string;
  minRating?: number;
  compatibleOnly?: boolean;
  sort?: "popular" | "downloads" | "newest" | "rating";
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  items: Application[];
  total: number;
  page: number;
  pageSize: number;
  tookMs: number;
}

export interface ApiRequestLog {
  at: number;
  method: string;
  path: string;
  status: number;
  ms: number;
}

export interface DbShape {
  v: number;
  users: User[];
  developers: Developer[];
  categories: Category[];
  applications: Application[];
  versions: ApplicationVersion[];
  artifacts: Artifact[];
  jobs: ProcessingJob[];
  reviews: Review[];
  downloads: DownloadEvent[];
  devices: DeviceProfile[];
  currentDeviceId: string;
  installed: InstalledApp[];
  featured: FeaturedEntry[];
  reports: AppReport[];
}

export const ABIS = ["arm64-v8a", "armeabi-v7a", "x86", "x86_64"] as const;
export const DENSITIES = [120, 160, 240, 320, 420, 480, 560, 640] as const;
export const SDK_NAMES: Record<number, string> = {
  21: "Android 5.0", 23: "Android 6.0", 24: "Android 7.0", 26: "Android 8.0",
  28: "Android 9", 29: "Android 10", 30: "Android 11", 31: "Android 12",
  33: "Android 13", 34: "Android 14", 35: "Android 15", 36: "Android 16",
};
