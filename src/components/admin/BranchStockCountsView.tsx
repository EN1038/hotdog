"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toPng } from "html-to-image";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import { DateInput } from "@/components/DateInput";
import { AdminCreateStockCountSheet } from "@/components/admin/AdminCreateStockCountSheet";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { bangkokDateKey } from "@/lib/constants";

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function formatBangkokDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type CountLine = {
  id: string;
  systemQty: number;
  countedQty: number;
  varianceReason: string | null;
  product: {
    name: string;
    stockType: string;
    unit: string;
  };
};

type Count = {
  id: string;
  name: string;
  status?: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  completedAt: string | null;
  createdAt?: string;
  note: string | null;
  createdByStaff: { name: string } | null;
  createdByAdmin: { username: string } | null;
  lines: CountLine[];
};

type DayItemActivity = {
  name: string;
  soldQty: number;
  restockQty: number;
  wasteQty: number;
  issueQty: number;
};

type DayActivity = {
  date: string;
  items: DayItemActivity[];
};

type DisplayLine = {
  id: string;
  name: string;
  systemQty: number;
  countedQty: number;
};

type LineDiagnosis = {
  code: string;
  /** สถานการณ์สั้นๆ อ่านเร็ว */
  label: string;
  /** ความเป็นไปได้ */
  cause: string;
  /** แนวทางแก้ / บริหาร */
  action: string;
  tone: "rose" | "amber" | "sky" | "slate";
  severity: "high" | "medium" | "low";
};

type FinancialData = {
  stockType?: "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";
  source?: "ADMIN" | "STAFF" | string;
  cash?: number;
  transfer?: number;
  change?: number;
  customers?: number;
  pendingAdminApply?: boolean;
  lines?: Array<{
    menuItemId?: string;
    name: string;
    systemQty: number;
    countedQty: number;
  }>;
};

type StatusFilter = "ALL" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type TypeFilter = "ALL" | "SALE_ITEM" | "CONSUMABLE" | "EQUIPMENT";

const STOCK_TYPE_LABEL: Record<string, string> = {
  SALE_ITEM: "เมนูขาย",
  CONSUMABLE: "ของสิ้นเปลือง",
  EQUIPMENT: "อุปกรณ์",
};

function statusTone(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-amber-50 text-amber-950 ring-amber-300";
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-800 ring-emerald-200";
    case "CANCELLED":
      return "bg-slate-100 text-slate-600 ring-slate-200";
    default:
      return "bg-slate-50 text-slate-700 ring-slate-200";
  }
}

function statusDot(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "bg-amber-500 animate-pulse";
    case "COMPLETED":
      return "bg-emerald-500";
    case "CANCELLED":
      return "bg-slate-400";
    default:
      return "bg-slate-400";
  }
}

function displayStatusLabel(
  status: string,
  financial: FinancialData | null,
  stockType: string,
  createdByAdmin: boolean,
) {
  if (status === "IN_PROGRESS") {
    if (createdByAdmin || financial?.source === "ADMIN") {
      return "รอ Convert · แอดมิน";
    }
    return "รอ Convert · หน้าร้าน";
  }
  if (status === "CANCELLED") return "ปฏิเสธแล้ว";
  if (status === "COMPLETED") {
    if (stockType === "SALE_ITEM" && financial?.pendingAdminApply === false) {
      return "Convert แล้ว";
    }
    if (
      stockType === "SALE_ITEM" &&
      financial?.pendingAdminApply == null &&
      !financial?.lines?.some((l) => l.menuItemId)
    ) {
      return "ระบบเก่า (ปรับแล้ว)";
    }
    if (financial?.source === "ADMIN" && stockType !== "SALE_ITEM") {
      return "แอดมินปรับแล้ว";
    }
    return stockType === "SALE_ITEM" ? "Convert แล้ว" : "บันทึกแล้ว";
  }
  return status;
}

function inferCountStockType(
  name: string,
  financial: FinancialData | null,
): string {
  if (
    financial?.stockType === "SALE_ITEM" ||
    financial?.stockType === "CONSUMABLE" ||
    financial?.stockType === "EQUIPMENT"
  ) {
    return financial.stockType;
  }
  if (name.includes("ของสิ้นเปลือง")) return "CONSUMABLE";
  if (name.includes("อุปกรณ์")) return "EQUIPMENT";
  return "SALE_ITEM";
}

function parseFinancial(note: string | null): FinancialData | null {
  if (!note || !note.startsWith("{")) return null;
  try {
    return JSON.parse(note) as FinancialData;
  } catch {
    return null;
  }
}

function getDisplayLines(
  count: Count,
  stockType: string,
  includesSales: boolean,
): DisplayLine[] {
  const financialData = parseFinancial(count.note);
  if (financialData?.lines && financialData.lines.length > 0) {
    return financialData.lines.map((l, i) => ({
      id: `note-${i}`,
      name: l.name,
      systemQty: l.systemQty,
      countedQty: l.countedQty,
    }));
  }
  return count.lines
    .filter((l) =>
      includesSales
        ? l.product.stockType === "SALE_ITEM"
        : l.product.stockType === stockType,
    )
    .map((l) => ({
      id: l.id,
      name: l.product.name,
      systemQty: l.systemQty,
      countedQty: l.countedQty ?? 0,
    }));
}

function emptyActivity(): Omit<DayItemActivity, "name"> {
  return { soldQty: 0, restockQty: 0, wasteQty: 0, issueQty: 0 };
}

