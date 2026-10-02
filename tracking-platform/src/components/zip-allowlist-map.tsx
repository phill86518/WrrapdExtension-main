"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import "maplibre-gl/dist/maplibre-gl.css";
import type { AllowedZipCodesPayload } from "@/lib/wrrapd-zip-codes-admin";

type ZipProps = { zip?: string; state?: string; county?: string };
type PayloadResult = { ok: true; data: AllowedZipCodesPayload } | { ok: false; error: string };
type Bbox = [number, number, number, number];

/** Continental U.S., Alaska, and Hawaii in one view. Far Aleutian codes stay on the map if you pan west. */
const US_BOUNDS: [[number, number], [number, number]] = [
  [-168, 17.4],
  [-66.4, 71.6],
];

if (typeof window !== "undefined") {
  setWorkerUrl(new URL("/maps/maplibre-gl-worker.js", window.location.origin).href);
}

function countyLabel(county?: string, state?: string): string {
  if (!county) return state ? state : "County not on file";
  const pretty = county
    .toLowerCase()
    .split(/([^a-z0-9]+)/i)
    .map((part) => (/[a-z]/i.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join("");
  const named = /\b(city|parish|borough|municipality|census)\b/i.test(pretty);
  const name = named ? pretty : `${pretty} County`;
  return state ? `${name}, ${state}` : name;
}

function expandBox(box: Bbox, lng: number, lat: number) {
  if (lng < box[0]) box[0] = lng;
  if (lat < box[1]) box[1] = lat;
  if (lng > box[2]) box[2] = lng;
  if (lat > box[3]) box[3] = lat;
}

function walkCoords(coords: unknown, box: Bbox) {
  if (!Array.isArray(coords) || coords.length === 0) return;
  if (typeof coords[0] === "number") {
    expandBox(box, coords[0] as number, coords[1] as number);
    return;
  }
  for (const part of coords) walkCoords(part, box);
}

function bboxForGeometry(geometry: Geometry): Bbox | null {
  const box: Bbox = [Infinity, Infinity, -Infinity, -Infinity];
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) {
      const childBox = bboxForGeometry(child);
      if (!childBox) continue;
      expandBox(box, childBox[0], childBox[1]);
      expandBox(box, childBox[2], childBox[3]);
    }
  } else if ("coordinates" in geometry) {
    walkCoords(geometry.coordinates, box);
  }
  if (!Number.isFinite(box[0])) return null;
  return box;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const zip of a) if (!b.has(zip)) return false;
  return true;
}

