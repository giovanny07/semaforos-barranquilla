/** Public addresses and source dates shown in the UI and in the page metadata. */
export const SITE_URL = "https://semaforos-baq.vercel.app";
export const SITE_NAME = "Semáforos de Barranquilla";
export const AUTHOR = "Victor Pay";

export const REPO_URL = "https://github.com/Victorpay1/semaforos-barranquilla";
export const repoFile = (path: string) => `${REPO_URL}/blob/main/${path}`;
export const METHOD_URL = repoFile("docs/validation.md");
export const DATA_LICENSE_URL = repoFile("data/LICENSE.md");
export const ISSUES_URL = `${REPO_URL}/issues`;

/** Alcaldía datasets on datos.gov.co: last update of the rows (portal metadata) and the date this snapshot was taken. */
export const SOURCES = {
  crashes: { id: "yb9r-2dsi", name: "Accidentalidad en Barranquilla", updated: "28 de julio de 2026", retrieved: "20 de septiembre de 2026" },
  signals: { id: "svyb-d6ts", name: "Semaforización en Barranquilla", updated: "16 de septiembre de 2022", version: "septiembre de 2023" },
  osm: { retrieved: "20 de septiembre de 2026" },
} as const;