function activityByNameMap(day: DayActivity | null) {
  const map = new Map<string, Omit<DayItemActivity, "name">>();
  for (const item of day?.items ?? []) {
    map.set(item.name.trim(), {
      soldQty: item.soldQty,
      restockQty: item.restockQty,
      wasteQty: item.wasteQty,
      issueQty: item.issueQty,
    });
  }
  return map;
}

/**
 * วิเคราะห์ผลต่างสำหรับผู้บริหาร/หัวหน้าสาขา
 * เวิร์กโฟลว์: รับเข้า → ขาย (คีย์ทีหลังได้ ผิดเมนูได้) → ของเสีย → นับปิดร้าน
 * ยอดนับ = คงเหลือจริง | ระบบ = ตามที่คีย์ไว้
 */
function diagnoseVarianceLine(
  line: DisplayLine,
  activity: Omit<DayItemActivity, "name">,
  context: { likelyMiskeyDay: boolean },
): LineDiagnosis | null {
  const diff = line.countedQty - line.systemQty;
  if (diff === 0) return null;

  const short = diff < 0 ? -diff : 0;
  const over = diff > 0 ? diff : 0;
  const sold = activity.soldQty;
  const waste = activity.wasteQty;
  const restock = activity.restockQty;
  const outflow = sold + waste;

  if (short > 0) {
    if (sold === 0 && waste === 0) {
      if (context.likelyMiskeyDay) {
        return {
          code: "short_no_sale_on_sku",
          label: "น่าจะคีย์ขายผิดเมนู",
          cause: `ชั้นเหลือ ${line.countedQty} ระบบคิด ${line.systemQty} (ขาด ${short}) — วันนี้มีขาด/เกินชดเชยกันหลายรายการ มักเกิดตอนคีย์ขายทีหลังผิดชื่อ`,
          action:
            "อย่าสรุปของหายก่อน · หาคู่เมนูที่เกินในตารางเดียวกัน · Convert ตามยอดนับ",
          tone: "amber",
          severity: "medium",
        };
      }
      return {
        code: "short_no_sale_on_sku",
        label: "ของออกจากชั้น — ระบบไม่รู้",
        cause: `ขาด ${short} ทั้งระบบไม่มีขาย/จ่ายเมนูนี้ — เป็นไปได้: คีย์ขายคนละเมนู · ของเสียไม่บันทึก · ของหาย · นับต่ำ`,
        action:
          "ถามพนักงานว่าออกทางไหน · ถ้าเสียให้คีย์จ่าย · ปิดงวดด้วย Convert ตามนับ",
        tone: "amber",
        severity: short >= 10 ? "high" : "medium",
      };
    }
    if (sold > 0) {
      const nearSold =
        Math.abs(short - sold) <= Math.max(2, Math.round(sold * 0.2));
      if (nearSold) {
        return {
          code: "short_vs_system_left",
          label: "ตัดขายแล้วยังเหลือในระบบ",
          cause: `ขาด ${short} ใกล้ยอดขายคีย์ (${sold}) — ตัดสต๊อกไม่ครบ หรือนับชั้นไม่ครบ`,
          action:
            "ทวนนับ 1 รอบ · ถ้ายังขาด Convert ตามนับ แล้วไล่บิลขาย",
          tone: "rose",
          severity: short >= 10 ? "high" : "medium",
        };
      }
    }
    if (short > outflow + 2) {
      return {
        code: "short_beyond_keyed",
        label: "ขาดเกินที่คีย์อธิบายได้",
        cause: `ขาด ${short} แต่ระบบตัดขาย+จ่ายแค่ ${outflow} — ของออกจริงมากกว่าที่บันทึก`,
        action:
          "ไล่ของเสีย+บิลขายที่ค้าง · Convert ตามนับเพื่อให้คงเหลือตรงชั้น",
        tone: "rose",
        severity: "high",
      };
    }
    return {
      code: "short_other",
      label: "นับน้อยกว่าระบบ",
      cause: `ขาด ${short} (ขายคีย์ ${sold} · จ่าย/เสีย ${waste}) — เบี่ยงเบนทั่วไป อาจนับคลาด`,
      action: "ทวนนับเมนูนี้ · ถ้าถือว่ายอดนับถูก → Convert ตามนับ",
      tone: "rose",
      severity: short >= 10 ? "high" : "low",
    };
  }

  if (over > 0) {
    if (sold > 0 && restock === 0) {
      return {
        code: "over_system_cut_sku",
        label: context.likelyMiskeyDay
          ? "น่าจะคีย์ขายเกินเมนูนี้"
          : "ระบบตัดสต๊อกเกิน",
        cause: context.likelyMiskeyDay
          ? `เกิน ${over} ทั้งมีขายคีย์ ${sold} — มักคีย์เมนูนี้แทนเมนูอื่นตอนทีหลัง`
          : `เกิน ${over} ทั้งระบบตัดขาย ${sold} — ตัดเกินจริง หรือนับสูง`,
        action: context.likelyMiskeyDay
          ? "เทียบเมนูที่ขาดคู่กัน · Convert ตามนับ · เตือนทีมคีย์ชื่อเมนู"
          : "ทวนนับ · ถ้าชั้นถูก → Convert ตามนับ",
        tone: "sky",
        severity: over >= 10 ? "high" : "medium",
      };
    }
    if (restock === 0 && sold === 0) {
      return {
        code: "over_no_restock",
        label: "รับเข้าไม่ลง / นับสูง",
        cause: `เกิน ${over} โดยไม่มีเติมและไม่มีขายเมนูนี้วันนี้ — อาจรับของแล้วยังไม่คีย์ หรือนับมาก`,
        action:
          "ถามว่าวันนี้เติมหรือไม่ · ถ้ามีให้คีย์รับเข้า · ไม่มีให้ทวนนับแล้ว Convert",
        tone: "sky",
        severity: over >= 10 ? "high" : "medium",
      };
    }
    if (restock > 0 && over <= restock + 2) {
      return {
        code: "over_near_restock",
        label: "ใกล้เคียงยอดเติม",
        cause: `เกิน ${over} ใกล้ยอดเติมวันนี้ (${restock}) — จังหวะรับเข้ากับระบบอาจไม่ตรงรอบ`,
        action: "เช็คประวัติเติม · ทวนนับ · Convert ตามนับ",
        tone: "slate",
        severity: "low",
      };
    }
    return {
      code: "over_other",
      label: "นับมากกว่าระบบ",
      cause: `เกิน ${over} (เติม ${restock} · ขายคีย์ ${sold}) — ชั้นมีมากกว่าที่ระบบคิด`,
      action: "ทวนนับ 1 รอบ · ถ้าชั้นถูก → Convert ตามนับ",
      tone: "sky",
      severity: over >= 10 ? "medium" : "low",
    };
  }

  return null;
}

