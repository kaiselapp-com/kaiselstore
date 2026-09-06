import React, { useEffect, useMemo, useRef, useState } from "react";
import { getDb, saveDb, fmtBytes } from "../lib/db";
import { detectBrowserProfile, refineDetectedProfile, searchCatalog, catalogEntryToProfile, densityLabel, DEVICE_CATALOG } from "../lib/device";
import { latestVersion, selectArtifacts, appByPkg, downloadCount } from "../lib/api";
import { Icon, Badge, Reveal, AppIcon } from "../components/ui";
import { useStore } from "../state/store";

/* ============================================================
   Device Lab — automatic fingerprinting + hardware matrix
   ============================================================ */

const TIER_TONE: Record<string, "jade" | "gold" | "coral" | "cy" | "mut"> = {
  flagship: "jade", high: "jade", mid: "cy", low: "gold", go: "coral",
};

export default function DeviceLab() {
  const { toast, refresh, tick } = useStore();
  const db = getDb();
  const active = db.devices.find((d) => d.id === db.currentDeviceId) ?? db.devices[0];

  const [scanning, setScanning] = useState(false);
  const [scanLog, setScanLog] = useState<{ msg: string; ok: boolean }[]>([]);
  const [q, setQ] = useState("");
  const termRef = useRef<HTMLDivElement>(null);
  void tick;

  useEffect(() => { termRef.current?.scrollTo({ top: 999999 }); }, [scanLog.length]);

  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanLog([{ msg: "kaisel device-lab · fingerprint scan started", ok: true }]);
    const base = detectBrowserProfile();
    const enriched = await refineDetectedProfile(base, (msg, ok) => setScanLog((l) => [...l, { msg, ok }]));
    const cur = getDb();
    cur.devices = [enriched, ...cur.devices.filter((d) => d.id !== "detected")];
    if (cur.currentDeviceId === "detected" || !cur.devices.some((d) => d.id === cur.currentDeviceId)) cur.currentDeviceId = "detected";
    saveDb(); refresh();
    setScanLog((l) => [...l, { msg: `fingerprint complete → ${enriched.label} · ${enriched.abi} · API ${enriched.androidApi} · tier ${enriched.tier?.toUpperCase()}`, ok: true }]);
    setScanning(false);
    toast("ok", `Device identified: ${enriched.label}`);
  };

  useEffect(() => { if (active?.detected) void runScan(); /* initial fingerprint */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (entryId: string) => {
    const entry = DEVICE_CATALOG.find((e) => e.id === entryId);
    if (!entry) return;
    const profile = catalogEntryToProfile(entry);
    const cur = getDb();
    const detected = cur.devices.find((d) => d.detected);
    cur.devices = [...(detected ? [detected] : []), ...cur.devices.filter((d) => !d.detected && d.id !== profile.id), profile];
    cur.currentDeviceId = profile.id;
    saveDb(); refresh();
    toast("ok", `Delivering for ${entry.manufacturer} ${entry.model} — ${entry.variant}`);
  };

  const results = useMemo(() => searchCatalog(q), [q]);
  const grouped = useMemo(() => {
    const g = new Map<string, typeof results>();
    for (const e of results) { g.set(e.manufacturer, [...(g.get(e.manufacturer) ?? []), e]); }
    return [...g.entries()];
  }, [results]);

  const previews = ["com.copperleaf.riftracers", "com.hexline.vaultkey", "com.northwind.tidalnotes"]
    .map((p) => appByPkg(p)).filter(Boolean).map((app) => {
      const v = latestVersion(app!.id);
      const sel = v ? selectArtifacts(v, active) : null;
      return { app: app!, sel };
    });

  const spec = (label: string, value: React.ReactNode, icon: string) => (
    <div className="bg-panel2 border border-line rounded-xl p-3.5 anim-fade-up">
      <div className="flex items-center gap-2 text-mut text-[11px] uppercase tracking-wider font-semibold mb-1.5"><Icon name={icon} size={13} /> {label}</div>
      <div className="text-[13.5px] font-medium leading-snug">{value}</div>
    </div>
  );

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <Badge tone="jade" className="mb-2"><Icon name="cpu" size={11} /> Device intelligence</Badge>
          <h1 className="font-disp font-bold text-[28px] tracking-tight">Device Lab</h1>
          <p className="text-mut text-[13.5px] mt-1 max-w-2xl">
            Kaisel fingerprints the visiting device — form factor, ABI, GPU, sensors, OEM power policy — and
            generates the exact artifact set that device installs. On a desktop, pick the target from the hardware matrix.
          </p>
        </div>
        <button onClick={runScan} disabled={scanning}
          className="btn-primary px-5 py-2.5 text-[13.5px] inline-flex items-center gap-2 cursor-pointer">
          <Icon name="refresh" size={15} className={scanning ? "animate-spin" : ""} /> {scanning ? "Scanning…" : "Re-run fingerprint"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6 items-start">
        {/* -------- left: scan + spec sheet -------- */}
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
              <h3 className="font-disp font-semibold text-[15px] flex items-center gap-2"><Icon name="terminal" size={16} className="text-jade" /> Live fingerprint scan</h3>
              <Badge tone={scanning ? "gold" : "jade"}>{scanning ? "probing hardware" : "complete"}</Badge>
            </div>
            <div ref={termRef} className="term p-4 h-56 overflow-y-auto scrollx">
              {scanLog.map((l, i) => (
                <div key={i} className={l.ok ? "" : "lv-warn"}>
                  <span className="text-[#51668f]">{String(i + 1).padStart(2, "0")}</span> {l.msg}
                </div>
              ))}
              {scanning && <div className="animate-pulse">▍</div>}
            </div>
          </div>

          <div>
            <h3 className="font-disp font-semibold text-[16px] mb-3">Hardware fingerprint — {active.label}</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {spec("Form factor", <span className="capitalize">{active.formFactor ?? "phone"}</span>, "phone")}
              {spec("Platform", `Android ${active.androidVersion} · API ${active.androidApi}`, "layers")}
              {spec("Architecture", <span className="font-mono text-[12.5px]">{active.abi} {active.abi === "x86_64" || active.abi === "arm64-v8a" ? "(64-bit)" : "(32-bit)"}</span>, "cpu")}
              {spec("GPU", active.gpu ?? "reported by renderer", "game")}
              {spec("Display", `${active.screenWidth}×${active.screenHeight} · ${active.aspect ?? "—"} · ${densityLabel(active.density)}`, "eye")}
              {spec("Compute", `${active.cores ?? "?"} cores · ${active.ramGB ?? "?"} GB RAM class`, "chart")}
              {spec("OEM skin", active.oemSkin ?? "—", "flag")}
              {spec("Performance tier", <Badge tone={TIER_TONE[active.tier ?? "mid"]}>{(active.tier ?? "mid").toUpperCase()}</Badge>, "zap")}
              {spec("Connectivity", (active.connectivity ?? ["—"]).join(" · "), "globe")}
              {spec("Sensors", active.sensors?.length ? active.sensors.join(", ") : "none probed", "spark")}
              {spec("Biometrics", active.biometrics ?? "not exposed to the browser", "lock")}
              {spec("Power profile", active.batteryProfile ?? "standard AOSP policy", "bolt")}
            </div>
            {active.batteryProfile && (
              <p className="text-[12px] text-mut mt-3 flex items-start gap-2"><Icon name="info" size={14} className="text-cy mt-0.5 shrink-0" /> {active.batteryProfile}</p>
            )}
          </div>

          <Reveal className="card p-5">
            <h3 className="font-disp font-semibold text-[15px] mb-1">What Kaisel delivers on this device</h3>
            <p className="text-mut text-[12.5px] mb-4">Compatibility preview — resolved live against the active fingerprint.</p>
            <div className="space-y-2">
              {previews.map(({ app, sel }) => (
                <a key={app.id} href={`#/app/${app.packageName}`} className="flex items-center gap-3 bg-panel2 border border-line rounded-xl px-3.5 py-3 hover:border-jade/50 transition-colors group">
                  <AppIcon spec={app.icon} size={38} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold group-hover:text-jade transition-colors truncate">{app.name}</div>
                    {sel?.compatible ? (
                      <div className="text-[11.5px] text-mut font-mono truncate">
                        {sel.type === "split-set" ? `${sel.set.length} splits · ` : "single apk · "}{fmtBytes(sel.set.reduce((s, a) => s + a.fileSize, 0))} · {sel.set.map((a) => a.splitName ?? "universal").join(" + ")}
                      </div>
                    ) : <div className="text-[11.5px] text-coral">not compatible — {sel?.reasons?.[0] ?? "no artifact"}</div>}
                  </div>
                  {sel?.compatible
                    ? <Badge tone="jade"><Icon name="check" size={11} /> optimized</Badge>
                    : <Badge tone="coral"><Icon name="x" size={11} /> blocked</Badge>}
                </a>
              ))}
            </div>
          </Reveal>
        </div>

        {/* -------- right: hardware matrix -------- */}
        <div className="card overflow-hidden lg:sticky lg:top-20">
          <div className="px-5 py-4 border-b border-line">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-disp font-semibold text-[15px] flex items-center gap-2"><Icon name="database" size={16} className="text-jade" /> Hardware matrix</h3>
              <span className="text-[11.5px] text-mut font-mono">{results.length} / {DEVICE_CATALOG.length} devices</span>
            </div>
            <div className="field flex items-center gap-2 px-3 py-2.5">
              <Icon name="search" size={15} className="text-mut" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search model, brand, SoC, skin… (e.g. “fold”, “Exynos”, “Go”)" className="bg-transparent outline-none w-full text-[13.5px]" />
              {q && <button onClick={() => setQ("")} className="text-mut hover:text-ink cursor-pointer"><Icon name="x" size={13} /></button>}
            </div>
            <p className="text-[11.5px] text-mut mt-2.5">Selecting a target registers it via <code className="font-mono text-jade2">POST /api/device/profile</code> — every download afterwards is generated for it.</p>
          </div>
          <div className="max-h-[640px] overflow-y-auto scrollx p-3 space-y-4">
            {grouped.length === 0 && <p className="text-mut text-[13px] text-center py-10">No device matches “{q}”.</p>}
            {grouped.map(([mfr, list]) => (
              <div key={mfr}>
                <div className="text-[11px] uppercase tracking-wider text-mut font-semibold px-2 mb-1.5">{mfr}</div>
                <div className="space-y-1.5">
                  {list.map((e) => {
                    const isActive = active.id === "cat_" + e.id;
                    return (
                      <button key={e.id} onClick={() => choose(e.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all cursor-pointer ${isActive ? "border-jade/60 bg-jade/8" : "border-line hover:border-line2 hover:bg-panel2"}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px] font-semibold flex-1 truncate">{e.model}</span>
                          <Badge tone={TIER_TONE[e.tier]}>{e.tier}</Badge>
                          {e.formFactor !== "phone" && <Badge tone="cy">{e.formFactor}</Badge>}
                          {isActive && <Icon name="check" size={15} className="text-jade" />}
                        </div>
                        <div className="text-[11.5px] text-mut font-mono mt-1 truncate">
                          {e.variant} · API {e.api} · {e.abi} · {e.density} dpi · {e.gpu}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-line flex items-center justify-between">
            <span className="text-[11.5px] text-mut">Missing a device?</span>
            <a href="#/account" className="text-[12px] font-semibold text-jade hover:underline">Create a custom profile</a>
          </div>
        </div>
      </div>

      <Reveal className="card p-5 mt-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[12.5px] text-mut">
          <span className="flex items-center gap-2"><Icon name="shield" size={15} className="text-jade" /> Every generated build is sealed with per-file SHA-256 digests in MANIFEST.json</span>
          <span className="flex items-center gap-2"><Icon name="phone" size={15} className="text-jade" /> On Android the client streams splits straight into a PackageInstaller session — no ZIP needed</span>
          <span className="flex items-center gap-2"><Icon name="key" size={15} className="text-jade" /> Developer signatures are preserved — never stripped or re-signed</span>
          <span className="ml-auto font-mono text-[11.5px]">{downloadCount("app_riftracers") + 0 > 0 ? `${getDb().artifacts.filter((a) => a.status === "available").length} artifacts indexed` : ""}</span>
        </div>
      </Reveal>
    </div>
  );
}
