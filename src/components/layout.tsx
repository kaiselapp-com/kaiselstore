import React, { useEffect, useRef, useState } from "react";
import type { Application, DeviceProfile } from "../lib/types";
import { getDb, saveDb, fmtInt, fmtBytes, timeAgo } from "../lib/db";
import { api, appById, appRating, downloadCount, compatSummary, latestVersion, appSize, currentDevice } from "../lib/api";
import { AppIcon, Icon, StarRow, Badge, Modal, Chip } from "./ui";
import { useStore, navigate } from "../state/store";
import { densityLabel } from "../lib/device";

/* ---------- logo ---------- */

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <a href="#/" className="flex items-center gap-2.5 group" aria-label="Kaisel Store home">
      <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0">
        <rect x="1.5" y="1.5" width="37" height="37" rx="11" fill="rgba(255,255,255,0.08)" stroke="rgba(150,178,232,0.35)" />
        <path d="M11 30V11h4v7.2L22.4 11h5l-8 8.2L28 30h-5.1l-6-7.6-1.9 1.9V30H11z" fill="#eef3fc" className="group-hover:fill-[#9dbcF0] transition-colors" />
        <path d="M12 6.5l4 2.4 4-3 4 3 4-2.4" stroke="#e2b054" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-disp font-bold text-[17px] tracking-tight leading-none text-white">
        Kaisel<span className="text-[#8fb3f0]"> Store</span>
        <span className="block text-[9.5px] font-body font-medium tracking-[0.14em] uppercase mt-0.5" style={{ color: "rgba(190,208,240,0.55)" }}>device-matched delivery</span>
      </span>
    </a>
  );
}

/* ---------- search ---------- */

