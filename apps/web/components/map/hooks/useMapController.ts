"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { getMapOptions, type MapTheme } from "../mapStyles";
import { useTheme } from "../../ui/ThemeProvider";

export type FilterType = "all" | "volunteers" | "resources" | "operations";
export type SelectionType = { type: "volunteer" | "operation" | "resource"; data: any } | null;

export function useMapController() {
  const mapRef   = useRef<google.maps.Map | null>(null);
  const linesRef = useRef<google.maps.Polyline[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [selected, setSelected] = useState<SelectionType>(null);
  const [filter, setFilter]     = useState<FilterType>("all");
  const { theme } = useTheme();

  const initMap = useCallback(async (container: HTMLElement) => {
    if (mapRef.current) return;
    const loader = new Loader({
      apiKey:  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      version: "weekly",
    });
    await loader.load();
    const map = new google.maps.Map(container, getMapOptions(theme as MapTheme));
    mapRef.current = map;
    setMapReady(true);
  }, [theme]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setOptions(getMapOptions(theme as MapTheme));
  }, [theme, mapReady]);

  const panTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.panTo({ lat, lng });
  }, []);

  const select = useCallback((type: "volunteer" | "operation" | "resource", data: any) => {
    setSelected({ type, data });
    panTo(data.lat, data.lng);
  }, [panTo]);

  const clearSelection = useCallback(() => setSelected(null), []);

  const drawRoutingLines = useCallback((
    volunteers: { id: string; lat: number; lng: number; assignedTo?: string }[],
    operations: { id: string; lat: number; lng: number }[],
    routePaths?: Record<string, { lat: number; lng: number }[]>,
  ) => {
    linesRef.current.forEach((l) => l.setMap(null));
    linesRef.current = [];
    if (!mapRef.current) return;
    const opMap = new Map(operations.map((o) => [o.id, o]));
    volunteers.forEach((v) => {
      if (!v.assignedTo) return;
      const op = opMap.get(v.assignedTo);
      if (!op) return;
      const routeKey = `${v.id}:${v.assignedTo}`;
      const path = routePaths?.[routeKey] && routePaths[routeKey].length > 1
        ? routePaths[routeKey]
        : [{ lat: v.lat, lng: v.lng }, { lat: op.lat, lng: op.lng }];
      const line = new google.maps.Polyline({
        path,
        strokeColor:   "#48A15E",
        strokeOpacity: 0,
        icons: [{
          icon: { path: "M 0,-1 0,1", strokeOpacity: 0.65, scale: 3, strokeColor: "#48A15E" },
          offset: "0",
          repeat: "14px",
        }],
        map: mapRef.current,
      });
      linesRef.current.push(line);
    });
  }, []);

  return { mapRef, mapReady, initMap, selected, setSelected, select, clearSelection, filter, setFilter, drawRoutingLines };
}
