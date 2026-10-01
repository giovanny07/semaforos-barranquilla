"use client";

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { type FilterSpecification, type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PRIORITY_COLOR, mapFilter } from "@/lib/data";
import type { Filters, FlatFC } from "@/lib/types";

const BASEMAP = { light: "https://tiles.openfreemap.org/styles/positron", dark: "https://tiles.openfreemap.org/styles/dark" };
// camera survives the remount that a theme change triggers
let camera: { center: [number, number]; zoom: number } | null = null;
const CENTER: [number, number] = [-74.806, 10.99];
const BOUNDS: [number, number, number, number] = [-75.08, 10.78, -74.6, 11.18];

export interface FlyTarget {
  lng: number;
  lat: number;
  /** changes on every request so the same target can be re-flown */
  nonce: number;
}

interface Props {
  flat: FlatFC | null;
  dark: boolean;
  filters: Filters;
  selected: { lng: number; lat: number } | null;
  fly: FlyTarget | null;
  /** px covered by the detail panel on the right, so the selected junction is centred in the free area */
  rightInset: number;
  onSelect: (id: string | null) => void;
}

const EMPTY: FlatFC = { type: "FeatureCollection", features: [] };
const MAJOR = ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link"];

const byPriority = (hi: number, mid: number, low: number) => ["match", ["get", "pr"], "prioritario", hi, "recomendado", mid, low];

