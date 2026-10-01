// Serves the static export (out/) locally and applies the headers from vercel.json, so the Content-Security-Policy
// can be tested before deploying. Run `pnpm build` first.
//   node scripts/serve.mjs            → http://localhost:3000
//   PORT=4000 node scripts/serve.mjs
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const root = join(web, "out");
if (!existsSync(root)) {
  console.error("out/ not found: run `pnpm build` first.");
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(join(web, "vercel.json"), "utf8"));
const rules = cfg.headers.map((r) => ({ re: new RegExp(`^${r.source}$`), headers: r.headers }));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".geojson": "application/geo+json", ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json",
};
const port = Number(process.env.PORT || 3000);

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end();
  }
  // /licencias → licencias.html (Next also writes a licencias/ folder of route data next to it)
  if (existsSync(`${file}.html`) && (!existsSync(file) || statSync(file).isDirectory())) file = `${file}.html`;
  else if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  const found = existsSync(file);
  if (!found) file = join(root, "404.html");
  for (const r of rules) if (r.re.test(path)) for (const h of r.headers) res.setHeader(h.key, h.value);
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  res.writeHead(found ? 200 : 404);
  res.end(readFileSync(file));
}).listen(port, () => console.log(`out/ with vercel.json headers on http://localhost:${port}`));
