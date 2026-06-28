"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface HikeRoute {
  id: string;
  name: string;
  region: string | null;
  activityType: string | null;
  difficultyRaw: string | null;
  status: string;
  geojson: GeoJSON.FeatureCollection;
  bounds: number[][] | null;
  center: number[] | null;
}

interface WeatherInfo {
  emoji: string;
  label: string;
  tempMax: number;
  quality: "good" | "ok" | "bad";
}

interface OverviewMapProps {
  routes: HikeRoute[];
  onBoundsChange?: (bounds: MapBounds) => void;
}

const ROUTE_COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea",
  "#ea580c", "#0891b2", "#be185d", "#4f46e5",
  "#ca8a04", "#059669",
];

const QUALITY_COLOR: Record<WeatherInfo["quality"], string> = {
  good: "#16a34a",
  ok:   "#ca8a04",
  bad:  "#dc2626",
};

const DAY_LABELS = ["Heute", "Morgen", "Übermorgen"];

function wmoToWeather(code: number, tempMax: number): WeatherInfo {
  let emoji: string, label: string, quality: WeatherInfo["quality"];

  if (code === 0)       { emoji = "☀️";  label = "Sonnig";         quality = "good"; }
  else if (code <= 2)   { emoji = "🌤";  label = "Meist klar";     quality = "good"; }
  else if (code === 3)  { emoji = "☁️";  label = "Bewölkt";        quality = "ok";   }
  else if (code <= 48)  { emoji = "🌫";  label = "Nebel";          quality = "ok";   }
  else if (code <= 53)  { emoji = "🌦";  label = "Leichter Regen"; quality = "ok";   }
  else if (code <= 67)  { emoji = "🌧";  label = "Regen";          quality = "bad";  }
  else if (code <= 77)  { emoji = "❄️";  label = "Schnee";         quality = "bad";  }
  else if (code <= 82)  { emoji = "🌦";  label = "Schauer";        quality = "ok";   }
  else if (code <= 86)  { emoji = "🌨";  label = "Schneeschauer";  quality = "bad";  }
  else                  { emoji = "⛈";  label = "Gewitter";        quality = "bad";  }

  return { emoji, label, tempMax, quality };
}

function createWeatherIcon(info: WeatherInfo) {
  const bg = QUALITY_COLOR[info.quality];
  return L.divIcon({
    html: `<div style="background:${bg};color:white;border-radius:12px;padding:2px 7px;font-size:13px;white-space:nowrap;box-shadow:0 1px 5px rgba(0,0,0,0.35);display:flex;align-items:center;gap:3px;font-family:sans-serif"><span>${info.emoji}</span><span style="font-size:11px;font-weight:700">${info.tempMax}°</span></div>`,
    className: "",
    iconSize: [60, 24],
    iconAnchor: [30, 12],
  });
}

