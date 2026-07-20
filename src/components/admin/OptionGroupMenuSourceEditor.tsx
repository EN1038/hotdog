"use client";

import { useEffect, useMemo, useState } from "react";
import { adminInputClass, btnOutline, btnPrimary } from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";

type MenuRow = {
  id: string;
  name: string;
  isHidden?: boolean;
  category?: { id: string; name: string; sortOrder: number } | null;
};

type Props = {
  branchId: string;
  groupId: string;
  enabledIds: string[];
  onSaved: () => void;
};

export function OptionGroupMenuSourceEditor({
  branchId,
  groupId,
  enabledIds,
  onSaved,
}: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<MenuRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(enabledIds));
  }, [enabledIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/branches/${branchId}/menu-items`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const grouped = useMemo(() => {
    const byCat = new Map<string, MenuRow[]>();
    const order = new Map<string, number>();
    for (const item of items) {
      if (item.isHidden) continue;
      const cat = item.category?.name ?? "อื่นๆ";
      if (!byCat.has(cat)) {
        byCat.set(cat, []);
        order.set(cat, item.category?.sortOrder ?? 999);
      }
      byCat.get(cat)!.push(item);
    }
    return [...byCat.keys()]
      .sort((a, b) => (order.get(a)! - order.get(b)!) || a.localeCompare(b, "th"))
      .map((name) => ({ name, items: byCat.get(name)! }));
  }, [items]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(items.filter((i) => !i.isHidden).map((i) => i.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/option-groups/${groupId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ menuItemIds: [...selected] }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกรายการเมนูไม่สำเร็จ", data.error);
        return;
      }
      toast.success("อัปเดตรายการเมนูในตัวเลือกแล้ว");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">กำลังโหลดเมนู…</p>;
  }

  return (
    <div className="mt-3 rounded-lg border border-dashed border-site-primary/40 bg-site-primary-soft/30 p-3">
      <p className="text-sm font-semibold text-gray-900">รายการเมนูในตัวเลือก</p>
      <p className="mt-0.5 text-xs text-gray-600">
        เลือกเมนูที่ลูกค้าสามารถเลือกได้ในหัวข้อนี้ (เลือกซ้ำได้ตามจำนวนที่กำหนด)
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={btnOutline} onClick={selectAllVisible}>
          เลือกทั้งหมด
        </button>
        <button type="button" className={btnOutline} onClick={clearAll}>
          ล้าง
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={saving}
          onClick={save}
        >
          {saving ? "กำลังบันทึก…" : `บันทึก (${selected.size} รายการ)`}
        </button>
      </div>
      <div className="mt-3 max-h-64 space-y-3 overflow-y-auto">
        {grouped.map((g) => (
          <div key={g.name}>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {g.name}
            </p>
            <ul className="mt-1 space-y-1">
              {g.items.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/80">
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="text-sm text-gray-900">{item.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
