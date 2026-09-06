import React, { useEffect, useRef, useState } from "react";
import type { Application, AppIconSpec, ScreenshotSpec } from "../lib/types";
import { mulberry32, hashStr } from "../lib/db";

/* ============================================================
   Kaisel UI primitives — every icon is inline SVG.
   ============================================================ */

const P: Record<string, string> = {
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5L21 21",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5z",
  download: "M12 4v11M7.5 11l4.5 4.5L16.5 11M4.5 20h15",
  upload: "M12 16V5M7.5 9L12 4.5 16.5 9M4.5 20h15",
  shield: "M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3zM9 11.5l2 2 4-4.5",
  check: "M4.5 12.5l5 5L19.5 6.5",
  x: "M6 6l12 12M18 6L6 18",
  "chev-d": "M6 9.5l6 6 6-6",
  "chev-r": "M9.5 6l6 6-6 6",
  "chev-l": "M14.5 6l-6 6 6 6",
  "arrow-r": "M4 12h15M13 5.5L19.5 12 13 18.5",
  refresh: "M20 12a8 8 0 1 1-2.4-5.7M20 3.5V8h-4.5",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13.5h9l1-13.5M10 11v6M14 11v6",
  edit: "M4.5 19.5l1-4L16.7 4.3a2.1 2.1 0 0 1 3 3L8.5 18.5l-4 1z",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
  menu: "M4 6.5h16M4 12h16M4 17.5h16",
  hash: "M9.5 3.5l-2 17M16.5 3.5l-2 17M4 8.5h17M3 15.5h17",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8v4.5l3 2",
  filter: "M4 5h16l-6.2 7.2V18l-3.6 2v-7.8L4 5z",
  plus: "M12 5v14M5 12h14",
  alert: "M12 4.5L22 20H2L12 4.5zM12 10v4M12 17v.5",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5M12 7.5v.5",
  logout: "M9.5 4.5H5v15h4.5M14.5 8l4 4-4 4M8.5 12h10",
  globe: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5S14.5 18.2 12 20.5c-2.5-2.3-3.8-5.2-3.8-8.5S9.5 5.8 12 3.5z",
  box: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12L4 7.5M12 12v9",
  layers: "M12 3.5l9 4.8-9 4.8-9-4.8 9-4.8zM3.5 13l8.5 4.5 8.5-4.5M3.5 16.8l8.5 4.5 8.5-4.5",
  terminal: "M3.5 5h17v14h-17zM7 9l3 3-3 3M12.5 15H17",
  chart: "M4 20V4M4 20h16M8.5 16.5v-5M12.5 16.5v-9M16.5 16.5v-3.5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  flag: "M5.5 21V4.5c4-2.2 7 2 13 0v9.5c-6 2-9-2.2-13 0",
  database: "M12 3.5c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6.5v11c0 1.7 3.6 3 8 3s8-1.3 8-3v-11M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  lock: "M6 11h12v9.5H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2",
  key: "M14.5 4a5 5 0 0 0-4.9 6.2L4 15.8V20h4.2l1.6-1.6v-2h2l1.4-1.5A5 5 0 1 0 14.5 4zM15.5 8.5v.5",
  mail: "M3.5 6h17v12h-17zM3.5 7l8.5 6 8.5-6",
  spark: "M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7-4.7-1.8 4.7-1.8L12 3.5zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z",
  cpu: "M7 7h10v10H7zM10 10.5h4v4h-4zM9 3.5V7M15 3.5V7M9 17v3.5M15 17v3.5M3.5 9H7M3.5 15H7M17 9h3.5M17 15h3.5",
  phone: "M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5zM10.5 17.5h3",
  user: "M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5zM5 20a7 7 0 0 1 14 0",
  users: "M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6.5 6.5 0 0 1 13 0M16.5 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4A6.5 6.5 0 0 1 21.5 20",
  doc: "M6 3.5h8.5L19 8v12.5H6zM14.5 3.5V8H19M9 12.5h6M9 16h6",
  external: "M13.5 5H19v5.5M19 5l-8 8M16 13.5V19H5V8h5.5",
  zap: "M13 2.5L5 13.5h5L9 21.5l8-11h-5l1-8z",
  rocket: "M12 3.5c3.2 2 5 5.5 5 9.5l2.5 2.5-3.5 1-1.5 3.5L12 17.5l-2.5 2.5L8 16.5l-3.5-1L7 13c0-4 1.8-7.5 5-9.5zM12 10.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5z",
  game: "M7 5.5h10a4 4 0 0 1 4 4v5a2.6 2.6 0 0 1-4.6 1.6L14.5 13.5h-5L7.6 16.1A2.6 2.6 0 0 1 3 14.5v-5a4 4 0 0 1 4-4zM6.5 9.5h4M8.5 7.5v4M15 10.5h.5M17.5 8.5h.5",
  edu: "M2.5 9L12 4.5 21.5 9 12 13.5 2.5 9zM6 11.2V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.8M21.5 9v5",
  prod: "M4 4.5h4.5v15H4zM10 4.5h4.5v10H10zM16 4.5h4.5v7H16z",
  tools: "M20.5 6.8a5 5 0 0 1-6.5 6.2L8 19a2.1 2.1 0 0 1-3-3l6-6A5 5 0 0 1 17.2 3.5L14.5 6.2l.7 2.6 2.6.7 2.7-2.7z",
  social: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M17.8 14.3A6.5 6.5 0 0 1 21.5 20",
  comm: "M4 5h16v11.5H9.5L4 20.5V5zM8 9h8M8 12h5",
  ent: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM10 8.7l6 3.3-6 3.3V8.7z",
  music: "M9 18.5V6.2L20 4v12.3M9 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM20 16.3a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  video: "M3.5 6h17v13h-17zM3.5 10h17M8 6l-2.5 4M13.5 6L11 10M19 6l-2.5 4",
  photo: "M4 8h3.2L9 5h6l1.8 3H20v11H4V8zM12 16.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5z",
  fin: "M3.5 20.5h17M6.5 20.5V13M11 20.5V6M15.5 20.5v-10M20 20.5V10",
  health: "M12 20S3.5 14.7 3.5 9.4A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.5 2.2C20.5 14.7 12 20 12 20z",
  travel: "M21 4L3.5 10.8l6.7 2.5L12.7 20 21 4zM10.2 13.3L21 4",
  pers: "M12 3a9 9 0 1 0 0 18c1.6 0 2.2-1 1.6-2.1-.6-1.1-.5-2.1 1.1-2.1h1.6A4.2 4.2 0 0 0 20.5 12C20.5 7 16.7 3 12 3zM7.5 10.5v.5M10.5 7v.5M14.5 7.5V8",
  util: "M4 7.5h9M17.5 7.5H20M4 16.5h2.5M11 16.5h9M13.5 5v5M6.5 14v5",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, className = "", sw = 1.8 }: { name: string; size?: number; className?: string; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} fill="none"
      stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? P.box} />
    </svg>
  );
}

