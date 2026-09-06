# Kaisel Store

An alternative Android app store with **device-targeted APK distribution** from AAB and APK artifacts.
Navy-on-white UI with dark mode. **The store ships with an empty catalog** — every app, version,
artifact, review and download you see was published or performed through the build itself,
exactly like a real marketplace on day one.

## What actually works

```
Developer uploads APK/AAB (dev console, drag & drop)
  → intake vault (IndexedDB; random storage name, original filename never trusted)
  → ProcessingJob created (UPLOADED → PROCESSING → ANALYZING → GENERATING_ARTIFACTS → READY/FAILED)
  → real ZIP central-directory parsing (entry list, lib/<abi>/, res/ densities, META-INF signing block, AAB modules)
  → real SHA-256 (WebCrypto) of the uploaded bytes
  → BundletoolAdapter.generateApkSet()  ← EmbeddedAabExpander in the web build (logged in the job)
  → artifacts stored with ABI / density / minSdk / maxSdk / features constraints
  → compatibility index rebuilt → app goes live (pending → approved on first READY build)

User opens /app/{packageName}
  → GET /api/apps/{pkg}/compatible-artifact with the active DeviceProfile
  → scoring engine: ABI match (fatal), density distance, SDK range, features
  → base + config.<abi> + config.<density> split-set, or universal fallback, or "not compatible + why"
  → signed 90 s download token → POST /api/download streams the blob, records DownloadEvent
  → client recomputes SHA-256 → verify passes (Downloads page → "Verify")
  → install library updated → GET /api/updates diffs versionCode → one-tap update
```

The **only** step requiring external build tooling is AAB → APK set binary splitting. It is isolated
behind `BundletoolAdapter` (`src/lib/processor.ts`). The shipped `EmbeddedAabExpander` is a
pure-TypeScript implementation that derives split *metadata* from the parsed bundle and references
the uploaded payload; production plugs the containerized bundletool worker into the identical
interface — nothing else changes.

## Stack & topology (production target)

```
/frontend   Next.js + TypeScript + Tailwind      (this repo ships the React/Vite web build of it)
/backend    Node.js + TypeScript REST API        (mirrored 1:1 by src/lib/api.ts)
/worker     BullMQ job runner                    (mirrored by processUpload() job states + logs)
/artifact-processor  isolated container: bundletool + aapt2, no host perms, read-only intake mount
/database   PostgreSQL (schema in /database/schema.sql)
storage     S3-compatible vault (outside web root), Redis cache + queue
```

### Modules

| File | Responsibility |
| --- | --- |
| `src/lib/types.ts` | Domain model / DTOs shared with future backend + Android client |
| `src/lib/db.ts` | Persistence (localStorage documents + IndexedDB blob vault), empty-catalog seed (15 categories, publisher accounts, device profiles) |
| `src/lib/processor.ts` | ZIP parser, SHA-256, analysis, `BundletoolAdapter`, processing pipeline |
| `src/lib/api.ts` | REST-shaped API: search, compatibility engine, signed download tokens, rate limits, request log |
| `src/lib/device.ts` | Browser device detection + `DeviceProfile` presets |
| `src/lib/firebase.ts` | Firebase Auth (email/password + Google) with the Kaisel web-app config |
| `src/state/store.tsx` | Session, theme, toasts, hash router |
| `src/pages/*` | Home, gallery/search, app detail, developer page + console, admin, downloads, updates, API docs, auth/account |

## Authentication

Firebase is initialised with the Kaisel web-app config (email/password + Google popup).
Roles are granted server-side: new accounts start as `user`; any signed-in user can register a
developer profile from Account → "Become a developer" (or the developer console), and the
`ops@kaisel.store` account holds the `admin` role for the admin panel. Login attempts are
rate-limited (5/min).

## API surface