function NavSearch() {
  const [q, setQ] = useState("");
  const [sug, setSug] = useState<Application[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, []);

  const onChange = (v: string) => {
    setQ(v);
    window.clearTimeout(timer.current);
    if (!v.trim()) { setSug([]); setOpen(false); return; }
    timer.current = window.setTimeout(async () => {
      try {
        const r = await api.search({ q: v, pageSize: 5 });
        setSug(r.items); setOpen(true);
      } catch { setSug([]); }
    }, 220);
  };

  return (
    <div ref={wrap} className="relative flex-1 max-w-xl">
      <div className="field flex items-center gap-2 px-3 py-2">
        <Icon name="search" size={15} className="text-mut" />
        <input value={q} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { navigate(`/apps?q=${encodeURIComponent(q)}`); setOpen(false); } }}
          placeholder="Search apps, packages, developers…"
          className="bg-transparent flex-1 text-[13.5px] placeholder:text-mut" aria-label="Search" />
        <kbd className="hidden md:block text-[10px] font-mono text-mut border border-line rounded px-1.5 py-0.5">↵</kbd>
      </div>
      {open && sug.length > 0 && (
        <div className="absolute top-[calc(100%+6px)] left-0 right-0 card shadow-2xl shadow-black/30 z-50 overflow-hidden anim-pop">
          {sug.map((a) => {
            const dev = getDb().developers.find((d) => d.id === a.developerId);
            return (
              <button key={a.id} onClick={() => { navigate(`/app/${a.packageName}`); setOpen(false); setQ(""); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-panel2 text-left cursor-pointer border-b border-line last:border-0">
                <AppIcon spec={a.icon} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold truncate">{a.name}</div>
                  <div className="text-[11.5px] text-mut truncate">{dev?.name} · {fmtInt(downloadCount(a.id))} downloads</div>
                </div>
                <StarRow value={appRating(a.id).avg} size={11} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ---------- device switcher ---------- */

function DeviceSwitcher() {
  const { refresh, toast, tick } = useStore();
  const [open, setOpen] = useState(false);
  void tick;
  const db = getDb();
  const cur = currentDevice();

  const pick = (id: string) => {
    db.currentDeviceId = id;
    saveDb();
    refresh();
    setOpen(false);
    const d = db.devices.find((x) => x.id === id);
    toast("info", `Device profile → ${d?.label ?? id}`);
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost hidden lg:flex items-center gap-2 px-3 py-2 cursor-pointer" title="Identified device — click to switch or open Device Lab">
        <Icon name={cur.formFactor === "tablet" ? "grid" : cur.formFactor === "foldable" ? "layers" : cur.formFactor === "desktop" ? "doc" : "phone"} size={15} className="text-jade" />
        <span className="text-left leading-tight">
          <span className="block text-[12px] font-semibold max-w-[170px] truncate">{cur.label}</span>
          <span className="block text-[10.5px] font-mono" style={{ color: "rgba(170,190,228,0.6)" }}>
            {cur.detected ? "auto-identified · " : ""}API {cur.androidApi} · {cur.abi} · {cur.tier?.toUpperCase() ?? "—"}
          </span>
        </span>
        <Icon name="chev-d" size={13} className="opacity-50" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Device targeting">
        <button onClick={() => { setOpen(false); navigate("/device"); }}
          className="w-full flex items-center gap-3 p-3.5 rounded-xl mb-4 text-left cursor-pointer transition-all hover:-translate-y-px"
          style={{ background: "linear-gradient(125deg, #13294f, #0a1a38)", border: "1px solid rgba(130,165,230,0.25)" }}>
          <span className="w-9 h-9 rounded-lg grid place-items-center shrink-0" style={{ background: "rgba(255,255,255,0.1)" }}>
            <Icon name="cpu" size={18} className="text-[#8fb3f0]" />
          </span>
          <span className="flex-1">
            <span className="block text-[13.5px] font-semibold text-white">Open Device Lab</span>
            <span className="block text-[11.5px]" style={{ color: "#a8b7d6" }}>Live hardware fingerprint · 37-device matrix · generated builds</span>
          </span>
          <Icon name="arrow-r" size={15} className="text-[#8fb3f0]" />
        </button>
        <p className="text-[12.5px] text-mut leading-relaxed mb-4">
          Kaisel generates each download for a specific device. Switch the active target to preview what different hardware receives — this is the same
          <code className="font-mono text-jade2 mx-1">DeviceProfile</code>the Android client registers via <code className="font-mono text-jade2">POST /api/device/profile</code>.
        </p>
        <div className="space-y-2">
          {db.devices.map((d) => (
            <button key={d.id} onClick={() => pick(d.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left cursor-pointer transition-colors ${d.id === cur.id ? "border-jade/60 bg-jade/8" : "border-line hover:border-line2 hover:bg-panel2"}`}>
              <Icon name={d.formFactor === "tablet" ? "grid" : d.formFactor === "foldable" || d.formFactor === "dual-screen" ? "layers" : d.formFactor === "desktop" ? "doc" : "phone"} size={17} className={d.id === cur.id ? "text-jade" : "text-mut"} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-semibold truncate">{d.label} {d.detected && <Badge tone="cy">auto</Badge>} {d.tier && <Badge tone={d.tier === "go" || d.tier === "low" ? "gold" : "mut"}>{d.tier}</Badge>}</span>
                <span className="block text-[11.5px] text-mut font-mono truncate">API {d.androidApi} · {d.abi} · {densityLabel(d.density)} · {d.screenWidth}×{d.screenHeight}{d.oemSkin ? ` · ${d.oemSkin}` : ""}</span>
              </span>
              {d.id === cur.id && <Icon name="check" size={16} className="text-jade" />}
            </button>
          ))}
        </div>
        <button onClick={() => { setOpen(false); navigate("/account"); }} className="btn-ghost w-full mt-3 py-2 text-[13px] font-medium flex items-center justify-center gap-2 cursor-pointer">
          <Icon name="plus" size={14} /> Create custom profile
        </button>
      </Modal>
    </>
  );
}

/* ---------- navbar ---------- */

export function Navbar() {
  const { session, theme, toggleTheme, signOut } = useStore();
  const [mobile, setMobile] = useState(false);
  const [acct, setAcct] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);
  const db = getDb();
  const updatesCount = (() => {
    try {
      const d = currentDevice();
      return db.installed.filter((i) => {
        const a = appById(i.packageName) ?? db.applications.find((x) => x.packageName === i.packageName);
        if (!a) return false;
        const v = latestVersion(a.id);
        return v && v.versionCode > i.versionCode && compatSummary(a.id, d).compatible;
      }).length;
    } catch { return 0; }
  })();

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcct(false); };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, []);

  const link = (href: string, label: string, badge?: number) => (
    <a key={href} href={`#${href}`}
      className={`relative nav-link ${window.location.hash.startsWith("#" + href) ? "active" : ""}`}>
      {label}
      {badge ? <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#e2b054] text-[#2a1c02] text-[10px] font-bold grid place-items-center">{badge}</span> : null}
    </a>
  );

  return (
    <header className="navbar sticky top-0 z-40" style={{ background: "linear-gradient(180deg, #0e2148, #0a1834)", borderBottom: "1px solid rgba(130,165,230,0.16)" }}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-5">
        <Logo />
        <nav className="hidden md:flex items-center gap-0.5 ml-2">
          {link("/apps", "Apps")}
          {link("/categories", "Categories")}
          {link("/updates", "Updates", updatesCount)}
          {link("/dev", "Developers")}
        </nav>
        <div className="flex-1" />
        <NavSearch />
        <DeviceSwitcher />
        <button onClick={toggleTheme} className="btn-ghost p-2.5 cursor-pointer" aria-label="Toggle theme">
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </button>
        {session ? (
          <div ref={acctRef} className="relative">
            <button onClick={() => setAcct((v) => !v)} className="w-9 h-9 rounded-full grid place-items-center font-disp font-bold text-[13px] cursor-pointer border border-line2"
              style={{ background: `hsl(${db.users.find((u) => u.uid === session.uid)?.avatarHue ?? 160} 55% 32%)`, color: "#fff" }} aria-label="Account">
              {session.displayName.slice(0, 1).toUpperCase()}
            </button>
            {acct && (
              <div className="absolute right-0 top-[calc(100%+8px)] card w-56 shadow-2xl shadow-black/30 z-50 anim-pop overflow-hidden">
                <div className="px-4 py-3 border-b border-line">
                  <div className="text-[13.5px] font-semibold truncate">{session.displayName}</div>
                  <div className="text-[11.5px] text-mut truncate">{session.email}</div>
                  <Badge tone={session.role === "admin" ? "coral" : session.role === "developer" ? "gold" : "jade"} className="mt-1.5">{session.role}</Badge>
                </div>
                <a href="#/account" onClick={() => setAcct(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-panel2"><Icon name="user" size={15} /> Account & devices</a>
                <a href="#/downloads" onClick={() => setAcct(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-panel2"><Icon name="download" size={15} /> Downloads</a>
                {session.role !== "user" && <a href="#/dev" onClick={() => setAcct(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-panel2"><Icon name="terminal" size={15} /> Developer console</a>}
                {session.role === "admin" && <a href="#/admin" onClick={() => setAcct(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-panel2"><Icon name="shield" size={15} /> Admin panel</a>}
                <button onClick={() => { signOut(); setAcct(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-panel2 text-coral cursor-pointer border-t border-line"><Icon name="logout" size={15} /> Sign out</button>
              </div>
            )}
          </div>
        ) : (
          <a href="#/auth" className="btn-primary px-4 py-2 text-[13px] hidden sm:block">Sign in</a>
        )}
        <button className="md:hidden btn-ghost p-2.5 cursor-pointer" onClick={() => setMobile((v) => !v)} aria-label="Menu">
          <Icon name={mobile ? "x" : "menu"} size={17} />
        </button>
      </div>
      {mobile && (
        <div className="md:hidden mobile-menu border-t px-4 py-3 flex flex-col gap-1 anim-fade-up">
          {[["/apps", "Apps"], ["/categories", "Categories"], ["/device", "Device Lab"], ["/updates", "Updates"], ["/downloads", "Downloads"], ["/dev", "Developers"], ["/api-docs", "API docs"], ...(session ? [] : [["/auth", "Sign in"] as [string, string]])].map(([h, l]) => (
            <a key={h} href={`#${h}`} onClick={() => setMobile(false)} className="mob-link px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors">{l}</a>
          ))}
        </div>
      )}
    </header>
  );
}

/* ---------- app card ---------- */

export function CompatDot({ app, verbose }: { app: Application; verbose?: boolean }) {
  const d = currentDevice();
  const c = compatSummary(app.id, d);
  if (verbose) {
    return c.compatible
      ? <span className="inline-flex items-center gap-1.5 text-jade text-[12px] font-medium"><Icon name="check" size={13} /> Compatible with your device</span>
      : <span className="inline-flex items-center gap-1.5 text-coral text-[12px] font-medium"><Icon name="x" size={13} /> {c.reasons[0] ?? "Not compatible"}</span>;
  }
  return (
    <span title={c.compatible ? "Compatible with current device profile" : `Not compatible: ${c.reasons[0] ?? ""}`}
      className={`inline-block w-2 h-2 rounded-full ${c.compatible ? "bg-jade" : "bg-coral"}`} />
  );
}

export function AppCard({ app, index = 0 }: { app: Application; index?: number }) {
  const dev = getDb().developers.find((d) => d.id === app.developerId);
  const r = appRating(app.id);
  return (
    <a href={`#/app/${app.packageName}`}
      className="group block card p-4 transition-all duration-200 hover:-translate-y-1 hover:border-jade/50 hover:shadow-xl hover:shadow-black/20 anim-fade-up"
      style={{ animationDelay: `${Math.min(index * 45, 400)}ms` }}>
      <div className="flex items-start gap-3.5">
        <AppIcon spec={app.icon} size={54} className="transition-transform duration-200 group-hover:scale-105" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-disp font-semibold text-[14.5px] truncate group-hover:text-jade transition-colors">{app.name}</h3>
            <CompatDot app={app} />
          </div>
          <p className="text-[12px] text-mut truncate">{dev?.name}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <StarRow value={r.avg} size={11} />
            <span className="text-[11.5px] text-mut font-mono">{r.avg ? r.avg.toFixed(1) : "–"}</span>
          </div>
        </div>
      </div>
      <p className="text-[12.5px] text-mut leading-relaxed mt-3 line-clamp-2 min-h-[2.4em]">{app.tagline}</p>
      <div className="flex items-center gap-2 mt-3 text-[11px] text-mut font-mono">
        <span>{fmtInt(downloadCount(app.id))} ↓</span><span className="text-line2">·</span>
        <span>{fmtBytes(appSize(app.id))}</span><span className="text-line2">·</span>
        <span>v{latestVersion(app.id)?.versionName ?? "–"}</span>
      </div>
    </a>
  );
}

export function AppRow({ app, index = 0 }: { app: Application; index?: number }) {
  const dev = getDb().developers.find((d) => d.id === app.developerId);
  const r = appRating(app.id);
  const cat = getDb().categories.find((c) => app.categoryIds.includes(c.id));
  return (
    <a href={`#/app/${app.packageName}`}
      className="group flex items-center gap-3.5 p-3 rounded-xl border border-transparent hover:border-line hover:bg-panel transition-all anim-fade-up"
      style={{ animationDelay: `${Math.min(index * 35, 300)}ms` }}>
      <AppIcon spec={app.icon} size={46} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-disp font-semibold text-[14px] truncate group-hover:text-jade transition-colors">{app.name}</h3>
          <CompatDot app={app} />
        </div>
        <p className="text-[11.5px] text-mut truncate">{dev?.name} · {cat?.name}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-mut">
          <StarRow value={r.avg} size={10} />
          <span className="font-mono">{r.avg ? r.avg.toFixed(1) : "–"}</span>
          <span className="text-line2">·</span><span className="font-mono">{fmtInt(downloadCount(app.id))} ↓</span>
        </div>
      </div>
      <Icon name="chev-r" size={16} className="text-mut group-hover:text-jade group-hover:translate-x-0.5 transition-all" />
    </a>
  );
}

/* ---------- rail ---------- */

export function Rail({ title, sub, href, children }: { title: string; sub?: string; href?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * 480, behavior: "smooth" });
  return (
    <section className="mb-10">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="font-disp font-bold text-[19px] sm:text-[22px] tracking-tight">{title}</h2>
          {sub && <p className="text-mut text-[12.5px] mt-0.5">{sub}</p>}
        </div>
        <div className="flex items-center gap-2">
          {href && <a href={`#${href}`} className="btn-ghost hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium hover:text-jade">See all <Icon name="arrow-r" size={13} /></a>}
          <button onClick={() => scroll(-1)} className="btn-ghost p-2 cursor-pointer" aria-label="Scroll left"><Icon name="chev-l" size={15} /></button>
          <button onClick={() => scroll(1)} className="btn-ghost p-2 cursor-pointer" aria-label="Scroll right"><Icon name="chev-r" size={15} /></button>
        </div>
      </div>
      <div ref={ref} className="scrollx flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">{children}</div>
    </section>
  );
}

export function RailCard({ app, index = 0 }: { app: Application; index?: number }) {
  const dev = getDb().developers.find((d) => d.id === app.developerId);
  const r = appRating(app.id);
  return (
    <a href={`#/app/${app.packageName}`}
      className="group shrink-0 w-[172px] snap-start card p-3.5 transition-all duration-200 hover:-translate-y-1 hover:border-jade/50 anim-fade-up"
      style={{ animationDelay: `${Math.min(index * 40, 300)}ms` }}>
      <AppIcon spec={app.icon} size={52} className="mb-3 transition-transform group-hover:scale-105" />
      <h3 className="font-disp font-semibold text-[13.5px] truncate group-hover:text-jade transition-colors">{app.name}</h3>
      <p className="text-[11px] text-mut truncate">{dev?.name}</p>
      <div className="flex items-center gap-1.5 mt-1.5">
        <StarRow value={r.avg} size={10} />
        <span className="text-[10.5px] font-mono text-mut">{r.avg ? r.avg.toFixed(1) : "–"}</span>
        <span className="ml-auto"><CompatDot app={app} /></span>
      </div>
    </a>
  );
}

/* ---------- footer ---------- */

export function Footer() {
  return (
    <footer className="mt-16" style={{ background: "#0a1834", borderTop: "1px solid rgba(130,165,230,0.16)", color: "rgba(214,226,246,0.82)" }}>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <Logo size={30} />
          <p className="text-[12.5px] leading-relaxed mt-4 max-w-xs" style={{ color: "rgba(180,198,230,0.6)" }}>
            An alternative Android app store with device-targeted APK distribution from AAB and APK artifacts.
          </p>
        </div>
        <div>
          <h4 className="font-disp font-semibold text-[13px] mb-3 text-white">Store</h4>
          {[["/apps", "All apps"], ["/categories", "Categories"], ["/apps?sort=newest", "New releases"], ["/downloads", "Downloads"]].map(([h, l]) => (
            <a key={l} href={`#${h}`} className="block text-[12.5px] py-1 transition-colors hover:text-[#8fb3f0]" style={{ color: "rgba(180,198,230,0.62)" }}>{l}</a>
          ))}
        </div>
        <div>
          <h4 className="font-disp font-semibold text-[13px] mb-3 text-white">Developers</h4>
          {[["/dev", "Developer console"], ["/dev?tab=publish", "Publish an app"], ["/api-docs", "API reference"], ["/api-docs", "Android client spec"]].map(([h, l], i) => (
            <a key={i} href={`#${h}`} className="block text-[12.5px] py-1 transition-colors hover:text-[#8fb3f0]" style={{ color: "rgba(180,198,230,0.62)" }}>{l}</a>
          ))}
        </div>
        <div>
          <h4 className="font-disp font-semibold text-[13px] mb-3 text-white">Platform</h4>
          {[["/admin", "Admin panel"], ["/account", "Device profiles"], ["/updates", "Updates"], ["/auth", "Account"]].map(([h, l]) => (
            <a key={l} href={`#${h}`} className="block text-[12.5px] py-1 transition-colors hover:text-[#8fb3f0]" style={{ color: "rgba(180,198,230,0.62)" }}>{l}</a>
          ))}
        </div>
      </div>
      <div style={{ borderTop: "1px solid rgba(130,165,230,0.14)" }}>
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11.5px]" style={{ color: "rgba(180,198,230,0.55)" }}>
          <span>© 2026 Kaisel Store</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#3cc48d] pulse-live inline-block" /> ArtifactProcessor online</span>
          <span className="font-mono">SHA-256 verified delivery</span>
        </div>
      </div>
    </footer>
  );
}

export function CategoryChips({ active, onPick }: { active?: string; onPick: (slug: string | undefined) => void }) {
  const cats = getDb().categories;
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
      <Chip active={!active} onClick={() => onPick(undefined)}>All</Chip>
      {cats.map((c) => (
        <Chip key={c.id} active={active === c.id} onClick={() => onPick(active === c.id ? undefined : c.id)}>
          <span className="inline-flex items-center gap-1.5"><Icon name={c.glyph} size={13} /> {c.name}</span>
        </Chip>
      ))}
    </div>
  );
}

export { timeAgo };
