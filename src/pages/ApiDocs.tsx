import React, { useState } from "react";
import { Icon, Badge, Reveal } from "../components/ui";

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  desc: string;
  params?: [string, string][];
  req?: string;
  res: string;
}

const GROUPS: { name: string; icon: string; note?: string; endpoints: Endpoint[] }[] = [
  {
    name: "Discovery", icon: "search",
    endpoints: [
      { method: "GET", path: "/api/apps", desc: "List approved applications with cursor pagination.", params: [["category", "slug filter"], ["sort", "popular | downloads | newest | rating"], ["page", "1-based page"], ["pageSize", "default 12"]], res: `{\n  "items": [ { "id": "app_tidalnotes", "packageName": "com.northwind.tidalnotes",\n    "name": "Tidal Notes", "developerId": "dev_northwind" } ],\n  "total": 22, "page": 1, "pageSize": 12\n}` },
      { method: "GET", path: "/api/categories", desc: "All store categories.", res: `[ { "id": "games", "name": "Games", "slug": "games" }, … ]` },
      { method: "GET", path: "/api/search", desc: "Full-text search over name, package and developer. Indexed (PostgreSQL FTS in production).", params: [["q", "query"], ["category", "slug"], ["minRating", "3 | 4 | 4.5"], ["compatibleOnly", "true → filter by device profile"]], res: `{\n  "items": [ … ], "total": 7, "page": 1,\n  "pageSize": 12, "tookMs": 3\n}` },
      { method: "GET", path: "/api/featured", desc: "Editorially featured applications (spotlight).", res: `[ { "id": "app_riftracers", "name": "Rift Racers", … } ]` },
      { method: "GET", path: "/api/popular", desc: "Top applications by weighted download volume.", res: `[ { "id": "app_lingualoop", … } ]` },
      { method: "GET", path: "/api/recommended", desc: "Top-rated apps with a compatible artifact for the requesting device profile.", res: `[ { "id": "app_vaultkey", … } ]` },
    ],
  },
  {
    name: "Applications", icon: "grid",
    endpoints: [
      { method: "GET", path: "/api/apps/{id}", desc: "Application by internal id.", res: `{ "id": "app_vaultkey", "packageName": "com.hexline.vaultkey",\n  "name": "Vaultkey", "status": "approved", … }` },
      { method: "GET", path: "/api/apps/{packageName}", desc: "Application by reverse-domain package name.", res: `{ "id": "app_vaultkey", … }` },
      { method: "GET", path: "/api/apps/{packageName}/versions", desc: "All non-removed versions with their artifact manifests.", res: `[ { "versionName": "3.4.1", "versionCode": 152, "minSdk": 26,\n  "targetSdk": 35, "artifacts": [ { "splitName": "base",\n  "abi": ["universal"], "fileSize": 14890000, "sha256": "…" } ] } ]` },
      { method: "GET", path: "/api/developer/{id}", desc: "Public developer profile plus published apps.", res: `{ "developer": { "id": "dev_northwind", "name": "Northwind Labs" },\n  "apps": [ … ] }` },
    ],
  },
  {
    name: "Device targeting", icon: "phone",
    note: "The Android client registers its DeviceProfile once (and on config changes); every artifact request is then resolved against it.",
    endpoints: [
      { method: "POST", path: "/api/device/profile", desc: "Register or update the requesting device's capability profile.", req: `{\n  "androidApi": 35,\n  "abi": "arm64-v8a",\n  "density": 420,\n  "manufacturer": "Google",\n  "model": "Pixel 9 Pro",\n  "screenWidth": 1344,\n  "screenHeight": 2992,\n  "supportedFeatures": ["android.hardware.opengles.aep"]\n}`, res: `{ "id": "dev_prof_9f2", "androidApi": 35, "abi": "arm64-v8a",\n  "density": 420, … }` },
      {
        method: "GET", path: "/api/apps/{packageName}/compatible-artifact", desc: "Core endpoint: resolves the best artifact set for the device. Returns a signed, 90-second download URL.",
        params: [["X-Device-Profile", "registered profile id (header)"]],
        res: `{\n  "compatible": true,\n  "application": { "packageName": "com.hexline.vaultkey" },\n  "version": { "versionCode": 152, "versionName": "3.4.1" },\n  "artifact": { "id": "art_8f3", "splitName": "base",\n    "abi": ["universal"], "fileSize": 14890000 },\n  "set": ["art_8f3", "art_8f4", "art_8f7"],\n  "downloadUrl": "https://cdn.kaisel.store/dl/<signed-token>",\n  "sha256": "9f2ab3…",\n  "installationType": "split-set"\n}`,
      },
      {
        method: "GET", path: "/api/build/{packageName}", desc: "Device build generation: resolves the compatible artifact set for the target profile, seals it with per-file SHA-256 digests and streams one archive (web). The Android client instead opens a PackageInstaller session with the raw splits.",
        params: [["device", "target profile id"], ["X-Device-Profile", "registered profile id (header)"]],
        res: `200 application/zip\nX-Kaisel-Zip-Sha256: 9f2ab3c4…\ncontents: base.apk, config.arm64_v8a.apk,\n          config.xxhdpi.apk, MANIFEST.json`,
      },
      {
        method: "GET", path: "/api/device/matrix", desc: "Searchable hardware matrix (37 devices with SoC variants) for the desktop flow: pick the exact model the build should target.",
        params: [["q", "model / brand / SoC / skin"]],
        res: `[ { "id": "s24u-ex", "manufacturer": "Samsung",\n  "model": "Galaxy S24 Ultra", "variant": "Exynos 2400",\n  "api": 35, "abi": "arm64-v8a", "density": 560,\n  "formFactor": "phone", "tier": "flagship" } ]`,
      },
    ],
  },
  {
    name: "Downloads & updates", icon: "download",
    endpoints: [
      { method: "POST", path: "/api/download/{artifactId}", desc: "Streams the artifact. Validates the signed token, records a download event, and returns integrity metadata.", res: `200 application/vnd.android.package-archive\nX-Kaisel-Sha256: 9f2ab3c4…\nX-Kaisel-Session: sess_k2m9` },
      { method: "GET", path: "/api/apps/{packageName}/update", desc: "Compare installed versionCode with the latest compatible versionCode.", params: [["installedVersionCode", "int, required"]], res: `{\n  "updateAvailable": true,\n  "installedVersion": 148,\n  "latestVersion": 152,\n  "artifact": { "id": "art_8f3", "fileSize": 14890000 }\n}` },
      { method: "GET", path: "/api/updates", desc: "Batch update check for every app the device has installed (client posts its install list).", params: [["deviceProfile", "profile id"]], res: `[ { "packageName": "com.northwind.tidalnotes",\n  "updateAvailable": true, "installedVersion": 96,\n  "latestVersion": 104 } ]` },
    ],
  },
  {
    name: "Reviews", icon: "star",
    endpoints: [
      { method: "GET", path: "/api/apps/{id}/reviews", desc: "Visible reviews, newest first.", res: `[ { "id": "rev_1", "rating": 5, "title": "…", "body": "…",\n  "userName": "Mara J.", "helpful": 12 } ]` },
      { method: "POST", path: "/api/reviews", desc: "Create a review (auth required).", req: `{ "applicationId": "app_vaultkey", "rating": 5,\n  "title": "Does exactly what it says", "body": "…" }`, res: `{ "id": "rev_new", "createdAt": 1749301200 }` },
      { method: "PUT", path: "/api/reviews/{id}", desc: "Edit your own review.", req: `{ "rating": 4, "title": "…", "body": "…" }`, res: `{ "id": "rev_new", "editedAt": 1749304800 }` },
      { method: "DELETE", path: "/api/reviews/{id}", desc: "Delete your own review.", res: `{ "ok": true }` },
    ],
  },
];

