"use client";

import { useEffect, useState } from "react";
import {
  adminInputClass,
  adminLabelClass,
  btnDark,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

type Props = { branchId: string; onImported?: () => void };

type Preview = {
  code: string;
  branch: { id: string; name: string; code: string | null } | null;
  counts: {
    categories: number;
    optionGroups: number;
    menuItems: number;
    locations: number;
  };
};

export function BranchShareCopyPanel({ branchId, onImported }: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [myCode, setMyCode] = useState("");
  const [pasteCode, setPasteCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overwriteMenu, setOverwriteMenu] = useState(false);
  const [includeLocations, setIncludeLocations] = useState(false);
  const [busy, setBusy] = useState(false);

  async function loadMyCode() {
    const res = await fetch(`/api/admin/branches/${branchId}/share-code`);
    if (!res.ok) return;
    const data = await res.json();
    setMyCode(data.code ?? "");
  }

  useEffect(() => {
    loadMyCode();
  }, [branchId]);

  async function regenerate() {
    const ok = await confirm({
      title: "สร้างโค้ดใหม่?",
      message: "โค้ดเดิมจะใช้ไม่ได้แล้ว — คนที่มีโค้ดเก่าคัดลอกต่อไม่ได้",
      confirmLabel: "สร้างใหม่",
      tone: "primary",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/share-code`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้างโค้ดไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      setMyCode(data.code);
      toast.success("ได้โค้ดใหม่แล้ว");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!myCode) return;
    try {
      await navigator.clipboard.writeText(myCode);
      toast.success("คัดลอกโค้ดแล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ", "ลองคัดลอกจากช่องด้วยตนเอง");
    }
  }

  async function lookupPreview() {
    const code = pasteCode.trim().toUpperCase();
    if (!code) {
      toast.error("วางโค้ดก่อน");
      return;
    }
    setBusy(true);
    setPreview(null);
    try {
      const res = await fetch(
        `/api/admin/share/${encodeURIComponent(code)}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("หาโค้ดไม่เจอ", data.error ?? "ตรวจสอบโค้ดอีกครั้ง");
        return;
      }
      setPreview(data);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!preview) return;
    if (overwriteMenu) {
      const ok = await confirm({
        title: "ทับเมนูของสาขานี้?",
        message: "จะลบเมนูเดิมของสาขานี้ทั้งหมด แล้วใส่ชุดจากโค้ด",
        confirmLabel: "ทับเมนู",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/branches/${branchId}/import-share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: preview.code,
          overwriteMenu,
          includeLocations,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("นำเข้าไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(
        "นำเข้าแล้ว",
        `หมวดใหม่ ${data.categories} · ตัวเลือกใหม่ ${data.optionGroups} · เมนู ${data.menuItems}`,
      );
      setPreview(null);
      setPasteCode("");
      onImported?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-gray-900">
          คัดลอกข้อมูลสาขา
        </h3>
        <p className="mt-0.5 text-sm text-gray-600">
          แชร์โค้ดให้สาขาอื่น เพื่อนำเข้าหมวด ตัวเลือก และเมนูมาเป็นสำเนาในสาขานั้น
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">โค้ดของสาขานี้</p>
        <p className="mt-1 text-xs text-gray-500">
          คนอื่นเอาโค้ดนี้ไปวางที่สาขาของเขาเพื่อนำเข้าข้อมูลจากที่นี่
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-base font-semibold tracking-wide text-gray-900">
            {myCode || "—"}
          </code>
          <button
            type="button"
            className={btnPrimary}
            disabled={!myCode || busy}
            onClick={copyCode}
          >
            คัดลอก
          </button>
          <button
            type="button"
            className={btnOutline}
            disabled={busy}
            onClick={regenerate}
          >
            สร้างโค้ดใหม่
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">
          นำเข้าจากโค้ดสาขาอื่น
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <label className={adminLabelClass}>วางโค้ด</label>
            <input
              className={`${adminInputClass} font-mono uppercase`}
              value={pasteCode}
              onChange={(e) => setPasteCode(e.target.value.toUpperCase())}
              placeholder="HD-XXXXXX"
            />
          </div>
          <button
            type="button"
            className={btnDark}
            disabled={busy}
            onClick={lookupPreview}
          >
            ดูข้อมูล
          </button>
        </div>

        {preview && (
          <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-sm text-gray-800">
              จากสาขา{" "}
              <span className="font-semibold">
                {preview.branch?.name ?? "—"}
              </span>
            </p>
            <ul className="grid gap-1 text-sm text-gray-700 sm:grid-cols-2">
              <li>หมวดหมู่ {preview.counts.categories} รายการ</li>
              <li>หัวข้อตัวเลือก {preview.counts.optionGroups} รายการ</li>
              <li>เมนู {preview.counts.menuItems} รายการ</li>
              <li>พื้นที่จัดส่ง {preview.counts.locations} รายการ</li>
            </ul>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overwriteMenu}
                onChange={(e) => setOverwriteMenu(e.target.checked)}
              />
              ทับเมนูเดิมของสาขานี้ทั้งหมด
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeLocations}
                onChange={(e) => setIncludeLocations(e.target.checked)}
              />
              นำเข้าพื้นที่จัดส่งด้วย (ชื่อซ้ำจะข้าม)
            </label>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy}
              onClick={runImport}
            >
              ยืนยันนำเข้า
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
