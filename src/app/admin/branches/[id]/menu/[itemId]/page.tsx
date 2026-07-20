"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { IconBack, IconDelivery, IconPackage, IconStore, IconSkewerPlaceholder } from "@/components/icons";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
  adminSelectClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { ImageField } from "@/components/admin/ImageField";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import type { BranchOptionGroup } from "@/components/admin/BranchOptionLibrary";
import {
  resolveSellPrice,
  type MenuPricingFields,
} from "@/lib/menu-pricing";
import { serializeOptionGroup } from "@/lib/menu-option-groups";
import type { MenuOptionData } from "@/lib/customer-types";

type MenuItemDetail = {
  id: string;
  name: string;
  price: string;
  pickupPrice?: string | null;
  storefrontPrice?: string | null;
  sellDelivery?: boolean;
  sellPickup?: boolean;
  sellStorefront?: boolean;
  description: string | null;
  categoryId: string | null;
  category: { id: string; name: string; sortOrder: number } | null;
  imageUrl: string | null;
  isHidden: boolean;
  isOutOfStock: boolean;
  sortOrder: number;
  optionGroups: BranchOptionGroup[];
  optionGroupIds?: string[];
};

type MenuCategoryOption = {
  id: string;
  name: string;
  sortOrder: number;
};

type FormState = {
  name: string;
  price: string;
  pickupPrice: string;
  storefrontPrice: string;
  sellDelivery: boolean;
  sellPickup: boolean;
  sellStorefront: boolean;
  description: string;
  categoryId: string;
  imageUrl: string;
  isHidden: boolean;
  isOutOfStock: boolean;
};

const EMPTY_ITEM: MenuItemDetail = {
  id: "new",
  name: "",
  price: "",
  pickupPrice: null,
  storefrontPrice: null,
  sellDelivery: true,
  sellPickup: true,
  sellStorefront: true,
  description: null,
  categoryId: null,
  category: null,
  imageUrl: null,
  isHidden: false,
  isOutOfStock: false,
  sortOrder: 0,
  optionGroups: [],
  optionGroupIds: [],
};

const EMPTY_FORM: FormState = {
  name: "",
  price: "",
  pickupPrice: "",
  storefrontPrice: "",
  sellDelivery: true,
  sellPickup: true,
  sellStorefront: true,
  description: "",
  categoryId: "",
  imageUrl: "",
  isHidden: false,
  isOutOfStock: false,
};

const sectionClass = "rounded-xl border border-gray-200 bg-white p-4";

