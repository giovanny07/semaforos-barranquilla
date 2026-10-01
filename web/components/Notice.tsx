"use client";

import { REPO_URL } from "@/lib/site";

/** localStorage key; the inline script in app/layout.tsx sets <html data-aviso="visto"> before the first paint. */
export const NOTICE_KEY = "aviso-v1";

function dismiss() {
  document.documentElement.dataset.aviso = "visto";
  try {
    localStorage.setItem(NOTICE_KEY, "visto");
  } catch {}
}

/** First-screen note for visitors arriving from social media: who made this, and how to read the red points. */
export default function Notice({ onAbout }: { onAbout: () => void }) {
  return (
    <aside
      aria-label="Aviso"
      className="aviso absolute inset-x-3 top-[3.25rem] z-10 rounded-xl bg-white/95 px-4 py-3 text-[12.5px] leading-snug text-slate-700 shadow-lg ring-1 ring-slate-900/10 backdrop-blur md:left-1/2 md:right-auto md:top-3 md:w-[min(560px,calc(100%-24px))] md:-translate-x-1/2"
    >
      <button
        onClick={dismiss}
        aria-label="Cerrar aviso"
        className="absolute right-1.5 top-1.5 rounded-full px-2 py-1 text-[13px] leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        ✕
      </button>
      <p className="pr-5">
        <strong className="font-semibold text-slate-900">Proyecto independiente, no oficial:</strong> no es de la Alcaldía ni de la Secretaría
        de Tránsito. Los puntos rojos son los cruces que <strong className="font-semibold text-slate-900">conviene estudiar primero</strong> para
        un posible semáforo.
      </p>
      <p className="mt-1 text-[11.5px] text-slate-500">
        Evaluación automatizada con IA: lista priorizada para estudio técnico, no un dictamen.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium">
        <button onClick={onAbout} className="text-slate-900 underline underline-offset-2 hover:text-slate-600">
          Cómo se hizo
        </button>
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-slate-900 underline underline-offset-2 hover:text-slate-600">
          Código abierto en GitHub ↗
        </a>
        <button onClick={dismiss} className="ml-auto rounded-md bg-slate-900 px-2.5 py-1 text-white hover:bg-slate-700">
          Entendido
        </button>
      </div>
    </aside>
  );
}