export function ZipAllowlistMap({
  allowed,
  onClose,
  onSave,
}: {
  allowed: string[];
  onClose: () => void;
  onSave: (zips: string[]) => Promise<PayloadResult>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const boxesRef = useRef<Map<string, Bbox>>(new Map());
  const knownRef = useRef<Set<string>>(new Set());
  const selectedRef = useRef<Set<string>>(new Set(allowed));
  const baselineRef = useRef<Set<string>>(new Set(allowed));

  const [mounted, setMounted] = useState(false);
  const [count, setCount] = useState(allowed.length);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [findZip, setFindZip] = useState("");
  const [findNote, setFindNote] = useState<string | null>(null);
  const [unmapped, setUnmapped] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
    // requestClose closes over the latest dirty flag via the ref below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  function requestClose() {
    if (dirtyRef.current && !window.confirm("Close the map without saving these ZIP changes?")) return;
    onClose();
  }

  useEffect(() => {
    if (!mounted) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const selected = selectedRef.current;

    const map = new MapLibreMap({
      container,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": "#c5d8ea" } }],
      },
      center: [-98, 39],
      zoom: 3,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      minZoom: 1.4,
      maxZoom: 12,
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;
    const resize = () => map.resize();
    requestAnimationFrame(resize);
    window.addEventListener("resize", resize);

    const paintSelection = () => {
      for (const zip of selected) {
        if (!knownRef.current.has(zip)) continue;
        map.setFeatureState({ source: "zcta", id: zip }, { selected: true });
      }
    };

    let hoverId: string | null = null;
    const hideTip = () => {
      if (tipRef.current) tipRef.current.hidden = true;
    };
    const showTip = (point: { x: number; y: number }, props: ZipProps, on: boolean) => {
      const tip = tipRef.current;
      if (!tip) return;
      const zip = String(props.zip || "");
      const zipEl = tip.querySelector("[data-zip]");
      const countyEl = tip.querySelector("[data-county]");
      const statusEl = tip.querySelector("[data-status]");
      if (zipEl) zipEl.textContent = zip;
      if (countyEl) countyEl.textContent = countyLabel(props.county, props.state);
      if (statusEl) statusEl.textContent = on ? "Delivering gifts here" : "Not delivering gifts here";
      tip.hidden = false;
      const width = container.clientWidth;
      const height = container.clientHeight;
      const left = point.x > width - 220 ? point.x - 200 : point.x + 14;
      const top = point.y > height - 90 ? point.y - 78 : point.y + 14;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    };

    const onMove = (event: MapLayerMouseEvent) => {
      const hit = event.features?.[0];
      const zip = hit ? String(hit.properties?.zip || hit.id || "") : "";
      if (!zip) return;
      map.getCanvas().style.cursor = "pointer";
      if (hoverId && hoverId !== zip) {
        map.setFeatureState({ source: "zcta", id: hoverId }, { hover: false });
      }
      if (hoverId !== zip) {
        map.setFeatureState({ source: "zcta", id: zip }, { hover: true });
        hoverId = zip;
      }
      showTip(event.point, (hit?.properties || {}) as ZipProps, selected.has(zip));
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = "";
      if (hoverId) map.setFeatureState({ source: "zcta", id: hoverId }, { hover: false });
      hoverId = null;
      hideTip();
    };
    const onClick = (event: MapLayerMouseEvent) => {
      const hit = event.features?.[0];
      const zip = hit ? String(hit.properties?.zip || hit.id || "") : "";
      if (!zip || zip.length !== 5) return;
      if (selected.has(zip)) selected.delete(zip);
      else selected.add(zip);
      map.setFeatureState({ source: "zcta", id: zip }, { selected: selected.has(zip) });
      setCount(selected.size);
      setDirty(!setsEqual(selected, baselineRef.current));
      setSaveError(null);
      showTip(event.point, (hit?.properties || {}) as ZipProps, selected.has(zip));
    };

    map.on("load", () => {
      void (async () => {
        try {
          const response = await fetch("/maps/us-zcta.json");
          if (!response.ok) throw new Error(`Could not load the ZIP map (${response.status})`);
          const topo = (await response.json()) as Topology<{ zcta: GeometryCollection<ZipProps> }>;
          if (cancelled) return;
          const collection = feature(topo, topo.objects.zcta) as FeatureCollection<Geometry, ZipProps>;
          const boxes = new Map<string, Bbox>();
          const known = new Set<string>();
          for (const item of collection.features) {
            const zip = String(item.properties?.zip || "");
            if (zip.length !== 5 || !item.geometry) continue;
            known.add(zip);
            const box = bboxForGeometry(item.geometry);
            if (box && box[2] - box[0] < 30) boxes.set(zip, box);
          }
          boxesRef.current = boxes;
          knownRef.current = known;
          const offMap = [...baselineRef.current].filter((zip) => !known.has(zip)).length;
          setUnmapped(offMap);

          map.addSource("zcta", {
            type: "geojson",
            data: collection,
            promoteId: "zip",
          });
          map.addLayer({
            id: "zcta-fill",
            type: "fill",
            source: "zcta",
            paint: {
              "fill-color": [
                "case",
                ["boolean", ["feature-state", "selected"], false],
                ["case", ["boolean", ["feature-state", "hover"], false], "#e3a820", "#f6b933"],
                ["case", ["boolean", ["feature-state", "hover"], false], "#e7e0d2", "#f6f3ec"],
              ],
              "fill-opacity": 1,
            },
          });
          map.addLayer({
            id: "zcta-line",
            type: "line",
            source: "zcta",
            paint: {
              "line-color": [
                "case",
                ["boolean", ["feature-state", "hover"], false],
                "#0c0638",
                ["boolean", ["feature-state", "selected"], false],
                "#0f0351",
                "#c4bbaa",
              ],
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                2,
                ["case", ["boolean", ["feature-state", "hover"], false], 1.2, 0.15],
                8,
                ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.8],
              ],
            },
          });
          map.on("mousemove", "zcta-fill", onMove);
          map.on("mouseleave", "zcta-fill", onLeave);
          map.on("click", "zcta-fill", onClick);
          map.fitBounds(US_BOUNDS, { padding: 28, duration: 0 });
          map.once("idle", () => {
            if (cancelled) return;
            paintSelection();
            setLoading(false);
          });
        } catch (error) {
          if (cancelled) return;
          setLoadError(error instanceof Error ? error.message : "Could not load the ZIP map");
          setLoading(false);
        }
      })();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      map.remove();
      mapRef.current = null;
    };
  }, [mounted]);

  function hideHoverTip() {
    if (tipRef.current) tipRef.current.hidden = true;
  }

  function fitBox(box: Bbox, maxZoom: number) {
    hideHoverTip();
    mapRef.current?.fitBounds(
      [
        [box[0], box[1]],
        [box[2], box[3]],
      ],
      { padding: 64, maxZoom, duration: 700 },
    );
  }

  function zoomToSelected() {
    const boxes = boxesRef.current;
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const zip of selectedRef.current) {
      const box = boxes.get(zip);
      if (!box) continue;
      if (box[0] < west) west = box[0];
      if (box[1] < south) south = box[1];
      if (box[2] > east) east = box[2];
      if (box[3] > north) north = box[3];
    }
    if (!Number.isFinite(west)) {
      setFindNote("None of the selected ZIP codes are drawn on the map.");
      return;
    }
    setFindNote(null);
    fitBox([west, south, east, north], 10);
  }

  function findOnMap(event: React.FormEvent) {
    event.preventDefault();
    const zip = findZip.replace(/\D/g, "").slice(0, 5);
    const box = boxesRef.current.get(zip);
    if (!box) {
      setFindNote(zip.length === 5 ? "That ZIP is not drawn on the map." : "Enter a 5-digit ZIP.");
      return;
    }
    setFindNote(null);
    fitBox(box, 11);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const zips = [...selectedRef.current].sort();
      const result = await onSave(zips);
      if (!result.ok) {
        setSaveError(result.error);
        setSaving(false);
        return;
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save");
      setSaving(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex h-dvh flex-col bg-[#f7f4ee]" role="dialog" aria-modal="true" aria-label="Gift delivery ZIP map">
      <header className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[#0c0638]/15 bg-white px-3 py-2">
        <div className="mr-auto min-w-[12rem] shrink-0">
          <h2 className="text-base font-semibold text-[#0c0638]">Gift delivery map</h2>
          <p className="text-xs text-slate-600">
            {`${count.toLocaleString()} ZIP codes selected${dirty ? " · unsaved" : ""}. Click to add or remove. Hover shows the county.`}
          </p>
        </div>
        <form onSubmit={findOnMap} className="flex shrink-0 items-center gap-2">
          <input
            value={findZip}
            onChange={(event) => setFindZip(event.target.value.replace(/\D/g, "").slice(0, 5))}
            inputMode="numeric"
            maxLength={5}
            placeholder="ZIP code"
            aria-label="Find a ZIP code"
            className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
            Find
          </button>
        </form>
        <button
          type="button"
          onClick={zoomToSelected}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Zoom to selected
        </button>
        <button
          type="button"
          onClick={() => {
            setFindNote(null);
            hideHoverTip();
            mapRef.current?.fitBounds(US_BOUNDS, { padding: 28, duration: 700 });
          }}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Whole U.S.
        </button>
        <button
          type="button"
          disabled={!dirty || saving || loading}
          onClick={() => void save()}
          className="shrink-0 rounded-lg bg-[#f6b933] px-3 py-2 text-sm font-semibold text-[#0f0351] hover:bg-[#e3a820] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={requestClose}
          className="shrink-0 rounded-lg bg-[#0c0638] px-3 py-2 text-sm font-medium text-white hover:bg-[#16104a]"
        >
          Close
        </button>
      </header>
      {findNote ? <p className="bg-amber-50 px-4 py-2 text-sm text-amber-950">{findNote}</p> : null}
      {saveError ? <p className="bg-red-50 px-4 py-2 text-sm text-red-800">{saveError}</p> : null}
      {unmapped > 0 ? (
        <p className="bg-slate-100 px-4 py-2 text-sm text-slate-700">
          {unmapped.toLocaleString()} selected {unmapped === 1 ? "code has" : "codes have"} no map shape, usually a
          post office, and {unmapped === 1 ? "stays" : "stay"} on the allowlist when you save.
        </p>
      ) : null}
      <div className="relative min-h-[240px] flex-1">
        <div ref={containerRef} className="h-full w-full" />
        <div
          ref={tipRef}
          hidden
          className="pointer-events-none absolute z-30 rounded-lg border border-[#0c0638]/20 bg-white px-3 py-2 shadow-lg"
        >
          <div data-zip className="font-mono text-base font-semibold text-[#0c0638]" />
          <div data-county className="text-sm text-slate-700" />
          <div data-status className="text-xs text-slate-500" />
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-[#0c0638]/15 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow">
          <p className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm border border-[#0f0351] bg-[#f6b933]" />
            Delivering gift wrapping
          </p>
          <p className="mt-1 flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm border border-[#c4bbaa] bg-[#f6f3ec]" />
            Not delivering
          </p>
          <p className="mt-1 text-slate-500">Scroll to zoom. Alaska and Hawaii are on this map.</p>
        </div>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#c5d8ea]/80 text-sm font-medium text-[#0c0638]">
            Loading every U.S. ZIP code…
          </div>
        ) : null}
        {loadError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 p-6 text-center text-sm text-red-800">
            {loadError}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
