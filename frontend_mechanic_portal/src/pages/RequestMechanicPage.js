import React, { useMemo, useState } from "react";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { MapView } from "../components/MapView";

/**
 * PUBLIC_INTERFACE
 */
export function RequestMechanicPage() {
  /** Simple "Request Mechanic" page demonstrating Leaflet MapView integration with form-controlled lat/lng. */
  const defaults = useMemo(() => ({ lat: 13.0827, lng: 80.2707 }), []);
  const [lat, setLat] = useState(String(defaults.lat));
  const [lng, setLng] = useState(String(defaults.lng));

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  return (
    <div className="container">
      <div className="hero">
        <h1 className="h1">Request Mechanic</h1>
        <p className="lead">Enter a breakdown location to preview it on the map.</p>
      </div>

      <div className="grid2">
        <Card
          title="Breakdown location"
          subtitle="For now, enter coordinates directly (free + no API keys). Address → coordinates can be added later using Nominatim."
        >
          <div className="form">
            <Input
              label="Latitude"
              name="latitude"
              type="number"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              hint="Example: 13.0827 (Chennai)"
              required
            />
            <Input
              label="Longitude"
              name="longitude"
              type="number"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              hint="Example: 80.2707 (Chennai)"
              required
            />

            <div className="alert alert-info" style={{ marginTop: 6 }}>
              Tip: Later you can convert address → lat/lng using Nominatim:{" "}
              <span style={{ fontWeight: 900 }}>https://nominatim.openstreetmap.org/search?q=Chennai&format=json</span>
            </div>
          </div>
        </Card>

        <Card title="Map preview" subtitle="Marker updates automatically as you change latitude/longitude.">
          <MapView lat={parsedLat} lng={parsedLng} />
        </Card>
      </div>
    </div>
  );
}
