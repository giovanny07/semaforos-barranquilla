"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { PRIORITY_COLOR, loadIntersections, loadSummary, passes, type Loaded } from "@/lib/data";
import type { Filters, Junction, Summary } from "@/lib/types";
import type { FlyTarget } from "./MapView";
import About from "./About";
import DetailPanel from "./DetailPanel";
import Notice from "./Notice";
import Sidebar from "./Sidebar";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const DEFAULT_FILTERS: Filters = {
  priorities: { prioritario: true, recomendado: true, observacion: false },
  signals: true,
  nearSchool: false,
  nearHospital: false,
  query: "",
};
// Theme lives on <html class="dark"> + localStorage; read through an external store so SSR and the first client render agree.
const themeListeners = new Set<() => void>();
const readTheme = () => document.documentElement.classList.contains("dark");
function setTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
  themeListeners.forEach((l) => l());
}
const subscribeTheme = (l: () => void) => { themeListeners.add(l); return () => { themeListeners.delete(l); }; };

const ORDER = { prioritario: 0, recomendado: 1, observacion: 2, sin_accion: 3, semaforizado: 4 };

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fly, setFly] = useState<FlyTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const dark = useSyncExternalStore(subscribeTheme, readTheme, () => false);

  useEffect(() => {
    loadSummary().then(setSummary).catch(() => setSummary(null));
    loadIntersections().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  const list = useMemo(() => {
    if (!data) return [] as Junction[];
    return data.junctions
      .filter((j) => passes(j, filters))
      .sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || b.priorityScore - a.priorityScore);
  }, [data, filters]);

  const selected = selectedId ? data?.byId.get(selectedId) ?? null : null;
  const selectedPoint = useMemo(() => (selected ? { lng: selected.lng, lat: selected.lat } : null), [selected]);

  const onPick = useCallback((j: Junction) => {
    setSelectedId(j.id);
    setFly({ lng: j.lng, lat: j.lat, nonce: Date.now() });
    setOpen(false);
  }, []);

  return (
    <main className="fixed inset-0 flex bg-slate-100 text-slate-800">
      <div
        className={`absolute inset-y-0 left-0 z-30 w-[min(340px,88vw)] border-r border-slate-200 bg-white transition-transform duration-200 md:static md:w-[340px] md:shrink-0 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Sidebar
          summary={summary} counts={data?.counts ?? null} filters={filters} setFilters={setFilters}
          list={list} matchCount={list.length} selectedId={selectedId} onPick={onPick} onAbout={() => setAbout(true)}
          dark={dark} onToggleTheme={() => setTheme(!dark)}
        />
      </div>
      {open && <button aria-label="Cerrar panel" onClick={() => setOpen(false)} className="absolute inset-0 z-20 bg-black/50 md:hidden" />}

      <div className="relative min-w-0 flex-1">
        <MapView
          key={dark ? "dark" : "light"} dark={dark}
          flat={data?.flat ?? null} filters={filters} selected={selectedPoint} fly={fly}
          rightInset={typeof window !== "undefined" && window.innerWidth >= 768 ? 420 : 0} onSelect={setSelectedId}
        />
        <div className="absolute inset-x-3 top-3 z-10 flex items-center gap-2 md:hidden">
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg bg-white px-3 py-2 text-[13px] font-medium text-slate-800 shadow-md ring-1 ring-slate-900/10"
          >
            ☰ Cruces
          </button>
          <span className="min-w-0 truncate rounded-lg bg-white/90 px-2.5 py-1.5 text-[12.5px] font-semibold text-slate-900 shadow-sm ring-1 ring-slate-900/10">
            Semáforos de Barranquilla
          </span>
        </div>
        {/* the junction panel takes its place while a junction is open */}
        {!selected && <Notice onAbout={() => setAbout(true)} />}
        {/* legend on the first mobile screen, without opening the drawer */}
        <div className="pointer-events-none absolute bottom-10 left-3 z-10 flex flex-col gap-0.5 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-700 shadow-sm ring-1 ring-slate-900/10 md:hidden">
          {([["prioritario", "Estudiar primero"], ["recomendado", "Estudiar después"], ["semaforizado", "Ya tiene semáforo"]] as const).map(([p, label]) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: PRIORITY_COLOR[p] }} />
              {label}
            </span>
          ))}
        </div>
        {!data && !error && (
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white px-3 py-1.5 text-[12px] text-slate-600 shadow ring-1 ring-slate-900/10 md:bottom-8">
            Cargando cruces…
          </div>
        )}
        {error && (
          <div role="alert" className="absolute left-1/2 top-3 z-10 w-[min(90%,420px)] -translate-x-1/2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-800 ring-1 ring-rose-200">
            No se pudieron cargar los cruces ({error}). Verifica que existan los archivos en <code>public/data/</code>.
          </div>
        )}
        {selected && <DetailPanel key={selected.id} j={selected} onClose={() => setSelectedId(null)} />}
      </div>

      {about && <About summary={summary} onClose={() => setAbout(false)} />}
    </main>
  );
}
