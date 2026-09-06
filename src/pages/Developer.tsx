import React, { useEffect, useState } from "react";
import type { Application, Developer } from "../lib/types";
import { getDb, fmtInt, fmtDate } from "../lib/db";
import { api, downloadCount, appRating } from "../lib/api";
import { Icon, Badge, EmptyState, Reveal } from "../components/ui";
import { AppCard } from "../components/layout";

export default function DeveloperPage({ slug }: { slug: string }) {
  const [data, setData] = useState<{ developer: Developer; apps: Application[] } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let on = true;
    api.developer(slug).then((d) => on && setData(d)).catch(() => on && setMissing(true));
    return () => { on = false; };
  }, [slug]);

  if (missing) {
    return <div className="max-w-3xl mx-auto px-4 pt-16"><EmptyState icon="users" title="Developer not found" sub="This developer profile does not exist or was removed." /></div>;
  }
  if (!data) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8">
        <div className="flex gap-5 mb-8"><div className="skeleton w-20 h-20 rounded-2xl" /><div className="flex-1"><div className="skeleton h-7 w-56 mb-3" /><div className="skeleton h-4 w-80 max-w-full" /></div></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-48" />)}</div>
      </div>
    );
  }

  const { developer: dev, apps } = data;
  const totalDl = apps.reduce((s, a) => s + downloadCount(a.id), 0);
  const avgR = apps.length ? apps.reduce((s, a) => s + appRating(a.id).avg, 0) / apps.length : 0;

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8">
      <div className="card overflow-hidden mb-8 anim-fade-up">
        <div className="h-28" style={{ background: `linear-gradient(120deg, hsl(${dev.hue} 50% 26%), hsl(${dev.hue + 50} 45% 14%))` }}>
          <div className="kaisel-grid h-full" />
        </div>
        <div className="p-6 -mt-12 relative">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-20 h-20 rounded-2xl grid place-items-center font-disp font-bold text-[30px] text-white border-4 border-panel"
              style={{ background: `linear-gradient(150deg, hsl(${dev.hue} 60% 48%), hsl(${dev.hue + 40} 55% 32%))` }}>
              {dev.name.slice(0, 1)}
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2">
                <h1 className="font-disp font-bold text-[26px] tracking-tight">{dev.name}</h1>
                {dev.verified && <Badge tone="jade"><Icon name="shield" size={11} /> verified</Badge>}
              </div>
              <p className="text-[12.5px] text-mut font-mono mt-0.5">
                {dev.country !== "—" && `${dev.country} · `}joined {fmtDate(dev.joinedAt)} · <Icon name="globe" size={11} className="inline" /> {dev.website}
              </p>
            </div>
            <div className="flex gap-6 text-center">
              {[[String(apps.length), "apps"], [fmtInt(totalDl), "downloads"], [avgR ? avgR.toFixed(1) + "★" : "–", "avg rating"]].map(([v, l]) => (
                <div key={l}><div className="font-disp font-bold text-[22px]">{v}</div><div className="text-[11px] text-mut uppercase tracking-wider">{l}</div></div>
              ))}
            </div>
          </div>
          <p className="text-[14px] text-ink/85 leading-relaxed mt-4 max-w-2xl">{dev.bio}</p>
        </div>
      </div>

      <Reveal>
        <h2 className="font-disp font-bold text-[20px] tracking-tight mb-4">Published applications</h2>
        {apps.length === 0 ? (
          <EmptyState icon="box" title="No published apps yet" sub="This developer hasn't released anything through Kaisel Store." />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {apps.map((a, i) => <AppCard key={a.id} app={a} index={i} />)}
          </div>
        )}
      </Reveal>
      <p className="text-[12px] text-mut mt-8">
        Developer ID <code className="font-mono text-jade2">{dev.id}</code> · data via <code className="font-mono">GET /api/developer/{dev.slug}</code>
      </p>
      {getDb() && null}
    </div>
  );
}
