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

const pinIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/** Distinct blue-ish pin for the store reference marker */
const referenceIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];

export type MapLocationValue = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

export type MapReferencePin = {
  latitude: number;
  longitude: number;
  label?: string;
};

type Props = {
  value: MapLocationValue;
  onChange: (next: MapLocationValue) => void;
  /** Called when address changes from geocode/suggest (useful to suggest zone name) */
  onSuggestLabel?: (label: string) => void;
  addressLabel?: string;
  addressPlaceholder?: string;
  referencePin?: MapReferencePin | null;
  mapHeightClassName?: string;
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

function shortLabel(label: string): string {
  const part = label.split(",")[0]?.trim();
  return part && part.length > 0 ? part.slice(0, 48) : label.slice(0, 48);
}

export function AdminMapLocationField({
  value,
  onChange,
  onSuggestLabel,
  addressLabel = "ที่อยู่ (พิมพ์ได้เอง)",
  addressPlaceholder = "บ้านเลขที่ ถนน แขวง/ตำบล จังหวัด — กรอกเองได้เสมอ",
  referencePin = null,
  mapHeightClassName = "h-64",
}: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GeocodeHit[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [resolvingAddress, setResolvingAddress] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reverseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const onSuggestLabelRef = useRef(onSuggestLabel);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    onSuggestLabelRef.current = onSuggestLabel;
  }, [onSuggestLabel]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!searchWrapRef.current?.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const hasPin =
    value.latitude != null &&
    value.longitude != null &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude);

  const hasReference =
    referencePin != null &&
    Number.isFinite(referencePin.latitude) &&
    Number.isFinite(referencePin.longitude);

  const center: [number, number] = useMemo(() => {
    if (hasPin) return [value.latitude!, value.longitude!];
    if (hasReference) return [referencePin!.latitude, referencePin!.longitude];
    return DEFAULT_CENTER;
  }, [
    hasPin,
    hasReference,
    value.latitude,
    value.longitude,
    referencePin,
  ]);

  const zoom = hasPin || hasReference ? 16 : 12;

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
        setSearchOpen(true);
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
        const addr = data.address.trim();
        const current = valueRef.current;
        onChangeRef.current({
          ...current,
          latitude: Math.round(lat * 1e6) / 1e6,
          longitude: Math.round(lng * 1e6) / 1e6,
          address: addr,
        });
        onSuggestLabelRef.current?.(shortLabel(addr));
      }
    } catch {
      /* keep pin */
    } finally {
      setResolvingAddress(false);
    }
  }

  function setPin(
    lat: number,
    lng: number,
    options?: { address?: string; reverse?: boolean; suggest?: boolean },
  ) {
    const nextLat = Math.round(lat * 1e6) / 1e6;
    const nextLng = Math.round(lng * 1e6) / 1e6;
    const nextAddress = options?.address ?? value.address;
    onChange({
      address: nextAddress,
      latitude: nextLat,
      longitude: nextLng,
    });
    if (options?.address && options.suggest !== false) {
      onSuggestLabel?.(shortLabel(options.address));
    }

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

  function pickHit(h: GeocodeHit) {
    setPin(h.latitude, h.longitude, {
      address: h.label,
      reverse: false,
      suggest: true,
    });
    setQuery("");
    setHits([]);
    setSearchOpen(false);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={adminLabelClass}>{addressLabel}</label>
        <textarea
          className={`${adminInputClass} min-h-[72px]`}
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder={addressPlaceholder}
          rows={3}
        />
        <p className="mt-1 text-xs text-slate-500">
          คลิกหรือลากหมุดบนแผนที่ แล้วระบบจะดึงที่อยู่ใกล้เคียงมาให้ (แก้เองได้)
          {resolvingAddress ? " · กำลังดึงที่อยู่..." : null}
        </p>
      </div>

      <div ref={searchWrapRef} className="relative">
        <label className={adminLabelClass}>ค้นหาที่อยู่ / สถานที่</label>
        <input
          className={adminInputClass}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => {
            if (hits.length > 0) setSearchOpen(true);
          }}
          placeholder="พิมพ์แล้วเลือกรายการด้านล่าง เพื่อย้ายหมุด"
          autoComplete="off"
          role="combobox"
          aria-expanded={searchOpen && hits.length > 0}
          aria-controls="admin-map-geocode-list"
        />
        {searching && (
          <p className="mt-1 text-xs text-slate-500">กำลังค้นหา...</p>
        )}
        {searchError && (
          <p className="mt-1 text-xs text-red-600">{searchError}</p>
        )}
        {searchOpen && hits.length > 0 && (
          <ul
            id="admin-map-geocode-list"
            role="listbox"
            className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg"
          >
            {hits.map((h) => (
              <li key={`${h.latitude},${h.longitude},${h.label}`} role="option">
                <button
                  type="button"
                  className="w-full cursor-pointer px-3 py-2.5 text-left text-slate-800 hover:bg-site-primary-soft"
                  onClick={() => pickHit(h)}
                >
                  {h.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasReference && (
        <p className="text-xs text-slate-500">
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-blue-600 align-middle" />
          จุดสีน้ำเงิน = ตำแหน่งร้านจากตั้งค่าสาขา
          {referencePin?.label ? ` (${referencePin.label})` : ""}
          {" · "}หมุดแดง = จุดของรายการนี้ (ลาก/คลิกได้)
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          center={center}
          zoom={zoom}
          className={`z-0 w-full ${mapHeightClassName}`}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapView center={center} zoom={zoom} />
          <ClickToSetMarker onPick={(lat, lng) => setPin(lat, lng)} />
          {hasReference && (
            <Marker
              position={[referencePin!.latitude, referencePin!.longitude]}
              icon={referenceIcon}
              interactive={false}
            />
          )}
          {hasPin && (
            <Marker
              position={[value.latitude!, value.longitude!]}
              icon={pinIcon}
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p>
          {hasPin
            ? `พิกัด: ${value.latitude}, ${value.longitude}`
            : "ยังไม่ปักหมุด — ค้นหา คลิกแผนที่ หรือใช้ตำแหน่งร้าน"}
        </p>
        <div className="flex flex-wrap gap-2">
          {hasPin && (
            <button type="button" className={btnOutline} onClick={clearPin}>
              ล้างพิกัด
            </button>
          )}
          {hasReference && (
            <button
              type="button"
              className={btnOutline}
              onClick={() =>
                setPin(referencePin!.latitude, referencePin!.longitude)
              }
            >
              ใช้ตำแหน่งร้าน
            </button>
          )}
          {!hasPin && !hasReference && (
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
