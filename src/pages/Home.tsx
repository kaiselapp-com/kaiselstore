import React, { useEffect, useRef, useState } from "react";
import type { Application, Category } from "../lib/types";
import { getDb, fmtInt, fmtBytes } from "../lib/db";
import { api, appRating, downloadCount, latestVersion, appSize, currentDevice } from "../lib/api";
import { AppIcon, Icon, StarRow, Badge, SkelRow, Reveal } from "../components/ui";
import { Rail, RailCard, AppRow, CompatDot } from "../components/layout";
import { navigate, useStore } from "../state/store";
import { densityLabel } from "../lib/device";

interface HomeData {
  featured: Application[];
  popular: Application[];
  newest: Application[];
  games: Application[];
  productivity: Application[];
  tools: Application[];
  recommended: Application[];
  categories: Category[];
}

/* ---------- animated pipeline terminal (opening band) ---------- */

const PIPELINE_SCRIPT = [
  { cls: "text-mut", text: "$ kaisel processor --watch" },
  { cls: "", text: "intake vault .................. sealed" },
  { cls: "lv-ok", text: "compatibility index ........... online · 0 artifacts" },
  { cls: "", text: "waiting for first submission" },
  { cls: "lv-info", text: "→ developer registers listing (icon · art · screenshots)" },
  { cls: "lv-info", text: "→ AAB uploaded · ZIP central directory parsed" },
  { cls: "lv-ok", text: "  signing block v2+v3 preserved" },
  { cls: "lv-info", text: "→ device APK set derived (base + config splits)" },
  { cls: "lv-ok", text: "READY · indexed for 4 ABIs · 6 densities" },
  { cls: "", text: "next visitor's device gets its own build" },
];

function PipelineTerminal() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = window.setInterval(() => setN((v) => (v >= PIPELINE_SCRIPT.length ? 1 : v + 1)), 850);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="term rounded-xl p-4 sm:p-5 overflow-hidden relative h-full min-h-[240px]">
      <div className="absolute left-0 right-0 h-12 pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(56,140,220,0.10), transparent)", animation: "kScan 4.5s linear infinite" }} />
      <div className="text-mut text-[11px] mb-2">artifact-processor · embedded expander · idle-watch</div>
      {PIPELINE_SCRIPT.slice(0, n).map((l, i) => (
        <div key={i} className={`${l.cls} anim-fade-up`}>{l.text}</div>
      ))}
      <div className="animate-pulse">▍</div>
    </div>
  );
}

/* ---------- ghost shelf (empty rails) ---------- */