const METHOD_TONE: Record<string, "jade" | "gold" | "cy" | "coral"> = { GET: "jade", POST: "gold", PUT: "cy", DELETE: "coral" };

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(text).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1300); }}
      className="btn-ghost px-2 py-1 text-[11px] inline-flex items-center gap-1 cursor-pointer">
      <Icon name={ok ? "check" : "copy"} size={11} className={ok ? "text-jade" : ""} /> {ok ? "copied" : "copy"}
    </button>
  );
}

export default function ApiDocs() {
  const [open, setOpen] = useState<string | null>("/api/apps/{packageName}/compatible-artifact");
  return (
    <div className="max-w-[980px] mx-auto px-4 sm:px-6 pt-8">
      <div className="mb-8">
        <Badge tone="jade" className="mb-3">OpenAPI 3.1 · served at /api/docs in production</Badge>
        <h1 className="font-disp font-bold text-[32px] tracking-tight">Kaisel API reference</h1>
        <p className="text-mut text-[14px] mt-2 max-w-2xl leading-relaxed">
          The same REST surface the web store uses is designed for the future Kaisel Android client.
          This build serves it from an in-browser transport with realistic latency, rate limiting
          (login 5/min · search 30/min · download 12/min) and signed download tokens.
        </p>
      </div>

      <Reveal className="card p-5 mb-8">
        <h3 className="font-disp font-semibold text-[16px] mb-2 flex items-center gap-2"><Icon name="phone" size={16} className="text-jade" /> Android client flow</h3>
        <pre className="term rounded-xl p-4 whitespace-pre-wrap">{`1. POST /api/device/profile        → register DeviceProfile (API, ABI, density…)
2. GET  /api/updates                → diff installed versionCodes
3. GET  /api/apps/{pkg}/compatible-artifact
                                    → artifact set + signed URL + SHA-256
4. POST /api/download/{artifactId}  → stream payload, record event
5. client recomputes SHA-256        → abort install on mismatch
6. PackageInstaller session         → base + config splits, user confirms`}</pre>
      </Reveal>

      <div className="space-y-8">
        {GROUPS.map((g) => (
          <Reveal key={g.name}>
            <h2 className="font-disp font-bold text-[20px] tracking-tight mb-1 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-panel2 border border-line grid place-items-center text-jade"><Icon name={g.icon} size={16} /></span>
              {g.name}
            </h2>
            {g.note && <p className="text-mut text-[13px] mb-3 ml-10">{g.note}</p>}
            <div className="space-y-2 mt-3">
              {g.endpoints.map((e) => {
                const k = e.path;
                const isOpen = open === k;
                return (
                  <div key={k} className="card overflow-hidden">
                    <button onClick={() => setOpen(isOpen ? null : k)} className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left hover:bg-panel2 transition-colors">
                      <Badge tone={METHOD_TONE[e.method]} className="text-[10.5px] font-mono w-14 justify-center">{e.method}</Badge>
                      <code className="font-mono text-[13px] flex-1 truncate">{e.path}</code>
                      <Icon name="chev-d" size={14} className={`text-mut transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-line pt-3 anim-fade-up">
                        <p className="text-[13.5px] text-ink/90 mb-3">{e.desc}</p>
                        {e.params && (
                          <div className="mb-3">
                            <div className="text-[11px] uppercase tracking-wider text-mut font-semibold mb-1.5">Parameters</div>
                            <div className="border border-line rounded-lg divide-y divide-line">
                              {e.params.map(([p, d]) => (
                                <div key={p} className="flex gap-4 px-3 py-2 text-[12.5px]"><code className="font-mono text-jade2 w-44 shrink-0">{p}</code><span className="text-mut">{d}</span></div>
                              ))}
                            </div>
                          </div>
                        )}
                        {e.req && (
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-1.5"><span className="text-[11px] uppercase tracking-wider text-mut font-semibold">Request</span><CopyBtn text={e.req} /></div>
                            <pre className="term rounded-lg p-3 whitespace-pre-wrap">{e.req}</pre>
                          </div>
                        )}
                        <div>
                          <div className="flex items-center justify-between mb-1.5"><span className="text-[11px] uppercase tracking-wider text-mut font-semibold">Response</span><CopyBtn text={e.res} /></div>
                          <pre className="term rounded-lg p-3 whitespace-pre-wrap">{e.res}</pre>
                        </div>
                        <div className="mt-3 flex items-center justify-between">
                          <code className="text-[11.5px] font-mono text-mut">curl https://api.kaisel.store{e.path.replace(/\{[^}]+\}/g, "com.example.app")} {e.method !== "GET" ? `-X ${e.method}` : ""}</code>
                          <CopyBtn text={`curl https://api.kaisel.store${e.path.replace(/\{[^}]+\}/g, "com.example.app")}`} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="card p-5 mt-10">
        <h3 className="font-disp font-semibold text-[16px] mb-2">Example device profiles</h3>
        <pre className="term rounded-xl p-4 whitespace-pre-wrap">{`# flagship 2025        { "androidApi": 35, "abi": "arm64-v8a", "density": 420 }
# budget 2020          { "androidApi": 29, "abi": "armeabi-v7a", "density": 320 }
# legacy 2015          { "androidApi": 23, "abi": "armeabi-v7a", "density": 480 }
# x86 emulator         { "androidApi": 30, "abi": "x86_64", "density": 240 }`}</pre>
        <p className="text-[12px] text-mut mt-3 leading-relaxed">
          Integrity: every artifact carries SHA-256 + fileSize + versionCode + packageName. The client verifies the hash before asking
          Android to install. Signatures are preserved end-to-end — Kaisel never re-signs, strips, or modifies third-party binaries.
        </p>
      </Reveal>
    </div>
  );
}
