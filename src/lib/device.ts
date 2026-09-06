import type { DeviceProfile, FormFactor, PerfTier } from "./types";

/* ============================================================
   Kaisel Device Intelligence
   ------------------------------------------------------------
   Layer 1 — automatic fingerprinting of the visiting device:
     · UA Client Hints (high entropy: model, arch, bitness)
     · user-agent parsing (Android version, model, manufacturer)
     · WebGL renderer/vendor → GPU / SoC family
     · navigator.hardwareConcurrency / deviceMemory → perf tier
     · screen metrics + DPR → density bucket & aspect ratio
     · viewport segments → dual-screen / foldable form factors
     · WebAuthn → platform biometric authenticator
     · Battery / Network Information APIs → power & connectivity
     · short sensor probes → accelerometer / gyroscope
     · OEM-skin inference from model prefix / brand tokens
   Layer 2 — a searchable hardware matrix (desktop flow):
     pick an exact model + variant, Kaisel generates the build
     for it. Every value can be replaced by a real profile the
     Android client registers via POST /api/device/profile.
   ============================================================ */

const API_BY_VERSION: Record<string, number> = {
  "5.0": 21, "5.1": 22, "6.0": 23, "7.0": 24, "7.1": 25, "8.0": 26, "8.1": 27,
  "9": 28, "10": 29, "11": 30, "12": 31, "13": 33, "14": 34, "15": 35, "16": 36,
};

const FOLDABLE_MODELS = ["SM-F9", "SM-F7", "SM-F5", "SM-W2", "Pixel Fold", "Find N", "Find N2", "Find N3", "Magic V", "Magic Vs", "razr", "X Fold", "Mate X", "Mate XT", "MIX Fold", "Tecno Phantom V"];
const DUAL_MODELS = ["Surface Duo", "LG V50", "LG V60", "LG G8X"];

export function densityLabel(d: number): string {
  if (d >= 640) return `${d} dpi · xxxhdpi`;
  if (d >= 560) return `${d} dpi · xxhdpi+`;
  if (d >= 480) return `${d} dpi · xxhdpi`;
  if (d >= 420) return `${d} dpi · FHD+`;
  if (d >= 320) return `${d} dpi · xhdpi`;
  if (d >= 240) return `${d} dpi · hdpi`;
  return `${d} dpi · mdpi`;
}

export function aspectOf(w: number, h: number): string {
  const r = Math.max(w, h) / Math.max(1, Math.min(w, h));
  const candidates: [number, string][] = [[2.22, "20:9"], [2.17, "19.5:9"], [2.11, "19:9"], [2, "18:9"], [1.85, "16.7:9"], [1.78, "16:9"], [1.6, "16:10"], [1.5, "3:2"], [1.43, "10:7"], [1.33, "4:3"]];
  let best = candidates[0];
  for (const c of candidates) if (Math.abs(c[0] - r) < Math.abs(best[0] - r)) best = c;
  return best[1];
}

function nearestDensity(dpr: number): number {
  const buckets = [120, 160, 240, 320, 420, 480, 560, 640];
  const dpi = dpr * 160;
  return buckets.reduce((a, b) => (Math.abs(b - dpi) < Math.abs(a - dpi) ? b : a));
}