export default function MapView({ flat, dark, filters, selected, fly, rightInset, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const latest = useRef({ flat, filters, selected });
  const applyRef = useRef<() => void>(() => {});

  useEffect(() => {
    onSelectRef.current = onSelect;
    latest.current = { flat, filters, selected };
  });

  useEffect(() => {
    if (!el.current) return;
    maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
    const map = new maplibregl.Map({
      container: el.current,
      style: dark ? BASEMAP.dark : BASEMAP.light,
      center: camera?.center ?? CENTER,
      zoom: camera?.zoom ?? 12.2,
      minZoom: 10,
      maxZoom: 19,
      maxBounds: BOUNDS,
      pitch: 0,
      maxPitch: 0,
      pitchWithRotate: false,
      dragRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    // The basemap style references a few pattern images missing from its sprite; stub them.
    map.setMissingStyleImageResolver((id) => {
      if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });
    if (process.env.NODE_ENV !== "production") (window as unknown as { __map?: MLMap }).__map = map;

    const edge = dark ? "#0b1220" : "#ffffff"; // outline that separates a point from the basemap
    const apply = () => {
      if (!readyRef.current) return;
      const s = latest.current;
      const vis = s.filters.signals ? "visible" : "none";
      map.setLayoutProperty("signals", "visibility", vis);
      map.setLayoutProperty("signals-crossing", "visibility", vis);
      const f = mapFilter(s.filters) as unknown as FilterSpecification;
      map.setFilter("ix", f);
      map.setFilter("ix-halo", ["all", f, ["==", ["get", "pr"], "prioritario"]] as unknown as FilterSpecification);
      (map.getSource("selected") as GeoJSONSource).setData({
        type: "FeatureCollection",
        features: s.selected
          ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [s.selected.lng, s.selected.lat] } }]
          : [],
      });
    };
    applyRef.current = apply;

    map.on("load", () => {
      map.addSource("streets", { type: "geojson", data: "/data/streets.geojson", tolerance: 0.5 });
      map.addSource("signals", { type: "geojson", data: "/data/signals.geojson" });
      map.addSource("ix", { type: "geojson", data: latest.current.flat ?? EMPTY });
      map.addSource("selected", { type: "geojson", data: EMPTY });

      // Insert the road overlay below the basemap labels so street names stay readable.
      const styleLayers = map.getStyle().layers;
      let lastGeom = -1;
      styleLayers.forEach((l, i) => { if (l.type !== "symbol") lastGeom = i; });
      const firstSymbol = styleLayers.slice(lastGeom + 1).find((l) => l.type === "symbol")?.id;

      // main roads only, in one quiet tone: they give context without competing with the points
      map.addLayer({
        id: "streets-major", type: "line", source: "streets",
        filter: ["in", ["get", "highway"], ["literal", MAJOR]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": dark ? "#94a3b8" : "#64748b",
          "line-opacity": dark ? 0.4 : 0.55,
          "line-width": ["interpolate", ["exponential", 1.6], ["zoom"], 10, 0.8, 14, 2.4, 19, 12],
        },
      }, firstSymbol);

      map.addLayer({
        id: "signals-crossing", type: "circle", source: "signals", minzoom: 14,
        filter: ["==", ["get", "kind"], "crossing_signal"],
        paint: {
          "circle-color": edge,
          "circle-stroke-color": PRIORITY_COLOR.semaforizado,
          "circle-stroke-width": 1.4,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2, 18, 5],
        },
      });
      map.addLayer({
        id: "signals", type: "circle", source: "signals",
        filter: ["!=", ["get", "kind"], "crossing_signal"],
        paint: {
          "circle-color": PRIORITY_COLOR.semaforizado,
          "circle-opacity": 0.85,
          "circle-stroke-color": edge,
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 12, 0, 14, 1],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 13, 3, 17, 7],
        },
      });
      map.addLayer({
        id: "ix-halo", type: "circle", source: "ix",
        paint: {
          "circle-color": PRIORITY_COLOR.prioritario,
          "circle-opacity": 0.18,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 7, 13, 13, 17, 24],
        },
      });
      map.addLayer({
        id: "ix", type: "circle", source: "ix",
        layout: { "circle-sort-key": ["+", ["get", "ps"], byPriority(200, 100, 0)] as never },
        paint: {
          "circle-color": ["match", ["get", "pr"],
            "prioritario", PRIORITY_COLOR.prioritario, "recomendado", PRIORITY_COLOR.recomendado, PRIORITY_COLOR.observacion],
          "circle-stroke-color": edge,
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 11, 0.6, 14, 1.6],
          "circle-radius": ["interpolate", ["linear"], ["zoom"],
            10, byPriority(3.4, 2.4, 1.2), 13, byPriority(6.5, 5, 2.6), 17, byPriority(12, 10, 7)] as never,
          // "en observación" points fade in with zoom so the city-wide view shows only what matters most
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 11.5, byPriority(1, 0.95, 0.25), 13.5, byPriority(1, 0.95, 0.9)] as never,
        },
      });
      map.addLayer({
        id: "selected-ring", type: "circle", source: "selected",
        paint: {
          "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": dark ? "#f8fafc" : "#0f172a", "circle-stroke-width": 2.5,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 9, 17, 20],
        },
      });

      readyRef.current = true;
      apply();

      const clickable = ["ix", "signals", "signals-crossing"];
      map.on("click", (e) => {
        const pad = 6;
        const feats = map.queryRenderedFeatures(
          [[e.point.x - pad, e.point.y - pad], [e.point.x + pad, e.point.y + pad]],
          { layers: clickable },
        );
        const ix = feats.find((f) => f.source === "ix");
        if (ix) return onSelectRef.current(String(ix.properties.id));
        const sig = feats.find((f) => f.source === "signals" && f.properties.intersectionId);
        if (sig) return onSelectRef.current(String(sig.properties.intersectionId));
        onSelectRef.current(null);
      });
      for (const id of clickable) {
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      }
    });

    return () => {
      const c = map.getCenter();
      camera = { center: [c.lng, c.lat], zoom: map.getZoom() };
      readyRef.current = false;
      mapRef.current = null;
      map.remove();
    };
    // `dark` never changes during a mount: the parent remounts this component (key) when the theme changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !flat) return;
    (map.getSource("ix") as GeoJSONSource | undefined)?.setData(flat);
  }, [flat]);

  useEffect(() => {
    applyRef.current();
  }, [filters, selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fly) return;
    map.flyTo({
      center: [fly.lng, fly.lat], zoom: Math.max(map.getZoom(), 16.5), speed: 1.4,
      padding: { top: 0, bottom: 0, left: 0, right: rightInset },
    });
    // rightInset is read at fly time only; re-flying when the panel resizes would be jarring
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fly]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
    </div>
  );
}
