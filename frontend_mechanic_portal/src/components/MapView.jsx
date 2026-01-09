import React, { useEffect, useMemo, useRef } from "react";
import "../styles/map.css";

/**
 * We intentionally use Leaflet via CDN (loaded in public/index.html), so we do not import "leaflet".
 * CRA will not bundle Leaflet in JS; instead, it is available at runtime as window.L.
 */

/**
 * PUBLIC_INTERFACE
 */
export function MapView({ lat, lng, zoom = 13 }) {
  /**
   * Leaflet-based OpenStreetMap view.
   *
   * - Defaults to Chennai when lat/lng are missing/invalid.
   * - Displays a marker at current lat/lng.
   * - Updates marker + map view when props change.
   * - Cleans up Leaflet map on unmount to avoid duplicate map instances.
   */
  const containerId = useMemo(() => `rr-map-${Math.random().toString(16).slice(2)}`, []);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  const safeLat = Number.isFinite(Number(lat)) ? Number(lat) : 13.0827; // Chennai
  const safeLng = Number.isFinite(Number(lng)) ? Number(lng) : 80.2707; // Chennai

  useEffect(() => {
    const L = window.L;
    if (!L) {
      // Leaflet failed to load (CDN blocked/offline). Fail gracefully.
      // eslint-disable-next-line no-console
      console.error("Leaflet (window.L) not found. Ensure Leaflet CDN is included in public/index.html");
      return undefined;
    }

    // Initialize map only once per mounted component.
    if (!mapRef.current) {
      const map = L.map(containerId, {
        zoomControl: true,
        attributionControl: true,
      }).setView([safeLat, safeLng], zoom);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([safeLat, safeLng]).addTo(map);

      mapRef.current = map;
      markerRef.current = marker;
    }

    return () => {
      // Cleanup on unmount to avoid "Map container is already initialized" errors.
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    const next = [safeLat, safeLng];
    marker.setLatLng(next);
    map.setView(next, zoom, { animate: true });
  }, [safeLat, safeLng, zoom]);

  return (
    <div className="rr-map-card">
      <div className="rr-map" id={containerId} role="application" aria-label="Breakdown location map" />
      <div className="rr-map-footer">
        <div className="rr-map-coords">
          Lat: <strong>{safeLat.toFixed(6)}</strong> • Lng: <strong>{safeLng.toFixed(6)}</strong>
        </div>
        <div className="rr-map-hint">OpenStreetMap • Leaflet (no API keys)</div>
      </div>
    </div>
  );
}
