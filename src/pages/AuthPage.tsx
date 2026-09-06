import React, { useState } from "react";
import { getDb, saveDb, uid, timeAgo } from "../lib/db";
import { Icon, Badge, AppIcon, EmptyState } from "../components/ui";
import { useStore, navigate } from "../state/store";
import { appById } from "../lib/api";
import { densityLabel } from "../lib/device";

export default function AuthPage() {
  const { session } = useStore();
  return session ? <Account /> : <AuthForms />;
}

/* ================= AUTH ================= */

function AuthForms() {
  const { signInEmail, signUpEmail, signInGoogle, toast } = useStore();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const run = async (kind: "in" | "up" | "google") => {
    setErr(""); setBusy(kind);
    let r: { ok: boolean; error?: string };
    if (kind === "google") r = await signInGoogle();
    else if (kind === "up") r = await signUpEmail(email.trim(), pass, name.trim());
    else r = await signInEmail(email.trim(), pass);
    setBusy(null);
    if (r.ok) {
      toast("ok", kind === "google" ? "Signed in with Google" : mode === "up" ? "Account created — welcome to Kaisel" : "Welcome back");
      navigate("/account");
    } else {
      setErr(r.error ?? "Sign-in failed");
    }
  };

  return (
    <div className="max-w-[960px] mx-auto px-4 pt-10 grid md:grid-cols-[1fr_1.1fr] gap-8 items-start">
      {/* brand panel */}
      <div className="card overflow-hidden relative hidden md:block">
        <div className="p-8 relative" style={{ background: "linear-gradient(140deg, #122a56, #081530)" }}>
          <div className="kaisel-grid absolute inset-0 opacity-60" />
          <div className="relative">
            <Badge tone="gold" className="mb-5"><Icon name="spark" size={11} /> Kaisel ID</Badge>
            <h1 className="font-disp font-bold text-[28px] leading-tight tracking-tight text-[#eef3fc]">One account.<br />Every device you own.</h1>
            <p className="text-[13.5px] mt-4 leading-relaxed" style={{ color: "#a8b7d6" }}>
              Ratings, reviews, download history and per-device artifact matching are tied to your Kaisel ID.
            </p>
            <div className="term rounded-xl p-4 mt-6">
              <div className="text-[#51668f]">$ kaisel auth status</div>
              <div><span className="lv-ok">provider</span> firebase · email/password + google</div>
              <div><span className="lv-ok">limits</span> 5 logins / 60 s</div>
              <div><span className="lv-ok">tokens</span> rotate per session</div>
            </div>
          </div>
        </div>
      </div>

      {/* form panel */}
      <div className="card p-6 sm:p-8 anim-fade-up">
        <div className="flex gap-1 p-1 bg-panel2 border border-line rounded-xl mb-6">
          {([["in", "Sign in"], ["up", "Create account"]] as const).map(([m, l]) => (
            <button key={m} onClick={() => { setMode(m); setErr(""); }}
              className={`flex-1 py-2 rounded-lg text-[13.5px] font-semibold transition-colors cursor-pointer ${mode === m ? "bg-panel text-jade border border-line" : "text-mut hover:text-ink"}`}>{l}</button>
          ))}
        </div>
        <h2 className="font-disp font-bold text-[22px] tracking-tight mb-1">{mode === "in" ? "Welcome back" : "Join Kaisel Store"}</h2>
        <p className="text-mut text-[13px] mb-5">{mode === "in" ? "Sign in with your email or Google." : "Email + password, or continue with Google."}</p>

        <div className="space-y-3">
          {mode === "up" && (
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className="field w-full px-3.5 py-2.5 text-[14px]" autoComplete="name" />
          )}
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" className="field w-full px-3.5 py-2.5 text-[14px]" autoComplete="email" />
          <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Password (min 6 chars)" type="password"
            className="field w-full px-3.5 py-2.5 text-[14px]" autoComplete={mode === "in" ? "current-password" : "new-password"}
            onKeyDown={(e) => { if (e.key === "Enter" && email && pass) run(mode); }} />
          {err && (
            <div className="flex items-start gap-2 text-[12.5px] text-coral bg-coral/10 border border-coral/30 rounded-lg px-3 py-2.5 anim-pop">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> <span>{err}</span>
            </div>
          )}
          <button onClick={() => run(mode)} disabled={!!busy || !email || !pass}
            className="btn-primary w-full py-3 text-[14.5px] inline-flex items-center justify-center gap-2 cursor-pointer">
            {busy === mode ? <Icon name="refresh" size={16} className="animate-spin" /> : <Icon name="key" size={16} />}
            {mode === "in" ? "Sign in" : "Create account"}
          </button>
          <div className="flex items-center gap-3 py-1">
            <span className="h-px bg-line flex-1" /><span className="text-[11px] text-mut uppercase tracking-wider">or</span><span className="h-px bg-line flex-1" />
          </div>
          <button onClick={() => run("google")} disabled={!!busy}
            className="btn-ghost w-full py-3 text-[14px] font-semibold inline-flex items-center justify-center gap-2.5 cursor-pointer">
            {busy === "google" ? <Icon name="refresh" size={16} className="animate-spin" /> : (
              <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.8 6.1C12.2 13.4 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.3 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.6-2.4 15.7-6l-7.5-5.8c-2.1 1.4-4.9 2.3-8.2 2.3-6.4 0-11.8-3.9-13.7-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
            )}
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= ACCOUNT ================= */

function Account() {
  const { session, signOut, toast, refresh, tick } = useStore();
  void tick;
  const db = getDb();
  const user = db.users.find((u) => u.uid === session?.uid);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ label: "", manufacturer: "", model: "", androidApi: 34, abi: "arm64-v8a", density: 420, screenWidth: 1080, screenHeight: 2400 });

  const addDevice = () => {
    if (!f.label.trim()) { toast("warn", "Give the profile a label"); return; }
    db.devices.push({
      id: uid("devp"), label: f.label.trim(), manufacturer: f.manufacturer.trim() || "Custom", model: f.model.trim() || "Custom",
      androidApi: f.androidApi, androidVersion: String(Math.max(5, f.androidApi - 20)), abi: f.abi, density: f.density,
      screenWidth: f.screenWidth, screenHeight: f.screenHeight, supportedFeatures: [], glVersion: "OpenGL ES 3.2",
    });
    saveDb(); refresh(); setAdding(false);
    toast("ok", `Device profile "${f.label}" registered — POST /api/device/profile`);
  };

  return (
    <div className="max-w-[980px] mx-auto px-4 sm:px-6 pt-8">
      <div className="card p-6 mb-8 flex flex-wrap items-center gap-5 anim-fade-up">
        <span className="w-16 h-16 rounded-2xl grid place-items-center font-disp font-bold text-[24px] text-white" style={{ background: `hsl(${user?.avatarHue ?? 160} 55% 34%)` }}>
          {session?.displayName.slice(0, 1).toUpperCase()}
        </span>
        <div className="flex-1 min-w-[200px]">
          <h1 className="font-disp font-bold text-[24px] tracking-tight">{session?.displayName}</h1>
          <p className="text-[13px] text-mut">{session?.email} · <Badge tone={session?.provider === "google" ? "gold" : "jade"} className="ml-1">{session?.provider} · {session?.role}</Badge></p>
        </div>
        <div className="flex gap-2">
          {session?.role !== "developer" && session?.role !== "admin" && (
            <button onClick={() => { const u = db.users.find((x) => x.uid === session?.uid); if (u) { u.role = "developer"; saveDb(); } refresh(); toast("ok", "Developer tools unlocked — open the console"); navigate("/dev"); }}
              className="btn-ghost px-4 py-2 text-[13px] inline-flex items-center gap-2 cursor-pointer"><Icon name="terminal" size={14} /> Become a developer</button>
          )}
          <button onClick={() => { signOut(); navigate("/"); }} className="btn-ghost px-4 py-2 text-[13px] inline-flex items-center gap-2 cursor-pointer hover:border-coral/50 hover:text-coral"><Icon name="logout" size={14} /> Sign out</button>
        </div>
      </div>

      {/* devices */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-disp font-bold text-[20px] tracking-tight">Device profiles</h2>
            <p className="text-mut text-[13px] mt-0.5">Registered via <code className="font-mono text-jade2">POST /api/device/profile</code> — artifact selection runs against the active profile.</p>
          </div>
          <button onClick={() => setAdding((v) => !v)} className="btn-primary px-4 py-2 text-[13px] inline-flex items-center gap-1.5 cursor-pointer"><Icon name="plus" size={14} /> Add profile</button>
        </div>
        {adding && (
          <div className="card p-5 mb-4 anim-pop">
            <div className="grid sm:grid-cols-3 gap-3">
              <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Label * (e.g. My tablet)" className="field px-3 py-2.5 text-[13.5px]" />
              <input value={f.manufacturer} onChange={(e) => setF({ ...f, manufacturer: e.target.value })} placeholder="Manufacturer" className="field px-3 py-2.5 text-[13.5px]" />
              <input value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} placeholder="Model" className="field px-3 py-2.5 text-[13.5px]" />
              <select value={f.androidApi} onChange={(e) => setF({ ...f, androidApi: Number(e.target.value) })} className="field px-3 py-2.5 text-[13.5px]">
                {[21, 23, 26, 28, 29, 30, 31, 33, 34, 35].map((a) => <option key={a} value={a}>API {a}</option>)}
              </select>
              <select value={f.abi} onChange={(e) => setF({ ...f, abi: e.target.value })} className="field px-3 py-2.5 text-[13.5px]">
                {["arm64-v8a", "armeabi-v7a", "x86", "x86_64"].map((a) => <option key={a}>{a}</option>)}
              </select>
              <select value={f.density} onChange={(e) => setF({ ...f, density: Number(e.target.value) })} className="field px-3 py-2.5 text-[13.5px]">
                {[160, 240, 320, 420, 480, 560, 640].map((d) => <option key={d} value={d}>{densityLabel(d)}</option>)}
              </select>
              <input type="number" value={f.screenWidth} onChange={(e) => setF({ ...f, screenWidth: Number(e.target.value) })} className="field px-3 py-2.5 text-[13.5px]" placeholder="Width px" />
              <input type="number" value={f.screenHeight} onChange={(e) => setF({ ...f, screenHeight: Number(e.target.value) })} className="field px-3 py-2.5 text-[13.5px]" placeholder="Height px" />
              <button onClick={addDevice} className="btn-primary py-2.5 text-[13.5px] cursor-pointer">Register device</button>
            </div>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {db.devices.map((d) => (
            <div key={d.id} className="card p-4 flex items-start gap-3" style={d.id === db.currentDeviceId ? { borderColor: "rgba(56,211,159,0.6)" } : undefined}>
              <Icon name="phone" size={18} className={d.id === db.currentDeviceId ? "text-jade" : "text-mut"} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold">{d.label}</span>
                  {d.detected && <Badge tone="cy">detected</Badge>}
                  {d.id === db.currentDeviceId && <Badge tone="jade">active</Badge>}
                </div>
                <div className="text-[11.5px] text-mut font-mono mt-0.5">{d.manufacturer} {d.model} · API {d.androidApi} · {d.abi} · {densityLabel(d.density)} · {d.screenWidth}×{d.screenHeight}</div>
              </div>
              {d.id !== db.currentDeviceId && (
                <button onClick={() => { db.currentDeviceId = d.id; saveDb(); refresh(); toast("info", `Active device → ${d.label}`); }}
                  className="btn-ghost px-3 py-1.5 text-[12px] cursor-pointer">Use</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* library */}
      <div className="mb-8">
        <h2 className="font-disp font-bold text-[20px] tracking-tight mb-1">Install library</h2>
        <p className="text-mut text-[13px] mb-4">What the update checker compares against — <code className="font-mono text-jade2">GET /api/updates</code>.</p>
        {db.installed.length === 0 ? (
          <EmptyState icon="box" title="No installed apps tracked" sub="Downloads register here automatically so update detection works." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {db.installed.map((i) => {
              const app = appById(i.packageName) ?? db.applications.find((a) => a.packageName === i.packageName);
              if (!app) return null;
              return (
                <a key={i.packageName} href={`#/app/${app.packageName}`} className="flex items-center gap-3 card px-4 py-3 hover:border-jade/50 transition-colors">
                  <AppIcon spec={app.icon} size={34} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{app.name}</div>
                    <div className="text-[11px] text-mut font-mono">code {i.versionCode} · installed {timeAgo(i.installedAt)}</div>
                  </div>
                  <Icon name="chev-r" size={15} className="text-mut" />
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
