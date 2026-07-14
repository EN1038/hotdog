"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";

const markerIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];

export type BranchLocationValue = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type Props = {
  value: BranchLocationValue;
  onChange: (next: BranchLocationValue) => void;
};

type GeocodeHit = {
  label: string;
  latitude: number;
  longitude: number;
};

function MapView({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [map, center, zoom]);
  return null;
}

function ClickToSetMarker({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function BranchLocationField({ value, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const hasPin =
    value.latitude != null &&
    value.longitude != null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude);

  const center: [number, number] = useMemo(
    () => (hasPin ? [value.latitude!, value.longitude!] : DEFAULT_CENTER),
    [hasPin, value.latitude, value.longitude],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setHits([]);
      setSearchError("");
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const res = await fetch(
          `/api/admin/geocode?q=${encodeURIComponent(query.trim())}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setSearchError(
            typeof data.error === "string" ? data.error : "ค้นหาไม่สำเร็จ",
          );
          setHits([]);
          return;
        }
        setHits(data.results ?? []);
      } catch {
        setSearchError("ค้นหาไม่สำเร็จ");
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function fillAddressFromPin(lat: number, lng: number) {
    setResolvingAddress(true);
    try {
      const res = await fetch(
        `/api/admin/geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
      );
      const data = await res.json();
      if (res.ok && typeof data.address === "string" && data.address.trim()) {
        const current = valueRef.current;
        onChangeRef.current({
          ...current,
          latitude: Math.round(lat * 1e6) / 1e6,
          longitude: Math.round(lng * 1e6) / 1e6,
          address: data.address.trim(),
        });
      }
    } catch {
      /* keep pin; address stays as-is */
    } finally {
      setResolvingAddress(false);
    }
  }

  function setPin(
    lat: number,
    lng: number,
    options?: { address?: string; reverse?: boolean },
  ) {
    const nextLat = Math.round(lat * 1e6) / 1e6;
    const nextLng = Math.round(lng * 1e6) / 1e6;
    onChange({
      address: options?.address ?? value.address,
      latitude: nextLat,
      longitude: nextLng,
    });

    if (options?.reverse !== false && options?.address == null) {
      if (reverseTimer.current) clearTimeout(reverseTimer.current);
      reverseTimer.current = setTimeout(() => {
        void fillAddressFromPin(nextLat, nextLng);
      }, 280);
    }
  }

  function clearPin() {
    if (reverseTimer.current) clearTimeout(reverseTimer.current);
    onChange({
      address: value.address,
      latitude: null,
      longitude: null,
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={adminLabelClass}>ที่อยู่ร้าน (พิมพ์ได้เอง)</label>
        <textarea
          className={`${adminInputClass} min-h-[72px]`}
          value={value.address}
          onChange={(e) =>
            onChange({ ...value, address: e.target.value })
          }
          placeholder="บ้านเลขที่ ถนน แขวง/ตำบล จังหวัด — กรอกเองได้เสมอ"
          rows={3}
        />
        <p className="mt-1 text-xs text-gray-500">
          คลิกหรือลากหมุดบนแผนที่ แล้วระบบจะดึงที่อยู่ใกล้เคียงมาให้ (แก้เองได้)
          {resolvingAddress ? " · กำลังดึงที่อยู่..." : null}
        </p>
      </div>

      <div>
        <label className={adminLabelClass}>ค้นหาบนแผนที่ (ไม่บังคับ)</label>
        <input
          className={adminInputClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="พิมพ์ชื่อสถานที่ หรือที่อยู่เพื่อหาพิกัด"
        />
        {searching && (
          <p className="mt-1 text-xs text-gray-500">กำลังค้นหา...</p>
        )}
        {searchError && (
          <p className="mt-1 text-xs text-red-600">{searchError}</p>
        )}
        {hits.length > 0 && (
          <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white text-sm">
            {hits.map((h) => (
              <li key={`${h.latitude},${h.longitude},${h.label}`}>
                <button
                  type="button"
                  className="w-full cursor-pointer px-3 py-2 text-left hover:bg-gray-50"
                  onClick={() => {
                    setPin(h.latitude, h.longitude, {
                      address: h.label,
                      reverse: false,
                    });
                    setQuery("");
                    setHits([]);
                  }}
                >
                  {h.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <MapContainer
          center={center}
          zoom={hasPin ? 16 : 12}
          className="z-0 h-64 w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapView center={center} zoom={hasPin ? 16 : 12} />
          <ClickToSetMarker onPick={(lat, lng) => setPin(lat, lng)} />
          {hasPin && (
            <Marker
              position={[value.latitude!, value.longitude!]}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const p = m.getLatLng();
                  setPin(p.lat, p.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
        <p>
          {hasPin
            ? `พิกัด: ${value.latitude}, ${value.longitude}`
            : "ยังไม่ปักหมุด — คลิกบนแผนที่หรือค้นหาเพื่อตั้งจุด"}
        </p>
        <div className="flex gap-2">
          {hasPin && (
            <button type="button" className={btnOutline} onClick={clearPin}>
              ล้างพิกัด
            </button>
          )}
          {!hasPin && (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setPin(DEFAULT_CENTER[0], DEFAULT_CENTER[1])}
            >
              ปักหมุดที่กรุงเทพฯ
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