function GhostShelf() {
  return (
    <Reveal className="mb-12">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="font-disp font-bold text-[22px] tracking-tight">The shelf is waiting</h2>
          <p className="text-mut text-[13px] mt-0.5">Popular, new and category rails fill themselves the moment a build reaches <b className="text-jade font-mono">READY</b>.</p>
        </div>
        <button onClick={() => navigate("/dev")} className="btn-ghost hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium hover:text-jade cursor-pointer">
          Publish the first app <Icon name="arrow-r" size={13} />
        </button>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {["Popular right now", "New & noteworthy", "Essential tools"].map((t, k) => (
          <div key={t} className="anim-fade-up" style={{ animationDelay: `${k * 90}ms` }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mut mb-3">{t}</div>
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-dashed border-line2/70 p-3.5 flex items-center gap-3 opacity-70 hover:opacity-100 hover:border-jade/40 transition-all">
                  <span className="w-10 h-10 rounded-[11px] border border-dashed border-line2 grid place-items-center text-mut"><Icon name="box" size={16} /></span>
                  <span className="text-[12.5px] text-mut">First {t.split(" ")[0].toLowerCase()} app lands here</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/* ---------- publish pipeline strip ---------- */

function PublishStrip() {
  const steps: [string, string, string][] = [
    ["doc", "Register a listing", "name · package · icon · feature art · screenshots"],
    ["upload", "Upload the artifact", "AAB / APK / APKS up to 200 MB, hashed at intake"],
    ["layers", "Processor derives splits", "ABI · density · SDK constraints indexed live"],
    ["phone", "Device-matched delivery", "each visitor downloads a build for their own hardware"],
  ];
  return (
    <Reveal className="mb-12">
      <div className="rounded-2xl border border-line bg-panel overflow-hidden">
        <div className="px-6 pt-6 sm:px-8 flex items-center gap-3">
          <Badge tone="jade"><Icon name="rocket" size={11} /> How apps reach this shelf</Badge>
          <span className="text-[12px] text-mut font-mono hidden sm:inline">average time-to-live: under a minute</span>
        </div>
        <div className="flex flex-col lg:flex-row items-stretch gap-0 p-6 sm:p-8">
          {steps.map(([ic, title, sub], i) => (
            <React.Fragment key={title}>
              <div className="flex-1 flex items-start gap-3.5 group cursor-default min-w-0">
                <span className="relative shrink-0">
                  <span className="w-11 h-11 rounded-xl bg-jade/12 border border-jade/30 grid place-items-center text-jade transition-transform group-hover:scale-110 group-hover:-rotate-3">
                    <Icon name={ic} size={19} />
                  </span>
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-panel border border-line grid place-items-center text-[10px] font-mono font-bold text-mut">0{i + 1}</span>
                </span>
                <span className="min-w-0">
                  <span className="block font-disp font-semibold text-[14.5px] group-hover:text-jade transition-colors">{title}</span>
                  <span className="block text-[12px] text-mut leading-relaxed mt-0.5">{sub}</span>
                </span>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden lg:flex items-center px-3 text-line2" aria-hidden>
                  <svg width="34" height="12" viewBox="0 0 34 12" className="text-jade/50">
                    <line x1="0" y1="6" x2="26" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 4" className="dash-flow" />
                    <path d="M26 1.5L33 6l-7 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
              {i < steps.length - 1 && <div className="lg:hidden flex justify-start pl-5 py-1 text-jade/50"><Icon name="chev-d" size={15} /></div>}
            </React.Fragment>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

export default function Home() {
  const { tick } = useStore();
  const [data, setData] = useState<HomeData | null>(null);
  const [slide, setSlide] = useState(0);
  const timer = useRef<number>(0);
  const device = currentDevice();
  void tick;

  useEffect(() => {
    let on = true;
    (async () => {
      const [featured, popular, newest, games, productivity, tools, recommended, categories] = await Promise.all([
        api.featured(), api.popular(), api.newest(),
        api.topIn("games"), api.topIn("productivity"), api.topIn("tools"),
        api.recommended(), api.categories(),
      ]);
      if (on) setData({ featured, popular, newest, games, productivity, tools, recommended, categories });
    })();
    return () => { on = false; };
  }, [tick]);

  useEffect(() => {
    if (!data?.featured.length) return;
    timer.current = window.setInterval(() => setSlide((s) => (s + 1) % data.featured.length), 6500);
    return () => window.clearInterval(timer.current);
  }, [data?.featured.length]);

  const db = getDb();
  const totalArtifacts = db.artifacts.filter((a) => a.status === "available").length;
  const totalDownloads = db.applications.reduce((s, a) => s + downloadCount(a.id), 0);
  const feat = data?.featured ?? [];
  const cur = feat[Math.min(slide, Math.max(0, feat.length - 1))];
  const hasApps = (data?.popular.length ?? 0) > 0;

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6">
      {/* ============ SPOTLIGHT / GRAND OPENING ============ */}
      <section className="relative overflow-hidden rounded-2xl mb-4" style={{ background: "linear-gradient(125deg, #13294f, #0a1a38 70%)", border: "1px solid rgba(130,165,230,0.22)" }}>
        <div className="kaisel-grid absolute inset-0 opacity-60" />
        {!data ? (
          <div className="p-6 sm:p-10 grid md:grid-cols-[1.2fr_1fr] gap-8 items-center min-h-[300px]">
            <div><div className="skeleton h-4 w-24 mb-4" /><div className="skeleton h-10 w-72 mb-3" /><div className="skeleton h-4 w-full mb-2" /><div className="skeleton h-4 w-2/3 mb-6" /><div className="skeleton h-11 w-40" /></div>
            <div className="skeleton h-[240px] rounded-xl hidden md:block" />
          </div>
        ) : cur ? (
          <div key={cur.id} className="relative grid md:grid-cols-[1.15fr_1fr] items-stretch">
            <div className="p-6 sm:p-10 flex flex-col justify-center anim-fade-up">
              <div className="flex items-center gap-2 mb-4">
                <Badge tone="gold"><Icon name="spark" size={11} /> Featured {slide + 1} / {feat.length}</Badge>
                <CompatDot app={cur} verbose />
              </div>
              <div className="flex items-center gap-4">
                <AppIcon spec={cur.icon} size={64} />
                <div>
                  <h1 className="font-disp font-bold text-[30px] sm:text-[40px] leading-[1.04] tracking-tight text-[#eef3fc]">{cur.name}</h1>
                  <p className="text-[13px] mt-1" style={{ color: "#a8b7d6" }}>{getDb().developers.find((d) => d.id === cur.developerId)?.name}</p>
                </div>
              </div>
              <p className="text-[15px] mt-4 max-w-lg leading-relaxed" style={{ color: "#c9d5ec" }}>{cur.featuredBlurb ?? cur.tagline}</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 text-[12.5px]" style={{ color: "#a8b7d6" }}>
                <span className="inline-flex items-center gap-1.5"><StarRow value={appRating(cur.id).avg} size={12} /> <b className="text-white font-mono">{appRating(cur.id).avg.toFixed(1)}</b></span>
                <span className="font-mono">{fmtInt(downloadCount(cur.id))} downloads</span>
                <span className="font-mono">{fmtBytes(appSize(cur.id))}</span>
                <span className="font-mono">v{latestVersion(cur.id)?.versionName}</span>
              </div>
              <div className="flex flex-wrap gap-3 mt-6">
                <button onClick={() => navigate(`/app/${cur.packageName}`)} className="px-6 py-2.5 text-[14px] inline-flex items-center gap-2 cursor-pointer rounded-xl font-semibold text-[#0d1e40] transition-all hover:-translate-y-px" style={{ background: "#ffffff", boxShadow: "0 10px 24px -12px rgba(0,0,0,0.55)" }}>
                  <Icon name="download" size={16} /> Get the app
                </button>
                <button onClick={() => navigate("/apps")} className="px-5 py-2.5 text-[14px] cursor-pointer rounded-xl font-medium transition-colors" style={{ border: "1px solid rgba(140,170,230,0.35)", color: "#dce6f8" }}>Browse store</button>
              </div>
            </div>
            <div className="relative min-h-[220px] md:min-h-[360px] overflow-hidden">
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, hsl(${cur.icon.hue} 60% 30%), hsl(${cur.icon.hue + 60} 55% 18%))` }} />
              {cur.featuredArt && (
                <img src={cur.featuredArt} alt={cur.name} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  className="absolute inset-0 w-full h-full object-cover anim-fade-up" />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-[#0e2247] via-[#0e2247]/25 to-transparent" />
            </div>
            <div className="absolute bottom-4 left-6 sm:left-10 flex gap-2 z-10">
              {feat.map((f, i) => (
                <button key={f.id} onClick={() => { setSlide(i); window.clearInterval(timer.current); }} aria-label={`Slide ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${i === slide ? "w-8 bg-[#8fb3f0]" : "w-3 bg-white/25 hover:bg-white/50"}`} />
              ))}
            </div>
          </div>
        ) : (
          /* ---- grand opening (empty catalog) ---- */
          <div className="relative grid lg:grid-cols-[1.15fr_1fr] gap-8 items-stretch p-6 sm:p-10">
            <div className="flex flex-col justify-center anim-fade-up">
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11.5px] font-semibold uppercase tracking-[0.12em]" style={{ background: "rgba(56,211,159,0.12)", border: "1px solid rgba(56,211,159,0.35)", color: "#7fe0bd" }}>
                  <span className="relative flex w-2 h-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ background: "#4ade9f" }} /><span className="relative inline-flex rounded-full w-2 h-2" style={{ background: "#4ade9f" }} /></span>
                  Store online · {db.applications.length} apps live
                </span>
                {device.detected && (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-mono" style={{ background: "rgba(140,170,230,0.12)", border: "1px solid rgba(140,170,230,0.3)", color: "#a9c2ee" }}>
                    <Icon name="cpu" size={12} /> {device.label} identified
                  </span>
                )}
              </div>
              <h1 className="font-disp font-bold text-[34px] sm:text-[48px] leading-[1.02] tracking-tight text-[#eef3fc]">
                The shelf is empty.<br />
                <span style={{ color: "#8fb3f0" }}>Your build won't be.</span>
              </h1>
              <p className="text-[15px] mt-5 max-w-lg leading-relaxed" style={{ color: "#b9c8e4" }}>
                Kaisel is a device-matched app store: every listing here was published by a developer,
                processed by the <b className="text-white">ArtifactProcessor</b>, and is delivered as a build
                generated for the exact device that asks for it.
              </p>
              <div className="flex flex-wrap gap-3 mt-7">
                <button onClick={() => navigate("/dev")} className="px-6 py-3 text-[14px] inline-flex items-center gap-2 cursor-pointer rounded-xl font-semibold text-[#0d1e40] transition-all hover:-translate-y-px" style={{ background: "#ffffff", boxShadow: "0 10px 24px -12px rgba(0,0,0,0.55)" }}>
                  <Icon name="rocket" size={16} /> Publish the first app
                </button>
                <button onClick={() => navigate("/device")} className="px-5 py-3 text-[14px] cursor-pointer rounded-xl font-medium inline-flex items-center gap-2 transition-colors" style={{ border: "1px solid rgba(140,170,230,0.35)", color: "#dce6f8" }}>
                  <Icon name="cpu" size={15} /> Open Device Lab
                </button>
              </div>
            </div>
            <div className="hidden md:block anim-fade-up" style={{ animationDelay: "120ms" }}>
              <PipelineTerminal />
            </div>
          </div>
        )}
      </section>

      {/* ============ TICKER ============ */}
      <div className="border border-line rounded-xl bg-panel overflow-hidden mb-12">
        <div className="ticker-track py-2.5 text-[12px] font-mono text-mut">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 items-center gap-8 pr-8">
              <span className="inline-flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-jade inline-block" /> {db.applications.length} apps live</span>
              <span>{totalArtifacts} artifacts in vault</span>
              <span>{fmtInt(totalDownloads)} total downloads</span>
              <span className="text-jade">SHA-256 on every artifact</span>
              <span>delivering for API {device.androidApi} · {device.abi} · {densityLabel(device.density)}</span>
              <span className="text-gold">AAB expander: embedded</span>
              {hasApps
                ? <span>{db.versions.filter((v) => v.status === "ready").length} versions ready</span>
                : <span className="text-cy">compatibility index online — awaiting first READY build</span>}
              <span>signed artifacts preserved — never re-signed</span>
            </div>
          ))}
        </div>
      </div>

      {/* ============ CATEGORIES ============ */}
      <Reveal className="mb-12">
        <h2 className="font-disp font-bold text-[22px] tracking-tight mb-1">Browse by category</h2>
        <p className="text-mut text-[13px] mb-5">The store's structure is ready — every category ships device-matched artifacts.</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {(data?.categories ?? getDb().categories).map((c, i) => {
            const count = db.applications.filter((a) => a.status === "approved" && a.categoryIds.includes(c.id)).length;
            return (
              <a key={c.id} href={`#/apps?cat=${c.id}`}
                className="group card p-3.5 flex flex-col gap-3 hover:-translate-y-0.5 hover:border-jade/50 transition-all anim-fade-up"
                style={{ animationDelay: `${i * 30}ms` }}>
                <span className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: `hsl(${c.hue} 55% 45% / 0.18)`, color: `hsl(${c.hue} 70% 58%)` }}>
                  <Icon name={c.glyph} size={18} />
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold group-hover:text-jade transition-colors">{c.name}</span>
                  <span className="text-[10.5px] font-mono text-mut">{count || ""}</span>
                </span>
              </a>
            );
          })}
        </div>
      </Reveal>

      {/* ============ RAILS / EMPTY SHELF ============ */}
      {!data ? (
        <div className="space-y-12 mb-12"><SkelRow /><SkelRow /><SkelRow /></div>
      ) : hasApps ? (
        <>
          <Reveal><Rail title="Popular right now" sub="Most downloaded across all devices" href="/apps?sort=downloads">
            {data.popular.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}
          </Rail></Reveal>
          <Reveal><Rail title="New & noteworthy" sub="Fresh releases, recently processed and indexed" href="/apps?sort=newest">
            {data.newest.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}
          </Rail></Reveal>
          <div className="grid lg:grid-cols-2 gap-x-8">
            <Reveal><Rail title="Top games" href="/apps?cat=games">{data.games.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}</Rail></Reveal>
            <Reveal><Rail title="Top productivity" href="/apps?cat=productivity">{data.productivity.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}</Rail></Reveal>
          </div>
          <Reveal><Rail title="Essential tools" sub="Utilities and tooling, split-APK optimized" href="/apps?cat=tools">
            {data.tools.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}
          </Rail></Reveal>
          {data.recommended.length > 0 && (
            <Reveal className="mb-12">
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <h2 className="font-disp font-bold text-[22px] tracking-tight flex items-center gap-2.5">
                    Recommended for {device.label}
                    {device.detected && <Badge tone="jade"><Icon name="cpu" size={11} /> auto-identified</Badge>}
                  </h2>
                  <p className="text-mut text-[13px] mt-0.5 font-mono">API {device.androidApi} · {device.abi} · {densityLabel(device.density)}{device.formFactor ? ` · ${device.formFactor}` : ""} — every app below has a compatible artifact</p>
                </div>
                <a href="#/device" className="btn-ghost hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium hover:text-jade shrink-0">
                  Device Lab <Icon name="arrow-r" size={13} />
                </a>
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {data.recommended.slice(0, 8).map((a, i) => <AppRow key={a.id} app={a} index={i} />)}
              </div>
            </Reveal>
          )}
        </>
      ) : (
        <>
          <GhostShelf />
          <PublishStrip />
        </>
      )}

      {/* ============ DEVELOPER CTA + STATUS ============ */}
      <Reveal className="mb-4">
        <div className="rounded-2xl border border-line overflow-hidden grid md:grid-cols-[1.4fr_1fr]">
          <div className="p-6 sm:p-10 relative" style={{ background: "linear-gradient(130deg, #13294f, #081530)" }}>
            <div className="kaisel-grid absolute inset-0 opacity-50" />
            <div className="relative">
              <Badge tone="gold" className="mb-4">For developers</Badge>
              <h2 className="font-disp font-bold text-[26px] sm:text-[32px] tracking-tight leading-tight text-[#eef3fc]">Ship one bundle.<br />Reach every ABI.</h2>
              <p className="text-[13.5px] mt-3 max-w-md leading-relaxed" style={{ color: "#a8b7d6" }}>
                Upload an AAB or APK, watch the processor derive splits in real time, and review per-device compatibility before you go live.
              </p>
              <div className="flex gap-3 mt-6">
                <button onClick={() => navigate("/dev")} className="px-5 py-2.5 text-[13.5px] inline-flex items-center gap-2 cursor-pointer rounded-xl font-semibold text-[#0d1e40] transition-all hover:-translate-y-px" style={{ background: "#ffffff" }}><Icon name="terminal" size={15} /> Open developer console</button>
                <button onClick={() => navigate("/api-docs")} className="px-5 py-2.5 text-[13.5px] cursor-pointer rounded-xl font-medium transition-colors" style={{ border: "1px solid rgba(140,170,230,0.35)", color: "#dce6f8" }}>API docs</button>
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-8 bg-panel border-t md:border-t-0 md:border-l border-line">
            <h3 className="font-disp font-semibold text-[15px] mb-4 flex items-center gap-2"><Icon name="shield" size={16} className="text-jade" /> Platform status</h3>
            {[
              ["Intake vault", "operational", "jade"],
              ["ArtifactProcessor", "embedded expander", "gold"],
              ["Compatibility index", hasApps ? `${totalArtifacts} artifacts` : "online · awaiting builds", "jade"],
              ["Hash verification", "SHA-256 · WebCrypto", "jade"],
              ["Download CDN", "signed URLs · 90s TTL", "jade"],
            ].map(([k, v, tone]) => (
              <div key={k} className="flex items-center justify-between py-2 border-b border-line last:border-0 text-[12.5px]">
                <span className="text-mut">{k}</span>
                <Badge tone={tone as "jade" | "gold"}>{v}</Badge>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
