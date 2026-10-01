"use client";

import Link from "next/link";
import { useState } from "react";
import { ACTION_PRIORITIES, PRIORITY_COLOR, PRIORITY_HINT, PRIORITY_LABEL, junctionName } from "@/lib/data";
import { REPO_URL } from "@/lib/site";
import type { Filters, Junction, Priority, Summary } from "@/lib/types";

const nf = new Intl.NumberFormat("es-CO");

interface Props {
  summary: Summary | null;
  counts: Record<Priority, number> | null;
  filters: Filters;
  setFilters: (f: Filters) => void;
  list: Junction[];
  matchCount: number;
  selectedId: string | null;
  onPick: (j: Junction) => void;
  onAbout: () => void;
  dark: boolean;
  onToggleTheme: () => void;
}

function LegendRow({ on, onClick, color, label, hint, count }: {
  on: boolean; onClick: () => void; color: string; label: string; hint: string; count: number | null;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100 ${on ? "" : "opacity-45"}`}
    >
      <span className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white" style={{ background: color, boxShadow: `0 0 0 1px ${color}` }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-slate-800">{label}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
      <span className="font-mono text-[13px] tabular-nums text-slate-600">{count != null ? nf.format(count) : "—"}</span>
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      className={`rounded-full border px-2.5 py-1 text-[12px] transition ${on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
    >
      {children}
    </button>
  );
}

export default function Sidebar(p: Props) {
  const f = p.filters;
  const [limit, setLimit] = useState(30);

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-4 pt-5">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-[17px] font-semibold tracking-tight text-slate-900">Semáforos de Barranquilla</h1>
          <button
            onClick={p.onToggleTheme} aria-label={p.dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"} title={p.dark ? "Tema claro" : "Tema oscuro"}
            className="-mr-1 -mt-0.5 rounded-full p-1.5 text-[15px] leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            {p.dark ? "☀" : "☾"}
          </button>
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-slate-500">
          Dónde hay semáforos hoy y qué cruces conviene estudiar primero para instalar uno.
        </p>
        <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-slate-600 ring-1 ring-slate-200">
          <strong className="font-semibold text-slate-800">Proyecto independiente, no oficial.</strong> Evaluación automatizada con IA: lista
          priorizada para estudio técnico, no un dictamen.
        </p>
        {p.summary?.fixture && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-[11px] text-amber-800">Datos de ejemplo. Ejecuta el pipeline para cargar los datos reales.</p>
        )}
      </header>

      <section className="border-y border-slate-100 px-3 py-2">
        {ACTION_PRIORITIES.map((pr) => (
          <LegendRow
            key={pr} on={f.priorities[pr]} color={PRIORITY_COLOR[pr]} label={PRIORITY_LABEL[pr]} hint={PRIORITY_HINT[pr]}
            count={p.counts?.[pr] ?? null}
            onClick={() => p.setFilters({ ...f, priorities: { ...f.priorities, [pr]: !f.priorities[pr] } })}
          />
        ))}
        <LegendRow
          on={f.signals} color={PRIORITY_COLOR.semaforizado} label="Con semáforo" hint="Cruces ya semaforizados"
          count={p.counts?.semaforizado ?? p.summary?.counts.signalized ?? null}
          onClick={() => p.setFilters({ ...f, signals: !f.signals })}
        />
      </section>

      <section className="px-5 pb-2 pt-3">
        <input
          type="search" value={f.query} onChange={(e) => p.setFilters({ ...f, query: e.target.value })}
          placeholder="Buscar calle o carrera…" aria-label="Buscar calle o carrera"
          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip on={f.nearSchool} onClick={() => p.setFilters({ ...f, nearSchool: !f.nearSchool })}>Cerca de colegio</Chip>
          <Chip on={f.nearHospital} onClick={() => p.setFilters({ ...f, nearHospital: !f.nearHospital })}>Cerca de hospital</Chip>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <div className="sticky top-0 z-10 flex items-baseline justify-between bg-white px-2 pb-1.5 pt-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Cruces por prioridad</h2>
          <span className="font-mono text-[11px] text-slate-400">{nf.format(p.matchCount)}</span>
        </div>
        {p.list.length === 0 && <p className="px-2 text-[13px] text-slate-500">Ningún cruce coincide.</p>}
        <ol>
          {p.list.slice(0, limit).map((j, i) => (
            <li key={j.id}>
              <button
                onClick={() => p.onPick(j)}
                className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition hover:bg-slate-100 ${p.selectedId === j.id ? "bg-slate-100" : ""}`}
              >
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[j.priority] }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-800">{junctionName(j)}</span>
                  <span className="block truncate text-[12px] text-slate-500">{j.recommendation}{j.evidence[0] ? ` · ${j.evidence[0]}` : ""}</span>
                </span>
                <span className="mt-0.5 font-mono text-[11px] text-slate-400">{i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
        {p.list.length > limit && (
          <button onClick={() => setLimit(limit + 50)} className="mt-1 w-full rounded-lg py-2 text-[12px] text-slate-500 hover:bg-slate-100">
            Ver más
          </button>
        )}
      </section>

      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-5 py-3 text-[12px] text-slate-500">
        <button onClick={p.onAbout} className="underline-offset-2 hover:text-slate-800 hover:underline">
          Cómo se hizo
        </button>
        <Link href="/licencias" className="underline-offset-2 hover:text-slate-800 hover:underline">
          Licencias y créditos
        </Link>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline">
          Código abierto en GitHub ↗
        </a>
      </footer>
    </div>
  );
}