function buildVarianceInsights(
  lines: DisplayLine[],
  activityMap: Map<string, Omit<DayItemActivity, "name">>,
  financial: FinancialData | null,
) {
  let shortQty = 0;
  let overQty = 0;
  let shortCount = 0;
  let overCount = 0;
  let matchCount = 0;
  let systemTotal = 0;
  let countedTotal = 0;

  for (const line of lines) {
    const diff = line.countedQty - line.systemQty;
    systemTotal += line.systemQty;
    countedTotal += line.countedQty;
    if (diff === 0) {
      matchCount += 1;
      continue;
    }
    if (diff < 0) {
      shortCount += 1;
      shortQty += -diff;
    } else {
      overCount += 1;
      overQty += diff;
    }
  }

  let daySold = 0;
  let dayRestock = 0;
  let dayWaste = 0;
  for (const v of activityMap.values()) {
    daySold += v.soldQty;
    dayRestock += v.restockQty;
    dayWaste += v.wasteQty;
  }

  const gross = shortQty + overQty;
  const net = overQty - shortQty;
  const likelyMiskeyDay =
    shortCount >= 2 &&
    overCount >= 2 &&
    gross >= 4 &&
    Math.abs(net) <= Math.max(2, Math.round(gross * 0.25));

  let situation = "ยอดนับกับระบบไม่ตรงบางรายการ";
  if (matchCount === lines.length) {
    situation = "ปิดร้านเรียบร้อย — ระบบกับนับตรงกัน";
  } else if (likelyMiskeyDay) {
    situation =
      "ลักษณะคีย์ขายสลับเมนู — ขาดกับเกินชดเชยกัน ตัวเลขรวมยังใกล้เคียง";
  } else if (net <= -3 && shortQty >= overQty * 2) {
    situation =
      "ของบนชั้นน้อยกว่าระบบเป็นหลัก — ออกเกินที่บันทึก หรือนับต่ำ";
  } else if (net >= 3 && overQty >= shortQty * 2) {
    situation =
      "ของบนชั้นมากกว่าระบบเป็นหลัก — รับเข้าไม่ครบในระบบ หรือนับสูง";
  } else if (shortCount > 0 && overCount > 0) {
    situation =
      "มีทั้งขาดและเกิน — อาจคีย์ผิดบางเมนูร่วมกับการเคลื่อนไหวจริง";
  }

  const actions: string[] = [];
  if (likelyMiskeyDay) {
    actions.push(
      "อย่าสรุปของหายทั้งก้อน — ไล่คู่เมนูขาดกับเมนูเกินในตาราง",
    );
    actions.push("ทบทวนทีม: คีย์ขายทีหลังต้องเลือกชื่อเมนูให้ตรงของจริง");
  } else if (net <= -3 && shortQty >= overQty * 2) {
    actions.push("ไล่ของเสีย/บิลขายที่ยังไม่คีย์ — ถามว่าของขาดไปทางไหน");
  } else if (net >= 3 && overQty >= shortQty * 2) {
    actions.push("เช็คประวัติเติมวันนี้ — รับเข้าค้างให้คีย์ให้ครบ");
  } else {
    actions.push("ไล่รายการจากผลต่างมากไปน้อยในคอลัมน์ “แนวทาง”");
  }
  actions.push(
    "ปิดงวด: Convert ตามยอดนับ — ใช้ยอดนับเป็นคงเหลือจริงหลังปิดร้าน",
  );
  if (
    financial &&
    ((financial.cash ?? 0) + (financial.transfer ?? 0) > 0 ||
      (financial.customers ?? 0) > 0)
  ) {
    const money = (financial.cash ?? 0) + (financial.transfer ?? 0);
    actions.push(
      `เงินปิดวัน ฿${money.toLocaleString("th-TH")} ใช้ยืนยันว่ายอดขาย “เงิน” โอเค แยกจากปัญหาชื่อเมนู`,
    );
  }

  const facts = [
    `นับรวม ${countedTotal.toLocaleString("th-TH")} · ระบบรวม ${systemTotal.toLocaleString("th-TH")} · ผลต่างสุทธิ ${net > 0 ? "+" : ""}${net.toLocaleString("th-TH")}`,
    `วันนี้: ขายที่คีย์ ${daySold.toLocaleString("th-TH")} · เติม ${dayRestock.toLocaleString("th-TH")} · จ่าย/เสีย ${dayWaste.toLocaleString("th-TH")}`,
    `ผลต่าง: ขาด ${shortCount} รายการ (−${shortQty.toLocaleString("th-TH")}) · เกิน ${overCount} รายการ (+${overQty.toLocaleString("th-TH")})`,
  ];

  const diagnoses: Array<LineDiagnosis & { name: string; diff: number }> = [];
  for (const line of lines) {
    const diff = line.countedQty - line.systemQty;
    if (diff === 0) continue;
    const act = activityMap.get(line.name.trim()) ?? emptyActivity();
    const d = diagnoseVarianceLine(line, act, { likelyMiskeyDay });
    if (!d) continue;
    diagnoses.push({ ...d, name: line.name, diff });
  }

  const severityRank = { high: 0, medium: 1, low: 2 } as const;
  const rank: Record<string, number> = {
    short_beyond_keyed: 0,
    short_vs_system_left: 1,
    short_no_sale_on_sku: 2,
    over_system_cut_sku: 3,
    over_no_restock: 4,
    short_other: 5,
    over_other: 6,
    over_near_restock: 7,
  };
  diagnoses.sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] ||
      (rank[a.code] ?? 99) - (rank[b.code] ?? 99) ||
      Math.abs(b.diff) - Math.abs(a.diff),
  );

  return {
    diagnoses,
    situation,
    actions,
    facts,
    bullets: actions,
    likelyMiskeyDay,
    totals: {
      shortQty,
      overQty,
      shortCount,
      overCount,
      net,
      countedTotal,
      systemTotal,
      daySold,
      dayRestock,
      dayWaste,
    },
  };
}