Rendered interactively at `#/api-docs` (OpenAPI-shaped, with request/response examples):
`/api/apps`, `/api/apps/{id}`, `/api/apps/{packageName}`, `/api/apps/{pkg}/versions`,
`/api/apps/{pkg}/compatible-artifact`, `/api/apps/{pkg}/update`, `/api/categories`, `/api/search`,
`/api/featured`, `/api/popular`, `/api/recommended`, `/api/developer/{id}`, `POST /api/device/profile`,
`GET /api/updates`, `POST /api/download/{artifactId}`, reviews CRUD, admin actions.

### Example: compatible artifact

```bash
curl "https://api.kaisel.store/api/apps/com.hexline.vaultkey/compatible-artifact" \
     -H "X-Device-Profile: dev_prof_9f2"
# → { "compatible": true, "installationType": "split-set",
#     "set": ["art_base", "art_config.arm64_v8a", "art_config.xxhdpi"],
#     "downloadUrl": "https://cdn.kaisel.store/dl/<signed>", "sha256": "…" }
```

### Example device profiles

```json
{ "androidApi": 35, "abi": "arm64-v8a",   "density": 420, "manufacturer": "Google",  "model": "Pixel 9 Pro" }
{ "androidApi": 29, "abi": "armeabi-v7a", "density": 320, "manufacturer": "Nova",    "model": "A3" }
{ "androidApi": 23, "abi": "armeabi-v7a", "density": 480, "manufacturer": "LG",      "model": "Nexus 5" }
{ "androidApi": 30, "abi": "x86_64",      "density": 240, "manufacturer": "Google",  "model": "SDK Emulator" }
```

## Security model

- Uploads: type/extension allowlist (apk|aab|apks), 200 MB cap, random vault keys, original names never
  used on disk, stored outside the web root, SHA-256 at intake.
- No uploaded binary is ever executed; processing is parse-only in the web build and runs in an
  unprivileged container in production.
- Downloads: signed short-lived tokens, artifact availability check, per-event integrity hash.
- Signatures: the developer's APK signing block is detected and **preserved** — never stripped, re-signed or modified.
- Rate limiting: login 5/min, search 30/min, download 12/min, upload 6/min (bucket state visible in Admin → System).
- Installation respects Android: the client verifies hash + package/version, then hands files to the
  system `PackageInstaller` (session install for split sets). No silent installs, no security bypass.

## Theming

Navy-based "white room" light theme by default (deep-navy navbar, footer and spotlight panels),
with a navy-slate dark mode. Preference persists per browser.

## Local development

```bash
npm install
npm run dev       # web app — opens on an empty store
npm run build     # production bundle (dist/)
```

The store boots empty by design. To populate it: **Developers → sign in → New application**
(name, package, icon, feature art, screenshots) → **Publish version** (drop any `.apk`/`.aab`/`.apks`) →
watch the processor reach `READY` — the app appears in the gallery, home rails and search instantly.
**Admin → System → Reseed database** restores the empty-catalog state at any time.

Production-style environment with Postgres/Redis/worker containers:

```bash
cp .env.example .env
docker compose up
```

## Testing notes

Everything below runs against apps **you publish** through the console (the store ships empty):

- **End-to-end**: register an app (icon + feature art + screenshots) → publish an AAB/APK → processor
  reaches `READY` → the app appears in gallery, search, home rails and the category it was filed under.
- **Device-targeted delivery**: on the app page, **Generate build for {device}** resolves the split set for
  the active profile; switch devices in the navbar (e.g. *x86 Emulator*) and an arm64-only app flips to
  "Not compatible" with the exact reason.
- **Split-set vs universal**: upload a second version as a plain universal `.apk` and compare the resolved
  set size on the same device — the "% saved vs universal" chip appears on split builds.
- **SHA-256 round-trip**: download → Downloads → Verify (re-hashes the stored blob against the recorded digest).
- **Pipeline failure**: in the dev console upload a renamed `.txt` as `.apk` → job FAILED with a log reason.
- **Updates**: publish a higher versionCode → Updates page flags the installed app and one tap re-downloads
  the device-matched set.
- **Moderation**: Admin can reject/disable the app (it leaves the gallery) or feature it (home spotlight).