function inferOem(model: string, manufacturer: string, ua: string): { skin: string; battery: string } | null {
  const m = (manufacturer + " " + model + " " + ua).toUpperCase();
  if (/SAMSUNG|(^|\s)SM-/.test(m)) return { skin: "One UI", battery: "Adaptive battery + App Power Monitoring — background installs can be deferred; keep the store un-optimized." };
  if (/XIAOMI|REDMI|POCO|(^|\s)M2[0-9]{3}|MIUI|HYPEROS/.test(m)) return { skin: "HyperOS / MIUI", battery: "Aggressive task killing (battery saver) — install prompts may need a foreground nudge." };
  if (/ONEPLUS|(^|\s)(KB|LE|IN|NE|CPH2[0-9]{3})[0-9]*\s|OXYGENOS/.test(m)) return { skin: "OxygenOS", battery: "Deep optimization list — newly installed packages may start restricted until first launch." };
  if (/(^|\s)CPH|OPPO|COLOROS|REALME|(^|\s)RMX/.test(m)) return { skin: /REALME|RMX/.test(m) ? "realme UI" : "ColorOS", battery: "Smart power scenes may pause package verification on idle." };
  if (/(^|\s)V2[0-9]{3}|VIVO|IQOO|FUNTOUCH|ORIGINOS/.test(m)) return { skin: "Funtouch OS / OriginOS", battery: "High-refresh + power profiles can delay background hash verification." };
  if (/MOTOROLA|(^|\s)MOTO\s|(^|\s)XT[0-9]{4}/.test(m)) return { skin: "My UX (near-stock)", battery: "Near-stock power policy; standard install behaviour." };
  if (/ASUS|ROG|(^|\s)(ZS|AI2[0-9]{3})[0-9]*/.test(m)) return { skin: manufacturer.toUpperCase().includes("ROG") ? "ROG UI" : "ZenUI", battery: "Gaming profiles pin CPU clocks — sustained hash computation may throttle." };
  if (/GOOGLE|PIXEL/.test(m)) return { skin: "Stock Android (Pixel)", battery: "Adaptive battery only; predictable installer behaviour." };
  if (/LINEAGE|PIXELEXPERIENCE|EVOLUTIONX|CALYXOS|GRAPHENEOS/.test(m)) return { skin: "Custom ROM", battery: "ROM-defined power policy; verify installer intents are granted." };
  return null;
}