export default function OverviewMap({ routes, onBoundsChange }: OverviewMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const weatherLayerRef = useRef<L.LayerGroup | null>(null);
  const onBoundsChangeRef = useRef(onBoundsChange);
  onBoundsChangeRef.current = onBoundsChange;

  const [showWeather, setShowWeather] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);
  const [weatherData, setWeatherData] = useState<Map<string, WeatherInfo>>(new Map());
  const [weatherLoading, setWeatherLoading] = useState(false);

  const emitBounds = useCallback((map: L.Map) => {
    if (!onBoundsChangeRef.current) return;
    const b = map.getBounds();
    onBoundsChangeRef.current({
      north: b.getNorth(),
      south: b.getSouth(),
      east: b.getEast(),
      west: b.getWest(),
    });
  }, []);

  // Base map initialisation
  useEffect(() => {
    if (!mapRef.current || routes.length === 0) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      weatherLayerRef.current = null;
    }

    const map = L.map(mapRef.current);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);

    const allBounds = L.latLngBounds([]);

    routes.forEach((route, idx) => {
      const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];

      const layer = L.geoJSON(route.geojson, {
        style: { color, weight: 3, opacity: 0.8 },
      }).addTo(map);

      const popupContent = `
        <div style="min-width:150px">
          <strong><a href="/hikes/${route.id}" style="color:${color}">${route.name}</a></strong>
          <br/><span style="font-size:12px;color:#666">
            ${[route.region, route.activityType, route.difficultyRaw].filter(Boolean).join(" · ")}
          </span>
          ${route.status === "completed" ? '<br/><span style="font-size:11px;color:#16a34a">✓ Erledigt</span>' : ""}
        </div>
      `;
      layer.bindPopup(popupContent);
      layer.on("mouseover", () => layer.setStyle({ weight: 5, opacity: 1 }));
      layer.on("mouseout",  () => layer.setStyle({ weight: 3, opacity: 0.8 }));

      allBounds.extend(layer.getBounds());
    });

    if (allBounds.isValid()) map.fitBounds(allBounds, { padding: [30, 30] });

    map.whenReady(() => emitBounds(map));
    map.on("moveend", () => emitBounds(map));

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      weatherLayerRef.current = null;
    };
  }, [routes, emitBounds]);

  // Weather fetch — runs when enabled or when the selected day changes
  useEffect(() => {
    if (!showWeather) {
      setWeatherData(new Map());
      return;
    }

    const routesWithCenter = routes.filter((r) => r.center);
    if (routesWithCenter.length === 0) return;

    setWeatherLoading(true);

    const controller = new AbortController();

    Promise.all(
      routesWithCenter.map(async (route) => {
        const [lat, lng] = route.center!;
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude",  lat.toFixed(4));
        url.searchParams.set("longitude", lng.toFixed(4));
        url.searchParams.set("daily", "weathercode,temperature_2m_max");
        url.searchParams.set("timezone", "Europe/Zurich");
        url.searchParams.set("forecast_days", "3");

        try {
          const res = await fetch(url.toString(), { signal: controller.signal });
          if (!res.ok) return null;
          const data = await res.json();
          const code    = data.daily.weathercode[dayOffset] as number;
          const tempMax = Math.round(data.daily.temperature_2m_max[dayOffset] as number);
          return { id: route.id, info: wmoToWeather(code, tempMax) };
        } catch {
          return null;
        }
      })
    ).then((results) => {
      if (controller.signal.aborted) return;
      const map = new Map<string, WeatherInfo>();
      results.forEach((r) => { if (r) map.set(r.id, r.info); });
      setWeatherData(map);
      setWeatherLoading(false);
    });

    return () => controller.abort();
  }, [showWeather, dayOffset, routes]);

  // Weather marker rendering — re-runs whenever data or visibility changes
  useEffect(() => {
    if (weatherLayerRef.current) {
      weatherLayerRef.current.remove();
      weatherLayerRef.current = null;
    }

    const map = mapInstanceRef.current;
    if (!showWeather || weatherData.size === 0 || !map) return;

    const layer = L.layerGroup().addTo(map);
    weatherLayerRef.current = layer;

    routes.forEach((route) => {
      if (!route.center) return;
      const info = weatherData.get(route.id);
      if (!info) return;
      const [lat, lng] = route.center;
      L.marker([lat, lng], { icon: createWeatherIcon(info), zIndexOffset: 1000 })
        .bindPopup(
          `<div style="min-width:120px">
            <strong>${route.name}</strong><br/>
            <span style="font-size:13px">${info.emoji} ${info.label}</span><br/>
            <span style="font-size:12px;color:#555">Max ${info.tempMax}°C</span>
          </div>`
        )
        .addTo(layer);
    });
  }, [showWeather, weatherData, routes]);

  if (routes.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-lg border shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-4 py-2">
        <span className="text-sm font-medium text-gray-700">
          Karte ({routes.length} {routes.length === 1 ? "Tour" : "Touren"} mit GPX)
        </span>

        <div className="flex items-center gap-2">
          {showWeather && (
            <div className="flex overflow-hidden rounded border text-xs">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  onClick={() => setDayOffset(i)}
                  className={`px-2.5 py-1 transition-colors ${
                    dayOffset === i
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowWeather((v) => !v)}
            className={`flex items-center gap-1.5 rounded border px-3 py-1 text-xs font-medium transition-colors ${
              showWeather
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {weatherLoading ? "⏳" : "🌤"}&nbsp;Wetter
          </button>
        </div>
      </div>

      {showWeather && weatherData.size > 0 && (
        <div className="flex gap-3 border-b bg-gray-50 px-4 py-1.5 text-xs text-gray-500">
          {(["good", "ok", "bad"] as const).map((q) => (
            <span key={q} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: QUALITY_COLOR[q] }}
              />
              {q === "good" ? "Gut" : q === "ok" ? "Mässig" : "Schlecht"}
            </span>
          ))}
        </div>
      )}

      <div ref={mapRef} className="h-72 w-full sm:h-80 lg:h-96" style={{ minHeight: "288px" }} />
    </div>
  );
}
