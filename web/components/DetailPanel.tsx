"use client";

import { useEffect, useState } from "react";
import { PRIORITY_COLOR, PRIORITY_LABEL, classLabel, googleEmbed, googleLink, junctionName } from "@/lib/data";
import { legsFor, loadStreets, type Leg } from "@/lib/sim";
import type { Junction } from "@/lib/types";
import JunctionSim from "./JunctionSim";

const VIEWS = [["street", "Street View"], ["satellite", "Satélite"], ["map", "Mapa"]] as const;
type View = (typeof VIEWS)[number][0];

const SOURCE_LABEL = { osm: "OpenStreetMap", oficial: "Inventario oficial", ambos: "Inventario oficial y OpenStreetMap" };
const AGREEMENT_LABEL = { alto: "Todos los indicadores coinciden", medio: "La mayoría de indicadores coincide", bajo: "Los indicadores no coinciden" };

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-500">{label}</dt>
      <dd className="text-[14px] font-medium text-slate-800">{value}</dd>
    </div>
  );
}

export default function DetailPanel({ j, onClose }: { j: Junction; onClose: () => void }) {
  const [view, setView] = useState<View>("street");
  const [sim, setSim] = useState(false);
  const color = PRIORITY_COLOR[j.priority];
  const signalized = j.priority === "semaforizado";
  const classes = [...new Set(j.classes.map(classLabel))];
  const distance = j.distSignalAlongM ?? j.distNearestSignalM;
  // the before/after simulation only makes sense where a vehicle signal is the suggested measure...
  const wantsSim = !signalized && j.priority !== "sin_accion" && /sem[aá]foro vehicular/i.test(j.recommendation);
  // ...and where the junction's shape can be simulated (not a roundabout, a side street that actually feeds in)
  const [legs, setLegs] = useState<Leg[] | null>(null);
  useEffect(() => {
    if (!wantsSim) return;
    let alive = true;
    loadStreets().then((st) => alive && setLegs(legsFor(st, j.lng, j.lat, { names: j.streets, major: j.majorStreet }))).catch(() => {});
    return () => { alive = false; };
  }, [wantsSim, j.lng, j.lat, j.streets, j.majorStreet]);

  return (
    <aside
      aria-label="Detalle del cruce"
      className="absolute inset-x-2 bottom-2 z-20 flex max-h-[72vh] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10 md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:max-h-none md:w-[400px]"
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#fff]" style={{ background: color }}>
            {PRIORITY_LABEL[j.priority]}
          </span>
          <h2 className="mt-1.5 text-[17px] font-semibold leading-snug text-slate-900">{junctionName(j)}</h2>
          <p className="text-[12px] text-slate-500">{classes.join(" × ")}</p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
        {!signalized && j.priority !== "sin_accion" && (
          <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">Medida sugerida para estudio</div>
            <div className="text-[16px] font-semibold text-slate-900">{j.recommendation}</div>
            {j.agreement && <div className="mt-0.5 text-[12px] text-slate-500">{AGREEMENT_LABEL[j.agreement]}</div>}
            {legs && (
              <button onClick={() => setSim(true)} className="mt-2.5 w-full rounded-lg bg-slate-900 px-3 py-2 text-[13px] font-medium text-white transition hover:bg-slate-700">
                ▶ Ver simulación: hoy y con semáforo
              </button>
            )}
          </div>
        )}
        {signalized && j.signalSource && (
          <p className="mt-3 text-[13px] text-slate-600">Semáforo confirmado en: {SOURCE_LABEL[j.signalSource]}.</p>
        )}

        {j.evidence.length > 0 && !signalized && (
          <section className="mt-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Por qué</h3>
            <ul className="mt-1.5 space-y-1.5 text-[13.5px] leading-snug text-slate-700">
              {j.evidence.map((e) => (
                <li key={e} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-400" />{e}</li>
              ))}
            </ul>
          </section>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-3 border-y border-slate-100 py-3">
          <Fact label="Siniestros" value={j.crashes ? j.crashes.total : "s/d"} />
          <Fact label={signalized ? "Ramales" : "Semáforo más cercano"} value={signalized ? j.legs : `${Math.round(distance)} m`} />
          <Fact label="Carriles" value={j.maxLanes ?? "s/d"} />
        </dl>
        {j.crashes && (
          <p className="mt-1.5 text-[11px] text-slate-400">
            Siniestros {j.crashes.period}: {j.crashes.injuries} con heridos, {j.crashes.deaths} con muertos.
          </p>
        )}

        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ver el cruce</h3>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-[12px]">
              {VIEWS.map(([v, label]) => (
                <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                  className={`rounded-md px-2.5 py-1 transition ${view === v ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <iframe
            key={`${j.id}-${view}`} title={`${junctionName(j)} en Google Maps`} src={googleEmbed(j.lat, j.lng, view)}
            loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen
            className="mt-2 h-[260px] w-full rounded-xl border-0 bg-slate-100"
          />
          <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-mono">{j.lat.toFixed(5)}, {j.lng.toFixed(5)}</span>
            <a className="hover:text-slate-700 hover:underline" href={googleLink(j.lat, j.lng)} target="_blank" rel="noreferrer">Abrir en Google Maps ↗</a>
          </div>
        </section>
      </div>
      {sim && legs && <JunctionSim legs={legs} title={junctionName(j)} onClose={() => setSim(false)} />}
    </aside>
  );
}
