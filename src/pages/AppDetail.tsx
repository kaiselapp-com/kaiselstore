import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { Application, ApplicationVersion, Artifact, Review, DownloadEvent } from "../lib/types";
import { SDK_NAMES } from "../lib/types";
import { getDb, fmtInt, fmtBytes, fmtDate, timeAgo } from "../lib/db";
import { api, appRating, downloadCount, compatSummary, executeDownload, RateLimitError, currentDevice, verifyEvent, generateDeviceBuild, deviceNotes } from "../lib/api";
import { AppIcon, Icon, StarRow, Badge, Chip, Modal, EmptyState, Reveal, CopyHash } from "../components/ui";
import { RailCard, CompatDot } from "../components/layout";
import { Shot } from "../components/ui";
import { useStore, navigate } from "../state/store";
import { densityLabel } from "../lib/device";

interface DetailData {
  app: Application;
  versions: (ApplicationVersion & { artifacts: Artifact[] })[];
  reviews: Review[];
}

export default function AppDetail({ packageName }: { packageName: string }) {
  const { session, toast, refresh, tick } = useStore();
  const [data, setData] = useState<DetailData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastEvents, setLastEvents] = useState<DownloadEvent[] | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Bug report");
  const [reportDetail, setReportDetail] = useState("");
  const [buildBusy, setBuildBusy] = useState(false);
  const [buildStages, setBuildStages] = useState<string[]>([]);
  const [built, setBuilt] = useState<{ fileName: string; bytes: number; zipSha256: string; splits: number } | null>(null);

  useEffect(() => {
    let on = true;
    setErr(null); setData(null);
    (async () => {
      try {
        const app = await api.app(packageName);
        const [versions, reviews] = await Promise.all([api.versions(packageName), api.reviews(app.id)]);
        if (on) setData({ app, versions: versions as DetailData["versions"], reviews });
      } catch (e) { if (on) setErr(e instanceof Error ? e.message : "Failed to load application"); }
    })();
    return () => { on = false; };
  }, [packageName, tick]);

  const device = currentDevice();
  const compat = useMemo(() => (data ? compatSummary(data.app.id, device) : null), [data, device, tick]);

  const doDownload = useCallback(async () => {
    if (!data || !compat?.compatible || busy) return;
    setBusy(true); setProgress(4);
    const iv = window.setInterval(() => setProgress((p) => Math.min(92, p + 7 + Math.random() * 9)), 260);
    try {
      const out = await executeDownload(data.app.id, device.id, session ? { ...session, avatarHue: 0, createdAt: 0, provider: session.provider } : null);
      window.clearInterval(iv); setProgress(100);
      setLastEvents(out.events);
      toast("ok", `Downloaded ${out.events.length} artifact${out.events.length > 1 ? "s" : ""} (${fmtBytes(out.totalBytes)}) — SHA-256 recorded`);
      refresh();
      setTimeout(() => setBusy(false), 600);
    } catch (e) {
      window.clearInterval(iv); setBusy(false); setProgress(0);
      if (e instanceof RateLimitError) toast("warn", `Rate limited — retry in ${Math.ceil(e.retryMs / 1000)}s`);
      else toast("err", e instanceof Error ? e.message : "Download failed");
    }
  }, [data, compat, busy, device.id, session, toast, refresh]);

  const doBuild = useCallback(async () => {
    if (!data || !compat?.compatible || buildBusy) return;
    setBuildBusy(true); setBuilt(null); setBuildStages([`target: ${device.label} · ${device.abi} · API ${device.androidApi}`]);
    try {
      const out = await generateDeviceBuild(
        data.app.id, device.id,
        session ? { ...session, avatarHue: 0, createdAt: 0 } : null,
        (s) => setBuildStages((l) => [...l, s]),
      );
      const url = URL.createObjectURL(out.blob);
      const a = document.createElement("a");
      a.href = url; a.download = out.fileName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setBuilt({ fileName: out.fileName, bytes: out.bytes, zipSha256: out.zipSha256, splits: out.set.length });
      toast("ok", `Generated ${out.fileName} · ${fmtBytes(out.bytes)} for ${device.label}`);
      refresh();
    } catch (e) {
      if (e instanceof RateLimitError) toast("warn", `Rate limited — retry in ${Math.ceil(e.retryMs / 1000)}s`);
      else toast("err", e instanceof Error ? e.message : "Build generation failed");
    }
    setBuildBusy(false);
  }, [data, compat, buildBusy, device, session, toast, refresh]);

  if (err) {
    return (
      <div className="max-w-3xl mx-auto px-4 pt-16">
        <EmptyState icon="alert" title="Application not found" sub={`No published application matches "${packageName}". It may have been removed by moderation.`}
          action={<button onClick={() => navigate("/apps")} className="btn-primary px-5 py-2 text-[13px] cursor-pointer">Back to gallery</button>} />
      </div>
    );
  }

  if (!data || !compat) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8">
        <div className="flex gap-5 mb-8"><div className="skeleton w-24 h-24 rounded-3xl" /><div className="flex-1"><div className="skeleton h-8 w-64 mb-3" /><div className="skeleton h-4 w-40 mb-2" /><div className="skeleton h-4 w-96 max-w-full" /></div></div>
        <div className="grid lg:grid-cols-[1fr_360px] gap-8"><div className="skeleton h-72" /><div className="skeleton h-72" /></div>
      </div>
    );
  }

  const { app, versions, reviews } = data;
  const db = getDb();
  const dev = db.developers.find((d) => d.id === app.developerId);
  const rating = appRating(app.id);
  const visibleReviews = reviews.filter((r) => !r.hidden);
  const cats = app.categoryIds.map((c) => db.categories.find((x) => x.id === c)).filter(Boolean);
  const latest = versions[0];
  const similar = db.applications.filter((a) => a.id !== app.id && a.status === "approved" && a.categoryIds.some((c) => app.categoryIds.includes(c))).slice(0, 8);
  const myReview = session ? visibleReviews.find((r) => r.uid === session.uid) : undefined;
  const distMax = Math.max(1, ...rating.dist);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8">
      {/* feature art banner — developer-uploaded graphic, Play-Store style */}
      {app.featuredArt && (
        <div className="relative rounded-2xl overflow-hidden border border-line mb-[-44px] anim-fade-up" style={{ aspectRatio: "21/7", minHeight: 120 }}>
          <img src={app.featuredArt} alt={`${app.name} feature art`} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent" />
        </div>
      )}
      {/* header */}
      <div className={`relative flex flex-col md:flex-row gap-6 md:items-start mb-8 anim-fade-up ${app.featuredArt ? "z-10" : ""}`}>
        <AppIcon spec={app.icon} size={104} className={`rounded-3xl ${app.featuredArt ? "ring-4 ring-[var(--bg)]" : ""}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {cats.map((c) => c && <a key={c.id} href={`#/apps?cat=${c.id}`} className="text-[11.5px] font-semibold uppercase tracking-wider hover:text-jade transition-colors" style={{ color: `hsl(${c.hue} 65% 55%)` }}>{c.name}</a>)}
          </div>
          <h1 className="font-disp font-bold text-[30px] sm:text-[38px] leading-tight tracking-tight">{app.name}</h1>
          <a href={`#/developer/${dev?.slug}`} className="text-[14px] text-jade hover:underline inline-flex items-center gap-1.5 mt-1">
            {dev?.name} {dev?.verified && <Icon name="shield" size={13} className="text-jade" />}
          </a>
          <p className="text-mut text-[14px] mt-2 max-w-xl leading-relaxed">{app.tagline}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-[12.5px]">
            <span className="inline-flex items-center gap-1.5"><b className="font-mono text-[14px]">{rating.avg ? rating.avg.toFixed(1) : "–"}</b><StarRow value={rating.avg} size={12} /><span className="text-mut">{fmtInt(rating.count)} reviews</span></span>
            <span className="text-mut inline-flex items-center gap-1.5"><Icon name="download" size={13} /> <b className="text-ink font-mono">{fmtInt(downloadCount(app.id))}</b> downloads</span>
            <span className="text-mut"><b className="text-ink font-mono">{fmtBytes(latest?.artifacts.find((a) => a.splitName === "base")?.fileSize ?? latest?.artifacts[0]?.fileSize ?? 0)}</b></span>
            <span className="text-mut">Updated <b className="text-ink">{timeAgo(app.updatedAt)}</b></span>
          </div>
          <div className="mt-3"><CompatDot app={app} verbose /></div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8 items-start">
        {/* main column */}
        <div className="min-w-0">
          {/* screenshots — developer uploads take precedence over generated previews */}
          <Reveal className="mb-9">
            {app.screenshotUrls?.length ? (
              <div className="scrollx flex gap-3 overflow-x-auto pb-2">
                {app.screenshotUrls.map((s, i) => (
                  <img key={i} src={s} alt={`${app.name} screenshot ${i + 1}`} draggable={false}
                    className="h-[340px] w-auto rounded-xl border border-line object-cover shrink-0 select-none anim-fade-up"
                    style={{ animationDelay: `${i * 50}ms` }} />
                ))}
              </div>
            ) : (
              <div className="scrollx flex gap-3 overflow-x-auto pb-2">
                {app.screenshots.map((s) => <Shot key={s.id} app={app} shot={s} w={172} />)}
              </div>
            )}
          </Reveal>

          {/* about */}
          <Reveal className="mb-9">
            <h2 className="font-disp font-bold text-[20px] tracking-tight mb-3">About this app</h2>
            <div className="space-y-3 text-[14px] leading-relaxed text-ink/90 max-w-2xl">
              {app.description.map((p, i) => <p key={i}>{p}</p>)}
            </div>
            <ul className="grid sm:grid-cols-2 gap-2.5 mt-5 max-w-2xl">
              {app.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink/85">
                  <span className="w-5 h-5 rounded-md bg-jade/12 border border-jade/30 grid place-items-center text-jade shrink-0 mt-0.5"><Icon name="check" size={11} /></span>{f}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* what's new */}
          <Reveal className="mb-9">
            <h2 className="font-disp font-bold text-[20px] tracking-tight mb-1">What's new</h2>
            <p className="text-[12px] text-mut font-mono mb-3">v{latest?.versionName} ({latest?.versionCode}) · {latest ? fmtDate(latest.releasedAt) : ""}</p>
            <p className="text-[14px] leading-relaxed text-ink/90 max-w-2xl">{app.whatsNew}</p>
          </Reveal>

          {/* version history */}
          <Reveal className="mb-9">
            <h2 className="font-disp font-bold text-[20px] tracking-tight mb-4">Version history</h2>
            <div className="space-y-3 max-w-2xl">
              {versions.map((v, i) => (
                <details key={v.id} className="card group" open={i === 0}>
                  <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none">
                    <Badge tone={i === 0 ? "jade" : "mut"}>v{v.versionName}</Badge>
                    <span className="text-[12px] text-mut font-mono">code {v.versionCode}</span>
                    <span className="text-[12px] text-mut ml-auto">{fmtDate(v.releasedAt)}</span>
                    <Icon name="chev-d" size={14} className="text-mut group-open:rotate-180 transition-transform" />
                  </summary>
                  <div className="px-4 pb-4 border-t border-line pt-3">
                    <p className="text-[13px] text-ink/85 leading-relaxed mb-3">{v.changelog}</p>
                    <div className="text-[11.5px] text-mut font-mono mb-2">min {SDK_NAMES[v.minSdk] ?? `API ${v.minSdk}`} · target API {v.targetSdk} · {v.artifacts.length} artifacts</div>
                    <div className="space-y-1.5">
                      {v.artifacts.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-mono bg-panel2 border border-line rounded-lg px-3 py-2">
                          <Badge tone={a.artifactType === "aab" ? "gold" : "cy"}>{a.artifactType}</Badge>
                          <span className="text-ink">{a.splitName ?? "standalone"}</span>
                          <span className="text-mut">[{a.abi.join(", ")}]</span>
                          {a.density && <span className="text-mut">@{densityLabel(a.density)}</span>}
                          <span className="text-mut ml-auto">{fmtBytes(a.fileSize)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </Reveal>

          {/* permissions */}
          <Reveal className="mb-9">
            <h2 className="font-disp font-bold text-[20px] tracking-tight mb-4">Permissions & data safety</h2>
            <div className="card divide-y divide-line max-w-2xl">
              {app.permissions.map((p) => (
                <div key={p.name} className="flex items-start gap-3 px-4 py-3">
                  <Icon name="key" size={15} className="text-gold mt-0.5" />
                  <div>
                    <div className="text-[12.5px] font-mono">{p.name.replace("android.permission.", "")}</div>
                    <div className="text-[12px] text-mut">{p.purpose}</div>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3 px-4 py-3">
                <Icon name="shield" size={15} className="text-jade mt-0.5" />
                <div className="text-[12px] text-mut leading-relaxed">
                  Signing certificate fingerprint (SHA-256): <code className="hash-mono text-jade2">{latest?.signingFingerprint.slice(0, 32)}…</code><br />
                  Kaisel preserves the developer's original signature — artifacts are never re-signed or modified.
                </div>
              </div>
            </div>
          </Reveal>

          {/* reviews */}
          <Reveal className="mb-9">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-disp font-bold text-[20px] tracking-tight">Ratings & reviews</h2>
              {session ? (
                myReview ? <span className="text-[12px] text-mut">You reviewed this app</span> : <ReviewForm appId={app.id} onDone={refresh} />
              ) : (
                <a href="#/auth" className="btn-ghost px-4 py-2 text-[12.5px] font-medium">Sign in to review</a>
              )}
            </div>
            <div className="grid md:grid-cols-[240px_1fr] gap-6">
              <div className="card p-5 h-fit">
                <div className="flex items-end gap-3">
                  <span className="font-disp font-bold text-[44px] leading-none">{rating.avg ? rating.avg.toFixed(1) : "–"}</span>
                  <div className="pb-1"><StarRow value={rating.avg} size={14} /><div className="text-[11.5px] text-mut mt-1">{fmtInt(rating.count)} reviews</div></div>
                </div>
                <div className="mt-4 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((s) => (
                    <div key={s} className="flex items-center gap-2 text-[11px] font-mono text-mut">
                      <span className="w-3">{s}</span>
                      <div className="flex-1 h-2 rounded-full bg-panel2 overflow-hidden">
                        <div className="h-full rounded-full bg-gold" style={{ width: `${(rating.dist[s - 1] / distMax) * 100}%`, animation: "k-bar 0.8s ease both" }} />
                      </div>
                      <span className="w-6 text-right">{rating.dist[s - 1]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 min-w-0">
                {visibleReviews.length === 0 && <EmptyState icon="star" title="No reviews yet" sub="Be the first to rate this application." />}
                {visibleReviews.slice(0, 6).map((r) => (
                  <ReviewCard key={r.id} r={r} canEdit={session?.uid === r.uid} onChanged={refresh} />
                ))}
              </div>
            </div>
          </Reveal>
        </div>

        {/* right column — compatibility + download */}
        <div className="space-y-4 lg:sticky lg:top-20">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-disp font-semibold text-[15px] flex items-center gap-2">
                <Icon name="cpu" size={16} className="text-jade" /> Auto-delivery
              </h3>
              <a href="#/device" className="text-[12px] text-jade hover:underline inline-flex items-center gap-1">Device Lab <Icon name="arrow-r" size={11} /></a>
            </div>
            <div className="text-[12px] font-mono text-mut bg-panel2 border border-line rounded-lg px-3 py-2.5 mb-4 leading-relaxed">
              <span className="flex items-center gap-2 mb-1">
                <b className="text-ink not-italic">{device.label}</b>
                {device.detected
                  ? <Badge tone="cy">auto-identified</Badge>
                  : <Badge tone="mut">selected target</Badge>}
                {device.formFactor && device.formFactor !== "phone" && <Badge tone="gold">{device.formFactor}</Badge>}
              </span>
              API {device.androidApi} · {device.abi} · {densityLabel(device.density)} · {device.screenWidth}×{device.screenHeight}
              {device.oemSkin ? ` · ${device.oemSkin}` : ""}{device.tier ? ` · ${device.tier.toUpperCase()} tier` : ""}
            </div>
            {compat.compatible ? (
              <>
                <div className="flex items-center gap-2 text-jade font-semibold text-[14px] mb-1">
                  <span className="w-6 h-6 rounded-full bg-jade/15 border border-jade/40 grid place-items-center"><Icon name="check" size={13} /></span>
                  Optimized build available for this device
                </div>
                <p className="text-[12px] text-mut mb-4">{compat.reasons.join(" · ")}</p>
                <div className="space-y-1.5 mb-4">
                  {compat.artifacts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-[11.5px] font-mono bg-panel2 border border-line rounded-lg px-3 py-2">
                      <Badge tone="cy">{a.splitName ?? "apk"}</Badge>
                      <span className="text-mut truncate">{a.abi.join(",")}{a.density ? ` · ${densityLabel(a.density)}` : ""}</span>
                      <span className="ml-auto text-ink">{fmtBytes(a.fileSize)}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-[12px] px-1 pt-1">
                    <span className="text-mut">Total · {compat.installationType === "split-set" ? "session install" : "single APK"}</span>
                    <b className="font-mono">{fmtBytes(compat.totalBytes)}</b>
                  </div>
                  {(() => {
                    const uni = latest?.artifacts.find((a) => a.artifactType === "universal-apk");
                    if (!uni || compat.installationType !== "split-set") return null;
                    const saved = Math.max(0, Math.round((1 - compat.totalBytes / uni.fileSize) * 100));
                    if (saved <= 0) return null;
                    return (
                      <div className="flex items-center gap-2 text-[11.5px] text-jade bg-jade/8 border border-jade/25 rounded-lg px-3 py-2">
                        <Icon name="zap" size={13} />
                        <span>Saves <b>{saved}%</b> vs the {fmtBytes(uni.fileSize)} universal APK — this device never downloads code it can't run</span>
                      </div>
                    );
                  })()}
                </div>
                {buildBusy ? (
                  <div>
                    <div className="term p-3.5 max-h-44 overflow-y-auto scrollx mb-2">
                      {buildStages.map((s, i) => <div key={i}>{s}</div>)}
                      <div className="animate-pulse">▍</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <button onClick={doBuild} className="btn-primary w-full py-3 text-[14.5px] inline-flex items-center justify-center gap-2 cursor-pointer">
                      <Icon name="box" size={17} /> Generate build for {device.model}
                    </button>
                    <button onClick={doDownload} disabled={busy} className="btn-ghost w-full py-2.5 text-[12.5px] inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">
                      <Icon name="download" size={14} /> {busy ? `Downloading… ${Math.round(progress)}%` : `Download APK${compat.artifacts.length > 1 ? "s" : ""} individually`}
                    </button>
                  </div>
                )}
                {built && !buildBusy && (
                  <div className="mt-4 space-y-3 anim-fade-up">
                    <div className="flex items-center gap-2 text-jade text-[12.5px] font-medium"><Icon name="check" size={14} /> {built.fileName} · {fmtBytes(built.bytes)} · {built.splits} artifact{built.splits > 1 ? "s" : ""} sealed</div>
                    <CopyHash label="ZIP archive SHA-256" value={built.zipSha256} />
                    <p className="text-[11px] text-mut leading-relaxed">Unpack and install via the system installer; on Android the Kaisel client instead streams these splits straight into a PackageInstaller session and verifies each digest from MANIFEST.json.</p>
                  </div>
                )}
                {lastEvents && !busy && (
                  <div className="mt-4 space-y-3 anim-fade-up">
                    <div className="flex items-center gap-2 text-jade text-[12.5px] font-medium"><Icon name="check" size={14} /> Delivered & recorded in your downloads</div>
                    <CopyHash label={`SHA-256 · ${lastEvents[0]?.artifactId ? "" : ""}artifact payload`} value={lastEvents[0]?.sha256 ?? ""} />
                    <div className="flex gap-2">
                      <button onClick={async () => {
                        if (!lastEvents?.length || verifying) return;
                        setVerifying(true);
                        try {
                          const r = await verifyEvent(lastEvents[0].id);
                          toast(r.verified ? "ok" : "err", r.verified ? "Integrity verified — SHA-256 matches" : "HASH MISMATCH — do not install");
                          refresh();
                        } catch { toast("err", "Verification failed"); }
                        setVerifying(false);
                      }} className="btn-ghost flex-1 py-2 text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer">
                        <Icon name="shield" size={14} className="text-jade" /> {verifying ? "Re-hashing…" : "Verify SHA-256"}
                      </button>
                      <a href="#/downloads" className="btn-ghost flex-1 py-2 text-[12.5px] font-medium text-center">View downloads</a>
                    </div>
                  </div>
                )}
                {deviceNotes(app, device).length > 0 && (
                  <div className="space-y-1.5 mt-4">
                    {deviceNotes(app, device).map((n, i) => (
                      <div key={i} className={`flex items-start gap-2 text-[11.5px] leading-relaxed rounded-lg px-3 py-2 border ${
                        n.tone === "coral" ? "text-coral border-coral/30 bg-coral/8" : n.tone === "gold" ? "text-gold border-gold/30 bg-gold/8" : n.tone === "cy" ? "text-cy border-cy/30 bg-cy/8" : "text-jade border-jade/30 bg-jade/8"}`}>
                        <Icon name={n.icon} size={13} className="mt-0.5 shrink-0" /> {n.text}
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-mut leading-relaxed mt-4">
                  The button called <code className="font-mono text-jade2">GET /build/{"{packageName}"}</code> with your DeviceProfile — the store resolved
                  {compat.installationType === "split-set" ? " a base + config split set" : " the matching artifact"} and sealed it with per-file SHA-256 digests instead of serving a one-size-fits-all file.
                  On Android, the Kaisel client hands the verified set to the system PackageInstaller.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-coral font-semibold text-[14px] mb-1">
                  <span className="w-6 h-6 rounded-full bg-coral/15 border border-coral/40 grid place-items-center"><Icon name="x" size={13} /></span>
                  Not compatible with this device
                </div>
                <ul className="text-[12.5px] text-mut space-y-1 mb-4">
                  {compat.reasons.map((r, i) => <li key={i} className="flex gap-2"><Icon name="alert" size={13} className="text-gold mt-0.5 shrink-0" />{r}</li>)}
                </ul>
                <div className="text-[12px] text-mut bg-panel2 border border-line rounded-lg p-3 leading-relaxed mb-3">
                  Requires: API {latest?.minSdk ?? "—"}+ {latest?.artifacts.some((a) => !a.abi.includes("universal")) && "· specific ABIs"} · this device reports API {device.androidApi}, {device.abi}.
                </div>
                <button onClick={() => navigate("/device")} className="btn-ghost w-full py-2.5 text-[13px] inline-flex items-center justify-center gap-2 cursor-pointer">
                  <Icon name="cpu" size={15} className="text-jade" /> Pick a compatible target in Device Lab
                </button>
              </>
            )}
          </div>

          <div className="card p-5">
            <h3 className="font-disp font-semibold text-[14px] mb-3">Details</h3>
            {[
              ["Version", `v${latest?.versionName} (${latest?.versionCode})`],
              ["Updated", fmtDate(app.updatedAt)],
              ["Downloads", fmtInt(downloadCount(app.id))],
              ["Requires", SDK_NAMES[latest?.minSdk ?? 21] ?? `API ${latest?.minSdk}`],
              ["Target SDK", `API ${latest?.targetSdk}`],
              ["Architectures", [...new Set(latest?.artifacts.flatMap((a) => a.abi))].join(", ")],
              ["Developer", dev?.name ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-line last:border-0 text-[12.5px]">
                <span className="text-mut">{k}</span><span className="font-mono text-right">{v}</span>
              </div>
            ))}
            <button onClick={() => setReportOpen(true)} className="mt-3 text-[12px] text-mut hover:text-coral inline-flex items-center gap-1.5 cursor-pointer"><Icon name="flag" size={12} /> Report this app</button>
          </div>
        </div>
      </div>

      {/* similar */}
      {similar.length > 0 && (
        <Reveal className="mt-12">
          <h2 className="font-disp font-bold text-[20px] tracking-tight mb-4">Similar apps</h2>
          <div className="scrollx flex gap-4 overflow-x-auto pb-2">
            {similar.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}
          </div>
        </Reveal>
      )}

      {/* report modal */}
      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title={`Report ${app.name}`}>
        <div className="space-y-3">
          <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="field w-full px-3 py-2.5 text-[13.5px]">
            {["Bug report", "Security concern", "Misleading metadata", "Offensive content", "Other"].map((r) => <option key={r}>{r}</option>)}
          </select>
          <textarea value={reportDetail} onChange={(e) => setReportDetail(e.target.value)} rows={4}
            placeholder="Describe the issue…" className="field w-full px-3 py-2.5 text-[13.5px] resize-none" />
          <button onClick={() => {
            if (!reportDetail.trim()) { toast("warn", "Add a short description first"); return; }
            const dbx = getDb();
            dbx.reports.unshift({ id: `rep_${Date.now()}`, applicationId: app.id, reason: reportReason, detail: reportDetail.trim(), reporter: session?.email ?? "anonymous", status: "open", createdAt: Date.now() });
            setReportOpen(false); setReportDetail("");
            toast("ok", "Report filed — the moderation queue has been updated");
            refresh();
          }} className="btn-primary w-full py-2.5 text-[13.5px] cursor-pointer">Submit report</button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- review pieces ---------- */

function ReviewForm({ appId, onDone }: { appId: string; onDone: () => void }) {
  const { session, toast } = useStore();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary px-4 py-2 text-[12.5px] cursor-pointer">Write a review</button>;
  return (
    <div className="card p-4 w-full max-w-md anim-pop">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold">Your review</span>
        <StarRow value={rating} size={20} onRate={setRating} />
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="field w-full px-3 py-2 text-[13px] mb-2" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What stood out?" className="field w-full px-3 py-2 text-[13px] resize-none mb-3" />
      <div className="flex gap-2">
        <button disabled={busy || rating === 0} onClick={async () => {
          if (!session) return;
          setBusy(true);
          try {
            await api.addReview({ applicationId: appId, user: { ...session, avatarHue: 0, createdAt: 0 }, rating, title: title.trim() || "Review", body: body.trim() });
            toast("ok", "Review published");
            setOpen(false); onDone();
          } catch (e) { toast("err", e instanceof Error ? e.message : "Failed"); }
          setBusy(false);
        }} className="btn-primary flex-1 py-2 text-[13px] cursor-pointer">Publish</button>
        <button onClick={() => setOpen(false)} className="btn-ghost px-4 py-2 text-[13px] cursor-pointer">Cancel</button>
      </div>
    </div>
  );
}

function ReviewCard({ r, canEdit, onChanged }: { r: Review; canEdit: boolean; onChanged: () => void }) {
  const { toast, refresh } = useStore();
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(r.rating);
  const [title, setTitle] = useState(r.title);
  const [body, setBody] = useState(r.body);
  return (
    <div className="card p-4 anim-fade-up">
      <div className="flex items-center gap-3 mb-2">
        <span className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold text-white" style={{ background: `hsl(${(r.userName.length * 47) % 360} 50% 38%)` }}>{r.userName.slice(0, 1)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold truncate">{r.userName}</div>
          <div className="flex items-center gap-2"><StarRow value={r.rating} size={10} /><span className="text-[11px] text-mut">{timeAgo(r.createdAt)}{r.editedAt ? " · edited" : ""}</span></div>
        </div>
        {canEdit && !editing && (
          <div className="flex gap-1">
            <button onClick={() => setEditing(true)} className="btn-ghost p-1.5 cursor-pointer" aria-label="Edit"><Icon name="edit" size={13} /></button>
            <button onClick={async () => { await api.deleteReview(r.id); toast("info", "Review deleted"); refresh(); onChanged(); }} className="btn-ghost p-1.5 cursor-pointer hover:border-coral/50" aria-label="Delete"><Icon name="trash" size={13} /></button>
          </div>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <StarRow value={rating} size={18} onRate={setRating} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="field w-full px-3 py-2 text-[13px]" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="field w-full px-3 py-2 text-[13px] resize-none" />
          <div className="flex gap-2">
            <button onClick={async () => { await api.updateReview(r.id, { rating, title, body }); setEditing(false); toast("ok", "Review updated"); refresh(); onChanged(); }} className="btn-primary px-4 py-1.5 text-[12.5px] cursor-pointer">Save</button>
            <button onClick={() => setEditing(false)} className="btn-ghost px-4 py-1.5 text-[12.5px] cursor-pointer">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-[13.5px] font-semibold">{r.title}</div>
          <p className="text-[13px] text-mut leading-relaxed mt-0.5">{r.body}</p>
          <div className="flex items-center gap-2 mt-2.5 text-[11.5px] text-mut">
            <button onClick={async () => { const db = getDb(); const x = db.reviews.find((y) => y.id === r.id); if (x) { x.helpful++; } toast("info", "Marked helpful"); refresh(); onChanged(); }}
              className="chip px-2.5 py-1 inline-flex items-center gap-1.5 cursor-pointer hover:text-jade">
              <Icon name="check" size={11} /> Helpful · {r.helpful}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