export function detectBrowserProfile(): DeviceProfile {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isAndroid = /Android/i.test(ua);
  const verMatch = ua.match(/Android\s+([\d.]+)/i);
  const androidVersion = verMatch ? verMatch[1] : isAndroid ? "14" : "—";
  const api = isAndroid && verMatch ? API_BY_VERSION[verMatch[1].split(".").slice(0, 2).join(".")] ?? 34 : 34;

  let abi = "arm64-v8a";
  if (/x86_64|x64|Win64|Intel/i.test(ua) && !isAndroid) abi = "x86_64";
  else if (/Macintosh|iPhone|iPad/.test(ua)) abi = "arm64-v8a";
  else if (isAndroid && /armv7|; ALE-|SM-G3/i.test(ua)) abi = "armeabi-v7a";

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2;
  const sw = typeof screen !== "undefined" ? screen.width : 1080;
  const sh = typeof screen !== "undefined" ? screen.height : 2400;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";

  let model = "device";
  let manufacturer = "Unknown";
  const modelMatch = ua.match(/;\s?([A-Za-z0-9][\w\- ]{2,24})\s?Build\//);
  if (isAndroid && modelMatch) {
    model = modelMatch[1].trim();
    manufacturer = model.startsWith("SM-") ? "Samsung" : model.startsWith("Pixel") ? "Google" : /^(Mi |Redmi|POCO|M2)/.test(model) ? "Xiaomi" : /^(KB|LE|IN|NE)/.test(model) ? "OnePlus" : model.startsWith("CPH") ? "OPPO" : model.startsWith("RMX") ? "Realme" : /^V2[0-9]/.test(model) ? "vivo" : model.startsWith("moto") || model.startsWith("XT") ? "Motorola" : "OEM";
  } else if (/iPhone/.test(ua)) { model = "iPhone"; manufacturer = "Apple"; }
  else if (/iPad/.test(ua)) { model = "iPad"; manufacturer = "Apple"; }
  else if (/Windows/.test(ua)) { model = "Windows PC"; manufacturer = "Desktop"; }
  else if (/Mac OS/.test(ua)) { model = "Mac"; manufacturer = "Apple"; }
  else if (/Linux/.test(ua)) { model = "Linux PC"; manufacturer = "Desktop"; }

  const coarse = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  const formFactor: FormFactor = !isAndroid && !/iPhone|iPad/.test(ua) ? "desktop"
    : DUAL_MODELS.some((d) => model.includes(d)) ? "dual-screen"
    : FOLDABLE_MODELS.some((f) => model.includes(f)) ? "foldable"
    : (coarse && Math.min(sw, sh) / Math.max(sw, sh) > 0.62 && sw * dpr > 1500) ? "tablet" : "phone";

  const oem = inferOem(model, manufacturer, ua);
  const cores = (navigator as any).hardwareConcurrency ?? 8;
  const ramGB = (navigator as any).deviceMemory ?? 8;

  return {
    id: "detected", label: isAndroid || /iPhone|iPad/.test(ua) ? `${manufacturer} ${model}` : `${model} · ${browser}`,
    manufacturer, model, androidApi: isAndroid ? api : 35, androidVersion: isAndroid ? androidVersion : "—",
    abi, density: nearestDensity(dpr), screenWidth: Math.round(sw * dpr), screenHeight: Math.round(sh * dpr),
    supportedFeatures: [], glVersion: "OpenGL ES 3.2", detected: true,
    formFactor, cores, ramGB, variant: undefined,
    oemSkin: oem?.skin ?? (isAndroid ? "Stock Android" : undefined),
    batteryProfile: oem?.battery,
    aspect: aspectOf(Math.round(sw * dpr), Math.round(sh * dpr)),
    detectionLog: [`user-agent → ${isAndroid ? `Android ${androidVersion} (API ${api})` : browser + " · non-Android"}`],
  };
}

/* ---------- deep fingerprinting (async, staged) ---------- */

export interface DeepScanResult { profile: DeviceProfile; log: { msg: string; ok: boolean }[] }

const probe = <T,>(fn: () => T | Promise<T>, ms = 1200): Promise<T | null> =>
  Promise.race([Promise.resolve().then(fn), new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);

export async function refineDetectedProfile(base: DeviceProfile, onStep?: (msg: string, ok: boolean) => void): Promise<DeviceProfile> {
  const p: DeviceProfile = { ...base, detectionLog: [...(base.detectionLog ?? [])] };
  const log = (msg: string, ok = true) => { p.detectionLog!.push(msg); onStep?.(msg, ok); };
  const nav = navigator as any;

  /* 1 — UA client hints */
  const uad = nav.userAgentData;
  if (uad?.getHighEntropyValues) {
    const h: any = await probe(() => uad.getHighEntropyValues(["platform", "platformVersion", "model", "architecture", "bitness", "fullVersionList"]), 900);
    if (h) {
      if (h.model) { p.model = h.model; p.label = `${p.manufacturer} ${h.model}`; p.manufacturer = p.manufacturer === "Unknown" ? (h.brand || p.manufacturer) : p.manufacturer; log(`client hints → model “${h.model}”`); }
      if (h.architecture) {
        p.abi = h.architecture.includes("arm") ? (h.bitness === "64" ? "arm64-v8a" : "armeabi-v7a") : h.architecture.includes("x86") ? (h.bitness === "64" ? "x86_64" : "x86") : p.abi;
        log(`client hints → ${h.architecture}${h.bitness ? " (" + h.bitness + "-bit)" : ""} ⇒ ${p.abi}`);
      }
      if (h.platformVersion && /Android/i.test(uad.platform ?? "")) {
        const major = parseInt(h.platformVersion, 10);
        if (!isNaN(major)) { p.androidApi = major + 20; p.androidVersion = String(major); log(`client hints → Android platform v${major} ⇒ API ${p.androidApi}`); }
      }
    } else log("client hints refused — fell back to user-agent", false);
  } else log("client hints unsupported — user-agent heuristics only", false);

  /* 2 — GPU via WebGL */
  const gpu = await probe(() => {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  });
  if (gpu) {
    p.gpu = gpu.replace(/ANGLE \(.*?\)\s*/, "").replace(/\s*\(0x[0-9A-F]+\)/gi, "").trim();
    const soc = /Adreno/.test(gpu) ? "Snapdragon" : /Mali|Immortalis|Valhall/.test(gpu) ? "MediaTek / Exynos (Mali)" : /PowerVR/.test(gpu) ? "MediaTek (PowerVR)" : /Apple GPU/.test(gpu) ? "Apple Silicon" : /Radeon|AMD/.test(gpu) ? "AMD" : /Intel|Iris|UHD|Arc/.test(gpu) ? "Intel" : /NVIDIA|GeForce/.test(gpu) ? "NVIDIA" : "GPU";
    log(`WebGL renderer → ${p.gpu} (${soc})`);
  } else log("GPU renderer masked by browser", false);

  /* 3 — compute class */
  if (p.cores || p.ramGB) log(`compute → ${p.cores ?? "?"} cores · ${p.ramGB ?? "?"} GB RAM class`);

  /* 4 — biometrics (WebAuthn platform authenticator) */
  const bio = await probe(() => (window as any).PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.(), 900);
  if (bio === true) { p.biometrics = "Platform authenticator present (fingerprint / face unlock usable for app installs)"; log("WebAuthn → platform biometric authenticator available"); }
  else if (bio === false) { p.biometrics = "No platform authenticator exposed"; log("WebAuthn → no platform biometric authenticator", false); }

  /* 5 — connectivity */
  const conn: string[] = [];
  if ("NDEFReader" in window) conn.push("NFC");
  if ("bluetooth" in nav) conn.push("Bluetooth LE");
  if ("serial" in nav) conn.push("USB-serial");
  const net = nav.connection;
  if (net) {
    if (net.effectiveType) conn.push(net.effectiveType.toUpperCase());
    if (net.type === "cellular") conn.push("cellular data");
    if (net.type === "wifi") conn.push("Wi-Fi");
    log(`network info → ${conn.join(" · ") || "unknown"}`);
  }
  p.connectivity = conn.length ? conn : ["Wi-Fi (assumed)"];

  /* 6 — sensor probes (short listeners) */
  const sensors: string[] = [];
  const motionSeen = await probe(() => new Promise<boolean>((res) => {
    let got = false;
    const fn = () => { got = true; };
    window.addEventListener("devicemotion", fn);
    window.addEventListener("deviceorientation", fn);
    setTimeout(() => { window.removeEventListener("devicemotion", fn); window.removeEventListener("deviceorientation", fn); res(got); }, 450);
  }), 900);
  if (motionSeen) { sensors.push("accelerometer", "gyroscope"); log("sensor probe → accelerometer + gyroscope responding"); }
  if ("AmbientLightSensor" in window) sensors.push("ambient light");
  if ("Barometer" in window || /barometer/i.test(nav.userAgent ?? "")) sensors.push("barometer");
  p.sensors = sensors;
  if (!sensors.length) log("sensor probe → no motion events in 450 ms (headless/desktop)", false);

  /* 7 — screen & form factor refinement */
  const segs = (window as any).visualViewport ? undefined : undefined;
  void segs;
  const dual = await probe(() => (window as any).getScreenDetails?.(), 700);
  if (dual && dual.screens?.length > 1) { p.formFactor = "dual-screen"; log(`screen details → ${dual.screens.length} physical screens (dual-screen device)`); }
  else if (FOLDABLE_MODELS.some((f) => p.model.includes(f))) log(`model list → ${p.model} is a known foldable`);
  const w = Math.max(p.screenWidth, p.screenHeight), h = Math.min(p.screenWidth, p.screenHeight);
  p.aspect = aspectOf(w, h);
  const inches = Math.sqrt(w * w + h * h) / p.density;
  if (p.formFactor !== "dual-screen" && p.formFactor !== "desktop") {
    if (p.formFactor === "foldable") log(`display → ${p.aspect} · foldable class (${inches.toFixed(1)}″ unfolded)`);
    else if (inches > 6.9) { p.formFactor = "tablet"; log(`display → ${inches.toFixed(1)}″ ⇒ classified tablet`); }
    else log(`display → ${p.aspect} · ~${inches.toFixed(1)}″ · ${p.density} dpi class`);
  }

  /* 8 — power profile */
  const batt = await probe(() => (nav.getBattery ? nav.getBattery() : null), 700) as any;
  if (batt) log(`battery → ${Math.round(batt.level * 100)}% ${batt.charging ? "· charging" : "· discharging"}`);

  /* 9 — performance tier */
  const ram = p.ramGB ?? 8, cores = p.cores ?? 8;
  const isAndroid = p.androidVersion !== "—";
  p.tier = !isAndroid ? (cores >= 8 && ram >= 16 ? "flagship" : "high")
    : ram <= 2 ? "go" : ram <= 4 ? (cores <= 6 ? "low" : "mid") : ram <= 8 ? (cores <= 8 ? "mid" : "high") : "flagship";
  if (p.tier === "go") p.batteryProfile = (p.batteryProfile ? p.batteryProfile + " " : "") + "Android Go class device — Kaisel prefers minimal split sets.";
  log(`performance tier → ${p.tier.toUpperCase()} (RAM ${ram} GB · ${cores} cores)`);

  /* 10 — OEM skin (re-infer with refined model) */
  const oem = inferOem(p.model, p.manufacturer, navigator.userAgent);
  if (oem) { p.oemSkin = oem.skin; p.batteryProfile = oem.battery + (p.tier === "go" ? " Android Go class — minimal splits preferred." : ""); log(`OEM inference → ${oem.skin} power policy`); }

  return p;
}

/* ---------- hardware matrix (desktop / explicit choice) ---------- */

export interface DeviceModelEntry {
  id: string;
  manufacturer: string;
  model: string;
  variant: string;
  api: number;
  abi: string;
  density: number;
  width: number;
  height: number;
  ramGB: number;
  cores: number;
  gpu: string;
  tier: PerfTier;
  formFactor: FormFactor;
  oemSkin: string;
  connectivity: string[];
  sensors: string[];
  biometrics: string;
}

const E = (id: string, manufacturer: string, model: string, variant: string, api: number, abi: string, density: number, w: number, h: number, ramGB: number, cores: number, gpu: string, tier: PerfTier, formFactor: FormFactor, oemSkin: string, connectivity: string[], sensors: string[], biometrics: string): DeviceModelEntry =>
  ({ id, manufacturer, model, variant, api, abi, density, width: w, height: h, ramGB, cores, gpu, tier, formFactor, oemSkin, connectivity, sensors, biometrics });

const STD = ["NFC", "Bluetooth LE", "Wi-Fi 6E", "5G"];
const FOLD_STD = ["NFC", "Bluetooth LE", "Wi-Fi 6E", "5G", "UWB"];

export const DEVICE_CATALOG: DeviceModelEntry[] = [
  E("px9pro", "Google", "Pixel 9 Pro", "Tensor G4 · 16 GB", 35, "arm64-v8a", 420, 1344, 2992, 16, 8, "Mali-G715 MC10", "flagship", "phone", "Stock Android (Pixel)", FOLD_STD, ["accelerometer", "gyroscope", "barometer", "magnetometer", "ambient light"], "Under-display fingerprint + face unlock"),
  E("px9", "Google", "Pixel 9", "Tensor G4 · 12 GB", 35, "arm64-v8a", 420, 1080, 2424, 12, 8, "Mali-G715", "high", "phone", "Stock Android (Pixel)", STD, ["accelerometer", "gyroscope", "barometer"], "Under-display fingerprint"),
  E("pxfold", "Google", "Pixel Fold", "Tensor G2 · 12 GB", 34, "arm64-v8a", 420, 2208, 1840, 12, 8, "Mali-G710 MP7", "flagship", "foldable", "Stock Android (Pixel)", FOLD_STD, ["accelerometer", "gyroscope", "barometer", "magnetometer"], "Side-mounted fingerprint"),
  E("px8a", "Google", "Pixel 8a", "Tensor G3 · 8 GB", 34, "arm64-v8a", 420, 1080, 2400, 8, 8, "Mali-G715", "mid", "phone", "Stock Android (Pixel)", STD, ["accelerometer", "gyroscope"], "Under-display fingerprint"),
  E("px7", "Google", "Pixel 7", "Tensor G2 · 8 GB", 33, "arm64-v8a", 420, 1080, 2400, 8, 8, "Mali-G710", "mid", "phone", "Stock Android (Pixel)", STD, ["accelerometer", "gyroscope", "barometer"], "Under-display fingerprint"),
  E("s24u", "Samsung", "Galaxy S24 Ultra", "Snapdragon 8 Gen 3", 35, "arm64-v8a", 560, 1440, 3120, 12, 8, "Adreno 750", "flagship", "phone", "One UI", [...STD, "UWB"], ["accelerometer", "gyroscope", "barometer", "magnetometer"], "Ultrasonic under-display + face"),
  E("s24u-ex", "Samsung", "Galaxy S24 Ultra", "Exynos 2400 variant", 35, "arm64-v8a", 560, 1440, 3120, 12, 10, "Xclipse 940 (RDNA 3)", "flagship", "phone", "One UI", [...STD, "UWB"], ["accelerometer", "gyroscope", "barometer"], "Ultrasonic under-display"),
  E("s24", "Samsung", "Galaxy S24", "Snapdragon 8 Gen 3", 35, "arm64-v8a", 480, 1080, 2340, 8, 8, "Adreno 750", "high", "phone", "One UI", STD, ["accelerometer", "gyroscope", "barometer"], "Ultrasonic under-display"),
  E("zf6", "Samsung", "Galaxy Z Fold 6", "Snapdragon 8 Gen 3", 35, "arm64-v8a", 420, 1856, 2160, 12, 8, "Adreno 750", "flagship", "foldable", "One UI", FOLD_STD, ["accelerometer", "gyroscope", "barometer"], "Side-mounted fingerprint"),
  E("zf5", "Samsung", "Galaxy Z Flip 5", "Snapdragon 8 Gen 2", 34, "arm64-v8a", 480, 1080, 2640, 8, 8, "Adreno 740", "high", "foldable", "One UI", STD, ["accelerometer", "gyroscope"], "Side-mounted fingerprint"),
  E("a55", "Samsung", "Galaxy A55 5G", "Exynos 1480", 34, "arm64-v8a", 420, 1080, 2340, 8, 8, "Xclipse 530", "mid", "phone", "One UI", STD, ["accelerometer", "gyroscope"], "Under-display fingerprint"),
  E("a15", "Samsung", "Galaxy A15", "Helio G99", 33, "armeabi-v7a", 320, 1080, 2340, 4, 8, "Mali-G57 MC2", "low", "phone", "One UI", ["Bluetooth LE", "Wi-Fi 5", "4G"], ["accelerometer"], "Side-mounted fingerprint"),
  E("tabS9", "Samsung", "Galaxy Tab S9", "Snapdragon 8 Gen 2", 34, "arm64-v8a", 320, 1600, 2560, 8, 8, "Adreno 740", "high", "tablet", "One UI", STD, ["accelerometer", "gyroscope", "barometer"], "Under-display fingerprint"),
  E("op12", "OnePlus", "OnePlus 12", "Snapdragon 8 Gen 3", 35, "arm64-v8a", 480, 1440, 3168, 16, 8, "Adreno 750", "flagship", "phone", "OxygenOS", STD, ["accelerometer", "gyroscope", "barometer", "magnetometer"], "Under-display fingerprint"),
  E("opn3", "OnePlus", "OnePlus Open", "Snapdragon 8 Gen 2", 34, "arm64-v8a", 420, 1916, 2268, 16, 8, "Adreno 740", "flagship", "foldable", "OxygenOS", FOLD_STD, ["accelerometer", "gyroscope"], "Side-mounted fingerprint"),
  E("nord4", "OnePlus", "Nord 4", "Snapdragon 7+ Gen 3", 34, "arm64-v8a", 420, 1240, 2772, 12, 8, "Adreno 732", "mid", "phone", "OxygenOS", STD, ["accelerometer", "gyroscope"], "Under-display fingerprint"),
  E("mi14", "Xiaomi", "Xiaomi 14 Ultra", "Snapdragon 8 Gen 3", 35, "arm64-v8a", 480, 1440, 3200, 16, 8, "Adreno 750", "flagship", "phone", "HyperOS", [...STD, "UWB"], ["accelerometer", "gyroscope", "barometer", "magnetometer", "LiDAR-class ToF"], "Under-display fingerprint"),
  E("rn13", "Xiaomi", "Redmi Note 13 Pro", "Snapdragon 7s Gen 2", 34, "arm64-v8a", 420, 1220, 2712, 8, 8, "Adreno 710", "mid", "phone", "HyperOS", STD, ["accelerometer", "gyroscope"], "Under-display fingerprint"),
  E("pocox6", "Xiaomi", "POCO X6 Pro", "Dimensity 8300-Ultra", 34, "arm64-v8a", 420, 1220, 2712, 8, 8, "Mali-G615 MC6", "mid", "phone", "HyperOS", STD, ["accelerometer", "gyroscope"], "Under-display fingerprint"),
  E("pad6", "Xiaomi", "Xiaomi Pad 6", "Snapdragon 870", 33, "arm64-v8a", 320, 1800, 2880, 8, 8, "Adreno 650", "mid", "tablet", "HyperOS", ["Bluetooth LE", "Wi-Fi 6"], ["accelerometer", "gyroscope"], "None (PIN/pattern)"),
  E("x100p", "vivo", "X100 Pro", "Dimensity 9300", 34, "arm64-v8a", 480, 1260, 2800, 16, 8, "Immortalis-G720 MC12", "flagship", "phone", "Funtouch OS", STD, ["accelerometer", "gyroscope", "barometer"], "Under-display fingerprint"),
  E("f5", "Realme", "Realme 13 Pro+", "Snapdragon 7s Gen 2", 34, "arm64-v8a", 420, 1240, 2772, 12, 8, "Adreno 710", "mid", "phone", "realme UI", STD, ["accelerometer", "gyroscope"], "Under-display fingerprint"),
  E("fndn3", "OPPO", "Find N3 Flip", "Dimensity 9200", 34, "arm64-v8a", 480, 1080, 2520, 12, 8, "Immortalis-G715 MC11", "high", "foldable", "ColorOS", STD, ["accelerometer", "gyroscope"], "Side-mounted fingerprint"),
  E("rog8", "ASUS", "ROG Phone 8 Pro", "Snapdragon 8 Gen 3", 34, "arm64-v8a", 480, 1080, 2400, 24, 8, "Adreno 750", "flagship", "phone", "ROG UI", [...STD, "UWB"], ["accelerometer", "gyroscope", "barometer", "magnetometer"], "Under-display fingerprint"),
  E("moto70", "Motorola", "razr 50 Ultra", "Snapdragon 8s Gen 3", 34, "arm64-v8a", 420, 1080, 2640, 12, 8, "Adreno 735", "high", "foldable", "My UX (near-stock)", STD, ["accelerometer", "gyroscope"], "Side-mounted fingerprint"),
  E("edge50", "Motorola", "Edge 50 Fusion", "Snapdragon 7s Gen 2", 34, "arm64-v8a", 420, 1080, 2400, 8, 8, "Adreno 710", "mid", "phone", "My UX (near-stock)", STD, ["accelerometer", "gyroscope"], "Under-display fingerprint"),
  E("nothing2a", "Nothing", "Nothing Phone (2a)", "Dimensity 7200 Pro", 34, "arm64-v8a", 420, 1080, 2412, 8, 8, "Mali-G610 MC4", "mid", "phone", "Nothing OS", STD, ["accelerometer", "gyroscope"], "Under-display fingerprint"),
  E("sony1vi", "Sony", "Xperia 1 VI", "Snapdragon 8 Gen 3", 34, "arm64-v8a", 420, 1080, 2340, 12, 8, "Adreno 750", "flagship", "phone", "Stock-ish Android", STD, ["accelerometer", "gyroscope", "barometer", "magnetometer"], "Side-mounted fingerprint"),
  E("duo2", "Microsoft", "Surface Duo 2", "Snapdragon 888", 31, "arm64-v8a", 420, 1344, 1892, 8, 8, "Adreno 660", "mid", "dual-screen", "Stock Android", ["Bluetooth LE", "Wi-Fi 6", "5G"], ["accelerometer", "gyroscope"], "Side-mounted fingerprint"),
  E("teclab", "Tecno", "Phantom V Fold", "Dimensity 9000+", 33, "arm64-v8a", 320, 2000, 2296, 12, 8, "Mali-G710 MC10", "high", "foldable", "HiOS", STD, ["accelerometer", "gyroscope"], "Side-mounted fingerprint"),
  E("goplus", "Nokia", "Nokia C32", "Unisoc SC9863A", 33, "armeabi-v7a", 240, 720, 1600, 3, 8, "PowerVR GE8322", "go", "phone", "Near-stock (Android Go)", ["Bluetooth LE", "Wi-Fi n", "4G"], ["accelerometer"], "Rear fingerprint"),
  E("gopad", "Lenovo", "Tab M9 (Go)", "Helio G80", 33, "armeabi-v7a", 240, 800, 1340, 4, 8, "Mali-G52 MC2", "go", "tablet", "Near-stock (Android Go)", ["Bluetooth LE", "Wi-Fi ac"], ["accelerometer"], "None (PIN)"),
  E("oldtab", "Samsung", "Galaxy Tab A 8.0 (2019)", "Snapdragon 429", 28, "armeabi-v7a", 240, 800, 1280, 2, 4, "Adreno 504", "go", "tablet", "One UI (legacy)", ["Bluetooth LE", "Wi-Fi n"], ["accelerometer"], "None"),
  E("emul64", "Google", "Android Emulator", "x86_64 image · API 35", 35, "x86_64", 440, 1344, 2992, 8, 4, "SwiftShader (software GL)", "mid", "phone", "AOSP (emulator)", ["Wi-Fi (virtual)"], [], "None (no biometrics)"),
  E("emul86", "Google", "Android Emulator", "x86 image · API 30", 30, "x86", 440, 1080, 2340, 4, 4, "SwiftShader (software GL)", "low", "phone", "AOSP (emulator)", ["Wi-Fi (virtual)"], [], "None"),
  E("chromeos", "Google", "Chromebook Flex 5", "Intel i5 · Android runtime", 33, "x86_64", 240, 1200, 1920, 8, 4, "Intel Iris Xe", "mid", "desktop", "ChromeOS (ARC++)", ["Bluetooth LE", "Wi-Fi 6E"], [], "None"),
  E("win11", "Microsoft", "Windows 11 (WSA)", "Subsystem for Android", 33, "x86_64", 240, 1080, 2400, 8, 8, "Host GPU (translated)", "mid", "desktop", "Windows Subsystem", ["Wi-Fi", "Bluetooth LE"], [], "Windows Hello (host)"),
];

export function catalogEntryToProfile(e: DeviceModelEntry): DeviceProfile {
  return {
    id: "cat_" + e.id, label: `${e.model} · ${e.variant}`, manufacturer: e.manufacturer, model: e.model,
    androidApi: e.api, androidVersion: String(Math.max(5, e.api - 20)), abi: e.abi, density: e.density,
    screenWidth: e.width, screenHeight: e.height, supportedFeatures: [],
    glVersion: /SwiftShader/.test(e.gpu) ? "OpenGL ES 3.1 (software)" : "OpenGL ES 3.2",
    variant: e.variant, formFactor: e.formFactor, gpu: e.gpu, cores: e.cores, ramGB: e.ramGB,
    tier: e.tier, oemSkin: e.oemSkin, connectivity: e.connectivity, sensors: e.sensors,
    biometrics: e.biometrics, batteryProfile: e.tier === "go" ? "Android Go class — minimal split sets preferred." : undefined,
    aspect: aspectOf(e.width, e.height),
    detectionLog: [`selected from the Kaisel hardware matrix (${e.manufacturer} ${e.model})`],
  };
}

export function searchCatalog(q: string): DeviceModelEntry[] {
  const s = q.trim().toLowerCase();
  if (!s) return DEVICE_CATALOG;
  return DEVICE_CATALOG.filter((e) =>
    `${e.manufacturer} ${e.model} ${e.variant} ${e.oemSkin} ${e.formFactor} ${e.abi}`.toLowerCase().includes(s));
}

/* Legacy quick presets — kept for API compatibility with seeded profiles */
export const DEVICE_PRESETS: DeviceProfile[] = [
  { id: "preset_pixel9", label: "Pixel 9 Pro", manufacturer: "Google", model: "Pixel 9 Pro", androidApi: 35, androidVersion: "15", abi: "arm64-v8a", density: 420, screenWidth: 1344, screenHeight: 2992, supportedFeatures: [], glVersion: "OpenGL ES 3.2" },
  { id: "preset_s23", label: "Galaxy S23", manufacturer: "Samsung", model: "SM-S911B", androidApi: 34, androidVersion: "14", abi: "arm64-v8a", density: 480, screenWidth: 1080, screenHeight: 2340, supportedFeatures: [], glVersion: "OpenGL ES 3.2" },
  { id: "preset_nova", label: "Nova A3 (budget)", manufacturer: "Nova", model: "A3", androidApi: 29, androidVersion: "10", abi: "armeabi-v7a", density: 320, screenWidth: 720, screenHeight: 1600, supportedFeatures: [], glVersion: "OpenGL ES 3.1" },
  { id: "preset_tab", label: "x86 Emulator tablet", manufacturer: "Google", model: "SDK Emulator", androidApi: 30, androidVersion: "11", abi: "x86", density: 240, screenWidth: 1200, screenHeight: 1920, supportedFeatures: [], glVersion: "OpenGL ES 3.0 (SwiftShader)" },
  { id: "preset_nexus5", label: "Nexus 5 (2013)", manufacturer: "LG", model: "Nexus 5", androidApi: 23, androidVersion: "6.0", abi: "armeabi-v7a", density: 480, screenWidth: 1080, screenHeight: 1920, supportedFeatures: [], glVersion: "OpenGL ES 3.0" },
  { id: "preset_tv", label: "Android TV (arm64)", manufacturer: "Google", model: "ADT-3", androidApi: 29, androidVersion: "10", abi: "arm64-v8a", density: 320, screenWidth: 1920, screenHeight: 1080, supportedFeatures: ["android.software.leanback"], glVersion: "OpenGL ES 3.2" },
];
