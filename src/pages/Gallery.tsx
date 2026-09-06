import React, { useCallback, useEffect, useState } from "react";
import type { Application, SearchResult } from "../lib/types";
import { getDb } from "../lib/db";
import { api } from "../lib/api";
import { Icon, EmptyState, Reveal } from "../components/ui";
import { AppCard, CategoryChips } from "../components/layout";
import { useStore, navigate, useRoute } from "../state/store";

export function CategoriesPage() {
  const db = getDb();
  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8">
      <h1 className="font-disp font-bold text-[28px] tracking-tight mb-1">Categories</h1>
      <p className="text-mut text-[13.5px] mb-8">15 categories, all served with device-targeted artifacts.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {db.categories.map((c, i) => {
          const count = db.applications.filter((a) => a.categoryIds.includes(c.id) && a.status === "approved").length;
          return (
            <a key={c.id} href={`#/apps?cat=${c.id}`}
              className="group card p-5 hover:-translate-y-1 hover:border-jade/50 transition-all anim-fade-up"
              style={{ animationDelay: `${i * 35}ms` }}>
              <span className="w-11 h-11 rounded-xl grid place-items-center mb-3 transition-transform group-hover:scale-110"
                style={{ background: `hsl(${c.hue} 55% 45% / 0.16)`, color: `hsl(${c.hue} 72% 58%)` }}>
                <Icon name={c.glyph} size={22} />
              </span>
              <div className="font-disp font-semibold text-[15px] group-hover:text-jade transition-colors">{c.name}</div>
              <div className="text-[12px] text-mut font-mono mt-0.5">{count} apps</div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function Gallery() {
  const route = useRoute();
  const { tick } = useStore();
  const q = route.query.get("q") ?? "";
  const cat = route.query.get("cat") ?? undefined;
  const sort = (route.query.get("sort") as "popular" | "downloads" | "newest" | "rating" | null) ?? "popular";

  const [text, setText] = useState(q);
  const [minRating, setMinRating] = useState(0);
  const [compatOnly, setCompatOnly] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => setText(q), [q]);

  const setParam = useCallback((key: string, value: string | undefined) => {
    const params = new URLSearchParams(route.query);
    if (value) params.set(key, value); else params.delete(key);
    navigate(`/apps${params.toString() ? "?" + params.toString() : ""}`);
  }, [route.query]);

  const load = useCallback(async (page: number, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const r = await api.search({ q, category: cat, minRating: minRating || undefined, compatibleOnly: compatOnly || undefined, sort, page, pageSize: 12 });
      setResult(r);
      setItems((prev) => (append ? [...prev, ...r.items] : r.items));
    } catch {
      setResult({ items: [], total: 0, page: 1, pageSize: 12, tookMs: 0 });
      if (!append) setItems([]);
    } finally { setLoading(false); setLoadingMore(false); }
  }, [q, cat, minRating, compatOnly, sort]);

  useEffect(() => { load(1, false); }, [load, tick]);

  const title = q ? `Results for “${q}”` : cat ? (getDb().categories.find((c) => c.id === cat)?.name ?? "Apps") : sort === "newest" ? "New releases" : sort === "downloads" ? "Most downloaded" : "All apps";

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <h1 className="font-disp font-bold text-[28px] tracking-tight">{title}</h1>
          <p className="text-mut text-[13px] mt-1">
            {result ? <>{result.total} applications{q && <span className="font-mono"> · {result.tookMs} ms (indexed)</span>}</> : "Searching the catalog…"}
          </p>
        </div>
        <div className="field flex items-center gap-2 px-3 py-2 w-full sm:w-80">
          <Icon name="search" size={15} className="text-mut" />
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setParam("q", text || undefined); }}
            placeholder="Name, package, developer…" className="bg-transparent flex-1 text-[13.5px]" />
          {text && <button onClick={() => { setText(""); setParam("q", undefined); }} className="text-mut hover:text-ink cursor-pointer"><Icon name="x" size={13} /></button>}
        </div>
      </div>

      <CategoryChips active={cat} onPick={(slug) => setParam("cat", slug)} />

      <div className="flex flex-wrap items-center gap-2.5 mt-3 mb-7">
        <select value={sort} onChange={(e) => setParam("sort", e.target.value === "popular" ? undefined : e.target.value)}
          className="field px-3 py-2 text-[12.5px] cursor-pointer" aria-label="Sort">
          <option value="popular">Sort · Popular</option>
          <option value="downloads">Sort · Downloads</option>
          <option value="newest">Sort · Newest</option>
          <option value="rating">Sort · Rating</option>
        </select>
        <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="field px-3 py-2 text-[12.5px] cursor-pointer" aria-label="Minimum rating">
          <option value={0}>Any rating</option>
          <option value={3}>3★ & up</option>
          <option value={4}>4★ & up</option>
          <option value={4.5}>4.5★ & up</option>
        </select>
        <button onClick={() => setCompatOnly((v) => !v)}
          className={`chip px-3 py-2 text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer ${compatOnly ? "chip-on" : "text-mut"}`}>
          <Icon name="phone" size={13} /> Compatible with my device
        </button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4">
              <div className="flex gap-3.5 mb-3"><div className="skeleton w-14 h-14 rounded-[14px]" /><div className="flex-1"><div className="skeleton h-4 w-3/4 mb-2" /><div className="skeleton h-3 w-1/2" /></div></div>
              <div className="skeleton h-3 w-full mb-2" /><div className="skeleton h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="search" title="Nothing matches those filters"
          sub="Try a broader query, another category, or disable the compatibility filter to see everything in the catalog."
          action={<button onClick={() => { setParam("q", undefined); setParam("cat", undefined); setMinRating(0); setCompatOnly(false); }} className="btn-primary px-5 py-2 text-[13px] cursor-pointer">Clear filters</button>} />
      ) : (
        <Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((a, i) => <AppCard key={a.id} app={a} index={i % 12} />)}
          </div>
          {result && items.length < result.total && (
            <div className="flex justify-center mt-8">
              <button onClick={() => load(result.page + 1, true)} disabled={loadingMore}
                className="btn-ghost px-6 py-2.5 text-[13.5px] font-medium inline-flex items-center gap-2 cursor-pointer">
                {loadingMore ? <Icon name="refresh" size={15} className="animate-spin" /> : <Icon name="chev-d" size={15} />}
                {loadingMore ? "Loading…" : `Load more (${result.total - items.length} left)`}
              </button>
            </div>
          )}
        </Reveal>
      )}
    </div>
  );
}