export function StarRow({ value, size = 13, onRate, className = "" }: { value: number; size?: number; onRate?: (n: number) => void; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[2px] ${className}`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = value >= i - 0.25 ? 1 : value >= i - 0.75 ? 0.5 : 0;
        return (
          <svg key={i} viewBox="0 0 24 24" width={size} height={size}
            className={onRate ? "cursor-pointer hover:scale-125 transition-transform" : ""}
            onClick={onRate ? () => onRate(i) : undefined}>
            <defs>
              <linearGradient id={`sg${i}-${size}-${Math.round(fill * 2)}`} x1="0" x2="1">
                <stop offset={`${fill * 100}%`} stopColor="#f0b454" />
                <stop offset={`${fill * 100}%`} stopColor="var(--line2)" />
              </linearGradient>
            </defs>
            <path d={P.star} fill={`url(#sg${i}-${size}-${Math.round(fill * 2)})`} />
          </svg>
        );
      })}
    </span>
  );
}

/* ---------- app icon tile ---------- */

export function AppIcon({ spec, size = 56, className = "" }: { spec: AppIconSpec; size?: number; className?: string }) {
  if (spec.url) {
    return (
      <img src={spec.url} alt="" draggable={false}
        className={`shrink-0 object-cover select-none ${className}`}
        style={{ width: size, height: size, borderRadius: size * 0.26, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 16px -8px rgba(0,0,0,0.5)" }} />
    );
  }
  const h = spec.hue;
  const bg = spec.style === "solid"
    ? `linear-gradient(150deg, hsl(${h} 62% 52%), hsl(${h + 30} 60% 34%))`
    : spec.style === "duo"
      ? `linear-gradient(150deg, hsl(${h} 70% 55%), hsl(${h + 50} 65% 42%))`
      : `linear-gradient(150deg, hsl(${h} 30% 24%), hsl(${h} 45% 14%))`;
  return (
    <div className={`relative shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size, borderRadius: size * 0.26, background: bg, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 16px -8px rgba(0,0,0,0.5)" }}>
      {spec.style === "ring" && (
        <div className="absolute inset-0" style={{ border: `${Math.max(2, size * 0.055)}px solid hsl(${h} 80% 62% / 0.9)`, borderRadius: "inherit", transform: "scale(0.82)" }} />
      )}
      <div className="absolute inset-0 grid place-items-center text-white" style={{ opacity: 0.95 }}>
        <Icon name={spec.glyph} size={size * 0.52} sw={1.7} />
      </div>
    </div>
  );
}

/* ---------- procedural screenshot ---------- */

export function Shot({ app, shot, w = 180 }: { app: Application; shot: ScreenshotSpec; w?: number }) {
  const h = Math.round(w * 2.05);
  const hue = app.icon.hue;
  const rnd = mulberry32(hashStr(app.id + shot.id));
  const rows = [0, 1, 2, 3].map(() => 30 + rnd() * 55);
  const variant = shot.variant % 4;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="rounded-xl border border-line shrink-0" style={{ background: `hsl(${hue} 30% 10%)` }}>
      <defs>
        <linearGradient id={`shg-${app.id}-${shot.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 65% 45%)`} />
          <stop offset="100%" stopColor={`hsl(${hue + 45} 60% 30%)`} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={w} height={h * 0.26} fill={`url(#shg-${app.id}-${shot.id})`} />
      <circle cx={w * 0.12} cy={h * 0.06} r={3} fill="rgba(255,255,255,0.85)" />
      <rect x={w * 0.2} y={h * 0.052} width={w * 0.4} height={5} rx={2.5} fill="rgba(255,255,255,0.85)" />
      {variant === 0 && rows.map((rw, i) => (
        <g key={i}>
          <rect x={w * 0.07} y={h * 0.31 + i * h * 0.145} width={h * 0.085} height={h * 0.085} rx={8} fill={`hsl(${hue} 55% ${55 - i * 6}%)`} />
          <rect x={w * 0.07 + h * 0.115} y={h * 0.33 + i * h * 0.145} width={rw} height={6} rx={3} fill="rgba(233,242,236,0.8)" />
          <rect x={w * 0.07 + h * 0.115} y={h * 0.33 + i * h * 0.145 + 11} width={rw * 0.6} height={5} rx={2.5} fill="rgba(233,242,236,0.35)" />
        </g>
      ))}
      {variant === 1 && (
        <g>
          <rect x={w * 0.07} y={h * 0.32} width={w * 0.86} height={h * 0.3} rx={12} fill={`url(#shg-${app.id}-${shot.id})`} opacity="0.85" />
          <rect x={w * 0.07} y={h * 0.66} width={w * 0.86} height={8} rx={4} fill="rgba(233,242,236,0.8)" />
          <rect x={w * 0.07} y={h * 0.69 + 8} width={w * 0.6} height={6} rx={3} fill="rgba(233,242,236,0.35)" />
          {[0, 1, 2].map((i) => (
            <rect key={i} x={w * 0.07 + i * (w * 0.3)} y={h * 0.78} width={w * 0.27} height={h * 0.12} rx={10} fill={`hsl(${hue + i * 24} 45% 30%)`} />
          ))}
        </g>
      )}
      {variant === 2 && (
        <g>
          {[0.8, 0.55, 0.92, 0.4, 0.68].map((v, i) => (
            <rect key={i} x={w * 0.1 + i * w * 0.165} y={h * 0.62 - v * h * 0.22} width={w * 0.11} height={v * h * 0.22} rx={5} fill={`hsl(${hue} 60% ${45 + i * 5}%)`} />
          ))}
          <rect x={w * 0.07} y={h * 0.68} width={w * 0.86} height={6} rx={3} fill="rgba(233,242,236,0.5)" />
          <rect x={w * 0.07} y={h * 0.32} width={w * 0.5} height={8} rx={4} fill="rgba(233,242,236,0.85)" />
        </g>
      )}
      {variant === 3 && (
        <g>
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <rect x={w * 0.07} y={h * 0.32 + i * h * 0.115} width={w * 0.86} height={h * 0.085} rx={9} fill={`hsl(${hue} 30% ${18 + i * 3}%)`} />
              <circle cx={w * 0.13} cy={h * 0.32 + i * h * 0.115 + h * 0.0425} r={4.5} fill={`hsl(${hue} 65% 55%)`} opacity={i === 1 ? 1 : 0.4} />
              <rect x={w * 0.19} y={h * 0.32 + i * h * 0.115 + h * 0.03} width={w * 0.35 + (i % 3) * 12} height={5} rx={2.5} fill="rgba(233,242,236,0.6)" />
            </g>
          ))}
        </g>
      )}
      <circle cx={w * 0.85} cy={h * 0.925} r={h * 0.032} fill={`hsl(${hue} 75% 58%)`} />
    </svg>
  );
}

/* ---------- primitives ---------- */

export function Chip({ children, active, onClick, className = "" }: { children: React.ReactNode; active?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button onClick={onClick}
      className={`chip px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap cursor-pointer select-none ${active ? "chip-on" : "text-mut hover:text-ink"} ${className}`}>
      {children}
    </button>
  );
}

export function Badge({ tone = "mut", children, className = "" }: { tone?: "jade" | "gold" | "coral" | "cy" | "mut"; children: React.ReactNode; className?: string }) {
  const tones: Record<string, string> = {
    jade: "text-jade border-jade/40 bg-jade/10",
    gold: "text-gold border-gold/40 bg-gold/10",
    coral: "text-coral border-coral/40 bg-coral/10",
    cy: "text-cy border-cy/40 bg-cy/10",
    mut: "text-mut border-line bg-panel2",
  };
  return <span className={`inline-flex items-center gap-1 border rounded-md px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}>{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative card anim-pop w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[86vh] overflow-y-auto scrollx`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-line sticky top-0 bg-panel z-10">
          <h3 className="font-disp font-semibold text-[15px]">{title}</h3>
          <button onClick={onClose} className="btn-ghost p-1.5 cursor-pointer" aria-label="Close"><Icon name="x" size={15} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon = "box", title, sub, action }: { icon?: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="card py-14 px-6 text-center anim-fade-up">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-panel2 border border-line grid place-items-center text-mut mb-4">
        <Icon name={icon} size={26} />
      </div>
      <h3 className="font-disp font-semibold text-[16px]">{title}</h3>
      {sub && <p className="text-mut text-[13px] mt-1.5 max-w-sm mx-auto leading-relaxed">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionHead({ title, sub, href, right }: { title: string; sub?: string; href?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h2 className="font-disp font-bold text-[20px] sm:text-[23px] tracking-tight">{title}</h2>
        {sub && <p className="text-mut text-[13px] mt-0.5">{sub}</p>}
      </div>
      {right ?? (href ? (
        <a href={`#${href}`} className="btn-ghost hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium hover:text-jade">
          See all <Icon name="arrow-r" size={13} />
        </a>
      ) : null)}
    </div>
  );
}

export function SkelRow({ n = 6 }: { n?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="shrink-0 w-[168px]">
          <div className="skeleton w-14 h-14 rounded-[14px] mb-3" />
          <div className="skeleton h-3.5 w-28 mb-2" />
          <div className="skeleton h-3 w-20 mb-2" />
          <div className="skeleton h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CopyHash({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-mut font-semibold mb-1">{label}</div>
      <div className="flex items-start gap-2">
        <code className="hash-mono text-jade2 bg-panel2 border border-line rounded-lg px-2.5 py-2 flex-1">{value || "computed on first download"}</code>
        {value && (
          <button className="btn-ghost px-2.5 cursor-pointer" aria-label={`Copy ${label}`}
            onClick={() => { navigator.clipboard?.writeText(value).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1400); }}>
            <Icon name={copied ? "check" : "copy"} size={14} className={copied ? "text-jade" : ""} />
          </button>
        )}
      </div>
    </div>
  );
}

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { threshold: 0.08 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useReveal<HTMLDivElement>();
  return <div ref={ref} className={`reveal ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}
