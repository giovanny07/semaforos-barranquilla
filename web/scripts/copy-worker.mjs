// Copies the MapLibre GL v6 worker (ESM, split files) into public/ so the
// browser can load it from a same-origin URL regardless of the bundler.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/maplibre-gl/dist");
const dest = join(root, "public/maplibre");
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) {
  if (/^maplibre-gl-(worker|shared)\.mjs$/.test(f)) cpSync(join(src, f), join(dest, f));
}
console.log("maplibre worker copiado a public/maplibre");
