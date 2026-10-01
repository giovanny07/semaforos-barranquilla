import type { Metadata, Viewport } from "next";
// Geist from the `geist` package: the font files are bundled locally, so the build needs no network.
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import summary from "@/public/data/summary.json";
import { AUTHOR, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const nf = new Intl.NumberFormat("es-CO");
const title = "¿Dónde podría hacer falta un semáforo en Barranquilla? · Mapa ciudadano";
const description =
  `${nf.format(summary.counts.prioritario)} cruces prioritarios y ${nf.format(summary.counts.recomendado)} recomendados para estudio técnico, ` +
  "según datos abiertos de siniestralidad y OpenStreetMap. Mapa ciudadano independiente, no oficial.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: `%s · ${SITE_NAME}` },
  description,
  applicationName: SITE_NAME,
  authors: [{ name: AUTHOR }],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "es_CO", siteName: SITE_NAME, url: "/", title, description },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1729" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var d=document.documentElement,t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))d.classList.add("dark");if(localStorage.getItem("aviso-v1")==="visto")d.dataset.aviso="visto"}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
