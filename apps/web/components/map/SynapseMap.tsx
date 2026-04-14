"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { NeedNode, HotspotResult } from "../../lib/types";

declare const google: any;

interface SynapseMapProps {
  needs: NeedNode[];
  volunteers: any[];
  hotspots: HotspotResult[];
  showVolunteers: boolean;
  onMarkerClick?: (need: NeedNode) => void;
}

export default function SynapseMap({ needs, volunteers, hotspots, showVolunteers, onMarkerClick }: SynapseMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const markersRef = useRef<any[]>([]);
  const circlesRef = useRef<any[]>([]);

  useEffect(() => {
    const initMap = async () => {
      const loader = new Loader({
        apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
        version: "weekly",
      });

      const { Map } = await loader.importLibrary("maps");
      
      if (mapRef.current && !map) {
        const newMap = new Map(mapRef.current, {
          center: { lat: 28.6139, lng: 77.2090 }, // Delhi
          zoom: 12,
          mapId: "SYNAPSE_DARK_MAP",
          styles: [
            { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
            { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
            { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
          ],
        });
        setMap(newMap);
      }
    };
    initMap();
  }, [map]);

  useEffect(() => {
    if (!map) return;

    // Clear old markers and circles
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    circlesRef.current.forEach(c => c.setMap(null));
    circlesRef.current = [];

    // Add Hotspot Visualization (Heat Circles)
    hotspots.forEach(hotspot => {
      // Find a need in this area to get coordinates (simplified for demo)
      const needInArea = needs.find(n => n.location.name === hotspot.area);
      if (needInArea) {
        const circle = new google.maps.Circle({
          strokeColor: "#FF0000",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#FF0000",
          fillOpacity: 0.35,
          map,
          center: { lat: needInArea.location.lat, lng: needInArea.location.lng },
          radius: Math.sqrt(hotspot.need_count) * 200, // Dynamic sizing
        });
        circlesRef.current.push(circle);
      }
    });

    // Add Needs Markers
    needs.forEach(need => {
      if (!need.location || typeof need.location.lat !== 'number' || typeof need.location.lng !== 'number') return;
      
      const isResolved = need.status === 'RESOLVED';
      const color = isResolved ? "#10b981" : 
                    need.urgency_score >= 0.8 ? "#ef4444" : 
                    need.urgency_score >= 0.5 ? "#f97316" : 
                    need.urgency_score >= 0.3 ? "#eab308" : "#22c55e";
                    
      const iconUrl = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${encodeURIComponent(color)}"%3E%3Ccircle cx="12" cy="12" r="8"/%3E%3C/svg%3E`;

      const marker = new google.maps.Marker({
        position: { lat: need.location.lat, lng: need.location.lng },
        map: map,
        title: need.description,
        icon: {
          url: iconUrl,
          scaledSize: new google.maps.Size(isResolved ? 16 : 24, isResolved ? 16 : 24),
        }
      });

      if (onMarkerClick) {
        marker.addListener("click", () => onMarkerClick(need));
      }

      markersRef.current.push(marker);
    });

    // Add Volunteer Markers
    if (showVolunteers) {
      volunteers.forEach(v => {
        if (!v.location || typeof v.location.lat !== 'number' || typeof v.location.lng !== 'number') return;
        
        const isBusy = v.availability_status === 'BUSY';
        const color = isBusy ? "#a855f7" : "#06b6d4"; // Purple = Busy, Cyan = Active
        
        const iconUrl = `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${encodeURIComponent(color)}"%3E%3Cpath d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E`;

        const marker = new google.maps.Marker({
          position: { lat: v.location.lat, lng: v.location.lng },
          map: map,
          title: `Volunteer: ${v.name} (${v.availability_status})`,
          icon: {
            url: iconUrl,
            scaledSize: new google.maps.Size(28, 28),
          }
        });

        markersRef.current.push(marker);
      });
    }
  }, [map, needs, volunteers, hotspots, showVolunteers, onMarkerClick]);

  return <div ref={mapRef} className="w-full h-full rounded-xl overflow-hidden shadow-2xl border border-slate-800" />;
}
