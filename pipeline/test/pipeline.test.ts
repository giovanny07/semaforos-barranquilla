import assert from "node:assert/strict";
import { test } from "node:test";
import { keysFromOsmName, parseCrashAddress } from "../src/streetkeys.ts";
import { computePriority, type PriorityInput, type Thresholds } from "../src/priority.ts";
import { buildSites, assignSites } from "../src/signals.ts";

test("OSM names and crash addresses normalise to the same keys", () => {
  assert.deepEqual(keysFromOsmName("Calle 72"), ["CL72"]);
  assert.deepEqual(keysFromOsmName("Carrera 21B"), ["CR21B"]);
  assert.deepEqual(keysFromOsmName("Carrera 9 Sur"), ["CR9S"]);
  assert.deepEqual(keysFromOsmName("Avenida Carrera 46"), ["CR46"]);
  assert.deepEqual(keysFromOsmName("Avenida Murillo"), ["CL45"]);
  assert.deepEqual(keysFromOsmName("Vía 40"), ["VIA40"]);
  assert.deepEqual(keysFromOsmName("Avenida Circunvalar"), ["CIRCUNVALAR"]);
  assert.deepEqual(keysFromOsmName("Calle 110"), ["CIRCUNVALAR"]);
  assert.deepEqual(keysFromOsmName("Autopista Circunvalar de la Prosperidad"), ["PROSPERIDAD"]);
  for (const [addr, a, b] of [
    ["CL 110 CR 46", "CIRCUNVALAR", "CR46"],
    ["CRA 38 CON CALLE 72", "CR38", "CL72"],
    ["VIA 40 CL 75", "VIA40", "CL75"],
    ["CALLE 70 B CARRERA 21B", "CL70B", "CR21B"],
    ["AV CIRCUNAVALAR CL 73", "CIRCUNVALAR", "CL73"],
    ["CALLE 49 CARRERA 15SUR", "CL49", "CR15S"],
    ["AV MURILLO CR 21", "CL45", "CR21"],
  ] as const) {
    const p = parseCrashAddress(addr);
    assert.equal(p.kind, "junction", addr);
    if (p.kind === "junction") assert.deepEqual([p.a, p.b], [a, b], addr);
  }
});

test("addresses that do not identify a junction stay unmatched", () => {
  assert.equal(parseCrashAddress("CL 87 9H 24").kind, "door");
  assert.equal(parseCrashAddress("CALLE 110 # 43-448").kind, "door");
  assert.equal(parseCrashAddress("CL 30 CR 21 Y 22").kind, "between");
  assert.equal(parseCrashAddress("CL 70 FRENTE AL NO 44 18").kind, "between");
  assert.equal(parseCrashAddress("CL 99 CR 52 53").kind, "door");
  assert.equal(parseCrashAddress("PARQUEADERO EXITO PANORAMA").kind, "other");
  assert.equal(parseCrashAddress("CL 110 AV CIRCUNVALAR").kind, "other");
});

test("one signal site → one signalized junction; the side junction is covered", () => {
  const sites = buildSites(
    [{ id: 1, xy: [0, 0], kind: "signal" }, { id: 2, xy: [15, 0], kind: "crossing_signal" }, { id: 3, xy: [500, 0], kind: "crossing_signal" }],
    [{ idx: 0, xy: [5, 20], lonlat: [0, 0], nombre: "CALLE 1 CON CARRERA 1", codigo: "x", estado: "Funcionando", fechaInicio: "" }],
  );
  assert.equal(sites.length, 2);
  assert.equal(sites[0].source, "ambos");
  assert.equal(sites[1].pedestrianOnly, true);
  const { primaryOf, coveredBy } = assignSites(sites, [
    { id: "big", xy: [5, 0], memberXY: [[0, 0], [10, 0]], weight: 1 },
    { id: "side", xy: [35, 0], memberXY: [[35, 0]], weight: 0.1 },
    { id: "far", xy: [200, 0], memberXY: [[200, 0]], weight: 1 },
  ]);
  assert.ok(primaryOf.has("big"));
  assert.equal(coveredBy.get("side")?.by, "big");
  assert.ok(!primaryOf.has("far") && !coveredBy.has("far"));
});

