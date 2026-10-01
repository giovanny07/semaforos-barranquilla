"use client";

import Link from "next/link";
import { METHOD_URL, REPO_URL } from "@/lib/site";
import type { Summary } from "@/lib/types";

export default function About({ summary, onClose }: { summary: Summary | null; onClose: () => void }) {
  // generatedAt = date of the data snapshot (shown in Colombian time whatever the visitor's time zone)
  const date = summary
    ? new Date(summary.generatedAt).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Bogota" })
    : null;
  // figures measured by the pipeline's backtest (see docs/validation.md); absent in older data files
  const v = summary?.validation as {
    signals?: { officialInventory: number; officialConfirmedInOsm: number };
    crashes?: { matched: number; period: string };
    backtest?: { main?: { holdout?: { signalizedN: number; quietN: number; recallPct: number; falseAlarmQuietPct: number } } };
  } | undefined;
  const h = v?.backtest?.main?.holdout;
  const nf = new Intl.NumberFormat("es-CO");
  const link = "text-slate-700 underline underline-offset-2 hover:text-slate-900";
  return (
    <div role="dialog" aria-modal="true" aria-label="Cómo se hizo este análisis" className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative max-h-[85vh] w-full max-w-[560px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[18px] font-semibold text-slate-900">Cómo se hizo este análisis</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
        </div>
        <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-slate-700">
          <p>
            Este mapa es una <strong>lista priorizada de cruces para estudio técnico</strong>. No reemplaza los aforos de tránsito que exige el
            Manual de Señalización Vial 2024 para justificar un semáforo: indica dónde conviene hacerlos primero.
          </p>
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-[13.5px]">
            En el video los llamé los cruces donde «se necesita» un semáforo. Para ser precisos: son los cruces donde más indicadores coinciden y
            donde conviene hacer primero el estudio técnico (aforos) que exige el Manual. Es una señal para priorizar, no una orden ni un estudio
            técnico.
          </p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li><strong>Malla vial y semáforos:</strong> OpenStreetMap, contrastado con el inventario oficial de intersecciones semaforizadas de la Secretaría de Tránsito.</li>
            <li><strong>Siniestralidad:</strong> registros abiertos de accidentalidad de Barranquilla (datos.gov.co), ubicados por dirección en cada cruce.</li>
            <li>
              <strong>Evaluación automatizada con IA:</strong> cada cruce sin semáforo se evalúa con los mismos criterios (jerarquía de las vías,
              distancia al semáforo más cercano, siniestros y cercanía a colegios y hospitales), combinando reglas propias con un modelo de
              inteligencia artificial de decisión.
            </li>
            <li><strong>Prioridad:</strong> un cruce solo es «Prioritario» cuando varios indicadores independientes coinciden.</li>
          </ol>
          {h && v?.signals && v.crashes && (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-[13.5px]">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cómo se comprobó</div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>{v.signals.officialConfirmedInOsm} de los {v.signals.officialInventory} semáforos del inventario oficial aparecen también en el mapa base.</li>
                <li>{nf.format(v.crashes.matched)} siniestros ubicados en un cruce; para comparar se usa el periodo {v.crashes.period}.</li>
                <li>
                  Prueba a ciegas: se evaluaron {h.signalizedN} cruces que la ciudad ya semaforizó, ocultando su semáforo. El análisis habría señalado
                  a {Math.round(h.recallPct / 10)} de cada 10, y {h.falseAlarmQuietPct === 0 ? "a ninguno" : `al ${h.falseAlarmQuietPct}%`} de {h.quietN} cruces tranquilos de barrio.
                </li>
              </ul>
            </div>
          )}
          <p className="text-[13px] text-slate-500">
            Limitaciones: no incluye volúmenes de tránsito; los siniestros solo tienen dirección de texto y pueden estar subregistrados;
            un semáforo muy reciente puede no figurar todavía. Cada cruce se puede verificar en Street View desde su ficha.
          </p>
          <p className="text-[13px] text-slate-500">
            Proyecto ciudadano independiente: no es de la Alcaldía de Barranquilla ni de la Secretaría de Tránsito, y ninguna de las fuentes lo
            respalda.
          </p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <a className={link} href={METHOD_URL} target="_blank" rel="noreferrer">Metodología completa ↗</a>
            <Link className={link} href="/licencias">Licencias y créditos</Link>
            <a className={link} href={REPO_URL} target="_blank" rel="noreferrer">Código abierto en GitHub ↗</a>
          </p>
          {date && <p className="text-[12px] text-slate-400">Datos con corte al {date}.</p>}
        </div>
      </div>
    </div>
  );
}
