"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  AdminPageHeader,
  adminCardClass,
  adminInputClass,
  adminLabelClass,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { IconPlus, IconTrash } from "@/components/icons";
import { DEFAULT_PACKAGE_LABEL_LAYOUT } from "@/lib/print-layout/package-label-default-layout";
import {
  PACKAGE_LABEL_FIELD_OPTIONS,
  PACKAGE_LABEL_TEMPLATE_HINTS,
  PACKAGE_LABEL_TEXT_STYLES,
} from "@/lib/print-layout/package-label-layout-field-options";
import { renderPackageLabelArticleFromLayout } from "@/lib/print-layout/package-label-layout-html";
import type {
  PackageLabelLayoutBlock,
  PackageLabelLayoutDoc,
  PackageLabelLayoutTextStyle,
} from "@/lib/print-layout/package-label-layout-types";
import type { BrandPackageLabelLayoutResponse } from "@/lib/print-layout/brand-package-label-layout";

type Props = {
  brandId: string;
  brandName?: string | null;
  backHref?: string;
  backLabel?: string;
};

function blockSummary(block: PackageLabelLayoutBlock): string {
  switch (block.type) {
    case "text":
      if (block.template) return `ข้อความ: ${block.template}`;
      return `ฟิลด์: ${block.field ?? "—"} (${block.style})`;
    case "barcode":
      return `บาร์โค้ด · ${block.field}`;
    case "qr":
      return `QR · ${block.field}`;
    case "spacer":
      return `ช่องว่าง ${block.height}px`;
    default:
      return "บล็อก";
  }
}

function createBlock(type: PackageLabelLayoutBlock["type"]): PackageLabelLayoutBlock {
  switch (type) {
    case "text":
      return {
        type: "text",
        template: "รหัสสินค้า: {{productCode}}",
        style: "row",
      };
    case "barcode":
      return {
        type: "barcode",
        field: "barcodeValue",
        width: 260,
        height: 50,
        showCaption: true,
        captionField: "barcodeValue",
      };
    case "qr":
      return { type: "qr", field: "qrPayload", size: 140 };
    case "spacer":
      return { type: "spacer", height: 8 };
  }
}

function sampleLabel(brandName?: string | null) {
  return {
    labelCode: "L-88001",
    qrPayload: "https://skillsale.app/label/demo",
    productName: "บร๊อคโคลีหั่นชิ้น",
    productCode: "88001234",
    brandName: brandName?.trim() || "Mala Wai Wai",
    sourceBranchName: "สาขาคลอง 6",
    quantity: 2,
    unit: "ถุง",
    producedAtLabel: "31/08/2026",
    lotNumber: "A-001",
  };
}

