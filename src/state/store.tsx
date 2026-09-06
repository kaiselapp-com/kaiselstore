import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User, Role } from "../lib/types";
import { getDb, saveDb, uid } from "../lib/db";
import { takeLoginToken } from "./ratelimit";
import * as fb from "../lib/firebase";
import { detectBrowserProfile, refineDetectedProfile } from "../lib/device";

/* ---------- hash router ---------- */

export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

export function parseHash(): Route {
  const h = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs] = h.split("?");
  return { path, parts: path.split("/").filter(Boolean), query: new URLSearchParams(qs ?? "") };
}

export function navigate(to: string) {
  window.location.hash = to.startsWith("#") ? to : "#" + to;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash);
  useEffect(() => {
    const fn = () => { setRoute(parseHash()); window.scrollTo({ top: 0 }); };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  return route;
}

/* ---------- session ---------- */

export interface Session {
  uid: string;
  email: string;
  displayName: string;
  provider: "password" | "google";
  role: Role;
}

const SESSION_KEY = "kaisel.session";

function roleFor(uidStr: string, email: string): Role {
  const db = getDb();
  const existing = db.users.find((u) => u.uid === uidStr || (email && u.email.toLowerCase() === email.toLowerCase()));
  if (existing) { db.users = db.users.filter((u) => u.uid !== uidStr || u.uid === existing.uid); return existing.role; }
  let role: Role = "user";
  if (/admin@kaisel\.store/i.test(email)) role = "admin";
  const user: User = {
    uid: uidStr, email, displayName: email.split("@")[0], role, provider: "password",
    avatarHue: Math.floor(Math.random() * 360), createdAt: Date.now(),
  };
  db.users.push(user);
  saveDb();
  return role;
}

/* ---------- toasts ---------- */

export interface Toast { id: number; kind: "ok" | "err" | "info" | "warn"; msg: string }

interface StoreShape {
  route: Route;
  session: Session | null;
  theme: string;
  toggleTheme: () => void;
  toasts: Toast[];
  toast: (kind: Toast["kind"], msg: string) => void;
  refresh: () => void;
  tick: number;
  firebaseMode: "live" | "unavailable";
  signInEmail: (email: string, pass: string) => Promise<{ ok: boolean; error?: string }>;
  signUpEmail: (email: string, pass: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  signInGoogle: () => Promise<{ ok: boolean; error?: string }>;
  signOut: () => void;
  promoteToDeveloper: () => void;
}

const Ctx = createContext<StoreShape>(null as unknown as StoreShape);
export const useStore = () => useContext(Ctx);

let toastSeq = 1;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const route = useRoute();
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("kaisel.theme") ?? "light"; } catch { return "light"; }
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tick, setTick] = useState(0);
  const [session, setSession] = useState<Session | null>(() => {
    try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  });
  const [firebaseMode, setFirebaseMode] = useState<"live" | "unavailable">(fb.firebaseReady() ? "live" : "unavailable");
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.background = theme === "dark" ? "#0a1322" : "#f4f6fb";
    try { localStorage.setItem("kaisel.theme", theme); } catch { /* no-op */ }
  }, [theme]);

  // device refinement (async fingerprinting)
  useEffect(() => {
    refineDetectedProfile(detectBrowserProfile()).then((p) => {
      const db = getDb();
      const i = db.devices.findIndex((d) => d.id === "detected");
      if (i >= 0) db.devices[i] = { ...p, id: "detected" };
      saveDb();
      setTick((t) => t + 1);
      try {
        if (p.formFactor !== "desktop" && !sessionStorage.getItem("kaisel.id-toast")) {
          sessionStorage.setItem("kaisel.id-toast", "1");
          toast("info", `Device identified: ${p.label} — downloads are generated for ${p.abi} · API ${p.androidApi}`);
        }
      } catch { /* no-op */ }
    });
  }, []);

  useEffect(() => {
    const un = fb.onAuthChange((u) => {
      if (!mounted.current) return;
      if (u) {
        const role = roleFor(u.uid, u.email ?? "");
        const s: Session = {
          uid: u.uid, email: u.email ?? "", displayName: u.displayName ?? u.email?.split("@")[0] ?? "user",
          provider: "password", role,
        };
        setSession(s);
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* no-op */ }
      }
    });
    return un;
  }, []);

  const toast = useCallback((kind: Toast["kind"], msg: string) => {
    const id = toastSeq++;
    setToasts((t) => [...t.slice(-3), { id, kind, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const persistSession = (s: Session) => {
    setSession(s);
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* no-op */ }
  };

  const signInEmail = async (email: string, pass: string) => {
    try { takeLoginToken(); } catch { return { ok: false, error: "Too many attempts — try again in a minute." }; }
    const r = await fb.signInEmail(email, pass);
    if (r.ok) {
      const role = roleFor(r.uid!, email);
      persistSession({ uid: r.uid!, email, displayName: r.displayName ?? email.split("@")[0], provider: "password", role });
      return { ok: true };
    }
    setFirebaseMode("unavailable");
    return { ok: false, error: r.error };
  };

  const signUpEmail = async (email: string, pass: string, name: string) => {
    try { takeLoginToken(); } catch { return { ok: false, error: "Too many attempts — try again in a minute." }; }
    const r = await fb.signUpEmail(email, pass, name);
    if (r.ok) {
      const role = roleFor(r.uid!, email);
      persistSession({ uid: r.uid!, email, displayName: name || email.split("@")[0], provider: "password", role });
      return { ok: true };
    }
    setFirebaseMode("unavailable");
    return { ok: false, error: r.error };
  };

  const signInGoogle = async () => {
    try { takeLoginToken(); } catch { return { ok: false, error: "Too many attempts — try again in a minute." }; }
    const r = await fb.signInGoogle();
    if (r.ok) {
      const role = roleFor(r.uid!, r.email ?? "");
      persistSession({ uid: r.uid!, email: r.email ?? "", displayName: r.displayName ?? "Kaisel user", provider: "google", role });
      return { ok: true };
    }
    setFirebaseMode("unavailable");
    return { ok: false, error: r.error };
  };

  const signOut = () => {
    void fb.signOutFirebase();
    setSession(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* no-op */ }
    toast("info", "Signed out");
  };

  const promoteToDeveloper = () => {
    if (!session) return;
    const db = getDb();
    const u = db.users.find((x) => x.uid === session.uid);
    if (u) { u.role = u.role === "admin" ? "admin" : "developer"; }
    saveDb();
    persistSession({ ...session, role: u?.role ?? "developer" });
  };

  const value = useMemo<StoreShape>(() => ({
    route, session, theme, toasts, tick, firebaseMode,
    toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    toast, refresh, signInEmail, signUpEmail, signInGoogle, signOut, promoteToDeveloper,
  }), [route, session, theme, toasts, tick, firebaseMode]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ---------- toast host ---------- */

export function ToastHost() {
  const { toasts } = useStore();
  const icon: Record<Toast["kind"], string> = { ok: "M4 12.5l5 5L20 6.5", err: "M6 6l12 12M18 6L6 18", info: "M12 8v.5M12 11v6", warn: "M12 5l9 15H3l9-15zM12 11v4M12 18v.5" };
  const color: Record<Toast["kind"], string> = { ok: "#2fae7c", err: "#e2695b", info: "#55b4d8", warn: "#e2b054" };
  return (
    <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2 max-w-[calc(100vw-2rem)] w-80">
      {toasts.map((t) => (
        <div key={t.id} className="anim-pop card px-3.5 py-3 flex items-start gap-2.5 shadow-xl shadow-black/20">
          <svg viewBox="0 0 24 24" className="w-4.5 h-4.5 mt-0.5 shrink-0" fill="none" stroke={color[t.kind]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon[t.kind]} />
          </svg>
          <p className="text-[13px] leading-snug text-ink">{t.msg}</p>
        </div>
      ))}
    </div>
  );
}