const TH: Thresholds = { warrantProb: 0.7, warrantProbNoCrash: 0.6, source: "test", signalizedCrashMedian: 9, signalizedCrashP75: 15, signalizedSpacingP25M: 94 };
const base: PriorityInput = {
  hasSignal: false, coveredBy: null, coveredByName: null, coveredDistM: null, signalSource: null, signalSince: null,
  majorClass: "secondary", crossClass: "tertiary", majorStreet: "Carrera 38", crossStreet: "Calle 74", legs: 4, maxLanes: 2, divided: true, onewayT: false, rampOnly: false,
  structure: { roundabout: false, ramp: false, gradeSeparated: false, nearRoundabout: false, nearGradeSeparated: false },
  distNearestSignalM: 152, distSignalAlongM: 161, pois: { school: 0, hospital: 0, market: 0, busStop: 0, worship: 0, park: 0 },
  crashes: { total: 41, injuries: 2, deaths: 0, period: "2018–2022" }, crashesRecentVictims: 5, crashesPedestrian: 2, crashRank: 99,
  jev: { needLevel: "alta", needScore: 75, warrantProb: 0.89, control: "semáforo vehicular", confidence: 0.5 },
  jevNoCrash: { warrantProb: 0.76, control: "semáforo vehicular" },
};

test("tiers: agreement of model, crash-blind model, rules and crash level", () => {
  const p = computePriority(base, TH);
  assert.equal(p.priority, "prioritario");
  assert.equal(p.agreement, "alto");
  assert.equal(p.recommendation, "Semáforo vehicular");
  assert.ok(p.evidence.includes("41 siniestros registrados 2018–2022, 2 con heridos"));
  assert.ok(p.evidence.includes("Semáforo más cercano a 161 m sobre la Carrera 38"));
  assert.ok(p.evidence.every((e) => !/modelo|probabilidad|%/i.test(e)));

  assert.equal(computePriority({ ...base, jevNoCrash: { warrantProb: 0.3, control: "señal de PARE / ceda el paso" } }, TH).priority, "recomendado"); // crashes ≥ p75
  assert.equal(computePriority({ ...base, jevNoCrash: null, crashes: { ...base.crashes!, total: 8 } }, TH).priority, "observacion");
  assert.equal(computePriority({ ...base, majorClass: "residential", crossClass: "residential" }, TH).priority, "observacion");
  assert.equal(computePriority({ ...base, jev: { ...base.jev!, warrantProb: 0.4 }, crashRank: 10 }, TH).priority, "sin_accion");
});

test("never a signal on a roundabout, a ramp, an overpass, or next to an existing signal", () => {
  for (const k of ["roundabout", "ramp", "gradeSeparated", "nearRoundabout", "nearGradeSeparated"] as const) {
    const p = computePriority({ ...base, structure: { ...base.structure, [k]: true } }, TH);
    assert.equal(p.priority, "sin_accion", k);
    assert.equal(p.recommendation, "Ninguna");
  }
  assert.equal(computePriority({ ...base, distNearestSignalM: 60 }, TH).priority, "sin_accion");
  assert.equal(computePriority({ ...base, distNearestSignalM: 88 }, TH).priority, "recomendado"); // closer than the city's own p25 spacing
  assert.equal(computePriority({ ...base, hasSignal: true, signalSource: "ambos" }, TH).priority, "semaforizado");
  assert.equal(computePriority({ ...base, coveredBy: "n1", coveredByName: "Calle 1 × Carrera 1", coveredDistM: 25 }, TH).priority, "sin_accion");
});
