"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CAR_LEN, JunctionSim as Sim, LANE_W, STOP_LINE, VIEW_R, type Car, type Leg, type Mode, type Stats } from "@/lib/sim";

const SIZE = 440; // logical px of each view; the canvas scales down with its container
const K = SIZE / (2 * VIEW_R); // px per metre
const LIGHT = { green: "#22c55e", yellow: "#facc15", red: "#ef4444" };
const LAMPS = ["red", "yellow", "green"] as const;
const PALETTE = {
  light: { ground: "#e7ecf2", asphalt: "#b9c2ce", kerb: "#ffffff", paint: "#ffffff", label: "#334155", halo: "rgba(255,255,255,0.85)", car: "#475569", carBraking: "#1e293b", housing: "#0f172a", lampOff: "#334155" },
  dark: { ground: "#131c2e", asphalt: "#3a465c", kerb: "#55627a", paint: "#d5dbe6", label: "#e2e8f0", halo: "rgba(15,23,41,0.85)", car: "#cbd5e1", carBraking: "#94a3b8", housing: "#64748b", lampOff: "#1e293b" },
};
const pal = () => PALETTE[document.documentElement.classList.contains("dark") ? "dark" : "light"];

const X = (x: number) => SIZE / 2 + x * K;
const Y = (y: number) => SIZE / 2 - y * K;

/** Point at `dist` metres along a leg and `u` metres to the right of inbound traffic (negative = outbound side). */
const at = (leg: Leg, dist: number, u: number): [number, number] => [
  X(leg.dir[0] * dist - leg.dir[1] * u), Y(leg.dir[1] * dist + leg.dir[0] * u),
];

function line(ctx: CanvasRenderingContext2D, a: [number, number], b: [number, number]) {
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
}

function drawRoads(ctx: CanvasRenderingContext2D, sim: Sim) {
  const c = pal();
  const far = VIEW_R * 1.6;
  ctx.lineCap = "butt"; ctx.lineJoin = "round"; ctx.setLineDash([]);
  // Junction surface: polygon through the kerb corners of every leg, in angular order. A T-junction gets a
  // straight far kerb instead of a round blob.
  const order = [...sim.legs].sort((p, q) => Math.atan2(p.dir[1], p.dir[0]) - Math.atan2(q.dir[1], q.dir[0]));
  const surface = () => {
    ctx.beginPath();
    for (const leg of order) { ctx.lineTo(...at(leg, sim.boxR, -leg.outLanes * LANE_W)); ctx.lineTo(...at(leg, sim.boxR, leg.inLanes * LANE_W)); }
    ctx.closePath();
  };
  const road = (leg: Leg, extra: number, color: string) => {
    const w = (leg.inLanes + leg.outLanes) * LANE_W, mid = ((leg.inLanes - leg.outLanes) * LANE_W) / 2;
    ctx.strokeStyle = color; ctx.lineWidth = (w + extra) * K; line(ctx, at(leg, sim.boxR * 0.5, mid), at(leg, far, mid));
  };
  // all kerbs first, then all asphalt, so one leg's kerb is never painted over another leg's lanes
  for (const leg of sim.legs) road(leg, 1.2, c.kerb);
  ctx.strokeStyle = c.kerb; ctx.lineWidth = 1.2 * K; surface(); ctx.stroke();
  for (const leg of sim.legs) road(leg, 0, c.asphalt);
  ctx.fillStyle = c.asphalt; surface(); ctx.fill();

  for (const leg of sim.legs) {
    const from = sim.boxR + STOP_LINE + 0.1;
    ctx.lineWidth = 1.5;
    if (leg.inLanes && leg.outLanes) { ctx.strokeStyle = "#f5c518"; ctx.setLineDash([]); line(ctx, at(leg, from, 0), at(leg, far, 0)); } // centre line
    ctx.strokeStyle = c.paint; ctx.setLineDash([3 * K, 4 * K]);
    for (let n = 1; n < leg.inLanes; n++) line(ctx, at(leg, from, n * LANE_W), at(leg, far, n * LANE_W));
    for (let n = 1; n < leg.outLanes; n++) line(ctx, at(leg, from, -n * LANE_W), at(leg, far, -n * LANE_W));
    ctx.setLineDash([]);
    if (!leg.name) continue; // unnamed slip roads get no zebra: less clutter
    ctx.lineWidth = 0.55 * K;
    for (let u = -leg.outLanes * LANE_W + 0.6; u < leg.inLanes * LANE_W - 0.3; u += 1.15) line(ctx, at(leg, sim.boxR + 0.4, u), at(leg, sim.boxR + 2.8, u));
  }
}

