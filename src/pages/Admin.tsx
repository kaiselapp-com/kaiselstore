import React, { useState } from "react";
import { getDb, saveDb, resetDb, fmtInt, fmtBytes, timeAgo } from "../lib/db";
import { downloadCount, appRating, getRateStats } from "../lib/api";
import { apiLog } from "../lib/api";
import { Icon, Badge, Modal, EmptyState, AppIcon, StarRow } from "../components/ui";
import { useStore } from "../state/store";
import { densityLabel } from "../lib/device";

const TABS = [["overview", "Overview", "chart"], ["apps", "Applications", "grid"], ["reviews", "Reviews", "star"], ["people", "Users & devs", "users"], ["jobs", "Processing jobs", "terminal"], ["reports", "Reports", "flag"], ["system", "System", "database"]] as const;

export default function Admin() {
  const { session, toast, refresh, tick } = useStore();
  const [tab, setTab] = useState<string>("overview");
  void tick;

  if (!session || session.role !== "admin") {
    return (
      <div className="max-w-xl mx-auto px-4 pt-16">
        <EmptyState icon="shield" title="Admin access required"
          sub={session ? "Your account does not have the admin role." : "Sign in with an admin account to moderate applications, reviews and the processing pipeline."}
          action={<a href="#/auth" className="btn-primary px-5 py-2.5 text-[13.5px] inline-block">Sign in with an admin account</a>} />
      </div>
    );
  }

  return (
    <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-11 h-11 rounded-xl bg-coral/15 border border-coral/40 grid place-items-center text-coral"><Icon name="shield" size={20} /></span>
        <div>
          <h1 className="font-disp font-bold text-[24px] tracking-tight leading-tight">Admin panel</h1>
          <p className="text-[12.5px] text-mut">Moderation · pipeline · platform health</p>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-7 border-b border-line pb-px">
        {TABS.map(([id, label, ic]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-[13.5px] font-medium inline-flex items-center gap-2 border-b-2 -mb-px whitespace-nowrap cursor-pointer transition-colors ${tab === id ? "border-jade text-jade" : "border-transparent text-mut hover:text-ink"}`}>
            <Icon name={ic} size={15} /> {label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview go={setTab} />}
      {tab === "apps" && <AppsAdmin />}
      {tab === "reviews" && <ReviewsAdmin />}
      {tab === "people" && <People />}
      {tab === "jobs" && <Jobs />}
      {tab === "reports" && <Reports />}
      {tab === "system" && <System onReset={() => { resetDb(); refresh(); toast("ok", "Database re-seeded"); }} />}
    </div>
  );
}

function Overview({ go }: { go: (t: string) => void }) {
  const db = getDb();
  const pending = db.applications.filter((a) => a.status === "pending").length;
  const openReports = db.reports.filter((r) => r.status === "open").length;
  const failed = db.jobs.filter((j) => j.state === "FAILED").length;
  const cards: [string, string, string, string][] = [
    [String(db.applications.length), "applications", "grid", "apps"],
    [String(pending), "pending review", "clock", "apps"],
    [String(db.artifacts.filter((a) => a.status === "available").length), "artifacts in vault", "box", "jobs"],
    [fmtInt(db.downloads.length), "download events", "download", "system"],
    [String(db.reviews.filter((r) => !r.hidden).length), "live reviews", "star", "reviews"],
    [String(openReports), "open reports", "flag", "reports"],
    [String(failed), "failed jobs", "alert", "jobs"],
    [String(db.users.length), "users", "users", "people"],
  ];
  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {cards.map(([v, l, ic, t], i) => (
          <button key={l} onClick={() => go(t)} className="card p-5 text-left hover:border-jade/50 hover:-translate-y-0.5 transition-all cursor-pointer anim-fade-up" style={{ animationDelay: `${i * 35}ms` }}>
            <Icon name={ic} size={18} className="text-jade mb-3" />
            <div className="font-disp font-bold text-[26px] tracking-tight">{v}</div>
            <div className="text-[12px] text-mut uppercase tracking-wider mt-0.5">{l}</div>
          </button>
        ))}
      </div>
      <div className="card p-5">
        <h3 className="font-disp font-semibold text-[16px] mb-3">Latest API traffic</h3>
        <div className="space-y-1 font-mono text-[12px]">
          {apiLog.slice(0, 8).map((l, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5 border-b border-line last:border-0">
              <Badge tone={l.status === 200 ? "jade" : "coral"}>{l.status}</Badge>
              <span className="text-mut w-12">{l.method}</span>
              <span className="truncate flex-1 text-ink/90">{l.path}</span>
              <span className="text-mut">{l.ms} ms</span>
            </div>
          ))}
          {apiLog.length === 0 && <p className="text-mut font-body">No requests recorded this session yet.</p>}
        </div>
      </div>
    </div>
  );
}

function AppsAdmin() {
  const { toast, refresh } = useStore();
  const db = getDb();
  const [sel, setSel] = useState<string | null>(null);
  const app = db.applications.find((a) => a.id === sel);

  const setStatus = (id: string, status: "approved" | "rejected" | "disabled") => {
    const a = db.applications.find((x) => x.id === id);
    if (a) { a.status = status; saveDb(); refresh(); toast("ok", `${a.name} → ${status}`); }
  };
  const toggleFeatured = (id: string) => {
    const a = db.applications.find((x) => x.id === id);
    if (!a) return;
    a.featured = !a.featured;
    db.featured = db.featured.filter((f) => f.applicationId !== id);
    if (a.featured) db.featured.push({ applicationId: id, position: db.featured.length + 1 });
    saveDb(); refresh();
    toast("ok", `${a.name} ${a.featured ? "added to" : "removed from"} featured`);
  };
  const removeVersion = (vid: string) => {
    const v = db.versions.find((x) => x.id === vid);
    if (v) { v.status = "removed"; db.artifacts = db.artifacts.filter((a) => a.versionId !== vid || (a.status = "failed" as const) === "failed"); saveDb(); refresh(); toast("info", "Version removed from distribution"); }
  };

  return (
    <div>
      <div className="space-y-2 mb-6">
        {db.applications.map((a) => {
          const dev = db.developers.find((d) => d.id === a.developerId);
          const r = appRating(a.id);
          return (
            <div key={a.id} className="card px-4 py-3 flex flex-wrap items-center gap-3">
              <AppIcon spec={a.icon} size={38} />
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span className="font-disp font-semibold text-[14px]">{a.name}</span>
                  <Badge tone={a.status === "approved" ? "jade" : a.status === "pending" ? "gold" : a.status === "rejected" ? "coral" : "mut"}>{a.status}</Badge>
                  {a.featured && <Badge tone="gold"><Icon name="spark" size={10} /> featured</Badge>}
                </div>
                <div className="text-[11px] text-mut font-mono">{a.packageName} · {dev?.name} · {r.avg ? r.avg.toFixed(1) + "★" : "–"} · {fmtInt(downloadCount(a.id))} ↓</div>
              </div>
              <div className="flex gap-1.5">
                {a.status !== "approved" && <button onClick={() => setStatus(a.id, "approved")} className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer hover:border-jade/60 hover:text-jade">Approve</button>}
                {a.status === "approved" && <button onClick={() => setStatus(a.id, "disabled")} className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer">Disable</button>}
                {a.status !== "rejected" && <button onClick={() => setStatus(a.id, "rejected")} className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer hover:border-coral/60 hover:text-coral">Reject</button>}
                <button onClick={() => toggleFeatured(a.id)} className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer hover:border-gold/60 hover:text-gold">{a.featured ? "Unfeature" : "Feature"}</button>
                <button onClick={() => setSel(a.id)} className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer">Details</button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!app} onClose={() => setSel(null)} title={app?.name ?? ""} wide>
        {app && (
          <div className="space-y-5">
            <div className="flex gap-4 items-center">
              <AppIcon spec={app.icon} size={56} />
              <div className="text-[12.5px] font-mono text-mut">
                {app.packageName}<br />created {timeAgo(app.createdAt)} · {downloadCount(app.id)} downloads
              </div>
            </div>
            <div>
              <h4 className="font-disp font-semibold text-[14px] mb-2">Versions & artifacts</h4>
              <div className="space-y-3">
                {db.versions.filter((v) => v.applicationId === app.id).sort((a, b) => b.versionCode - a.versionCode).map((v) => (
                  <div key={v.id} className="border border-line rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge tone={v.status === "ready" ? "jade" : v.status === "removed" ? "coral" : "gold"}>v{v.versionName} · {v.versionCode}</Badge>
                      <Badge tone="mut">{v.status}</Badge>
                      <span className="text-[11px] text-mut font-mono ml-auto">min API {v.minSdk} · target {v.targetSdk}</span>
                      {v.status !== "removed" && <button onClick={() => removeVersion(v.id)} className="btn-ghost px-2 py-1 text-[11px] cursor-pointer hover:border-coral/60 hover:text-coral">Remove</button>}
                    </div>
                    <div className="space-y-1">
                      {db.artifacts.filter((a) => a.versionId === v.id).map((a) => (
                        <div key={a.id} className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono bg-panel2 border border-line rounded-lg px-2.5 py-1.5">
                          <Badge tone={a.artifactType === "aab" ? "gold" : "cy"}>{a.artifactType}</Badge>
                          <span>{a.splitName ?? "standalone"}</span>
                          <span className="text-mut">[{a.abi.join(",")}]</span>
                          {a.density && <span className="text-mut">{densityLabel(a.density)}</span>}
                          <span className="text-mut">{fmtBytes(a.fileSize)}</span>
                          <span className="text-mut truncate flex-1 min-w-[120px]">sha {a.sha256 ? a.sha256.slice(0, 18) + "…" : "on-demand"}</span>
                          <span className="text-mut">{a.source}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ReviewsAdmin() {
  const { toast, refresh } = useStore();
  const db = getDb();
  return (
    <div className="space-y-2">
      {db.reviews.sort((a, b) => b.createdAt - a.createdAt).map((r) => {
        const app = db.applications.find((a) => a.id === r.applicationId);
        return (
          <div key={r.id} className={`card px-4 py-3 flex flex-wrap items-center gap-3 ${r.hidden ? "opacity-55" : ""}`}>
            <div className="flex-1 min-w-[220px]">
              <div className="flex items-center gap-2 text-[12px] text-mut">
                <b className="text-ink text-[13px]">{app?.name ?? r.applicationId}</b> · {r.userName} · {timeAgo(r.createdAt)}
                {r.hidden && <Badge tone="coral">hidden</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-1"><StarRow value={r.rating} size={11} /><span className="text-[13px] font-semibold">{r.title}</span></div>
              <p className="text-[12.5px] text-mut mt-0.5">{r.body}</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => { r.hidden = !r.hidden; saveDb(); refresh(); toast("info", r.hidden ? "Review hidden" : "Review restored"); }}
                className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer inline-flex items-center gap-1.5"><Icon name="eye" size={12} /> {r.hidden ? "Restore" : "Hide"}</button>
              <button onClick={() => { db.reviews = db.reviews.filter((x) => x.id !== r.id); saveDb(); refresh(); toast("info", "Review deleted"); }}
                className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer hover:border-coral/60 hover:text-coral inline-flex items-center gap-1.5"><Icon name="trash" size={12} /> Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function People() {
  const db = getDb();
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card p-5">
        <h3 className="font-disp font-semibold text-[16px] mb-3">Users ({db.users.length})</h3>
        <div className="space-y-2">
          {db.users.map((u) => (
            <div key={u.uid} className="flex items-center gap-3 bg-panel2 border border-line rounded-lg px-3 py-2.5">
              <span className="w-8 h-8 rounded-full grid place-items-center text-[12px] font-bold text-white" style={{ background: `hsl(${u.avatarHue} 50% 38%)` }}>{u.displayName.slice(0, 1).toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate">{u.displayName}</div>
                <div className="text-[11px] text-mut font-mono truncate">{u.email} · {u.provider}</div>
              </div>
              <Badge tone={u.role === "admin" ? "coral" : u.role === "developer" ? "gold" : "jade"}>{u.role}</Badge>
            </div>
          ))}
        </div>
      </div>
      <div className="card p-5">
        <h3 className="font-disp font-semibold text-[16px] mb-3">Developers ({db.developers.length})</h3>
        <div className="space-y-2">
          {db.developers.map((d) => {
            const apps = db.applications.filter((a) => a.developerId === d.id);
            return (
              <div key={d.id} className="flex items-center gap-3 bg-panel2 border border-line rounded-lg px-3 py-2.5">
                <span className="w-8 h-8 rounded-lg grid place-items-center text-[12px] font-bold text-white" style={{ background: `hsl(${d.hue} 55% 38%)` }}>{d.name.slice(0, 1)}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate">{d.name}</div>
                  <div className="text-[11px] text-mut font-mono truncate">{apps.length} apps · joined {timeAgo(d.joinedAt)}</div>
                </div>
                {d.verified ? <Badge tone="jade">verified</Badge> : <Badge tone="mut">unverified</Badge>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Jobs() {
  const db = getDb();
  const [sel, setSel] = useState<string | null>(null);
  const job = db.jobs.find((j) => j.id === sel);
  return (
    <div>
      <div className="space-y-2">
        {db.jobs.slice(0, 20).map((j) => {
          const app = db.applications.find((a) => a.id === j.applicationId);
          return (
            <button key={j.id} onClick={() => setSel(j.id)} className="w-full card px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-jade/50 transition-colors text-left">
              <Badge tone={j.state === "READY" ? "jade" : j.state === "FAILED" || j.state === "REJECTED" ? "coral" : "cy"}>{j.state}</Badge>
              <span className="text-[13px] font-medium truncate flex-1">{app?.name ?? j.applicationId} · <span className="font-mono text-mut">{j.fileName}</span></span>
              <span className="text-[11px] text-mut font-mono">{fmtBytes(j.fileSize)} · {timeAgo(j.createdAt)}</span>
              <Icon name="chev-r" size={14} className="text-mut" />
            </button>
          );
        })}
      </div>
      <Modal open={!!job} onClose={() => setSel(null)} title={job ? `Job ${job.id}` : ""} wide>
        {job && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Badge tone={job.state === "READY" ? "jade" : "coral"}>{job.state}</Badge>
              <Badge tone="gold">bundletool: {job.bundletool}</Badge>
              <span className="text-[12px] text-mut font-mono ml-auto">{job.progress}%</span>
            </div>
            <div className="term p-4 max-h-[420px] overflow-y-auto scrollx">
              {job.logs.map((l, i) => (
                <div key={i}><span className="text-[#51668f]">{new Date(l.t).toLocaleTimeString()}</span> <span className={`lv-${l.level}`}>{l.level.toUpperCase().padEnd(5)}</span> {l.msg}</div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Reports() {
  const { toast, refresh } = useStore();
  const db = getDb();
  return (
    <div className="space-y-2">
      {db.reports.length === 0 && <EmptyState icon="flag" title="No reports" sub="User-submitted reports land here." />}
      {db.reports.map((r) => {
        const app = db.applications.find((a) => a.id === r.applicationId);
        return (
          <div key={r.id} className="card px-4 py-3 flex flex-wrap items-center gap-3">
            <Badge tone={r.status === "open" ? "gold" : r.status === "resolved" ? "jade" : "mut"}>{r.status}</Badge>
            <div className="flex-1 min-w-[220px]">
              <div className="text-[13px] font-semibold">{r.reason} — <span className="font-normal text-mut">{app?.name}</span></div>
              <p className="text-[12.5px] text-mut mt-0.5">{r.detail}</p>
              <div className="text-[11px] text-mut font-mono mt-1">by {r.reporter} · {timeAgo(r.createdAt)}</div>
            </div>
            {r.status === "open" && (
              <div className="flex gap-1.5">
                <button onClick={() => { r.status = "resolved"; saveDb(); refresh(); toast("ok", "Report resolved"); }} className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer hover:border-jade/60 hover:text-jade">Resolve</button>
                <button onClick={() => { r.status = "dismissed"; saveDb(); refresh(); toast("info", "Report dismissed"); }} className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer">Dismiss</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function System({ onReset }: { onReset: () => void }) {
  const db = getDb();
  const [confirm, setConfirm] = useState(false);
  const rates = getRateStats();
  const size = (() => { try { return fmtBytes((localStorage.getItem("kaisel.db.v3") ?? "").length); } catch { return "—"; } })();
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="card p-5">
        <h3 className="font-disp font-semibold text-[16px] mb-3">Services</h3>
        {[
          ["API gateway", "200 OK · in-browser transport", "jade"],
          ["ArtifactProcessor", "embedded AAB expander", "gold"],
          ["Intake vault", "IndexedDB · " + size, "jade"],
          ["Compatibility index", `${db.artifacts.length} artifacts indexed`, "jade"],
          ["Search", "PostgreSQL FTS (production) · in-memory index (web build)", "jade"],
          ["Auth", "Firebase (email/password + Google)", "jade"],
        ].map(([k, v, tone]) => (
          <div key={k} className="flex items-center justify-between py-2 border-b border-line last:border-0 text-[12.5px]">
            <span className="text-mut">{k}</span><Badge tone={tone as "jade" | "gold"}>{v}</Badge>
          </div>
        ))}
      </div>
      <div className="card p-5">
        <h3 className="font-disp font-semibold text-[16px] mb-3">Rate limit buckets</h3>
        <div className="space-y-2">
          {rates.map((r) => (
            <div key={r.endpoint} className="flex items-center gap-3 text-[12.5px] font-mono">
              <span className="w-24 text-mut">{r.endpoint}</span>
              <div className="flex-1 h-2 rounded-full bg-panel2 overflow-hidden">
                <div className={`h-full rounded-full ${r.hits > 0 ? "bg-gold" : "bg-jade"}`} style={{ width: `${Math.min(100, (r.hits / r.cap) * 100 + 4)}%` }} />
              </div>
              <span className="w-24 text-right text-mut">{r.hits} hits / {r.cap} per {r.windowS}s</span>
            </div>
          ))}
        </div>
        <div className="mt-5 pt-4 border-t border-line">
          <h4 className="font-disp font-semibold text-[14px] mb-2 text-coral">Danger zone</h4>
          {!confirm ? (
            <button onClick={() => setConfirm(true)} className="btn-ghost px-4 py-2 text-[12.5px] cursor-pointer hover:text-coral" style={{ transition: "color .15s" }}>Reseed database…</button>
          ) : (
            <div className="flex gap-2 anim-pop">
              <button onClick={onReset} className="px-4 py-2 rounded-lg bg-coral text-white text-[12.5px] font-semibold cursor-pointer">Yes, re-seed everything</button>
              <button onClick={() => setConfirm(false)} className="btn-ghost px-4 py-2 text-[12.5px] cursor-pointer">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
