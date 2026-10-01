import { BBOX } from "./config.ts";

const LAT0 = ((BBOX.s + BBOX.n) / 2) * (Math.PI / 180);
const MX = 111_320 * Math.cos(LAT0);
const MY = 110_574;

/** Local equirectangular projection to metres — accurate to well under 0.1 % over a ~20 km city. */
export const project = (lon: number, lat: number): [number, number] => [lon * MX, lat * MY];
export const unproject = (x: number, y: number): [number, number] => [x / MX, y / MY];

export const dist = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Bearing in degrees [0,360) from a to b in projected metres (0 = north, clockwise). */
export function bearing(a: readonly [number, number], b: readonly [number, number]): number {
  const deg = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
}
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export type Ring = Array<[number, number]>; // lon, lat

/** Stitch the `outer`/`inner` member ways of a boundary relation into closed rings. */
export function assembleRings(members: Array<{ role: string; geometry?: Array<{ lat: number; lon: number }> }>, role: string): Ring[] {
  const segs: Ring[] = members
    .filter((m) => (m.role || "outer") === role && m.geometry && m.geometry.length > 1)
    .map((m) => m.geometry!.map((p) => [p.lon, p.lat] as [number, number]));
  const key = (p: [number, number]) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  const rings: Ring[] = [];
  const used = new Array(segs.length).fill(false);
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const ring = segs[i].slice();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      const tail = key(ring[ring.length - 1]);
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const s = segs[j];
        if (key(s[0]) === tail) ring.push(...s.slice(1));
        else if (key(s[s.length - 1]) === tail) ring.push(...s.slice(0, -1).reverse());
        else continue;
        used[j] = true;
        grew = true;
        break;
      }
    }
    if (key(ring[0]) !== key(ring[ring.length - 1])) throw new Error("boundary ring does not close");
    rings.push(ring);
  }
  return rings;
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export class AreaFilter {
  private bbox: [number, number, number, number] | null = null;
  constructor(private outers: Ring[] | null, private inners: Ring[] = []) {
    if (outers) {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const r of outers) for (const [x, y] of r) {
        if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y;
      }
      this.bbox = [w, s, e, n];
    }
  }
  get clipped() {
    return this.outers !== null;
  }
  contains(lon: number, lat: number): boolean {
    if (lat < BBOX.s || lat > BBOX.n || lon < BBOX.w || lon > BBOX.e) return false;
    if (!this.outers) return true;
    const b = this.bbox!;
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) return false;
    if (!this.outers.some((r) => inRing(lon, lat, r))) return false;
    return !this.inners.some((r) => inRing(lon, lat, r));
  }
}
