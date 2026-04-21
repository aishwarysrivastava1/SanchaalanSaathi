from __future__ import annotations

import math
import os
from typing import Any

import httpx


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


class GeoRoutingService:
    def __init__(self) -> None:
        self._api_key = os.getenv("GEOAPIFY_API_KEY", "").strip()
        self._base = "https://api.geoapify.com/v1"

    @property
    def enabled(self) -> bool:
        return bool(self._api_key)

    async def get_distance_matrix(
        self,
        origins: list[tuple[float | None, float | None]],
        destinations: list[tuple[float | None, float | None]],
    ) -> dict[tuple[int, int], dict[str, float]]:
        # Fallback immediately if API key is unavailable.
        if not self.enabled:
            return self._haversine_matrix(origins, destinations)

        clean_origins: list[list[float]] = []
        clean_destinations: list[list[float]] = []
        origin_index_map: list[int] = []
        destination_index_map: list[int] = []

        for i, (lat, lng) in enumerate(origins):
            if lat is None or lng is None:
                continue
            clean_origins.append([lng, lat])
            origin_index_map.append(i)

        for j, (lat, lng) in enumerate(destinations):
            if lat is None or lng is None:
                continue
            clean_destinations.append([lng, lat])
            destination_index_map.append(j)

        if not clean_origins or not clean_destinations:
            return self._haversine_matrix(origins, destinations)

        url = f"{self._base}/routematrix"
        params = {"apiKey": self._api_key}
        body = {
            "mode": "drive",
            "sources": clean_origins,
            "targets": clean_destinations,
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.post(url, params=params, json=body)
                response.raise_for_status()
                payload = response.json()

            rows = payload.get("sources_to_targets", [])
            matrix: dict[tuple[int, int], dict[str, float]] = {}
            for src_idx, row in enumerate(rows):
                for dst_idx, cell in enumerate(row or []):
                    from_idx = origin_index_map[src_idx]
                    to_idx = destination_index_map[dst_idx]
                    distance_m = float(cell.get("distance", 0.0) or 0.0)
                    time_s = float(cell.get("time", 0.0) or 0.0)
                    matrix[(from_idx, to_idx)] = {
                        "distance_km": distance_m / 1000.0,
                        "duration_s": time_s,
                    }

            fallback = self._haversine_matrix(origins, destinations)
            fallback.update(matrix)
            return fallback
        except Exception:
            return self._haversine_matrix(origins, destinations)

    async def get_route(
        self,
        start: tuple[float, float],
        end: tuple[float, float],
    ) -> dict[str, Any]:
        start_lat, start_lng = start
        end_lat, end_lng = end

        fallback_distance_km = haversine_km(start_lat, start_lng, end_lat, end_lng)
        fallback_duration_s = (fallback_distance_km / 35.0) * 3600.0
        fallback = {
            "source": "haversine",
            "distance_km": round(fallback_distance_km, 3),
            "duration_s": round(fallback_duration_s, 1),
            "polyline": [
                {"lat": start_lat, "lng": start_lng},
                {"lat": end_lat, "lng": end_lng},
            ],
        }

        if not self.enabled:
            return fallback

        params = {
            "waypoints": f"{start_lat},{start_lng}|{end_lat},{end_lng}",
            "mode": "drive",
            "details": "route_details",
            "apiKey": self._api_key,
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.get(f"{self._base}/routing", params=params)
                response.raise_for_status()
                payload = response.json()

            features = payload.get("features", [])
            if not features:
                return fallback

            geometry = features[0].get("geometry", {})
            coords = geometry.get("coordinates", [])
            props = features[0].get("properties", {})
            distance_m = float(props.get("distance", 0.0) or 0.0)
            time_s = float(props.get("time", 0.0) or 0.0)

            polyline = [{"lat": c[1], "lng": c[0]} for c in coords if isinstance(c, list) and len(c) >= 2]
            if not polyline:
                return fallback

            return {
                "source": "geoapify",
                "distance_km": round(distance_m / 1000.0, 3),
                "duration_s": round(time_s, 1),
                "polyline": polyline,
            }
        except Exception:
            return fallback

    def _haversine_matrix(
        self,
        origins: list[tuple[float | None, float | None]],
        destinations: list[tuple[float | None, float | None]],
    ) -> dict[tuple[int, int], dict[str, float]]:
        out: dict[tuple[int, int], dict[str, float]] = {}
        for i, (olat, olng) in enumerate(origins):
            for j, (dlat, dlng) in enumerate(destinations):
                if olat is None or olng is None or dlat is None or dlng is None:
                    out[(i, j)] = {"distance_km": 9999.0, "duration_s": 999999.0}
                    continue
                km = haversine_km(olat, olng, dlat, dlng)
                out[(i, j)] = {
                    "distance_km": km,
                    "duration_s": (km / 35.0) * 3600.0,
                }
        return out


geo_routing_service = GeoRoutingService()
