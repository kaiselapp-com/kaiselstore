import React, { useEffect, useRef, useState } from "react";
import type { Application, Category } from "../lib/types";
import { getDb, fmtInt, fmtBytes } from "../lib/db";
import { api, appRating, downloadCount, latestVersion, appSize, compatSummary, currentDevice } from "../lib/api";
import { AppIcon, Icon, StarRow, Badge, SkelRow, Reveal } from "../components/ui";
import { Rail, RailCard, AppRow, CompatDot } from "../components/layout";
import { navigate } from "../state/store";
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

export default function Home() {
  const [data, setData] = useState<HomeData | null>(null);
  const [slide, setSlide] = useState(0);
  const timer = useRef<number>(0);
  const device = currentDevice();

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
  }, []);

  useEffect(() => {
    if (!data?.featured.length) return;
    timer.current = window.setInterval(() => setSlide((s) => (s + 1) % data.featured.length), 6500);
    return () => window.clearInterval(timer.current);
  }, [data?.featured.length]);

  const db = getDb();
  const totalArtifacts = db.artifacts.filter((a) => a.status === "available").length;
  const totalDownloads = db.applications.reduce((s, a) => s + downloadCount(a.id), 0);
  const feat = data?.featured ?? [];
  const cur = feat[slide];

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6">
      {/* ============ SPOTLIGHT ============ */}
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
        ) : null}
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
              <span>{db.versions.filter((v) => v.status === "ready").length} versions ready</span>
              <span>signed artifacts preserved — never re-signed</span>
            </div>
          ))}
        </div>
      </div>

      {/* ============ CATEGORIES ============ */}
      <Reveal className="mb-12">
        <h2 className="font-disp font-bold text-[22px] tracking-tight mb-1">Browse by category</h2>
        <p className="text-mut text-[13px] mb-5">Every category ships device-matched artifacts.</p>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {(data?.categories ?? getDb().categories).map((c, i) => (
            <a key={c.id} href={`#/apps?cat=${c.id}`}
              className="group card p-3.5 flex flex-col gap-3 hover:-translate-y-0.5 hover:border-jade/50 transition-all anim-fade-up"
              style={{ animationDelay: `${i * 30}ms` }}>
              <span className="w-9 h-9 rounded-lg grid place-items-center" style={{ background: `hsl(${c.hue} 55% 45% / 0.18)`, color: `hsl(${c.hue} 70% 58%)` }}>
                <Icon name={c.glyph} size={18} />
              </span>
              <span className="text-[13px] font-semibold group-hover:text-jade transition-colors">{c.name}</span>
            </a>
          ))}
        </div>
      </Reveal>

      {/* ============ RAILS ============ */}
      {!data ? (
        <div className="space-y-12 mb-12"><SkelRow /><SkelRow /><SkelRow /></div>
      ) : (
        <>
          <Reveal><Rail title="Popular right now" sub="Most downloaded across all devices" href="/apps?sort=downloads">
            {data.popular.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}
          </Rail></Reveal>
          <Reveal><Rail title="New & noteworthy" sub="Fresh releases, recently processed and indexed" href="/apps?sort=newest">
            {data.newest.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}
          </Rail></Reveal>

          {/* pipeline band */}
          <Reveal className="mb-12">
            <div className="relative overflow-hidden rounded-2xl border border-line bg-panel">
              <div className="kaisel-grid absolute inset-0" />
              <div className="relative grid lg:grid-cols-2 gap-8 p-6 sm:p-10">
                <div>
                  <Badge tone="jade" className="mb-4"><Icon name="layers" size={11} /> The Kaisel pipeline</Badge>
                  <h2 className="font-disp font-bold text-[24px] sm:text-[30px] tracking-tight leading-tight">One upload.<br />A build for every device.</h2>
                  <p className="text-mut text-[14px] leading-relaxed mt-4 max-w-md">
                    Developers ship APKs or Android App Bundles. The <b className="text-ink">ArtifactProcessor</b> validates the container,
                    parses the manifest, and derives device-compatible APK sets — so a Pixel 9 Pro never downloads x86 code it can't run.
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-6 max-w-md">
                    {[["box", "Validate container & signing"], ["cpu", "Extract ABI / density / SDK"], ["layers", "Generate APK sets"], ["phone", "Index per-device compatibility"]].map(([ic, t]) => (
                      <div key={t} className="flex items-start gap-2.5 text-[12.5px] text-ink/85">
                        <span className="w-7 h-7 rounded-lg bg-jade/12 border border-jade/30 grid place-items-center text-jade shrink-0"><Icon name={ic} size={14} /></span>{t}
                      </div>
                    ))}
                  </div>
                  <button onClick={() => navigate("/dev")} className="btn-primary mt-7 px-5 py-2.5 text-[13.5px] inline-flex items-center gap-2 cursor-pointer">
                    <Icon name="rocket" size={15} /> Publish on Kaisel
                  </button>
                </div>
                <div className="term rounded-xl p-4 sm:p-5 overflow-hidden relative">
                  <div className="absolute left-0 right-0 h-10 bg-gradient-to-b from-jade/8 to-transparent pointer-events-none" style={{ animation: "k-scan 4.5s linear infinite" }} />
                  <div className="text-mut text-[11px] mb-2">artifact-processor · job ksl_8f3a21</div>
                  <pre className="whitespace-pre-wrap leading-relaxed">
{`$ kaisel ingest rift-racers-412.aab
`}<span className="lv-info">→</span>{` ZIP central directory ............ `}<span className="lv-ok">ok · 1,284 entries
</span><span className="lv-info">→</span>{` manifest.pb ..................... `}<span className="lv-ok">minSdk 30 · target 35
</span><span className="lv-info">→</span>{` native libs ..................... `}<span className="lv-ok">arm64-v8a, armeabi-v7a
</span><span className="lv-info">→</span>{` signing block ................... `}<span className="lv-ok">v2+v3 · preserved
</span><span className="lv-info">→</span>{` bundletool generate-apks ........ `}<span className="lv-warn">embedded expander
</span>{`  ✓ base.apk                      14.2 MB
  ✓ config.arm64_v8a.apk           6.9 MB
  ✓ config.armeabi_v7a.apk         6.4 MB
  ✓ config.xxhdpi.apk              3.1 MB
`}<span className="lv-ok">READY</span>{` · compatibility index rebuilt · 4 artifacts live`}
                  </pre>
                </div>
              </div>
            </div>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-x-8">
            <Reveal><Rail title="Top games" href="/apps?cat=games">{data.games.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}</Rail></Reveal>
            <Reveal><Rail title="Top productivity" href="/apps?cat=productivity">{data.productivity.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}</Rail></Reveal>
          </div>
          <Reveal><Rail title="Essential tools" sub="Utilities and tooling, split-APK optimized" href="/apps?cat=tools">
            {data.tools.map((a, i) => <RailCard key={a.id} app={a} index={i} />)}
          </Rail></Reveal>

          {/* recommended for device */}
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
              ["Compatibility index", `${totalArtifacts} artifacts`, "jade"],
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
