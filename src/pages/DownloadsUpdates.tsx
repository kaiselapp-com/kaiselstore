import React, { useCallback, useEffect, useState } from "react";
import type { DownloadEvent, UpdateCheckResult } from "../lib/types";
import { getDb, fmtInt, fmtBytes, timeAgo } from "../lib/db";
import { api, appById, executeDownload, verifyEvent, RateLimitError } from "../lib/api";
import { serveArtifactBlob } from "../lib/processor";
import { Icon, Badge, EmptyState, AppIcon } from "../components/ui";
import { useStore, navigate } from "../state/store";

/* ================= DOWNLOADS ================= */

export function DownloadsPage() {
  const { toast, refresh, tick, session } = useStore();
  const [filter, setFilter] = useState<"all" | "verified" | "pending">("all");
  const [verifying, setVerifying] = useState<string | null>(null);
  void tick;
  const db = getDb();
  const mine = db.downloads.filter((d) => !session || d.uid === session.uid || d.uid === null);
  const rows = mine.filter((d) => filter === "all" || (filter === "verified" ? d.verified === true : d.verified !== true));

  const verify = async (ev: DownloadEvent) => {
    setVerifying(ev.id);
    try {
      const r = await verifyEvent(ev.id);
      toast(r.verified ? "ok" : "err", r.verified ? "SHA-256 verified — payload intact" : "HASH MISMATCH — payload corrupted, do not install");
      refresh();
    } catch { toast("err", "Verification failed — artifact missing"); }
    setVerifying(null);
  };

  const reDownload = async (ev: DownloadEvent) => {
    const art = db.artifacts.find((a) => a.id === ev.artifactId);
    if (!art) { toast("err", "Artifact no longer in vault"); return; }
    const blob = await serveArtifactBlob(art);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${art.packageName}-${art.versionCode}${art.splitName ? "-" + art.splitName : ""}.apk`;
    document.body.appendChild(a); a.click(); a.remove();
    toast("ok", "Artifact re-fetched from vault");
  };

  return (
    <div className="max-w-[980px] mx-auto px-4 sm:px-6 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-disp font-bold text-[28px] tracking-tight">Downloads</h1>
          <p className="text-mut text-[13px] mt-1">Every artifact you fetched, with its recorded SHA-256 and integrity state.</p>
        </div>
        <div className="flex gap-2">
          {(["all", "verified", "pending"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`chip px-3.5 py-1.5 text-[12.5px] font-medium capitalize cursor-pointer ${filter === f ? "chip-on" : "text-mut"}`}>{f}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="download" title="No downloads yet"
          sub="When you download an app, the event is recorded here with the artifact's SHA-256 so you can verify integrity before installing."
          action={<button onClick={() => navigate("/apps")} className="btn-primary px-5 py-2 text-[13px] cursor-pointer">Browse apps</button>} />
      ) : (
        <div className="space-y-3">
          {rows.map((ev) => {
            const app = appById(ev.applicationId);
            const art = db.artifacts.find((a) => a.id === ev.artifactId);
            return (
              <div key={ev.id} className="card p-4 flex flex-wrap items-center gap-4 anim-fade-up">
                {app && <AppIcon spec={app.icon} size={44} />}
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <a href={app ? `#/app/${app.packageName}` : undefined} className="font-disp font-semibold text-[14.5px] hover:text-jade transition-colors">{app?.name ?? ev.applicationId}</a>
                    {art?.splitName && <Badge tone="cy">{art.splitName}</Badge>}
                  </div>
                  <div className="text-[11.5px] text-mut font-mono mt-0.5">
                    code {ev.versionCode} · {ev.deviceLabel} · {timeAgo(ev.at)} · {fmtBytes(ev.bytes)} · session {ev.sessionId.slice(-6)}
                  </div>
                </div>
                <div>
                  {ev.verified === true ? <Badge tone="jade"><Icon name="check" size={11} /> verified</Badge>
                    : ev.verified === false ? <Badge tone="coral"><Icon name="alert" size={11} /> mismatch</Badge>
                      : <Badge tone="mut">unverified</Badge>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => verify(ev)} disabled={verifying === ev.id}
                    className="btn-ghost px-3 py-2 text-[12px] font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                    <Icon name="shield" size={13} className="text-jade" /> {verifying === ev.id ? "hashing…" : "Verify"}
                  </button>
                  <button onClick={() => reDownload(ev)} className="btn-ghost px-3 py-2 text-[12px] cursor-pointer" aria-label="Re-download"><Icon name="refresh" size={13} /></button>
                </div>
                <div className="w-full">
                  <div className="text-[10.5px] uppercase tracking-wider text-mut font-semibold mb-1">SHA-256</div>
                  <code className="hash-mono text-jade2">{ev.sha256 || "—"}</code>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card p-5 mt-8">
        <h3 className="font-disp font-semibold text-[15px] mb-2 flex items-center gap-2"><Icon name="phone" size={16} className="text-jade" /> How installation works on Android</h3>
        <ol className="text-[13px] text-mut leading-relaxed space-y-1.5 list-decimal list-inside">
          <li>The Kaisel client downloads the artifact set and recomputes each SHA-256.</li>
          <li>Package name and versionCode are checked against the manifest metadata.</li>
          <li>The original developer signature is validated (never stripped or re-signed).</li>
          <li>For split sets, a <code className="font-mono text-jade2">PackageInstaller</code> session installs base + config splits atomically.</li>
          <li>Android prompts you to confirm — Kaisel cannot install silently.</li>
        </ol>
      </div>
    </div>
  );
}