function formatBaht(n: number): string {
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function optionalPricePayload(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parseFloat(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** รายการที่ลูกค้าเห็น (รวมหัวข้อจากเมนู) สำหรับตัวอย่างในแอดมิน */
function previewOptionsForLibraryGroup(group: BranchOptionGroup): MenuOptionData[] {
  return serializeOptionGroup(
    group as Parameters<typeof serializeOptionGroup>[0],
  ).options as MenuOptionData[];
}

export default function MenuItemEditorPage() {
  const { id: branchId, itemId } = useParams<{
    id: string;
    itemId: string;
  }>();
  const router = useRouter();
  const toast = useToast();
  const { confirm } = useConfirm();
  const isCreate = itemId === "new";

  const [item, setItem] = useState<MenuItemDetail | null>(
    isCreate ? EMPTY_ITEM : null,
  );
  const [library, setLibrary] = useState<BranchOptionGroup[]>([]);
  const [categories, setCategories] = useState<MenuCategoryOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [shopCode, setShopCode] = useState<string | null>(null);

  function applyItem(data: MenuItemDetail) {
    setItem(data);
    const isHidden = data.isHidden;
    const isOutOfStock = isHidden ? false : data.isOutOfStock;
    setForm({
      name: data.name,
      price: data.price != null ? String(data.price) : "",
      pickupPrice:
        data.pickupPrice != null && String(data.pickupPrice) !== String(data.price)
          ? String(data.pickupPrice)
          : "",
      storefrontPrice:
        data.storefrontPrice != null &&
        String(data.storefrontPrice) !== String(data.price)
          ? String(data.storefrontPrice)
          : "",
      sellDelivery: data.sellDelivery !== false,
      sellPickup: data.sellPickup !== false,
      sellStorefront: data.sellStorefront !== false,
      description: data.description ?? "",
      categoryId: data.categoryId ?? "",
      imageUrl: data.imageUrl ?? "",
      isHidden,
      isOutOfStock,
    });
    const ids = data.optionGroupIds ?? data.optionGroups.map((g) => g.id);
    setSelectedGroupIds(ids);
  }

  async function loadLibrary() {
    const res = await fetch(`/api/admin/branches/${branchId}/option-groups`);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.ok) setLibrary(await res.json());
  }

  async function loadCategories() {
    const res = await fetch(`/api/admin/branches/${branchId}/categories`);
    if (res.ok) setCategories(await res.json());
  }

  async function loadShopCode() {
    const res = await fetch(`/api/admin/branches/${branchId}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      code?: string | null;
      brand?: { code?: string | null } | null;
    };
    setShopCode(data.code?.trim() || data.brand?.code?.trim() || null);
  }

  async function loadItem() {
    if (isCreate) {
      setItem(EMPTY_ITEM);
      setForm(EMPTY_FORM);
      setSelectedGroupIds([]);
      return;
    }
    const res = await fetch(
      `/api/admin/branches/${branchId}/menu-items/${itemId}`,
    );
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!res.ok) {
      toast.error("โหลดเมนูไม่สำเร็จ");
      return;
    }
    applyItem(await res.json());
  }

  useEffect(() => {
    loadLibrary();
    loadCategories();
    loadItem();
    loadShopCode();
  }, [branchId, itemId, router]);

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  }

  async function setChannelEnabled(
    key: "sellDelivery" | "sellPickup" | "sellStorefront",
    next: boolean,
  ) {
    if (next) {
      setForm((f) => ({ ...f, [key]: true }));
      return;
    }
    const labels = {
      sellDelivery: "จัดส่ง",
      sellPickup: "รับที่ร้าน",
      sellStorefront: "หน้าร้าน",
    } as const;
    const onlineNote =
      key === "sellStorefront"
        ? "ปิดราคาหน้าร้านนี้ไว้ (ยังไม่ใช้สั่งออนไลน์)"
        : `เมนูนี้จะไม่แสดงเมื่อลูกค้าเลือกช่องทาง "${labels[key]}"`;
    const ok = await confirm({
      title: `ปิดขายช่องทาง${labels[key]}?`,
      message: onlineNote,
      confirmLabel: "ปิดช่องทาง",
      cancelLabel: "ยกเลิก",
      tone: "danger",
    });
    if (!ok) return;
    setForm((f) => ({ ...f, [key]: false }));
  }

  const previewPricing = useMemo(() => {
    const delivery = parseFloat(form.price);
    if (!Number.isFinite(delivery) || delivery <= 0) return null;
    const fields: MenuPricingFields = {
      price: delivery,
      pickupPrice: optionalPricePayload(form.pickupPrice),
      storefrontPrice: optionalPricePayload(form.storefrontPrice),
    };
    return {
      delivery: resolveSellPrice(fields, "delivery"),
      pickup: resolveSellPrice(fields, "pickup"),
    };
  }, [form]);

  async function saveItem() {
    if (!form.name.trim()) {
      toast.error("กรอกชื่อเมนู");
      return;
    }
    const deliveryPrice = parseFloat(form.price);
    if (!form.price || Number.isNaN(deliveryPrice) || deliveryPrice <= 0) {
      toast.error("กรอกราคาเดลิเวอรี่");
      return;
    }
    if (!form.sellDelivery && !form.sellPickup && !form.sellStorefront) {
      toast.error("ต้องเปิดขายอย่างน้อย 1 ช่องทาง");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        price: deliveryPrice,
        pickupPrice: optionalPricePayload(form.pickupPrice),
        storefrontPrice: optionalPricePayload(form.storefrontPrice),
        sellDelivery: form.sellDelivery,
        sellPickup: form.sellPickup,
        sellStorefront: form.sellStorefront,
        description: form.description.trim() || null,
        categoryId: form.categoryId || null,
        imageUrl: form.imageUrl || null,
        isHidden: form.isHidden,
        isOutOfStock: form.isHidden ? false : form.isOutOfStock,
        optionGroupIds: selectedGroupIds,
      };

      const res = await fetch(
        isCreate
          ? `/api/admin/branches/${branchId}/menu-items`
          : `/api/admin/branches/${branchId}/menu-items/${itemId}`,
        {
          method: isCreate ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(isCreate ? "สร้างเมนูแล้ว" : "บันทึกแล้ว");
      router.push(`/admin/branches/${branchId}?tab=menu`);
    } finally {
      setSaving(false);
    }
  }

  async function saveAttachedGroups() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/menu-items/${itemId}/option-groups`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ groupIds: selectedGroupIds }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกการผูกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      applyItem(data);
      toast.success("อัปเดตหัวข้อของเมนูแล้ว");
    } finally {
      setSaving(false);
    }
  }

  if (!item) {
    return <AdminLoadingState />;
  }

  const attachedGroups = selectedGroupIds
    .map((id) => library.find((g) => g.id === id))
    .filter((g): g is BranchOptionGroup => Boolean(g));

  const optionsTabHref = `/admin/branches/${branchId}?tab=options`;
  const categoriesTabHref = `/admin/branches/${branchId}?tab=categories`;

  async function leaveTo(href: string) {
    const ok = await confirm({
      title: "ออกจากหน้านี้?",
      message:
        "ข้อมูลที่กรอกไว้ยังไม่ได้บันทึกอาจหายไปถ้าไปหน้าอื่น — ต้องการไปต่อหรือไม่?",
      confirmLabel: "ยืนยัน",
      cancelLabel: "ยกเลิก",
      tone: "primary",
    });
    if (!ok) return;
    router.push(href);
  }

  function renderOrderPreview(
    channelLabel: string,
    priced: NonNullable<typeof previewPricing>["delivery"] | null,
    enabled: boolean,
  ) {
    return (
      <div
        className={`flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)] ${
          !enabled ? "opacity-50" : ""
        }`}
      >
        <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl">
          {form.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-site-primary-soft">
              <IconSkewerPlaceholder size={40} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-slate-500">
            {channelLabel}
            {!enabled ? " · ปิดขาย" : ""}
          </p>
          <p className="truncate text-[15px] font-bold text-gray-900">
            {form.name.trim() || "ชื่อเมนู"}
          </p>
          {priced ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-sm font-bold text-site-primary">
                ฿{formatBaht(priced.final)}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400">กรอกราคาเดลิเวอรี่เพื่อดูตัวอย่าง</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/admin/branches/${branchId}?tab=menu`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          aria-label="กลับ"
        >
          <IconBack size={20} />
        </Link>
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {isCreate ? "เพิ่มเมนู" : "แก้ไขเมนู"}
          </h2>
          <p className="text-sm text-gray-500">
            {isCreate
              ? "ตั้งราคาตามช่องทาง"
              : item.name || "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className={sectionClass}>
            <h3 className="mb-3 font-semibold text-gray-900">ข้อมูลเมนู</h3>
            <div className="space-y-3">
              <div>
                <label className={adminLabelClass}>ชื่อเมนู</label>
                <input
                  className={adminInputClass}
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>คำอธิบาย</label>
                <textarea
                  className={adminInputClass}
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>หมวดหมู่</label>
                <select
                  className={adminSelectClass || adminInputClass}
                  value={form.categoryId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoryId: e.target.value }))
                  }
                >
                  <option value="">— ไม่ระบุ —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <ImageField
                label="รูปเมนู"
                value={form.imageUrl}
                onChange={(url) => setForm((f) => ({ ...f, imageUrl: url }))}
                shopCode={shopCode}
                folder="Products"
              />
              <div className="flex flex-wrap gap-2">
                <AdminToggle
                  checked={form.isHidden}
                  onChange={(next) =>
                    setForm((f) => ({
                      ...f,
                      isHidden: next,
                      isOutOfStock: next ? false : f.isOutOfStock,
                    }))
                  }
                  label="ซ่อนจากลูกค้า"
                  size="md"
                />
                <AdminToggle
                  checked={form.isOutOfStock}
                  onChange={(next) =>
                    setForm((f) => ({
                      ...f,
                      isOutOfStock: next,
                      isHidden: next ? false : f.isHidden,
                    }))
                  }
                  label="หมดชั่วคราว"
                  size="md"
                />
              </div>
              <p className="text-xs text-slate-500">
                เลือกได้อย่างใดอย่างหนึ่ง — เปิดอันหนึ่งจะปิดอีกอันให้อัตโนมัติ
              </p>
            </div>
          </section>

          <section className={sectionClass}>
            <h3 className="mb-1 font-semibold text-gray-900">ราคาตามช่องทาง</h3>
            <p className="mb-3 text-sm text-gray-500">
              ถ้าไม่ใส่ราคา「รับที่ร้าน」หรือ「หน้าร้าน」ระบบจะใช้ราคาเดลิเวอรี่ให้อัตโนมัติ
            </p>
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <IconDelivery size={16} className="text-green-600" />
                    เดลิเวอรี่
                  </p>
                  <AdminToggle
                    checked={form.sellDelivery}
                    onChange={(next) =>
                      void setChannelEnabled("sellDelivery", next)
                    }
                    label="ขายช่องนี้"
                    size="sm"
                  />
                </div>
                <label className={adminLabelClass}>ราคา (บาท) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={adminInputClass}
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, price: e.target.value }))
                  }
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    <IconPackage size={16} className="text-sky-600" />
                    รับที่ร้าน
                  </p>
                  <AdminToggle
                    checked={form.sellPickup}
                    onChange={(next) =>
                      void setChannelEnabled("sellPickup", next)
                    }
                    label="ขายช่องนี้"
                    size="sm"
                  />
                </div>
                <label className={adminLabelClass}>ราคา (บาท)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={adminInputClass}
                  value={form.pickupPrice}
                  placeholder="ว่าง = เท่าเดลิเวอรี่"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, pickupPrice: e.target.value }))
                  }
                />
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                      <IconStore size={16} className="text-amber-800" />
                      หน้าร้าน
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      เก็บราคาอ้างอิง — ยังไม่เปิดสั่งออนไลน์
                    </p>
                  </div>
                  <AdminToggle
                    checked={form.sellStorefront}
                    onChange={(next) =>
                      void setChannelEnabled("sellStorefront", next)
                    }
                    label="ใช้งาน"
                    size="sm"
                  />
                </div>
                <label className={adminLabelClass}>ราคา (บาท)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={adminInputClass}
                  value={form.storefrontPrice}
                  placeholder="ว่าง = เท่าเดลิเวอรี่"
                  onChange={(e) =>
                    setForm((f) => ({ ...f, storefrontPrice: e.target.value }))
                  }
                />
              </div>
            </div>
          </section>

          <button
            type="button"
            disabled={saving}
            onClick={saveItem}
            className={btnPrimary}
          >
            {isCreate ? "สร้างเมนู" : "บันทึกเมนู"}
          </button>
        </div>

        <div className="space-y-6">
          <section className={sectionClass}>
            <h3 className="mb-1 font-semibold text-gray-900">
              ตัวอย่างฝั่งออเดอร์
            </h3>
            <p className="mb-3 text-sm text-gray-500">
              ดูว่าลูกค้าจะเห็นราคาและป้ายลดอย่างไร (ตัวเลือกไม่ถูกลด)
            </p>
            <div className="space-y-2">
              {renderOrderPreview(
                "จัดส่ง",
                previewPricing?.delivery ?? null,
                form.sellDelivery,
              )}
              {renderOrderPreview(
                "รับที่ร้าน",
                previewPricing?.pickup ?? null,
                form.sellPickup,
              )}
            </div>
          </section>

          <section className={sectionClass}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">ใช้กับเมนูนี้</h3>
                <p className="mt-0.5 text-sm text-gray-500">
                  ติ๊กหัวข้อจากคลัง — สร้าง/แก้ที่แท็บตัวเลือกของสาขา
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => leaveTo(categoriesTabHref)}
                >
                  หมวดหมู่
                </button>
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => leaveTo(optionsTabHref)}
                >
                  คลังตัวเลือก
                </button>
              </div>
            </div>

            {library.length === 0 ? (
              <p className="text-sm text-gray-500">
                ยังไม่มีหัวข้อในคลัง —{" "}
                <Link
                  href={optionsTabHref}
                  className="text-site-primary hover:underline"
                >
                  ไปสร้างที่แท็บตัวเลือก
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {library.map((group) => {
                  const on = selectedGroupIds.includes(group.id);
                  return (
                    <label
                      key={group.id}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                        on
                          ? "border-site-primary-soft bg-site-primary-soft text-site-primary"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() => toggleGroup(group.id)}
                      />
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                          on
                            ? "border-site-primary bg-site-primary text-white"
                            : "border-gray-300 bg-white"
                        }`}
                        aria-hidden
                      >
                        {on ? "✓" : ""}
                      </span>
                      {group.name}
                      {group.required ? (
                        <span className="text-red-500">*</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}

            {isCreate && attachedGroups.length > 0 && (
              <p className="mt-3 text-xs text-amber-800">
                หัวข้อที่เลือกจะถูกผูกเมื่อกด “สร้างเมนู”
              </p>
            )}

            {!isCreate && (
              <button
                type="button"
                disabled={saving}
                className={`mt-3 ${btnOutline}`}
                onClick={saveAttachedGroups}
              >
                บันทึกหัวข้อที่ใช้กับเมนูนี้
              </button>
            )}
          </section>

          <section className={sectionClass}>
            <h3 className="mb-1 font-semibold text-gray-900">
              ตัวอย่างตัวเลือก
            </h3>
            <p className="mb-3 text-sm text-gray-500">
              ราคาตัวเลือกแยกจากราคาเมนู
            </p>

            {attachedGroups.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                ยังไม่ได้เลือกหัวข้อ — ติ๊กด้านบนเพื่อดูตัวอย่าง
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
                {attachedGroups.map((group, gi) => {
                  const previewOptions = previewOptionsForLibraryGroup(group);
                  const min = group.minSelect ?? 0;
                  const max = group.maxSelect;
                  const fromMenu = group.mode === "FROM_MENU";
                  const isSingle = max <= 1 && min <= 1;
                  const selectionHint = fromMenu
                    ? min === max && min > 0
                      ? `เลือกให้ครบ ${min} รายการ (เลือกซ้ำได้)`
                      : `เลือกได้สูงสุด ${max}`
                    : !isSingle
                      ? `เลือกได้สูงสุด ${max}`
                      : null;
                  return (
                    <div
                      key={group.id}
                      className={gi > 0 ? "border-t border-gray-100" : ""}
                    >
                      <div className="px-4 pb-1 pt-4">
                        <p className="text-[15px] font-bold text-orange-500">
                          {group.name}
                          {group.required ? (
                            <span className="ml-0.5 text-orange-400">*</span>
                          ) : (
                            <span className="text-sm font-normal text-gray-400">
                              {" "}
                              (ไม่บังคับ)
                            </span>
                          )}
                        </p>
                        {!isSingle && selectionHint ? (
                          <p className="mt-0.5 text-xs text-gray-400">
                            {selectionHint}
                          </p>
                        ) : null}
                        {fromMenu ? (
                          <p className="mt-0.5 text-xs text-site-primary">
                            จากรายการเมนูในคลังตัวเลือก
                          </p>
                        ) : null}
                      </div>
                      <ul className="pb-2">
                        {previewOptions.length === 0 ? (
                          <li className="px-4 py-3 text-sm text-gray-400">
                            {fromMenu
                              ? "ยังไม่ได้เลือกเมนูในคลังตัวเลือก — ไปติ๊กเมนูที่แท็บตัวเลือก"
                              : "หัวข้อนี้ยังไม่มีรายการ — ไปเพิ่มที่คลังตัวเลือก"}
                          </li>
                        ) : (
                          previewOptions.map((opt) => (
                            <li
                              key={opt.id}
                              className="flex w-full items-center gap-3 px-4 py-3 text-left"
                            >
                              {opt.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={opt.imageUrl}
                                  alt=""
                                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                                />
                              ) : fromMenu ? (
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-site-primary-soft">
                                  <IconSkewerPlaceholder size={28} />
                                </div>
                              ) : null}
                              <span className="min-w-0 flex-1">
                                <span className="text-[15px] text-gray-800">
                                  {opt.name}
                                </span>
                                {Number(opt.priceDelta) > 0 && (
                                  <span className="ml-1.5 text-[15px] font-medium text-orange-500">
                                    +฿
                                    {Number(opt.priceDelta).toLocaleString(
                                      "th-TH",
                                    )}
                                  </span>
                                )}
                              </span>
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center border border-gray-300 ${
                                  isSingle ? "rounded-full" : "rounded"
                                }`}
                                aria-hidden
                              />
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