/** Street names, beside the road (never on the lanes) and kept inside the canvas. Drawn after the cars. */
function drawLabels(ctx: CanvasRenderingContext2D, sim: Sim) {
  const c = pal();
  ctx.font = "600 12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
  const seen = new Set<string>();
  for (const leg of sim.legs) {
    if (!leg.name || seen.has(leg.name)) continue;
    seen.add(leg.name);
    const half = ctx.measureText(leg.name).width / 2 + 8;
    // slide the label towards the centre until the whole text fits in the view
    let d = VIEW_R * 0.8, x = 0, y = 0;
    for (; d > sim.boxR + 12; d -= 2) {
      [x, y] = at(leg, d, -(leg.outLanes * LANE_W + 2.6));
      const ex = Math.abs(leg.dir[0]) * half, ey = Math.abs(leg.dir[1]) * half;
      if (x - ex > 4 && x + ex < SIZE - 4 && y - ey > 4 && y + ey < SIZE - 4) break;
    }
    let a = -Math.atan2(leg.dir[1], leg.dir[0]);
    if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.lineWidth = 3; ctx.strokeStyle = c.halo; ctx.strokeText(leg.name, 0, 0);
    ctx.fillStyle = c.label; ctx.fillText(leg.name, 0, 0);
    ctx.restore();
  }
}

function drawControls(ctx: CanvasRenderingContext2D, sim: Sim) {
  for (const leg of sim.legs) {
    if (!leg.inLanes) continue;
    const light = sim.light(leg.group);
    // the stop line itself takes the colour of the light: easy to read from above
    // today only the side street has to stop; a line across the main road would read as a stop on it
    if (sim.mode === "signal" || leg.group === 1) {
      ctx.strokeStyle = sim.mode === "signal" ? LIGHT[light] : pal().paint;
      ctx.lineWidth = sim.mode === "signal" ? 4 : 2.5;
      line(ctx, at(leg, sim.boxR + STOP_LINE, 0.2), at(leg, sim.boxR + STOP_LINE, leg.inLanes * LANE_W - 0.2));
    }
    const [x, y] = at(leg, sim.boxR + STOP_LINE + 1.1, leg.inLanes * LANE_W + 3.2);
    if (sim.mode === "signal") {
      ctx.fillStyle = pal().housing; ctx.beginPath(); ctx.roundRect(x - 7, y - 17, 14, 34, 4); ctx.fill();
      LAMPS.forEach((c, i) => {
        ctx.fillStyle = c === light ? LIGHT[c] : pal().lampOff;
        ctx.shadowColor = LIGHT[c]; ctx.shadowBlur = c === light ? 10 : 0;
        ctx.beginPath(); ctx.arc(x, y - 10 + i * 10, 4, 0, Math.PI * 2); ctx.fill();
      });
      ctx.shadowBlur = 0;
    } else if (leg.group === 1) {
      ctx.fillStyle = "#dc2626"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const t = (Math.PI / 4) * (i + 0.5); ctx.lineTo(x + 13 * Math.cos(t), y + 13 * Math.sin(t)); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffffff"; ctx.font = "700 8px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("PARE", x, y + 0.5);
    }
  }
}

/** When each mark was first shown (ms of real time): marks last long enough to be seen at any playback speed. */
interface Marks { ring: WeakMap<Car, number>; shock: WeakMap<Car, number> }
const RING_MS = 2500, SHOCK_MS = 1500;