/* ================= UPDATES ================= */

export function UpdatesPage() {
  const { toast, refresh, session, tick } = useStore();
  const [updates, setUpdates] = useState<UpdateCheckResult[] | null>(null);
  const [checking, setChecking] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const check = useCallback(async () => {
    setChecking(true);
    try { setUpdates(await api.updates()); } catch { setUpdates([]); }
    setChecking(false);
  }, []);

  useEffect(() => { check(); }, [check, tick]);

  const run = async (pkg: string) => {
    const db = getDb();
    const app = db.applications.find((a) => a.packageName === pkg);
    if (!app || updating) return;
    setUpdating(pkg); setProgress(5);
    const iv = window.setInterval(() => setProgress((p) => Math.min(90, p + 10)), 240);
    try {
      const out = await executeDownload(app.id, undefined, session ? { ...session, avatarHue: 0, createdAt: 0 } : null);
      window.clearInterval(iv); setProgress(100);
      toast("ok", `${app.name} updated — ${out.events.length} artifact(s), SHA-256 recorded`);
      refresh();
      setTimeout(() => { setUpdating(null); check(); }, 500);
    } catch (e) {
      window.clearInterval(iv); setUpdating(null);
      toast(e instanceof RateLimitError ? "warn" : "err", e instanceof RateLimitError ? "Rate limited — wait a moment" : (e instanceof Error ? e.message : "Update failed"));
    }
  };

  const db = getDb();
  const updatable = (updates ?? []).filter((u) => u.updateAvailable);
  const current = (updates ?? []).filter((u) => !u.updateAvailable);

  return (
    <div className="max-w-[980px] mx-auto px-4 sm:px-6 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-disp font-bold text-[28px] tracking-tight">Updates</h1>
          <p className="text-mut text-[13px] mt-1">Installed versionCode vs. latest compatible versionCode, per device profile.</p>
        </div>
        <button onClick={check} disabled={checking} className="btn-ghost px-4 py-2 text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer">
          <Icon name="refresh" size={14} className={checking ? "animate-spin" : ""} /> {checking ? "Checking…" : "Check for updates"}
        </button>
      </div>

      {checking && !updates ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20" />)}</div>
      ) : (
        <>
          {updatable.length > 0 && (
            <div className="space-y-3 mb-8">
              {updatable.map((u) => {
                const app = db.applications.find((a) => a.packageName === u.packageName);
                if (!app) return null;
                return (
                  <div key={u.packageName} className="card p-4 flex flex-wrap items-center gap-4 anim-fade-up">
                    <AppIcon spec={app.icon} size={48} />
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <a href={`#/app/${app.packageName}`} className="font-disp font-semibold text-[15px] hover:text-jade transition-colors">{app.name}</a>
                        <Badge tone="gold">update</Badge>
                      </div>
                      <div className="text-[12px] text-mut font-mono mt-0.5">
                        {u.installedVersion} → <span className="text-jade">{u.latestVersion}</span> (v{u.versionName}) · {u.artifactCount} artifact{u.artifactCount > 1 ? "s" : ""} · {fmtBytes(u.totalBytes)}
                      </div>
                      <p className="text-[12.5px] text-mut mt-1 line-clamp-1">{u.changelog}</p>
                    </div>
                    {updating === u.packageName ? (
                      <div className="w-40">
                        <div className="h-2 rounded-full bg-panel2 overflow-hidden"><div className="h-full bg-jade rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
                        <div className="text-[11px] text-mut font-mono text-center mt-1">{progress}%</div>
                      </div>
                    ) : (
                      <button onClick={() => run(u.packageName)} className="btn-primary px-5 py-2.5 text-[13.5px] inline-flex items-center gap-2 cursor-pointer">
                        <Icon name="download" size={15} /> Update
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {updatable.length === 0 && !checking && (
            <EmptyState icon="check" title="Everything is up to date"
              sub={`All ${current.length} tracked apps run the latest compatible versionCode on the current device profile.`}
              action={<button onClick={() => navigate("/apps")} className="btn-ghost px-5 py-2 text-[13px] cursor-pointer">Discover more apps</button>} />
          )}

          {current.length > 0 && updatable.length > 0 && (
            <>
              <h2 className="font-disp font-semibold text-[16px] mb-3">Up to date</h2>
              <div className="space-y-2">
                {current.map((u) => {
                  const app = db.applications.find((a) => a.packageName === u.packageName);
                  if (!app) return null;
                  return (
                    <div key={u.packageName} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-line bg-panel/60">
                      <AppIcon spec={app.icon} size={30} />
                      <span className="text-[13px] font-medium flex-1">{app.name}</span>
                      <span className="text-[11.5px] font-mono text-mut">code {u.installedVersion} · latest</span>
                      <Icon name="check" size={15} className="text-jade" />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
