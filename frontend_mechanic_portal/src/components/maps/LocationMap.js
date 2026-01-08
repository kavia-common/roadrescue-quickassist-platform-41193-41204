import React, { useMemo } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";

/**
 * Leaflet marker icons are not auto-resolved by some bundlers (CRA included).
 * Provide explicit URLs to the images shipped in the `leaflet` package.
 */
const defaultMarkerIcon = new L.Icon({
  iconUrl: `${process.env.PUBLIC_URL}/leaflet/marker-icon.png`,
  iconRetinaUrl: `${process.env.PUBLIC_URL}/leaflet/marker-icon-2x.png`,
  shadowUrl: `${process.env.PUBLIC_URL}/leaflet/marker-shadow.png`,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function toNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// PUBLIC_INTERFACE
export function LocationMap({ lat, lon, height = 300 }) {
  /** Render an OpenStreetMap + Leaflet map for the provided coordinates. */
  const latNum = toNumberOrNull(lat);
  const lonNum = toNumberOrNull(lon);

  const center = useMemo(() => {
    if (latNum === null || lonNum === null) return null;
    return [latNum, lonNum];
  }, [latNum, lonNum]);

  if (!center) return null;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <MapContainer
        center={center}
        zoom={15}
        style={{ height, width: "100%" }}
        scrollWheelZoom
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
        />
        <Marker position={center} icon={defaultMarkerIcon}>
          <Popup>Breakdown Location</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
