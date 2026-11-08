'use client';

import { useRef, useEffect } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface GoogleMapViewProps {
  center: [number, number]; // [lng, lat] — kept for drop-in compatibility with the old MapboxMap prop shape
  markerPosition: [number, number] | null; // [lng, lat]
  // When set, the real marker is suppressed and the caller is expected to
  // render its own fixed center-of-viewport pin overlay (classic Uber-style
  // "drag the map, pin stays put" pattern) — this just reports the map's
  // center back out every time it settles after a pan/zoom so the caller
  // can reverse-geocode it.
  onIdleCenterChanged?: (lat: number, lng: number) => void;
}

// Same palette as the dark Mapbox style this replaces, re-implemented as a
// Google Maps styles array (ported from the orphaned CustomerBooking.tsx).
const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry',           stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill',   stylers: [{ color: '#746855' }] },
  { featureType: 'road',         elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#746855' }] },
  { featureType: 'water',        elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  // Hide Google's default business/landmark pins (shops, restaurants, hospitals,
  // schools, etc.) — without this the map is covered in unrelated icons that have
  // nothing to do with delivery booking and make the screen look cluttered/unfinished.
  { featureType: 'poi',          elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi',          elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',      elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',      elementType: 'geometry', stylers: [{ visibility: 'off' }] },
  { featureType: 'road',         elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
];

// Same orange teardrop marker shape the Mapbox version used, as an SVG data URL.
function markerIcon(): google.maps.Icon {
  return {
    url:
      'data:image/svg+xml;charset=UTF-8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <path d="M16 2C9 2 3 8 3 15c0 10 13 15 13 15s13-5 13-15c0-7-6-13-13-13z" fill="#f97316" stroke="#fff" stroke-width="2"/>
        </svg>`
      ),
    scaledSize: new google.maps.Size(32, 32),
    anchor: new google.maps.Point(16, 30),
  };
}

let mapsLibraryPromise: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (!mapsLibraryPromise) {
    const loader = new Loader({
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
    });
    mapsLibraryPromise = loader.load().then(() => undefined);
  }
  return mapsLibraryPromise;
}

export default function GoogleMapView({ center, markerPosition, onIdleCenterChanged }: GoogleMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const readyRef = useRef(false);
  // Keep the latest callback in a ref so the 'idle' listener (attached once,
  // on map init) always calls the current version without needing to be
  // re-attached every render.
  const onIdleRef = useRef(onIdleCenterChanged);
  onIdleRef.current = onIdleCenterChanged;

  // Init map once, after the Maps JS API has loaded.
  useEffect(() => {
    let cancelled = false;
    loadMaps().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      mapRef.current = new google.maps.Map(containerRef.current, {
        center: { lat: center[1], lng: center[0] },
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        styles: DARK_MAP_STYLE,
      });
      readyRef.current = true;
      mapRef.current.addListener('idle', () => {
        const c = mapRef.current?.getCenter();
        if (c) onIdleRef.current?.(c.lat(), c.lng());
      });
      // Apply whatever marker was already set before the map finished loading.
      if (markerPosition) {
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position: { lat: markerPosition[1], lng: markerPosition[0] },
          icon: markerIcon(),
        });
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pan map when center changes
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    mapRef.current.panTo({ lat: center[1], lng: center[0] });
    mapRef.current.setZoom(14);
  }, [center]);

  // Update marker
  useEffect(() => {
    if (!mapRef.current || !readyRef.current) return;
    if (markerRef.current) { markerRef.current.setMap(null); markerRef.current = null; }
    if (markerPosition) {
      markerRef.current = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: markerPosition[1], lng: markerPosition[0] },
        icon: markerIcon(),
      });
    }
  }, [markerPosition]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