export function PackageLabelLayoutEditor({
  brandId,
  brandName,
  backHref,
  backLabel,
}: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverVersion, setServerVersion] = useState(1);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [layout, setLayout] = useState<PackageLabelLayoutDoc>(
    DEFAULT_PACKAGE_LABEL_LAYOUT,
  );
  const [savedLayout, setSavedLayout] = useState<PackageLabelLayoutDoc>(
    DEFAULT_PACKAGE_LABEL_LAYOUT,
  );
  const [previewHtml, setPreviewHtml] = useState("");
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  const dirty = useMemo(() => {
    return JSON.stringify(layout) !== JSON.stringify(savedLayout);
  }, [layout, savedLayout]);

  const loadLayout = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/brands/${brandId}/print-layouts/package-label`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "โหลดแบบป้ายไม่สำเร็จ",
        );
      }
      const data = (await res.json()) as BrandPackageLabelLayoutResponse;
      setLayout(data.layout);
      setSavedLayout(data.layout);
      setServerVersion(data.version);
      setUpdatedAt(data.updatedAt);
    } catch (error) {
      toast.error(
        "โหลดไม่สำเร็จ",
        error instanceof Error ? error.message : "กรุณาลองใหม่",
      );
    } finally {
      setLoading(false);
    }
  }, [brandId, toast]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  useEffect(() => {
    let cancelled = false;
    async function renderPreview() {
      const qrSvg = await QRCode.toString(
        sampleLabel(brandName).qrPayload,
        { type: "svg", margin: 1, width: 140 },
      );
      if (cancelled) return;
      const article = renderPackageLabelArticleFromLayout(
        layout,
        sampleLabel(brandName),
        qrSvg,
      );
      setPreviewHtml(article);
    }
    void renderPreview();
    return () => {
      cancelled = true;
    };
  }, [layout, brandName]);

  function patchBlock(index: number, patch: Partial<PackageLabelLayoutBlock>) {
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block, i) =>
        i === index ? ({ ...block, ...patch } as PackageLabelLayoutBlock) : block,
      ),
    }));
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= layout.blocks.length) return;
    setLayout((prev) => {
      const blocks = [...prev.blocks];
      const [item] = blocks.splice(index, 1);
      blocks.splice(next, 0, item);
      return { ...prev, blocks };
    });
    setExpandedIndex(next);
  }

  function removeBlock(index: number) {
    if (layout.blocks.length <= 1) {
      toast.error("ลบไม่ได้", "ต้องมีอย่างน้อย 1 บล็อก");
      return;
    }
    setLayout((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((_, i) => i !== index),
    }));
    setExpandedIndex((prev) => {
      if (prev == null) return null;
      if (prev === index) return Math.max(0, index - 1);
      if (prev > index) return prev - 1;
      return prev;
    });
  }

  function addBlock(type: PackageLabelLayoutBlock["type"]) {
    setLayout((prev) => ({
      ...prev,
      blocks: [...prev.blocks, createBlock(type)],
    }));
    setExpandedIndex(layout.blocks.length);
  }

  async function saveLayout() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/brands/${brandId}/print-layouts/package-label`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layout, bumpVersion: true }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "บันทึกไม่สำเร็จ",
        );
      }
      const payload = data as BrandPackageLabelLayoutResponse;
      setLayout(payload.layout);
      setSavedLayout(payload.layout);
      setServerVersion(payload.version);
      setUpdatedAt(payload.updatedAt);
      toast.success(`บันทึกแบบป้ายแล้ว · v${payload.version}`);
    } catch (error) {
      toast.error(
        "บันทึกไม่สำเร็จ",
        error instanceof Error ? error.message : "กรุณาลองใหม่",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    const ok = await confirm({
      title: "รีเซ็ตเป็นค่าเริ่มต้น?",
      message:
        "แบบป้ายจะกลับเป็น layout มาตรฐาน และ version จะเพิ่มขึ้นเมื่อบันทึก",
      confirmLabel: "รีเซ็ต",
      tone: "danger",
    });
    if (!ok) return;
    setLayout(structuredClone(DEFAULT_PACKAGE_LABEL_LAYOUT));
    setExpandedIndex(0);
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        กำลังโหลดแบบป้ายแพ็ก…
      </div>
    );
  }

  return (
    <div>
      <AdminPageHeader
        title="แบบป้ายแพ็ก"
        description="ปรับ layout ป้ายแพ็กสต๊อกระดับแบรนด์ — พนักงานและแอป SkillSale Print จะใช้แบบนี้โดยอัตโนมัติเมื่อ version เปลี่ยน"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {backHref ? (
              <a href={backHref} className={btnOutline}>
                {backLabel ?? "กลับ"}
              </a>
            ) : null}
            <button
              type="button"
              className={btnOutline}
              onClick={() => void resetToDefault()}
            >
              รีเซ็ตค่าเริ่มต้น
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={saving}
              onClick={() => void saveLayout()}
            >
              {saving ? "กำลังบันทึก…" : "บันทึกและเผยแพร่"}
            </button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">
          version {serverVersion}
        </span>
        {updatedAt ? (
          <span className="text-slate-500">
            อัปเดตล่าสุด{" "}
            {new Intl.DateTimeFormat("th-TH", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(updatedAt))}
          </span>
        ) : null}
        {dirty ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
            มีการแก้ไขที่ยังไม่บันทึก
          </span>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className={adminCardClass}>
            <h3 className="text-sm font-bold text-slate-900">ขนาดป้าย</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className={adminLabelClass}>ความกว้าง (px)</label>
                <input
                  type="number"
                  className={adminInputClass}
                  min={280}
                  max={600}
                  value={layout.widthPx}
                  onChange={(e) =>
                    setLayout((prev) => ({
                      ...prev,
                      widthPx: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div>
                <label className={adminLabelClass}>ระยะขอบซ้ายขวา (px)</label>
                <input
                  type="number"
                  className={adminInputClass}
                  min={0}
                  max={40}
                  value={layout.paddingH}
                  onChange={(e) =>
                    setLayout((prev) => ({
                      ...prev,
                      paddingH: Number(e.target.value),
                    }))
                  }
                />
              </div>
            </div>
          </section>

          <section className={adminCardClass}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  บล็อกบนป้าย ({layout.blocks.length})
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  เรียงจากบนลงล่าง · ใช้ปุ่มลูกศรเพื่อจัดลำดับ
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => addBlock("text")}
                >
                  <IconPlus size={14} className="mr-1 inline" />
                  ข้อความ
                </button>
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => addBlock("barcode")}
                >
                  <IconPlus size={14} className="mr-1 inline" />
                  บาร์โค้ด
                </button>
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => addBlock("qr")}
                >
                  <IconPlus size={14} className="mr-1 inline" />
                  QR
                </button>
                <button
                  type="button"
                  className={btnOutline}
                  onClick={() => addBlock("spacer")}
                >
                  <IconPlus size={14} className="mr-1 inline" />
                  ช่องว่าง
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {layout.blocks.map((block, index) => {
                const expanded = expandedIndex === index;
                return (
                  <div
                    key={`${block.type}-${index}`}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60"
                  >
                    <div className="flex w-full items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() =>
                          setExpandedIndex(expanded ? null : index)
                        }
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-bold text-slate-600 shadow-sm">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {block.type}
                          </span>
                          <span className="block truncate text-sm font-medium text-slate-900">
                            {blockSummary(block)}
                          </span>
                        </span>
                      </button>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                          onClick={() => moveBlock(index, -1)}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                          onClick={() => moveBlock(index, 1)}
                          disabled={index === layout.blocks.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-red-200 bg-white px-2 py-1 text-red-600 hover:bg-red-50"
                          onClick={() => void removeBlock(index)}
                        >
                          <IconTrash size={14} />
                        </button>
                      </span>
                    </div>

                    {expanded ? (
                      <div className="border-t border-slate-200 bg-white px-4 py-4">
                        <BlockFields
                          block={block}
                          onChange={(patch) => patchBlock(index, patch)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className={`${adminCardClass} text-sm text-slate-600`}>
            <p className="font-semibold text-slate-800">ตัวแปรที่ใช้ในข้อความ</p>
            <p className="mt-2">
              ใส่ในข้อความแบบ{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                {"{{productCode}}"}
              </code>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {PACKAGE_LABEL_FIELD_OPTIONS.map((field) => (
                <span
                  key={field.id}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                >
                  {`{{${field.id}}}`}
                </span>
              ))}
            </div>
          </section>
        </div>

        <aside className="xl:sticky xl:top-4 xl:self-start">
          <section className={adminCardClass}>
            <h3 className="text-sm font-bold text-slate-900">ตัวอย่างป้าย</h3>
            <p className="mt-1 text-xs text-slate-500">
              ข้อมูลตัวอย่าง — ป้ายจริงใช้ข้อมูลจากการรับเข้าแพ็ก
            </p>
            <div
              className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-inner"
              style={{ maxWidth: layout.widthPx / 2 }}
            >
              <div
                className="package-label-preview text-[#111]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
            <style jsx global>{`
              .package-label-preview .barcode svg {
                width: 100%;
                height: auto;
              }
              .package-label-preview .qr svg {
                width: 70px;
                height: 70px;
              }
            `}</style>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: PackageLabelLayoutBlock;
  onChange: (patch: Partial<PackageLabelLayoutBlock>) => void;
}) {
  if (block.type === "text") {
    const mode = block.template ? "template" : "field";
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={adminLabelClass}>รูปแบบข้อความ</label>
          <div className="flex flex-wrap gap-2">
            {(["field", "template"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                  mode === value
                    ? "border-site-primary bg-site-primary/10 text-site-primary"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                onClick={() => {
                  if (value === "field") {
                    onChange({
                      field: block.field ?? "productName",
                      template: undefined,
                    });
                  } else {
                    onChange({
                      template:
                        block.template ??
                        PACKAGE_LABEL_TEMPLATE_HINTS[0] ??
                        "รหัสสินค้า: {{productCode}}",
                      field: undefined,
                    });
                  }
                }}
              >
                {value === "field" ? "ใช้ฟิลด์" : "ใช้ข้อความแม่แบบ"}
              </button>
            ))}
          </div>
        </div>

        {mode === "field" ? (
          <div className="sm:col-span-2">
            <label className={adminLabelClass}>ฟิลด์</label>
            <select
              className={adminInputClass}
              value={block.field ?? "productName"}
              onChange={(e) => onChange({ field: e.target.value })}
            >
              {PACKAGE_LABEL_FIELD_OPTIONS.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className={adminLabelClass}>ข้อความแม่แบบ</label>
            <input
              className={adminInputClass}
              value={block.template ?? ""}
              onChange={(e) => onChange({ template: e.target.value })}
              placeholder="เช่น จำนวน: {{quantity}} {{unit}}"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PACKAGE_LABEL_TEMPLATE_HINTS.map((hint) => (
                <button
                  key={hint}
                  type="button"
                  className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
                  onClick={() => onChange({ template: hint })}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className={adminLabelClass}>สไตล์</label>
          <select
            className={adminInputClass}
            value={block.style}
            onChange={(e) =>
              onChange({
                style: e.target.value as PackageLabelLayoutTextStyle,
              })
            }
          >
            {PACKAGE_LABEL_TEXT_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={adminLabelClass}>จัดแนว</label>
          <select
            className={adminInputClass}
            value={block.align ?? "left"}
            onChange={(e) =>
              onChange({
                align: e.target.value as "left" | "center",
              })
            }
          >
            <option value="left">ซ้าย</option>
            <option value="center">กลาง</option>
          </select>
        </div>

        <div>
          <label className={adminLabelClass}>บรรทัดสูงสุด</label>
          <input
            type="number"
            className={adminInputClass}
            min={1}
            max={4}
            value={block.maxLines ?? ""}
            placeholder="ไม่จำกัด"
            onChange={(e) =>
              onChange({
                maxLines: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>

        <div>
          <label className={adminLabelClass}>ข้อความสำรอง</label>
          <input
            className={adminInputClass}
            value={block.fallback ?? ""}
            onChange={(e) =>
              onChange({ fallback: e.target.value || undefined })
            }
            placeholder="เมื่อฟิลด์ว่าง"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={Boolean(block.uppercase)}
            onChange={(e) => onChange({ uppercase: e.target.checked })}
          />
          ตัวพิมพ์ใหญ่ทั้งหมด
        </label>
      </div>
    );
  }

  if (block.type === "barcode") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={adminLabelClass}>ฟิลด์บาร์โค้ด</label>
          <select
            className={adminInputClass}
            value={block.field}
            onChange={(e) => onChange({ field: e.target.value })}
          >
            {PACKAGE_LABEL_FIELD_OPTIONS.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={adminLabelClass}>ความกว้าง</label>
          <input
            type="number"
            className={adminInputClass}
            min={80}
            max={400}
            value={block.width ?? 260}
            onChange={(e) => onChange({ width: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={adminLabelClass}>ความสูง</label>
          <input
            type="number"
            className={adminInputClass}
            min={24}
            max={120}
            value={block.height ?? 50}
            onChange={(e) => onChange({ height: Number(e.target.value) })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={block.showCaption ?? false}
            onChange={(e) => onChange({ showCaption: e.target.checked })}
          />
          แสดงตัวเลขใต้บาร์โค้ด
        </label>
        {block.showCaption ? (
          <div className="sm:col-span-2">
            <label className={adminLabelClass}>ฟิลด์คำบรรยาย</label>
            <select
              className={adminInputClass}
              value={block.captionField ?? block.field}
              onChange={(e) => onChange({ captionField: e.target.value })}
            >
              {PACKAGE_LABEL_FIELD_OPTIONS.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    );
  }

  if (block.type === "qr") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={adminLabelClass}>ฟิลด์ QR</label>
          <select
            className={adminInputClass}
            value={block.field}
            onChange={(e) => onChange({ field: e.target.value })}
          >
            {PACKAGE_LABEL_FIELD_OPTIONS.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            ปกติใช้ qrPayload — สแกนเพื่อจ่ายออกแพ็ก
          </p>
        </div>
        <div>
          <label className={adminLabelClass}>ขนาด (px)</label>
          <input
            type="number"
            className={adminInputClass}
            min={64}
            max={240}
            value={block.size ?? 140}
            onChange={(e) => onChange({ size: Number(e.target.value) })}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className={adminLabelClass}>ความสูงช่องว่าง (px)</label>
      <input
        type="number"
        className={adminInputClass}
        min={0}
        max={40}
        value={block.height}
        onChange={(e) => onChange({ height: Number(e.target.value) })}
      />
    </div>
  );
}
