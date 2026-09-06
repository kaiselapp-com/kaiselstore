import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Application, ProcessingJob, JobState } from "../lib/types";
import { getDb, saveDb, uid, fmtInt, fmtBytes, timeAgo, fmtDate } from "../lib/db";
import { processIcon, processFeatureArt, processScreenshot } from "../lib/images";
import { processUpload, bundletool } from "../lib/processor";
import { downloadCount, appRating, latestVersion } from "../lib/api";
import { Icon, Badge, Modal, EmptyState, AppIcon, Chip } from "../components/ui";
import { useStore, useRoute } from "../state/store";
import { densityLabel } from "../lib/device";

const STATE_TONE: Record<JobState, "jade" | "gold" | "coral" | "cy" | "mut"> = {
  UPLOADED: "cy", PROCESSING: "cy", ANALYZING: "cy", GENERATING_ARTIFACTS: "gold", READY: "jade", FAILED: "coral", REJECTED: "coral",
};

const GLYPHS = ["box", "spark", "bolt", "shield", "cloud", "book", "music", "photo", "game", "prod", "tools", "health", "travel", "pers", "util", "star", "zap", "rocket"];

export default function DevDashboard() {
  const { session, toast, refresh, tick, promoteToDeveloper } = useStore();
  const route = useRoute();
  const [tab, setTab] = useState(route.query.get("tab") ?? "overview");
  useEffect(() => { const t = route.query.get("tab"); if (t) setTab(t); }, [route.query]);
  void tick;

  if (!session) {
    return (
      <div className="max-w-xl mx-auto px-4 pt-16">
        <EmptyState icon="terminal" title="Developer console" sub="Sign in to publish applications, upload AAB/APK artifacts and watch the processor derive device-compatible splits."
          action={<a href="#/auth" className="btn-primary px-5 py-2.5 text-[13.5px] inline-block">Sign in to continue</a>} />
      </div>
    );
  }

  const db = getDb();
  const dev = db.developers.find((d) => d.userId === session.uid);

  if (!dev) return <RegisterDev onDone={() => { promoteToDeveloper(); refresh(); toast("ok", "Developer profile created — welcome to Kaisel"); }} />;

  const myApps = db.applications.filter((a) => a.developerId === dev!.id);
  const myJobs = db.jobs.filter((j) => myApps.some((a) => a.id === j.applicationId));
  const totalDl = myApps.reduce((s, a) => s + downloadCount(a.id), 0);

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-8">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl grid place-items-center font-disp font-bold text-[20px] text-white" style={{ background: `linear-gradient(150deg, hsl(${dev.hue} 60% 48%), hsl(${dev.hue + 40} 55% 32%))` }}>{dev.name.slice(0, 1)}</div>
        <div className="flex-1 min-w-[200px]">
          <h1 className="font-disp font-bold text-[24px] tracking-tight leading-tight">Developer console</h1>
          <p className="text-[12.5px] text-mut">{dev.name} · {myApps.length} applications · processor: <span className="text-gold font-mono">{bundletool.mode} AAB expander</span></p>
        </div>
        <a href={`#/developer/${dev.slug}`} className="btn-ghost px-4 py-2 text-[13px] inline-flex items-center gap-2"><Icon name="external" size={14} /> Public page</a>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-7 border-b border-line pb-px">
        {[["overview", "Overview", "chart"], ["apps", "Applications", "grid"], ["publish", "Publish version", "upload"], ["reviews", "Reviews", "star"], ["profile", "Profile", "user"]].map(([id, label, ic]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-[13.5px] font-medium inline-flex items-center gap-2 border-b-2 -mb-px transition-colors cursor-pointer whitespace-nowrap ${tab === id ? "border-jade text-jade" : "border-transparent text-mut hover:text-ink"}`}>
            <Icon name={ic} size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview apps={myApps} jobs={myJobs} totalDl={totalDl} goPublish={() => setTab("publish")} />}
      {tab === "apps" && <MyApps devId={dev.id} apps={myApps} />}
      {tab === "publish" && <Publish apps={myApps} />}
      {tab === "reviews" && <DevReviews apps={myApps} />}
      {tab === "profile" && <DevProfile />}
    </div>
  );
}

/* ---------- register ---------- */

function RegisterDev({ onDone }: { onDone: () => void }) {
  const { session } = useStore();
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [err, setErr] = useState("");
  return (
    <div className="max-w-xl mx-auto px-4 pt-6">
      <div className="card p-6 sm:p-8 anim-fade-up">
        <Badge tone="gold" className="mb-3">Step 1 · developer registration</Badge>
        <h2 className="font-disp font-bold text-[24px] tracking-tight mb-1">Become a Kaisel developer</h2>
        <p className="text-mut text-[13.5px] mb-6">Create your publisher identity. You'll then register applications and upload artifacts.</p>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Studio / developer name *" className="field w-full px-3.5 py-2.5 text-[14px]" />
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="Website" className="field w-full px-3.5 py-2.5 text-[14px]" />
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="field w-full px-3.5 py-2.5 text-[14px]" />
          </div>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Short bio shown on your public page" className="field w-full px-3.5 py-2.5 text-[14px] resize-none" />
          {err && <p className="text-coral text-[12.5px]">{err}</p>}
          <button onClick={() => {
            if (name.trim().length < 2) { setErr("Give your studio a name (min 2 characters)."); return; }
            const db = getDb();
            if (db.developers.some((d) => d.name.toLowerCase() === name.trim().toLowerCase())) { setErr("That developer name is taken."); return; }
            db.developers.push({
              id: uid("dev"), userId: session!.uid, name: name.trim(),
              slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              bio: bio.trim() || "Independent Android developer on Kaisel Store.",
              website: website.trim() || "—", country: country.trim() || "—",
              verified: false, hue: Math.floor(Math.random() * 360), joinedAt: Date.now(),
            });
            saveDb();
            onDone();
          }} className="btn-primary w-full py-3 text-[14.5px] cursor-pointer">Create developer profile</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- overview ---------- */

function Overview({ apps, jobs, totalDl, goPublish }: { apps: Application[]; jobs: ProcessingJob[]; totalDl: number; goPublish: () => void }) {
  const readyVersions = getDb().versions.filter((v) => apps.some((a) => a.id === v.applicationId) && v.status === "ready").length;
  const artifacts = getDb().artifacts.filter((a) => apps.some((x) => x.id === a.applicationId) && a.status === "available").length;
  const avg = apps.length ? apps.reduce((s, a) => s + appRating(a.id).avg, 0) / apps.length : 0;
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {[[fmtInt(totalDl), "total downloads", "download"], [String(readyVersions), "versions ready", "layers"], [String(artifacts), "artifacts in vault", "box"], [avg ? avg.toFixed(2) + "★" : "–", "avg rating", "star"]].map(([v, l, ic]) => (
          <div key={l} className="card p-5 anim-fade-up">
            <Icon name={ic} size={18} className="text-jade mb-3" />
            <div className="font-disp font-bold text-[26px] tracking-tight">{v}</div>
            <div className="text-[12px] text-mut uppercase tracking-wider mt-0.5">{l}</div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        <div className="card p-5">
          <h3 className="font-disp font-semibold text-[16px] mb-4">Recent processing jobs</h3>
          {jobs.length === 0 ? <p className="text-mut text-[13px]">No jobs yet — publish a version to see the pipeline run.</p> : (
            <div className="space-y-2">
              {jobs.slice(0, 6).map((j) => {
                const app = apps.find((a) => a.id === j.applicationId);
                return (
                  <div key={j.id} className="flex items-center gap-3 bg-panel2 border border-line rounded-lg px-3 py-2.5">
                    <Badge tone={STATE_TONE[j.state]}>{j.state}</Badge>
                    <span className="text-[13px] font-medium truncate flex-1">{app?.name} · {j.fileName}</span>
                    <span className="text-[11.5px] text-mut font-mono">{timeAgo(j.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="card p-5">
          <h3 className="font-disp font-semibold text-[16px] mb-4">Top apps</h3>
          {apps.length === 0 ? (
            <EmptyState icon="grid" title="No applications yet" action={<button onClick={goPublish} className="btn-primary px-4 py-2 text-[12.5px] cursor-pointer">Publish your first app</button>} />
          ) : (
            <div className="space-y-2.5">
              {[...apps].sort((a, b) => downloadCount(b.id) - downloadCount(a.id)).slice(0, 5).map((a) => (
                <a key={a.id} href={`#/app/${a.packageName}`} className="flex items-center gap-3 group">
                  <AppIcon spec={a.icon} size={34} />
                  <span className="text-[13.5px] font-medium group-hover:text-jade transition-colors flex-1 truncate">{a.name}</span>
                  <Badge tone={a.status === "approved" ? "jade" : a.status === "pending" ? "gold" : "coral"}>{a.status}</Badge>
                  <span className="text-[11.5px] text-mut font-mono w-14 text-right">{fmtInt(downloadCount(a.id))} ↓</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- my apps ---------- */

function MyApps({ devId, apps }: { devId: string; apps: Application[] }) {
  const { toast } = useStore();
  void toast;
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; app: Application } | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-mut text-[13px]">{apps.length} application{apps.length !== 1 ? "s" : ""} · new apps stay <b className="text-gold">pending</b> until the first build finishes processing</p>
        <button onClick={() => setModal({ mode: "create" })} className="btn-primary px-4 py-2.5 text-[13.5px] inline-flex items-center gap-2 cursor-pointer"><Icon name="plus" size={15} /> New application</button>
      </div>
      {apps.length === 0 ? (
        <EmptyState icon="grid" title="Register your first application" sub="A listing is a package name, store graphics and metadata. Versions and artifacts are attached afterwards — exactly like a Play Console listing."
          action={<button onClick={() => setModal({ mode: "create" })} className="btn-primary px-5 py-2.5 text-[13px] cursor-pointer">Create listing</button>} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((a, i) => {
            const r = appRating(a.id);
            const v = latestVersion(a.id);
            return (
              <div key={a.id} className="card p-4 anim-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                {a.featuredArt && (
                  <div className="h-16 -mx-4 -mt-4 mb-3 overflow-hidden" style={{ borderRadius: "14px 14px 0 0" }}>
                    <img src={a.featuredArt} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="flex items-start gap-3 mb-3">
                  <AppIcon spec={a.icon} size={48} />
                  <div className="min-w-0 flex-1">
                    <a href={`#/app/${a.packageName}`} className="font-disp font-semibold text-[15px] hover:text-jade transition-colors block truncate">{a.name}</a>
                    <div className="text-[11px] text-mut font-mono truncate">{a.packageName}</div>
                    <Badge tone={a.status === "approved" ? "jade" : a.status === "pending" ? "gold" : a.status === "rejected" ? "coral" : "mut"} className="mt-1.5">{a.status}{a.featured ? " · featured" : ""}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-[11.5px] mb-3">
                  <div className="bg-panel2 border border-line rounded-lg py-2"><b className="block font-mono text-[13px]">{fmtInt(downloadCount(a.id))}</b><span className="text-mut">downloads</span></div>
                  <div className="bg-panel2 border border-line rounded-lg py-2"><b className="block font-mono text-[13px]">{r.avg ? r.avg.toFixed(1) + "★" : "–"}</b><span className="text-mut">rating</span></div>
                  <div className="bg-panel2 border border-line rounded-lg py-2"><b className="block font-mono text-[13px]">{v ? v.versionCode : "–"}</b><span className="text-mut">version</span></div>
                </div>
                <button onClick={() => setModal({ mode: "edit", app: a })} className="btn-ghost w-full py-2 text-[12.5px] font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer">
                  <Icon name="edit" size={13} /> Edit store listing
                </button>
              </div>
            );
          })}
        </div>
      )}

      {modal && <ListingModal devId={devId} editing={modal.mode === "edit" ? modal.app : null} onClose={() => setModal(null)} />}
    </div>
  );
}

/* ---------- store listing modal (create / edit) ---------- */

function ListingModal({ devId, editing, onClose }: { devId: string; editing: Application | null; onClose: () => void }) {
  const { toast, refresh } = useStore();
  const db = getDb();
  const [name, setName] = useState(editing?.name ?? "");
  const [pkg, setPkg] = useState(editing?.packageName ?? "");
  const [cat, setCat] = useState(editing?.categoryIds[0] ?? "tools");
  const [tagline, setTagline] = useState(editing?.tagline ?? "");
  const [desc, setDesc] = useState(editing?.description.join("\n\n") ?? "");
  const [hue, setHue] = useState(editing?.icon.hue ?? Math.floor(Math.random() * 360));
  const [glyph, setGlyph] = useState(editing?.icon.glyph ?? "box");
  const [style, setStyle] = useState<"duo" | "solid" | "ring">(editing?.icon.style ?? "duo");
  const [iconUrl, setIconUrl] = useState<string | undefined>(editing?.icon.url);
  const [featureArt, setFeatureArt] = useState<string | undefined>(editing?.featuredArt);
  const [shots, setShots] = useState<string[]>(editing?.screenshotUrls ?? []);
  const [perms, setPerms] = useState<string[]>(editing?.permissions.map((p) => p.name.replace("android.permission.", "")) ?? ["INTERNET", "POST_NOTIFICATIONS"]);
  const [err, setErr] = useState("");
  const [busyMedia, setBusyMedia] = useState<string | null>(null);

  const pick = async (kind: "icon" | "art" | "shot", file: File | undefined) => {
    if (!file) return;
    setBusyMedia(kind); setErr("");
    const r = kind === "icon" ? await processIcon(file) : kind === "art" ? await processFeatureArt(file) : await processScreenshot(file);
    setBusyMedia(null);
    if (!r.ok) { setErr(`${kind === "art" ? "Feature art" : kind === "icon" ? "Icon" : "Screenshot"}: ${r.error}`); return; }
    if (kind === "icon") setIconUrl(r.dataUrl);
    else if (kind === "art") setFeatureArt(r.dataUrl);
    else if (shots.length < 8) setShots((s) => [...s, r.dataUrl]);
    else setErr("Maximum 8 screenshots.");
  };

  const save = () => {
    if (name.trim().length < 2) return setErr("App name is required.");
    if (!editing) {
      if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(pkg)) return setErr("Package must look like com.studio.app (lowercase, dots).");
      if (db.applications.some((a) => a.packageName === pkg)) return setErr("That package name is already registered on Kaisel.");
    }
    const icon = { hue, glyph, style, url: iconUrl };
    const descParas = desc.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    if (editing) {
      editing.name = name.trim();
      editing.tagline = tagline.trim() || editing.tagline;
      editing.categoryIds = [cat];
      editing.icon = icon;
      editing.featuredArt = featureArt;
      editing.screenshotUrls = shots.length ? shots : undefined;
      editing.description = descParas.length ? descParas : editing.description;
      editing.permissions = perms.map((p) => ({ name: `android.permission.${p}`, purpose: "Declared by the developer at submission." }));
      editing.updatedAt = Date.now();
      saveDb(); refresh(); onClose();
      toast("ok", `${editing.name} store listing updated`);
      return;
    }
    const appId = uid("app");
    db.applications.push({
      id: appId, packageName: pkg, name: name.trim(), tagline: tagline.trim() || "A new Android application.",
      developerId: devId, categoryIds: [cat],
      description: descParas.length ? descParas : [`${name.trim()} — a new release on Kaisel Store.`, "Published through the Kaisel developer console. Device-targeted artifacts are generated during processing."],
      features: ["Device-targeted delivery (ABI + density matched)", "SHA-256 verified artifacts"],
      whatsNew: "Initial release.",
      icon, status: "pending", featured: false,
      featuredArt: featureArt,
      screenshotUrls: shots.length ? shots : undefined,
      createdAt: Date.now(), updatedAt: Date.now(), baseDownloads: 0,
      permissions: perms.map((p) => ({ name: `android.permission.${p}`, purpose: "Declared by the developer at submission." })),
      screenshots: [0, 1, 2, 3].map((i) => ({ id: `${appId}_s${i}`, variant: i, label: ["Home", "Detail", "Insights", "Settings"][i] })),
    });
    saveDb(); refresh(); onClose();
    toast("ok", `${name.trim()} registered — upload an artifact to go live (pending → approved on first READY build)`);
  };

  const mediaBtn = (kind: "icon" | "art" | "shot", label: string) => (
    <label className={`btn-ghost px-3 py-2 text-[12.5px] inline-flex items-center gap-1.5 cursor-pointer ${busyMedia === kind ? "opacity-60 pointer-events-none" : ""}`}>
      <input type="file" accept="image/*" multiple={kind === "shot"} className="hidden"
        onChange={(e) => { pick(kind, e.target.files?.[0]); if (kind === "shot") Array.from(e.target.files ?? []).slice(1).forEach((f) => pick(kind, f)); e.target.value = ""; }} />
      <Icon name={busyMedia === kind ? "refresh" : "upload"} size={13} className={busyMedia === kind ? "animate-spin" : ""} /> {busyMedia === kind ? "Processing…" : label}
    </label>
  );

  return (
    <Modal open onClose={onClose} title={editing ? `Edit listing — ${editing.name}` : "Register application"} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[11.5px] text-mut font-semibold block mb-1">App name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Driftboard" className="field w-full px-3.5 py-2.5 text-[14px]" />
        </div>
        <div>
          <label className="text-[11.5px] text-mut font-semibold block mb-1">Package name * {editing && <span className="text-mut">(locked after registration)</span>}</label>
          <input value={pkg} onChange={(e) => setPkg(e.target.value)} disabled={!!editing} placeholder="com.studio.app" className="field w-full px-3.5 py-2.5 text-[14px] font-mono disabled:opacity-60" />
        </div>
        <div>
          <label className="text-[11.5px] text-mut font-semibold block mb-1">Category</label>
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="field w-full px-3.5 py-2.5 text-[14px]">
            {db.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11.5px] text-mut font-semibold block mb-1">Tagline</label>
          <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="One line shown in listings" className="field w-full px-3.5 py-2.5 text-[14px]" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11.5px] text-mut font-semibold block mb-1">Full description</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={4} placeholder="What the app does — blank lines split paragraphs" className="field w-full px-3.5 py-2.5 text-[14px] resize-none" />
        </div>

        {/* app icon */}
        <div className="sm:col-span-2 card bg-panel2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-disp font-semibold text-[14px] flex items-center gap-2"><Icon name="photo" size={15} className="text-jade" /> App icon</h4>
            <div className="flex gap-2">{mediaBtn("icon", iconUrl ? "Replace icon" : "Upload icon")}{iconUrl && <button onClick={() => setIconUrl(undefined)} className="btn-ghost px-3 py-2 text-[12.5px] cursor-pointer">Remove</button>}</div>
          </div>
          <div className="flex items-center gap-4">
            <AppIcon spec={{ hue, glyph, style, url: iconUrl }} size={76} />
            <div className="flex-1">
              <p className="text-[12px] text-mut leading-relaxed mb-2">Upload a square PNG (512×512 recommended). It is cropped and optimized locally. No icon? Auto-generate one:</p>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={359} value={hue} onChange={(e) => { setHue(Number(e.target.value)); }} className="flex-1 accent-[#2b57a8]" />
                <div className="flex gap-1">
                  {(["duo", "solid", "ring"] as const).map((s) => <Chip key={s} active={style === s && !iconUrl} onClick={() => { setStyle(s); }}>{s}</Chip>)}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {GLYPHS.slice(0, 12).map((g) => (
                  <button key={g} onClick={() => setGlyph(g)} className={`w-7 h-7 rounded-md grid place-items-center border cursor-pointer transition-colors ${glyph === g && !iconUrl ? "border-jade text-jade bg-jade/10" : "border-line text-mut hover:text-ink"}`}>
                    <Icon name={g} size={13} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* feature art */}
        <div className="sm:col-span-2 card bg-panel2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-disp font-semibold text-[14px] flex items-center gap-2"><Icon name="spark" size={15} className="text-gold" /> Feature art <span className="text-[11px] text-mut font-body font-medium">— banner shown on the app page & home spotlight</span></h4>
            <div className="flex gap-2">{mediaBtn("art", featureArt ? "Replace art" : "Upload art")}{featureArt && <button onClick={() => setFeatureArt(undefined)} className="btn-ghost px-3 py-2 text-[12.5px] cursor-pointer">Remove</button>}</div>
          </div>
          {featureArt ? (
            <div className="relative rounded-xl overflow-hidden border border-line anim-pop">
              <img src={featureArt} alt="Feature art preview" className="w-full h-36 object-cover" />
              <span className="absolute bottom-2 right-2 text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-black/60 text-white">shown at 1024×500 class</span>
            </div>
          ) : (
            <div className="h-24 rounded-xl border-2 border-dashed border-line grid place-items-center text-[12.5px] text-mut">
              Wide landscape image (1024×500 recommended) — appears at the top of your store page
            </div>
          )}
        </div>

        {/* screenshots */}
        <div className="sm:col-span-2 card bg-panel2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-disp font-semibold text-[14px] flex items-center gap-2"><Icon name="grid" size={15} className="text-cy" /> Screenshots <span className="text-[11px] text-mut font-body font-medium">{shots.length}/8 · phone screenshots, portrait or landscape</span></h4>
            {mediaBtn("shot", "Add screenshots")}
          </div>
          {shots.length ? (
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {shots.map((s, i) => (
                <div key={i} className="relative shrink-0 group anim-pop">
                  <img src={s} alt={`Screenshot ${i + 1}`} className="h-28 rounded-lg border border-line object-cover" />
                  <button onClick={() => setShots((x) => x.filter((_, j) => j !== i))} aria-label="Remove screenshot"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-coral text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <Icon name="x" size={10} sw={2.4} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-20 rounded-xl border-2 border-dashed border-line grid place-items-center text-[12.5px] text-mut">
              No screenshots uploaded — the store page will show generated previews until you add real ones
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <div className="text-[12px] text-mut mb-1.5 font-semibold">Declared permissions</div>
          <div className="flex flex-wrap gap-1.5">
            {["INTERNET", "POST_NOTIFICATIONS", "CAMERA", "RECORD_AUDIO", "ACCESS_FINE_LOCATION", "READ_MEDIA_IMAGES", "VIBRATE", "FOREGROUND_SERVICE", "BLUETOOTH_CONNECT"].map((p) => (
              <Chip key={p} active={perms.includes(p)} onClick={() => setPerms((x) => x.includes(p) ? x.filter((y) => y !== p) : [...x, p])}>{p}</Chip>
            ))}
          </div>
        </div>
        {err && <p className="text-coral text-[12.5px] sm:col-span-2">{err}</p>}
        <button onClick={save} className="btn-primary py-2.5 text-[14px] sm:col-span-2 cursor-pointer">
          {editing ? "Save store listing" : "Register application"}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- publish ---------- */

function Publish({ apps }: { apps: Application[] }) {
  const { toast, refresh } = useStore();
  const db = getDb();
  const [appId, setAppId] = useState(apps[0]?.id ?? "");
  const app = apps.find((a) => a.id === appId);
  const latest = app ? latestVersion(app.id) : null;
  const [vName, setVName] = useState("1.0.0");
  const [vCode, setVCode] = useState(String((latest?.versionCode ?? 0) + 1));
  const [changelog, setChangelog] = useState("");
  const [minSdk, setMinSdk] = useState(26);
  const [targetSdk, setTargetSdk] = useState(35);
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [job, setJob] = useState<ProcessingJob | null>(null);
  const [err, setErr] = useState("");
  const termRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { termRef.current?.scrollTo({ top: 999999, behavior: "smooth" }); }, [job?.logs.length]);

  const accept = (f: File | undefined | null) => {
    if (!f) return;
    const ok = /\.(apk|aab|apks)$/i.test(f.name);
    if (!ok) { setErr("Only .apk, .aab and .apks containers are accepted."); return; }
    if (f.size > 200 * 1024 * 1024) { setErr("Max upload size is 200 MB."); return; }
    setErr(""); setFile(f);
  };

  const submit = async () => {
    if (!app) return setErr("Register an application first.");
    if (!file) return setErr("Attach an APK / AAB / APKS file.");
    const code = parseInt(vCode, 10);
    if (!code || code <= (latest?.versionCode ?? 0)) return setErr(`versionCode must be greater than ${latest?.versionCode ?? 0}.`);
    const versionId = uid("ver");
    db.versions.push({
      id: versionId, applicationId: app.id, versionName: vName.trim() || "1.0.0", versionCode: code,
      minSdk, targetSdk, changelog: changelog.trim() || "Stability and performance improvements.",
      releasedAt: Date.now(), status: "processing", signingFingerprint: "",
    });
    saveDb(); refresh();
    setErr("");
    await processUpload({
      applicationId: app.id, versionId, file,
      versionName: vName, versionCode: code, minSdk, targetSdk,
      onJob: (j) => {
        setJob({ ...j, logs: [...j.logs] });
        if (j.state === "READY") {
          const d = getDb();
          const a = d.applications.find((x) => x.id === app.id);
          if (a && a.status === "pending") { a.status = "approved"; saveDb(); }
          toast("ok", `${app.name} v${vName} is live — artifacts indexed for device compatibility`);
          refresh();
        }
        if (j.state === "FAILED") toast("err", "Processing failed — check the log");
      },
    });
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const jobApp = job ? apps.find((a) => a.id === job.applicationId) : null;
  const recentJobs = useMemo(() => db.jobs.filter((j) => apps.some((a) => a.id === j.applicationId)).slice(0, 8), [db.jobs, apps]);

  if (apps.length === 0) return <EmptyState icon="upload" title="Nothing to publish yet" sub="Register an application under the Applications tab, then upload its first artifact here." />;

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div className="card p-5 sm:p-6">
        <h3 className="font-disp font-semibold text-[17px] mb-4">New version</h3>
        <div className="space-y-3">
          <div>
            <label className="text-[12px] text-mut font-semibold block mb-1.5">Application</label>
            <select value={appId} onChange={(e) => { setAppId(e.target.value); const l = latestVersion(e.target.value); setVCode(String((l?.versionCode ?? 0) + 1)); }} className="field w-full px-3.5 py-2.5 text-[14px]">
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.packageName}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-mut font-semibold block mb-1.5">versionName</label>
              <input value={vName} onChange={(e) => setVName(e.target.value)} className="field w-full px-3.5 py-2.5 text-[14px] font-mono" />
            </div>
            <div>
              <label className="text-[12px] text-mut font-semibold block mb-1.5">versionCode {latest && <span className="text-mut">(latest {latest.versionCode})</span>}</label>
              <input value={vCode} onChange={(e) => setVCode(e.target.value.replace(/[^\d]/g, ""))} className="field w-full px-3.5 py-2.5 text-[14px] font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-mut font-semibold block mb-1.5">minSdk</label>
              <select value={minSdk} onChange={(e) => setMinSdk(Number(e.target.value))} className="field w-full px-3.5 py-2.5 text-[14px]">
                {[21, 23, 24, 26, 28, 29, 30, 31, 33, 34].map((s) => <option key={s} value={s}>API {s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[12px] text-mut font-semibold block mb-1.5">targetSdk</label>
              <select value={targetSdk} onChange={(e) => setTargetSdk(Number(e.target.value))} className="field w-full px-3.5 py-2.5 text-[14px]">
                {[30, 31, 33, 34, 35].map((s) => <option key={s} value={s}>API {s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[12px] text-mut font-semibold block mb-1.5">Changelog</label>
            <textarea value={changelog} onChange={(e) => setChangelog(e.target.value)} rows={2} placeholder="What's new in this version" className="field w-full px-3.5 py-2.5 text-[14px] resize-none" />
          </div>
          <div>
            <label className="text-[12px] text-mut font-semibold block mb-1.5">Artifact — APK · AAB · APKS (max 200 MB)</label>
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files?.[0]); }}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${drag ? "border-jade bg-jade/8" : "border-line hover:border-line2"}`}>
              <input ref={fileRef} type="file" accept=".apk,.aab,.apks" className="hidden" onChange={(e) => accept(e.target.files?.[0])} />
              {file ? (
                <div className="anim-pop">
                  <Icon name="box" size={26} className="text-jade mx-auto mb-2" />
                  <div className="text-[13.5px] font-semibold font-mono">{file.name}</div>
                  <div className="text-[12px] text-mut font-mono">{fmtBytes(file.size)} · SHA-256 computed at intake</div>
                </div>
              ) : (
                <div>
                  <Icon name="upload" size={26} className="text-mut mx-auto mb-2" />
                  <div className="text-[13.5px] font-medium">Drop your bundle here or click to browse</div>
                  <div className="text-[11.5px] text-mut mt-1">AABs are expanded into device APK sets · signing is preserved, never stripped</div>
                </div>
              )}
            </div>
          </div>
          {err && <p className="text-coral text-[12.5px]">{err}</p>}
          <button onClick={submit} disabled={!file || !!job && job.state !== "READY" && job.state !== "FAILED"}
            className="btn-primary w-full py-3 text-[14.5px] inline-flex items-center justify-center gap-2 cursor-pointer">
            <Icon name="rocket" size={16} /> Submit for processing
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
            <h3 className="font-disp font-semibold text-[15px] flex items-center gap-2"><Icon name="terminal" size={16} className="text-jade" /> ArtifactProcessor</h3>
            {job ? <Badge tone={STATE_TONE[job.state]}>{job.state}</Badge> : <Badge tone="mut">idle · embedded expander</Badge>}
          </div>
          {job ? (
            <div>
              <div className="h-1.5 bg-panel2">
                <div className={`h-full transition-all duration-300 ${job.state === "FAILED" ? "bg-coral" : "bg-jade"}`} style={{ width: `${job.progress}%` }} />
              </div>
              <div ref={termRef} className="term p-4 h-[340px] overflow-y-auto scrollx">
                <div className="text-mut mb-1">{jobApp?.name} · {job.fileName} · {fmtBytes(job.fileSize)}</div>
                {job.logs.map((l, i) => (
                  <div key={i}><span className="text-[#51668f]">{new Date(l.t).toLocaleTimeString()}</span> <span className={`lv-${l.level}`}>{l.level.toUpperCase().padEnd(5)}</span> {l.msg}</div>
                ))}
                {job.state !== "READY" && job.state !== "FAILED" && <div className="animate-pulse">▍</div>}
              </div>
            </div>
          ) : (
            <div className="term p-4 h-[380px]">
              <div className="text-mut">kaisel artifact-processor v0.4.2 — waiting for job…</div>
              <div className="text-mut mt-2">pipeline: intake → validate → analyze → generate → index</div>
              <div className="text-mut mt-2">adapter : embedded AAB expander (pure TypeScript pipeline)</div>
              <div className="lv-warn mt-2">note: production swaps in the containerized bundletool worker</div>
            </div>
          )}
        </div>
        <div className="card p-5">
          <h3 className="font-disp font-semibold text-[15px] mb-3">Job history</h3>
          <div className="space-y-1.5 max-h-56 overflow-y-auto scrollx">
            {recentJobs.map((j) => (
              <button key={j.id} onClick={() => setJob({ ...j, logs: [...j.logs] })}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left cursor-pointer transition-colors ${job?.id === j.id ? "border-jade/50 bg-jade/8" : "border-line hover:bg-panel2"}`}>
                <Badge tone={STATE_TONE[j.state]}>{j.state}</Badge>
                <span className="text-[12px] font-mono truncate flex-1">{j.fileName}</span>
                <span className="text-[11px] text-mut">{timeAgo(j.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- reviews ---------- */

function DevReviews({ apps }: { apps: Application[] }) {
  const db = getDb();
  const rows = db.reviews.filter((r) => apps.some((a) => a.id === r.applicationId)).sort((a, b) => b.createdAt - a.createdAt);
  if (rows.length === 0) return <EmptyState icon="star" title="No reviews yet" sub="Reviews appear here as users rate your applications." />;
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const app = apps.find((a) => a.id === r.applicationId);
        return (
          <div key={r.id} className="card p-4 flex flex-wrap gap-3 items-start anim-fade-up">
            <AppIcon spec={app?.icon ?? { hue: 160, glyph: "box", style: "duo" }} size={36} />
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 text-[12px] text-mut">
                <b className="text-ink text-[13px]">{app?.name}</b> · {r.userName} · {timeAgo(r.createdAt)} {r.hidden && <Badge tone="coral">hidden by moderation</Badge>}
              </div>
              <div className="text-[13px] font-semibold mt-1">{r.rating}★ — {r.title}</div>
              <p className="text-[13px] text-mut mt-0.5">{r.body}</p>
            </div>
            <span className="text-[11.5px] text-mut font-mono">{r.helpful} helpful</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- profile ---------- */

function DevProfile() {
  const { session, toast, refresh } = useStore();
  const db = getDb();
  const dev = db.developers.find((d) => d.userId === session?.uid);
  const [name, setName] = useState(dev?.name ?? "");
  const [bio, setBio] = useState(dev?.bio ?? "");
  const [website, setWebsite] = useState(dev?.website ?? "");
  if (!dev) return null;
  return (
    <div className="max-w-xl">
      <div className="card p-6">
        <h3 className="font-disp font-semibold text-[17px] mb-4">Publisher profile</h3>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} className="field w-full px-3.5 py-2.5 text-[14px]" placeholder="Name" />
          <input value={website} onChange={(e) => setWebsite(e.target.value)} className="field w-full px-3.5 py-2.5 text-[14px]" placeholder="Website" />
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className="field w-full px-3.5 py-2.5 text-[14px] resize-none" placeholder="Bio" />
          <button onClick={() => { dev.name = name.trim() || dev.name; dev.bio = bio; dev.website = website; saveDb(); refresh(); toast("ok", "Profile saved"); }}
            className="btn-primary px-6 py-2.5 text-[13.5px] cursor-pointer">Save changes</button>
        </div>
        <div className="mt-6 pt-5 border-t border-line text-[12px] text-mut font-mono space-y-1">
          <div>developer_id: {dev.id}</div>
          <div>slug: /developer/{dev.slug}</div>
          <div>verified: {dev.verified ? "yes" : "pending review"} · joined {fmtDate(dev.joinedAt)}</div>
        </div>
      </div>
    </div>
  );
}
