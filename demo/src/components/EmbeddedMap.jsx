import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// height: the map's height in px; directions: false when the caller has its own button.
export default function EmbeddedMap({ latitude, longitude, placeName, address, height = 260, directions = true }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const lat = latitude || 1.3521;
  const lng = longitude || 103.8198;

  useEffect(() => {
    if (!mapInstanceRef.current && mapRef.current) {
      const map = L.map(mapRef.current).setView([lat, lng], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      L.marker([lat, lng]).addTo(map)
        .bindPopup(`<strong>${placeName}</strong><br />${address}`)
        .openPopup();

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lng, placeName, address]);

  // Handler to launch Google Maps directions in a new tab
  const handleOpenDirections = () => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  };

  return (
    <div className="map-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div 
        ref={mapRef} 
        className="map-container" 
        style={{ height: `${height}px`, width: '100%', borderRadius: '8px', overflow: 'hidden' }} 
      />
      {directions && <button
        type="button"
        onClick={handleOpenDirections}
        style={{
          background: '#10b981',
          color: '#ffffff',
          border: 'none',
          padding: '8px 14px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px'
        }}
      >
        🚗 Get Directions (Open in Google Maps)
      </button>}
    </div>
  );
}