type Props = {
  branchId: string;
  onPendingChange?: (pending: number) => void;
  /** Expand this stock count when loaded (deep link). */
  initialCountId?: string | null;
};

export function BranchStockCountsView({
  branchId,
  onPendingChange,
  initialCountId = null,
}: Props) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [counts, setCounts] = useState<Count[]>([]);
  const [dayActivity, setDayActivity] = useState<DayActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dateStr, setDateStr] = useState(() => bangkokDateKey());
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("IN_PROGRESS");
  const [expandedId, setExpandedId] = useState<string | null>(
    initialCountId?.trim() || null,
  );
  const [diffOnly, setDiffOnly] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saveBusyId, setSaveBusyId] = useState<string | null>(null);
  const [captureStamp, setCaptureStamp] = useState("");
  const detailCaptureRef = useRef<HTMLDivElement | null>(null);
  const initialCountHandled = useRef(false);

  async function handleSaveCountImage(
    count: Count,
    meta: { typeLabel: string; time: string },
  ) {
    if (saveBusyId) return;
    // ensure expanded so capture node is mounted
    if (expandedId !== count.id) {
      flushSync(() => setExpandedId(count.id));
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await new Promise((r) => setTimeout(r, 80));
    }
    setSaveBusyId(count.id);
    try {
      flushSync(() => setCaptureStamp(formatBangkokDateTime()));
      const node = detailCaptureRef.current;
      if (!node) throw new Error("ไม่พบรายละเอียดยอดนับ");
      const dataUrl = await toPng(node, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      });
      const safeName = (count.name || "สรุปยอด")
        .replace(/[^\w\u0E00-\u0E7F\-]+/g, "_")
        .slice(0, 40);
      downloadDataUrl(
        dataUrl,
        `ยอดนับ_${meta.typeLabel}_${safeName}_${dateStr}.png`,
      );
      toast.success("บันทึกรูปแล้ว");
    } catch {
      toast.error("บันทึกรูปไม่สำเร็จ");
    } finally {
      setSaveBusyId(null);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/counts?date=${encodeURIComponent(dateStr)}`,
      );
      if (res.ok) {
        const json = await res.json();
        const next = (json.counts || []) as Count[];
        setCounts(next);
        setDayActivity(
          json.dayActivity
            ? (json.dayActivity as DayActivity)
            : { date: dateStr, items: [] },
        );
        const want = initialCountId?.trim() || "";
        if (want && next.some((c) => c.id === want)) {
          setExpandedId(want);
          setStatusFilter("ALL");
          initialCountHandled.current = true;
        } else {
          setExpandedId(null);
        }
        const pending = next.filter((c) => c.status === "IN_PROGRESS").length;
        onPendingChange?.(pending);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || err.message || "โหลดสรุปยอดไม่สำเร็จ");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [branchId, dateStr, toast, onPendingChange, initialCountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dayActivityMap = useMemo(
    () => activityByNameMap(dayActivity),
    [dayActivity],
  );

  const stats = useMemo(() => {
    let pending = 0;
    let done = 0;
    let cancelled = 0;
    for (const c of counts) {
      if (c.status === "IN_PROGRESS") pending += 1;
      else if (c.status === "CANCELLED") cancelled += 1;
      else done += 1;
    }
    return { pending, done, cancelled, total: counts.length };
  }, [counts]);

  const filteredCounts = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = counts.filter((count) => {
      const financial = parseFinancial(count.note);
      const stockType = inferCountStockType(count.name, financial);
      const status = count.status || "COMPLETED";
      if (typeFilter !== "ALL" && stockType !== typeFilter) return false;
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!needle) return true;
      const creator =
        count.createdByStaff?.name ||
        count.createdByAdmin?.username ||
        "";
      const lineNames = (
        financial?.lines?.map((l) => l.name) ??
        count.lines.map((l) => l.product.name)
      ).join(" ");
      const hay = [
        count.name,
        creator,
        count.note ?? "",
        lineNames,
        STOCK_TYPE_LABEL[stockType] ?? "",
        displayStatusLabel(
          status,
          financial,
          stockType,
          Boolean(count.createdByAdmin),
        ),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
    return [...list].sort((a, b) => {
      const sa = a.status === "IN_PROGRESS" ? 0 : 1;
      const sb = b.status === "IN_PROGRESS" ? 0 : 1;
      if (sa !== sb) return sa - sb;
      const ta = new Date(a.createdAt || a.completedAt || 0).getTime();
      const tb = new Date(b.createdAt || b.completedAt || 0).getTime();
      return tb - ta;
    });
  }, [counts, q, typeFilter, statusFilter]);

  async function applyCount(countId: string, action: "apply" | "reject") {
    const ok = await confirm({
      title: action === "apply" ? "Convert ยอดนับเป็น ADJUST?" : "ปฏิเสธสรุปยอด?",
      message:
        action === "apply"
          ? "ระบบจะตั้งยอดเมนูขายตามจำนวนที่นับได้ และสร้างประวัติ ADJUST"
          : "สรุปยอดนี้จะไม่ถูกนำไปปรับสต๊อก",
      confirmLabel: action === "apply" ? "Convert สต๊อก" : "ปฏิเสธ",
    });
    if (!ok) return;
    setBusyId(countId);
    try {
      const res = await fetch(
        `/api/admin/branches/${branchId}/stock/counts/${countId}/apply`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error || "ดำเนินการไม่สำเร็จ");
        return;
      }
      toast.success(
        action === "apply"
          ? `Convert สำเร็จ${
              typeof body.adjustedItemCount === "number"
                ? ` · ADJUST ${body.adjustedItemCount} รายการ`
                : ""
            }`
          : "ปฏิเสธสรุปยอดแล้ว",
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const today = bangkokDateKey();
  const statusChips: { id: StatusFilter; label: string; count: number }[] = [
    { id: "IN_PROGRESS", label: "รอ Convert", count: stats.pending },
    { id: "COMPLETED", label: "เสร็จแล้ว", count: stats.done },
    { id: "CANCELLED", label: "ปฏิเสธ", count: stats.cancelled },
    { id: "ALL", label: "ทั้งหมด", count: stats.total },
  ];
  const typeChips: { id: TypeFilter; label: string }[] = [
    { id: "ALL", label: "ทุกประเภท" },
    { id: "SALE_ITEM", label: "เมนูขาย" },
    { id: "CONSUMABLE", label: "ของสิ้นเปลือง" },
    { id: "EQUIPMENT", label: "อุปกรณ์" },
  ];

  return (
    <div className="space-y-4">
      {/* Header + primary actions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-extrabold text-slate-900">
              สรุปยอดสต๊อกและขาย
            </h2>
            <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-500">
              ปิดร้าน: นับของจริงเข้าเช็คสต๊อก → เทียบระบบ → สรุปสาเหตุและแนวทางแก้
              ยอดนับ = คงเหลือจริง · ขายคีย์ทีหลังอาจผิดเมนู แต่วงเงิน/จำนวนรวมมักตรง
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              รีเฟรช
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-site-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90"
            >
              + สร้างเอกสารยอดนับ
            </button>
          </div>
        </div>
        
        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            onClick={() => setStatusFilter("IN_PROGRESS")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              statusFilter === "IN_PROGRESS"
                ? "border-amber-300 bg-amber-50"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500">รอ Convert</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-amber-800">
              {stats.pending}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("COMPLETED")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              statusFilter === "COMPLETED"
                ? "border-emerald-300 bg-emerald-50"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500">เสร็จแล้ว</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-emerald-800">
              {stats.done}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("CANCELLED")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              statusFilter === "CANCELLED"
                ? "border-slate-300 bg-slate-100"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500">ปฏิเสธ</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-700">
              {stats.cancelled}
            </p>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              statusFilter === "ALL"
                ? "border-site-primary/40 bg-site-primary-soft"
                : "border-slate-200 bg-slate-50 hover:bg-white"
            }`}
          >
            <p className="text-[11px] font-semibold text-slate-500">ทั้งหมดวันนี้</p>
            <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-900">
              {stats.total}
            </p>
          </button>
        </div>

        {/* Filters */}
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-[11rem]">
              <label className={adminLabelClass} htmlFor="stock-count-date">
                วันที่
              </label>
              <DateInput
                id="stock-count-date"
                className={adminInputClass}
            value={dateStr}
                max={today}
                onChange={(v) => {
                  if (v) setDateStr(v);
                }}
              />
            </div>
            {dateStr !== today ? (
              <button
                type="button"
                onClick={() => setDateStr(today)}
                className="mb-0.5 rounded-lg px-2 py-2 text-xs font-bold text-site-primary hover:underline"
              >
                วันนี้
              </button>
            ) : null}
            <div className="min-w-[12rem] flex-1">
              <label className={adminLabelClass} htmlFor="stock-count-q">
                ค้นหา
              </label>
              <input
                id="stock-count-q"
                type="search"
                className={adminInputClass}
                placeholder="ชื่อเอกสาร, ผู้บันทึก, ชื่อรายการ…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

          <div className="flex flex-wrap gap-1.5">
            {statusChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setStatusFilter(chip.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  statusFilter === chip.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {chip.label}
                <span className="ml-1 tabular-nums opacity-70">{chip.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {typeChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setTypeFilter(chip.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  typeFilter === chip.id
                    ? "bg-site-primary text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <AdminLoadingState className="py-8" />
      ) : filteredCounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-14 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-700">
            {statusFilter === "IN_PROGRESS" && counts.length > 0
              ? "ไม่มีเอกสารรอ Convert ในวันนี้"
              : counts.length === 0
                ? "ยังไม่มีสรุปยอดในวันที่เลือก"
                : "ไม่พบรายการตามตัวกรอง"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            สร้างเอกสารยอดนับเอง หรือรอหน้าร้านส่งสรุปเมนูขาย
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-xl bg-site-primary px-4 py-2 text-sm font-bold text-white"
            >
              + สร้างเอกสารยอดนับ
            </button>
            {statusFilter !== "ALL" && counts.length > 0 ? (
              <button
                type="button"
                onClick={() => setStatusFilter("ALL")}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700"
              >
                ดูทั้งหมดวันนี้
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <p className="text-sm font-semibold text-slate-600">
              แสดง {filteredCounts.length} เอกสาร
              {filteredCounts.length !== counts.length
                ? ` จาก ${counts.length}`
                : ""}
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={diffOnly}
                onChange={(e) => setDiffOnly(e.target.checked)}
              />
              ตอนเปิดดู: แสดงเฉพาะยอดต่าง
            </label>
          </div>

          {filteredCounts.map((count) => {
            const isExpanded = expandedId === count.id;
            const whenIso = count.completedAt || count.createdAt || "";
            const time = whenIso
              ? new Date(whenIso).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Bangkok",
                })
              : "—";
            const creator =
              count.createdByStaff?.name ||
              count.createdByAdmin?.username ||
              "ไม่ทราบชื่อ";
            const financialData = parseFinancial(count.note);
            const stockType = inferCountStockType(count.name, financialData);
            const typeLabel = STOCK_TYPE_LABEL[stockType] ?? "เมนูขาย";
            const includesSales = stockType === "SALE_ITEM";
            const status = count.status || "COMPLETED";
            const canApply =
              includesSales &&
              status === "IN_PROGRESS" &&
              Boolean(financialData?.lines?.length);
            const displayLines = getDisplayLines(
              count,
              stockType,
              includesSales,
            );
            const mismatchCount = displayLines.filter(
              (l) => l.countedQty !== l.systemQty,
            ).length;
            const visibleLines = diffOnly
              ? displayLines.filter((l) => l.countedQty !== l.systemQty)
              : displayLines;
            const varianceSummary = displayLines.reduce(
              (acc, line) => {
                const diff = line.countedQty - line.systemQty;
                if (diff < 0) {
                  acc.shortCount += 1;
                  acc.shortQty += -diff;
                } else if (diff > 0) {
                  acc.overCount += 1;
                  acc.overQty += diff;
                }
                return acc;
              },
              { shortCount: 0, shortQty: 0, overCount: 0, overQty: 0 },
            );
            const varianceInsights =
              includesSales && mismatchCount > 0
                ? buildVarianceInsights(
                    displayLines,
                    dayActivityMap,
                    financialData,
                  )
                : null;
            const statusLabel = displayStatusLabel(
              status,
              financialData,
              stockType,
              Boolean(count.createdByAdmin),
            );
            const salesTotal =
              (financialData?.cash || 0) + (financialData?.transfer || 0);
            const fromAdmin =
              Boolean(count.createdByAdmin) ||
              financialData?.source === "ADMIN";

            return (
              <article
                key={count.id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  status === "IN_PROGRESS"
                    ? "border-amber-300 ring-1 ring-amber-100"
                    : "border-slate-200"
                }`}
              >
                <div className="flex flex-col gap-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 sm:text-base">
                          {count.name || `สรุปยอด ${time} น.`}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${statusTone(status)}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(status)}`}
                            aria-hidden
                          />
                          {statusLabel}
                        </span>
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {typeLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                        {fromAdmin ? "แอดมิน" : "หน้าร้าน"}: {creator}
                        <span className="mx-1.5 text-slate-300">·</span>
                        {time} น.
                        {mismatchCount > 0 ? (
                          <>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span className="font-bold text-red-600">
                              ยอดต่าง {mismatchCount} รายการ
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span className="text-emerald-700">ยอดตรงทั้งหมด</span>
                          </>
                        )}
                      </p>
                    </div>

                    {includesSales && financialData ? (
                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          ยอดเงิน (สด+โอน)
                        </p>
                        <p className="text-lg font-black tabular-nums text-slate-900">
                          ฿{salesTotal.toLocaleString("th-TH")}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {/* Always-visible actions for pending */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                    {canApply ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId === count.id}
                          onClick={() => void applyCount(count.id, "apply")}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
                        >
                          {busyId === count.id
                            ? "กำลัง Convert…"
                            : "Convert → ADJUST"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === count.id}
                          onClick={() => void applyCount(count.id, "reject")}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                        >
                          ปฏิเสธ
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : count.id)
                      }
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      {isExpanded ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        saveBusyId === count.id || displayLines.length === 0
                      }
                      onClick={() =>
                        void handleSaveCountImage(count, {
                          typeLabel,
                          time,
                        })
                      }
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {saveBusyId === count.id ? "กำลังบันทึก…" : "Save รูป"}
                    </button>
                    <span className="ml-auto text-xs tabular-nums text-slate-400">
                      {displayLines.length} รายการ
                    </span>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t border-slate-100 bg-slate-50/80 p-4 sm:p-5">
                    <div
                      ref={detailCaptureRef}
                      className="space-y-3 rounded-xl bg-white p-3 sm:p-4"
                    >
                      <div className="border-b border-slate-100 pb-2">
                        <p className="text-sm font-extrabold text-slate-900">
                          {count.name || `สรุปยอด ${time} น.`}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {typeLabel}
                          {" · "}
                          {fromAdmin ? "แอดมิน" : "หน้าร้าน"}: {creator}
                          {" · "}
                          {time} น.
                          {dateStr ? ` · ${dateStr}` : ""}
                        </p>
                        {captureStamp ? (
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            บันทึกเมื่อ {captureStamp}
                          </p>
                        ) : null}
                      </div>
                    {status === "COMPLETED" &&
                    includesSales &&
                    !financialData?.lines?.some((l) => l.menuItemId) ? (
                      <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                        สรุประบบเก่า (ปรับสต๊อกตอนหน้าร้านส่งแล้ว) — ไม่ต้อง
                        Convert ซ้ำ
                      </div>
                    ) : null}

                    {financialData && includesSales ? (
                      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {(
                          [
                            ["เงินสด", financialData.cash ?? 0],
                            ["เงินโอน", financialData.transfer ?? 0],
                            ["เงินทอน", financialData.change ?? 0],
                            ["ลูกค้า (คิว)", financialData.customers ?? 0],
                          ] as const
                        ).map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                          >
                            <p className="text-[11px] font-semibold text-slate-500">
                              {label}
                            </p>
                            <p className="mt-0.5 text-base font-black tabular-nums text-slate-900">
                              {label.startsWith("ลูกค้า")
                                ? value.toLocaleString("th-TH")
                                : `฿${value.toLocaleString("th-TH")}`}
                            </p>
                  </div>
                        ))}
                  </div>
                    ) : null}

                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        รายการนับ ({typeLabel})
                      </h4>
                      {mismatchCount > 0 && diffOnly ? (
                        <p className="text-xs font-semibold text-red-600">
                          แสดง {visibleLines.length} รายการที่ยอดต่าง
                          (จากทั้งหมด {displayLines.length})
                        </p>
                      ) : null}
                        </div>

                    {mismatchCount > 0 ? (
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                          <p className="text-[11px] font-semibold text-rose-700">
                            นับได้น้อยกว่า (ขาด)
                          </p>
                          <p className="mt-0.5 text-base font-black tabular-nums text-rose-900">
                            −{varianceSummary.shortQty.toLocaleString("th-TH")}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-rose-700/90">
                            {varianceSummary.shortCount.toLocaleString("th-TH")}{" "}
                            รายการ
                            {varianceSummary.shortCount === 0
                              ? ""
                              : " · รวมหน่วยที่ขาด"}
                          </p>
                        </div>
                        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                          <p className="text-[11px] font-semibold text-sky-800">
                            นับได้มากกว่า (เกิน)
                          </p>
                          <p className="mt-0.5 text-base font-black tabular-nums text-sky-900">
                            {varianceSummary.overQty > 0 ? "+" : ""}
                            {varianceSummary.overQty.toLocaleString("th-TH")}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-sky-800/90">
                            {varianceSummary.overCount.toLocaleString("th-TH")}{" "}
                            รายการ
                            {varianceSummary.overCount === 0
                              ? ""
                              : " · รวมหน่วยที่เกิน"}
                          </p>
                        </div>
                        </div>
                    ) : null}

                    {varianceInsights &&
                    (varianceInsights.actions?.length > 0 ||
                      varianceInsights.facts.length > 0) ? (
                      <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-bold text-violet-900">
                            สรุปสำหรับบริหาร
                            {dayActivity?.date
                              ? ` · ${dayActivity.date}`
                              : ""}
                          </p>
                          {varianceInsights.likelyMiskeyDay ? (
                            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 ring-1 ring-amber-300">
                              น่าจะคีย์ขายผิดเมนู
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 rounded-lg border border-violet-100 bg-white px-3 py-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-violet-500">
                            สถานการณ์
                          </p>
                          <p className="mt-0.5 text-sm font-bold leading-snug text-slate-900">
                            {varianceInsights.situation}
                          </p>
                      </div>

                        {varianceInsights.facts.length > 0 ? (
                          <div className="mt-2 grid gap-1 sm:grid-cols-3">
                            {varianceInsights.facts.map((f) => (
                              <p
                                key={f}
                                className="rounded-lg border border-violet-100/80 bg-white/80 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-slate-700"
                              >
                                {f}
                              </p>
                            ))}
                      </div>
                    ) : null}

                        {varianceInsights.actions.length > 0 ? (
                          <div className="mt-2">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-violet-500">
                              แนวทางปฏิบัติ
                            </p>
                            <ol className="mt-1 list-decimal space-y-1 pl-4">
                              {varianceInsights.actions.map((a) => (
                                <li
                                  key={a}
                                  className="text-xs font-semibold leading-snug text-violet-950"
                                >
                                  {a}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}

                        {varianceInsights.diagnoses.length > 0 ? (
                          <div className="mt-2.5 space-y-1.5 border-t border-violet-200/80 pt-2.5">
                            <p className="text-[11px] font-semibold text-violet-800">
                              รายการเร่ง (สูงสุด 6)
                            </p>
                            {varianceInsights.diagnoses
                              .slice(0, 6)
                              .map((d) => (
                                <div
                                  key={`${d.name}-${d.code}`}
                                  className="rounded-lg border border-violet-100 bg-white px-2.5 py-2"
                                >
                                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                    <p className="text-xs font-bold text-slate-900">
                                      {d.name}
                                    </p>
                                    <span
                                      className={`text-xs font-black tabular-nums ${
                                        d.diff < 0
                                          ? "text-rose-700"
                                          : "text-sky-700"
                                      }`}
                                    >
                                      {d.diff > 0 ? "+" : ""}
                                      {d.diff}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                        d.severity === "high"
                                          ? "bg-rose-100 text-rose-800"
                                          : d.severity === "medium"
                                            ? "bg-amber-100 text-amber-900"
                                            : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {d.label}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] leading-snug text-slate-600">
                                    <span className="font-semibold text-slate-500">
                                      เป็นไปได้:{" "}
                                    </span>
                                    {d.cause}
                                  </p>
                                  <p className="mt-0.5 text-[11px] font-semibold leading-snug text-violet-900">
                                    <span className="font-bold">ควรทำ: </span>
                                    {d.action}
                                  </p>
                                </div>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {visibleLines.length === 0 ? (
                      <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                        ไม่มียอดต่าง — ทุกรายการตรงกับสต๊อกตอนบันทึก
                      </p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                              <th className="px-3 py-2.5 font-semibold">
                                รายการ
                              </th>
                              <th className="px-3 py-2.5 text-right font-semibold">
                                ระบบ
                              </th>
                              <th className="px-3 py-2.5 text-right font-semibold">
                                นับได้
                              </th>
                              <th className="px-3 py-2.5 text-right font-semibold">
                                ผลต่าง
                              </th>
                              {includesSales ? (
                                <>
                                  <th className="px-3 py-2.5 text-right font-semibold">
                                    ขายคีย์
                                  </th>
                                  <th className="min-w-[12rem] px-3 py-2.5 font-semibold">
                                    สถานการณ์ / แนวทาง
                                  </th>
                                </>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {visibleLines.map((line) => {
                              const diff = line.countedQty - line.systemQty;
                              const isDiff = diff !== 0;
                              const act =
                                dayActivityMap.get(line.name.trim()) ??
                                emptyActivity();
                              const diagnosis =
                                includesSales && isDiff
                                  ? diagnoseVarianceLine(line, act, {
                                      likelyMiskeyDay: Boolean(
                                        varianceInsights?.likelyMiskeyDay,
                                      ),
                                    })
                                  : null;
                              const toneClass =
                                diagnosis?.tone === "rose"
                                  ? "text-rose-800"
                                  : diagnosis?.tone === "amber"
                                    ? "text-amber-800"
                                    : diagnosis?.tone === "sky"
                                      ? "text-sky-800"
                                      : "text-slate-600";
                              return (
                                <tr
                                  key={line.id}
                                  className={
                                    isDiff ? "bg-red-50/60" : undefined
                                  }
                                >
                                  <td
                                    className={`px-3 py-2.5 font-semibold ${
                                      isDiff ? "text-red-800" : "text-slate-900"
                                    }`}
                                  >
                                    {line.name}
                                  </td>
                                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                    {line.systemQty}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-slate-900">
                                    {line.countedQty}
                                  </td>
                                  <td
                                    className={`px-3 py-2.5 text-right font-bold tabular-nums ${
                                      isDiff ? "text-red-700" : "text-slate-300"
                                    }`}
                                  >
                                    {diff > 0 ? "+" : ""}
                                    {diff}
                                  </td>
                                  {includesSales ? (
                                    <>
                                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                                        {act.soldQty > 0
                                          ? act.soldQty.toLocaleString("th-TH")
                                          : "—"}
                                        {act.wasteQty > 0 ? (
                                          <span className="mt-0.5 block text-[10px] font-medium text-orange-700">
                                            จ่าย/เสีย{" "}
                                            {act.wasteQty.toLocaleString(
                                              "th-TH",
                                            )}
                                          </span>
                                        ) : null}
                                        {act.restockQty > 0 ? (
                                          <span className="mt-0.5 block text-[10px] font-medium text-emerald-700">
                                            เติม{" "}
                                            {act.restockQty.toLocaleString(
                                              "th-TH",
                                            )}
                                          </span>
                                        ) : null}
                                      </td>
                                      <td
                                        className={`px-3 py-2.5 text-xs leading-snug ${toneClass}`}
                                      >
                                        {diagnosis ? (
                                          <div className="max-w-[16rem] space-y-1">
                                            <span
                                              className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${
                                                diagnosis.severity === "high"
                                                  ? "bg-rose-100 text-rose-900"
                                                  : diagnosis.severity ===
                                                      "medium"
                                                    ? "bg-amber-100 text-amber-950"
                                                    : "bg-slate-100 text-slate-700"
                                              }`}
                                            >
                                              {diagnosis.label}
                                            </span>
                                            <p className="text-[11px] font-medium text-slate-600">
                                              <span className="font-semibold text-slate-500">
                                                เป็นไปได้:{" "}
                                              </span>
                                              {diagnosis.cause}
                                            </p>
                                            <p className="text-[11px] font-bold text-violet-900">
                                              → {diagnosis.action}
                                            </p>
                                          </div>
                                        ) : (
                                          <span className="text-slate-300">
                                            —
                                          </span>
                                        )}
                                      </td>
                                    </>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                  </div>
                )}
              </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      <AdminCreateStockCountSheet
        branchId={branchId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setStatusFilter(
            statusFilter === "IN_PROGRESS" ? "IN_PROGRESS" : "ALL",
          );
          void load();
        }}
      />
    </div>
  );
}
