'use client';

import { useRef, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

interface MapboxMapProps {
  center: [number, number]; // [lng, lat] for Mapbox
  markerPosition: [number, number] | null; // [lng, lat]
  token: string;
}

export default function MapboxMap({ center, markerPosition, token }: MapboxMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: center,
      zoom: 13,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Pan map when center changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({ center: center, zoom: 14, duration: 1200 });
  }, [center]);

  // Update marker
  useEffect(() => {
    if (!mapRef.current) return;
    if (markerRef.current) { markerRef.current.remove(); markerRef.current = null; }
    if (markerPosition) {
      const el = document.createElement('div');
      el.style.cssText = 'width:32px;height:32px;background:#f97316;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4)';
      markerRef.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(markerPosition)
        .addTo(mapRef.current);
    }
  }, [markerPosition]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