function drawCars(ctx: CanvasRenderingContext2D, sim: Sim, marks: Marks, now: number) {
  // one wait timer per approach: the car that has waited longest, whether behind the line or edging into the road
  const longest = new Map<number, Car>(), from = sim.mode === "today" ? 4 : 8;
  for (const c of sim.cars) {
    if (c.s < c.box / 2 && c.v < 1 && c.wait > from && c.wait > (longest.get(c.leg)?.wait ?? 0)) longest.set(c.leg, c);
  }
  const shown = (map: WeakMap<Car, number>, c: Car, ms: number) => {
    if (!map.has(c)) map.set(c, now);
    return now - map.get(c)! < ms;
  };

  for (const c of sim.cars) {
    const { p, h } = sim.position(c);
    // a motorcycle waiting in a queue slips to one side of its lane, towards the front: drawing only, it keeps its slot
    const aside = c.moto && c.s < 0 ? (c.id % 2 ? 1.1 : -1.1) * Math.max(0, 1 - c.v / 3) : 0;
    const x = X(p[0] - h[1] * aside), y = Y(p[1] + h[0] * aside);
    const side = sim.legs[c.leg].group === 1;
    // got in by making somebody on the main road brake hard or give way: marked from the moment it moves in
    if (side && c.forced && c.s < c.box + 10 && (marks.ring.has(c) || c.v >= 0.3) && shown(marks.ring, c, RING_MS)) {
      ctx.strokeStyle = "rgba(220,38,38,0.85)"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 13 + 2.5 * Math.sin(now / 160), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y); ctx.rotate(-Math.atan2(h[1], h[0]));
    const L = (c.moto ? 2 : CAR_LEN) * K, W = (c.moto ? 0.8 : 1.9) * K;
    const body = side ? (c.braking ? "#c2560c" : "#f97316") : c.braking ? pal().carBraking : pal().car;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(-L / 2, -W / 2, L, W, c.moto ? 1.2 : 2.5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.55)"; // windscreen (rider's helmet on a motorcycle), so the direction of travel is obvious
    ctx.beginPath();
    if (c.moto) ctx.arc(L * 0.08, 0, W * 0.55, 0, Math.PI * 2); else ctx.roundRect(L * 0.12, -W / 2 + 1.2, L * 0.2, W - 2.4, 1);
    ctx.fill();
    if (c.braking) { // brake lights: the knock-on effect of a car nosing in is cars braking behind one another
      ctx.fillStyle = "#ff2d2d"; ctx.shadowColor = "#ff2d2d"; ctx.shadowBlur = 6;
      if (c.moto) ctx.fillRect(-L / 2 - 1, -1.5, 3, 3);
      else { ctx.fillRect(-L / 2 - 1, -W / 2, 4, 3); ctx.fillRect(-L / 2 - 1, W / 2 - 3, 4, 3); }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    if (c.shocked && shown(marks.shock, c, SHOCK_MS)) { // the driver who had to brake hard for it
      ctx.fillStyle = "#dc2626"; ctx.font = "800 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("!", x - h[1] * 9, y - h[0] * 9);
    }
  }
  ctx.font = "700 11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const c of longest.values()) {
    // beside the car, on its left: the sign or signal head stands on the other side. It follows the car into the junction
    const { p, h } = sim.position(c), x = X(p[0] - h[1] * 5.2), y = Y(p[1] + h[0] * 5.2);
    const text = `${Math.floor(c.wait / 60)}:${String(Math.floor(c.wait % 60)).padStart(2, "0")}`;
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 9, w, 18, 9); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.fillText(text, x, y + 0.5);
  }
}

function draw(ctx: CanvasRenderingContext2D, sim: Sim, dpr: number, marks: Marks, now: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = pal().ground;
  ctx.fillRect(0, 0, SIZE, SIZE);
  drawRoads(ctx, sim);
  drawControls(ctx, sim);
  drawCars(ctx, sim, marks, now);
  drawLabels(ctx, sim);
}

