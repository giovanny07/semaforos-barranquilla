import type { Metadata } from "next";
import Link from "next/link";
import { AUTHOR, DATA_LICENSE_URL, ISSUES_URL, METHOD_URL, REPO_URL, SITE_NAME, SOURCES, repoFile } from "@/lib/site";

export const metadata: Metadata = {
  title: "Licencias y créditos",
  description: "Fuentes de datos, licencias y créditos de Semáforos de Barranquilla, un mapa ciudadano independiente y de código abierto.",
  alternates: { canonical: "/licencias" },
};

const ODBL = "https://opendatacommons.org/licenses/odbl/1-0/";
const CC_BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/deed.es";
const CC_BY = "https://creativecommons.org/licenses/by/4.0/deed.es";
const APACHE = "https://www.apache.org/licenses/LICENSE-2.0";

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-slate-900 underline underline-offset-2 hover:text-slate-600">
      {children}
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-slate-500">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default function Licencias() {
  const { crashes, signals, osm } = SOURCES;
  return (
    <main className="min-h-full bg-slate-100 px-4 py-8 text-slate-700 md:py-14">
      <article className="mx-auto max-w-[680px] rounded-2xl bg-white px-6 py-7 text-[14.5px] leading-relaxed shadow-sm ring-1 ring-slate-900/5 md:px-10 md:py-10">
        <Link href="/" className="text-[13px] text-slate-500 hover:text-slate-900">
          ← Volver al mapa
        </Link>
        <h1 className="mt-3 text-[24px] font-semibold tracking-tight text-slate-900">Licencias y créditos</h1>
        <p className="mt-2">
          {SITE_NAME} es un mapa ciudadano <strong>independiente y no oficial</strong>, hecho por {AUTHOR}. No es de la Alcaldía de
          Barranquilla ni de la Secretaría de Tránsito, y ninguna de las fuentes de datos lo respalda. El código, los datos y la metodología
          son abiertos.
        </p>

        <Section title="Fuentes de datos">
          <ul className="list-disc space-y-3 pl-5">
            <li>
              <strong>Calles, cruces y semáforos:</strong> © colaboradores de <A href="https://www.openstreetmap.org/copyright">OpenStreetMap</A>,
              datos disponibles bajo la Open Database License (<A href={ODBL}>ODbL 1.0</A>). Descarga del {osm.retrieved}.
            </li>
            <li>
              <strong>Mapa base:</strong> <A href="https://openfreemap.org">OpenFreeMap</A> © <A href="https://openmaptiles.org">OpenMapTiles</A>,
              datos de OpenStreetMap.
            </li>
            <li>
              <strong>Siniestralidad:</strong> Alcaldía Distrital de Barranquilla, «{crashes.name}»,{" "}
              <A href={`https://www.datos.gov.co/d/${crashes.id}`}>datos.gov.co ({crashes.id})</A>, licencia{" "}
              <A href={CC_BY_SA}>CC BY-SA 4.0</A>. Datos actualizados por la Alcaldía el {crashes.updated}; consultados el {crashes.retrieved}.
              Cambios: los registros se ubicaron por su dirección en los cruces de OpenStreetMap. En el mapa solo se muestran conteos por cruce;
              el repositorio guarda los registros originales reducidos a año, gravedad, clase y dirección, sin fecha exacta ni datos de personas.
            </li>
            <li>
              <strong>Inventario de intersecciones semaforizadas:</strong> Alcaldía Distrital de Barranquilla, «{signals.name}»,{" "}
              <A href={`https://www.datos.gov.co/d/${signals.id}`}>datos.gov.co ({signals.id})</A>, licencia <A href={CC_BY_SA}>CC BY-SA 4.0</A>.
              Datos actualizados por la Alcaldía el {signals.updated}; se usa la versión de {signals.version} del mismo inventario. Cambios:
              convertido a GeoJSON y asociado a cruces de OpenStreetMap.
            </li>
            <li>Fuente: Portal de Datos Abiertos <A href="https://www.datos.gov.co">www.datos.gov.co</A>.</li>
          </ul>
        </Section>

        <Section title="Evaluación con inteligencia artificial">
          <p>
            La prioridad de cada cruce es una <strong>evaluación automatizada con IA</strong>: combina reglas propias y registros de
            siniestros con un modelo de inteligencia artificial de decisión (Jev, de TypeSafe). Es una lista priorizada para estudio técnico,
            no un dictamen ni un estudio de ingeniería de tránsito. Cómo se validó: <A href={METHOD_URL}>metodología</A>.
          </p>
        </Section>

        <Section title="Licencias de este proyecto">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Código:</strong> <A href={APACHE}>Apache-2.0</A>, © 2026 {AUTHOR}. Ver <A href={repoFile("LICENSE")}>LICENSE</A> y{" "}
              <A href={repoFile("NOTICE")}>NOTICE</A>.
            </li>
            <li>
              <strong>Datos derivados de OpenStreetMap</strong> (calles, semáforos, cruces, prioridades y puntajes): <A href={ODBL}>ODbL 1.0</A>.
            </li>
            <li>
              <strong>Datos re-publicados de la Alcaldía</strong> (siniestros por cruce e inventario oficial, en archivos aparte):{" "}
              <A href={CC_BY_SA}>CC BY-SA 4.0</A>.
            </li>
            <li>
              <strong>Documentación y metodología:</strong> <A href={CC_BY}>CC BY 4.0</A>.
            </li>
          </ul>
          <p>
            Detalle archivo por archivo: <A href={DATA_LICENSE_URL}>data/LICENSE.md</A>. El nombre y el logo no están incluidos en estas
            licencias: ver <A href={repoFile("TRADEMARKS.md")}>TRADEMARKS.md</A>.
          </p>
        </Section>

        <Section title="Software">
          <p>
            Hecho con <A href="https://maplibre.org">MapLibre GL JS</A> (BSD-3-Clause), <A href="https://nextjs.org">Next.js</A> (MIT) y la
            tipografía <A href="https://vercel.com/font">Geist</A> (SIL OFL 1.1).
          </p>
        </Section>

        <Section title="Privacidad">
          <p>
            Este sitio no usa cookies ni pide datos personales; solo guarda en tu navegador el tema claro u oscuro y si ya cerraste el aviso.
            El mapa base se carga desde OpenFreeMap, y la vista de calle desde Google Maps cuando abres un cruce (Google puede usar sus
            propias cookies dentro de esa vista).
          </p>
        </Section>

        <Section title="Correcciones y contacto">
          <p>
            ¿Ves un error en un cruce o tienes mejores datos (aforos, inventario actualizado)? Abre un reporte en{" "}
            <A href={ISSUES_URL}>GitHub</A>. Las correcciones se hacen en público.
          </p>
          <p>
            <A href={REPO_URL}>Código abierto en GitHub ↗</A>
          </p>
        </Section>
      </article>
    </main>
  );
}