// when queues outgrow the model the average keeps climbing with the run time: show a floor, not a false precision
const atLeast = (s: number) => `más de ${Math.max(1, Math.min(5, Math.floor(s / 60)))} min`;
/** Events per hour differ by up to half from one run (seed) to the next: show a range, not a false precision. */
const span = (n: number) => (n < 5 ? "menos de 5" : `${Math.max(5, Math.floor((n * 0.7) / 10) * 10)}–${Math.ceil((n * 1.4) / 10) * 10}`);
const clock = (s: number) => (s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

function Figure({ label, tone, value }: { label: string; tone: "bad" | "good" | "plain"; value: string }) {
  const color = tone === "bad" ? "text-rose-600" : tone === "good" ? "text-emerald-600" : "text-slate-900";
  return (
    <div>
      <div className="text-[12px] leading-tight text-slate-500">{label}</div>
      <div className={`mt-0.5 text-[20px] font-semibold leading-tight tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

export default function JunctionSim({ legs, title, onClose }: { legs: Leg[]; title: string; onClose: () => void }) {
  const today = useRef<HTMLCanvasElement>(null);
  const signal = useRef<HTMLCanvasElement>(null);
  const speedRef = useRef(1);
  const [speed, setSpeed] = useState(1);
  const [stats, setStats] = useState<Record<Mode, Stats> | null>(null);

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!today.current || !signal.current) return;
    let raf = 0;
    const dpr = window.devicePixelRatio || 1;
    // same seed: both views receive exactly the same arriving traffic
    const views = ([["today", today.current], ["signal", signal.current]] as const).map(([mode, canvas]) => {
      canvas.width = canvas.height = SIZE * dpr;
      const sim = new Sim(legs, mode);
      sim.warmUp(60, 600); // with peak-hour densities a longer fast-forward takes over a second on a laptop; the figures keep settling while it plays
      return { sim, ctx: canvas.getContext("2d")!, marks: { ring: new WeakMap<Car, number>(), shock: new WeakMap<Car, number>() } };
    });
    let last = performance.now(), sinceStats = 1;
    const frame = (now: number) => {
      const real = Math.min(0.05, (now - last) / 1000), dt = real * speedRef.current;
      last = now;
      for (const v of views) { for (let i = 0; i < 3; i++) v.sim.step(dt / 3); draw(v.ctx, v.sim, dpr, v.marks, now); }
      if ((sinceStats += real) > 1) { sinceStats = 0; setStats({ today: views[0].sim.stats(), signal: views[1].sim.stats() }); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [legs]);

  const busiest = (g: 0 | 1) => legs.filter((l) => l.group === g && l.inLanes).sort((a, b) => b.flow - a.flow)[0];
  const roads = { main: busiest(0), side: busiest(1) };
  const sideName = roads.side.name ?? "la vía secundaria", mainName = roads.main.name ?? "la vía principal";
  const saves = !stats || stats.signal.waitSide <= stats.today.waitSide - 2 || stats.today.saturatedSide;
  const views = [
    { mode: "today" as const, ref: today, title: "Hoy, sin semáforo (simulado)",
      text: `Los carros y motos de ${sideName} (naranja) bajan la velocidad en el PARE pero no paran: se van metiendo de a poquitos y cruzan apenas ven un hueco. A los de ${mainName} les toca frenar (círculo rojo).`,
      note: (s: Stats) => `Otras ${span(s.yields)} veces por hora alguien de ${mainName} frena para dejar pasar al que ya se metió.` },
    { mode: "signal" as const, ref: signal, title: "Con semáforo (simulado)",
      // honest when the signal does not save time: its case here would be order and safety, not delay
      text: saves ? `Cada vía pasa en su turno y nadie se mete a la fuerza. ${mainName} espera unos segundos en cada ciclo.`
        : `Cada vía pasa en su turno y nadie se mete a la fuerza. Con este tráfico el semáforo no ahorra tiempo en ${sideName}: lo que cambia es que se acaba el pulso en el cruce.`,
      note: () => "Donde se han puesto semáforos en cruces así (EE. UU., NCHRP 491), los choques de lado, los más graves, bajaron entre uno y dos tercios; los choques por detrás, más leves, subieron un 40–50 %." },
  ];
  // waits of a few seconds matter on the main road, where every car pays them: one decimal below ten
  const wait = (w: number, sat: boolean) => (sat ? atLeast(w) : w < 10 ? `${w.toFixed(1).replace(".", ",")} s` : clock(w));

  // portal: the panel that opens this sits inside the map column, below the sidebar's stacking level
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Simulación de ${title}`} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative max-h-[94vh] w-full max-w-[980px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Simulación ilustrativa</div>
            <h2 className="text-[20px] font-semibold text-slate-900">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-[12px]" aria-label="Velocidad">
              {[1, 2, 4].map((v) => (
                <button key={v} onClick={() => setSpeed(v)} aria-pressed={speed === v}
                  className={`rounded-md px-2.5 py-1 ${speed === v ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-500"}`}>×{v}</button>
              ))}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
          </div>
        </div>

        <div className="mt-4 grid gap-5 md:grid-cols-2">
          {views.map((v) => {
            const s = stats?.[v.mode];
            return (
              <section key={v.mode}>
                <h3 className="text-[15px] font-semibold text-slate-900">{v.title}</h3>
                <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600 md:min-h-[54px]">{v.text}</p>
                <canvas ref={v.ref} className="mx-auto mt-2 aspect-square w-full max-w-[min(100%,calc(94vh-330px))] rounded-xl bg-slate-100" aria-label={`Simulación: ${v.title}`} />
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Figure label="Se meten a la fuerza, por hora" value={s ? (v.mode === "today" ? span(s.forced) : "0") : "…"} tone={s && v.mode === "today" && s.forced >= 5 ? "bad" : v.mode === "signal" ? "good" : "plain"} />
                  <Figure label={`Frenadas en seco en ${mainName}, por hora`} value={s ? (v.mode === "today" ? span(s.hardBrakes) : "0") : "…"} tone={s && v.mode === "today" && s.hardBrakes >= 5 ? "bad" : v.mode === "signal" ? "good" : "plain"} />
                  <Figure label={`Cola más larga en ${sideName}`} value={s ? `${s.saturatedSide ? "más de " : ""}${s.queueSide}` : "…"} tone="plain" />
                </div>
                <p className="mt-2 text-[12.5px] leading-snug text-slate-700">
                  Espera: <strong className="tabular-nums">{s ? wait(s.waitSide, s.saturatedSide) : "…"}</strong> en {sideName} · <strong className="tabular-nums">{s ? wait(s.waitMain, s.saturatedMain) : "…"}</strong> en {mainName}
                </p>
                <p className="mt-1 text-[12px] leading-snug text-slate-500 md:min-h-[50px]">{s ? v.note(s) : "…"}</p>
              </section>
            );
          })}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-600">
          <li className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-orange-500" />De {sideName}</li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-slate-500" />De {mainName}</li>
          <li className="flex items-center gap-1.5"><span className="h-1 w-2.5 rounded-sm bg-slate-500" />Motos</li>
          <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-red-600" />Se metió a la fuerza: a alguien le tocó frenar (<strong className="text-red-600">!</strong>)</li>
          <li className="flex items-center gap-1.5"><span className="h-2 w-1.5 rounded-[1px] bg-red-500" />Frenando</li>
          <li className="flex items-center gap-1.5"><span className="rounded-full bg-[#0f172a] px-1.5 text-[10px] font-bold text-[#fff]">0:12</span>Tiempo que lleva esperando</li>
        </ul>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-500">
          El cruce (carriles y sentidos) es real. El tráfico <strong>no está medido</strong>: se suponen unos {roads.main.flow} carros y motos por hora por sentido
          en {mainName} y {roads.side.flow} en {sideName} (tres de cada diez, motos). La forma de manejar en el PARE es <strong>ilustrativa</strong> (estudios de
          Argentina e India, más supuestos). El semáforo cambia tiempo por orden. Si vale la pena aquí lo decide un aforo.
        </p>
      </div>
    </div>,
    document.body,
  );
}
