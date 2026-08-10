import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUS_LABELS,
  formatPrice,
} from "@/lib/constants";
import {
  getBranchActivityContext,
  logAdminActivity,
} from "@/lib/admin-activity";
import { sessionFromLineAdmin, logLineAdminActivity } from "@/lib/line-activity";
import {
  canAdminManageBranchOrder,
  clearDeleteMode,
  findLinkedAdmin,
  type LinkedAdmin,
} from "@/lib/line-order-delete";
import {
  expandGroupOptions,
  optionGroupDetailInclude,
  serializeOptionGroup,
} from "@/lib/menu-option-groups";
import { reconstructOptionIdsFromText } from "@/lib/order-item-options-text";
import {
  OrderItemRewriteError,
  rewriteOrderItemsWithStock,
} from "@/lib/order-item-rewrite";
import { formatQueueNumber } from "@/lib/order-queue-format";
import { validateOrderItemOptionIds } from "@/lib/option-selection";
import {
  LINE_EDIT_MODE_TTL_MS,
  LINE_EDIT_SESSION_TTL_MS,
  LINE_POSTBACK,
  type LineReplyPayload,
} from "@/lib/line-postback";

const EDIT_COMMAND_RE = /^แก้ไข\s*#?([A-Za-z]\d{4})\s*$/i;
const BARE_ORDER_RE = /^#?([A-Za-z]\d{4})$/i;
const EXIT_MODE_RE = /^(ยกเลิกโหมด|ออกโหมด|exit)$/i;
const CONFIRM_RE = /^(ยืนยัน|ใช่)$/i;
const MENU_PAGE_SIZE = 8;

export type LineEditDraftItem = {
  branchMenuItemId: string;
  name: string;
  quantity: number;
  optionIds: string[];
  note?: string;
};

export type LineEditStep =
  | "hub"
  | "pick_menu"
  | "pick_qty"
  | "pick_options"
  | "pick_line_edit"
  | "pick_line_delete"
  | "confirm_save";

export type LineEditSession = {
  expiresAt: number;
  orderId: string;
  orderNumber: string;
  branchId: string;
  branchName: string;
  deliveryFee: number;
  discountAmount: number;
  step: LineEditStep;
  draft: LineEditDraftItem[];
  menuPage: number;
  /** null = add new; number = replace draft index */
  editingLineIndex: number | null;
  pendingMenuId?: string;
  pendingMenuName?: string;
  pendingQty?: number;
  pendingOptionIds?: string[];
  optionGroupIndex?: number;
};

function touchSession(session: LineEditSession): LineEditSession {
  return {
    ...session,
    expiresAt: Date.now() + LINE_EDIT_SESSION_TTL_MS,
  };
}

function parseSession(raw: unknown): LineEditSession | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as LineEditSession;
  if (!s.orderId || !s.orderNumber || !Array.isArray(s.draft)) return null;
  if (!s.expiresAt || s.expiresAt < Date.now()) return null;
  return s;
}

export async function clearEditMode(adminId: string) {
  await prisma.admin.update({
    where: { id: adminId },
    data: {
      lineEditModeExpiresAt: null,
      lineEditSession: Prisma.DbNull,
    },
  });
}

async function saveSession(adminId: string, session: LineEditSession | null) {
  await prisma.admin.update({
    where: { id: adminId },
    data: {
      lineEditSession: session
        ? (touchSession(session) as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
    },
  });
}

export function isEditModeActive(admin: LinkedAdmin): boolean {
  return (
    Boolean(admin.lineEditModeExpiresAt) &&
    (admin.lineEditModeExpiresAt?.getTime() ?? 0) >= Date.now()
  );
}

function hubQuickReply() {
  return [
    { label: "เพิ่ม", data: LINE_POSTBACK.EDIT_ADD, displayText: "เพิ่ม" },
    { label: "แก้บรรทัด", data: LINE_POSTBACK.EDIT_LINE, displayText: "แก้บรรทัด" },
    {
      label: "ลบบรรทัด",
      data: LINE_POSTBACK.EDIT_DELETE_LINE,
      displayText: "ลบบรรทัด",
    },
    { label: "บันทึก", data: LINE_POSTBACK.EDIT_SAVE, displayText: "บันทึก" },
    { label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL, displayText: "ยกเลิก" },
  ];
}

function formatDraftLines(draft: LineEditDraftItem[]): string[] {
  if (draft.length === 0) return ["· (ยังไม่มีรายการ)"];
  return draft.map((it, i) => {
    const opts =
      it.optionIds.length > 0 ? ` [${it.optionIds.length} ตัวเลือก]` : "";
    return `${i + 1}. ${it.name} ×${it.quantity}${opts}`;
  });
}

function formatHub(session: LineEditSession): LineReplyPayload {
  const subtotal = session.draft.reduce((s, it) => s + it.quantity, 0);
  return {
    text: [
      `แก้ไขออเดอร์ #${session.orderNumber}`,
      `สาขา: ${session.branchName}`,
      "",
      "รายการร่าง:",
      ...formatDraftLines(session.draft),
      "",
      `จำนวนชิ้นรวม (qty): ${subtotal}`,
      "",
      "เลือกคำสั่งด้านล่าง หรือพิมพ์เลขคำสั่ง",
      "1=เพิ่ม 2=แก้บรรทัด 3=ลบบรรทัด 4=บันทึก 0=ยกเลิก",
    ].join("\n"),
    quickReply: hubQuickReply(),
  };
}

export async function enterEditMode(
  admin: LinkedAdmin,
): Promise<LineReplyPayload> {
  await clearDeleteMode(admin.id);
  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lineEditModeExpiresAt: new Date(Date.now() + LINE_EDIT_MODE_TTL_MS),
      lineEditSession: Prisma.DbNull,
    },
  });
  await logLineAdminActivity(admin, {
    action: "line.edit_mode.enter",
    summary: `เข้าโหมดแก้ไขออเดอร์ผ่าน LINE — ${admin.username}`,
  });
  return {
    text: [
      "เข้าโหมดแก้ไขออเดอร์แล้ว (30 นาที)",
      "พิมพ์เลขที่ออเดอร์ เช่น A1048",
      "หรือพิมพ์ แก้ไข A1048",
      "พิมพ์ ยกเลิกโหมด เพื่อออก",
    ].join("\n"),
    quickReply: [
      {
        label: "ออกโหมดแก้ไข",
        data: LINE_POSTBACK.MODE_EXIT,
        displayText: "ออกโหมดแก้ไข",
      },
    ],
  };
}

export async function exitEditMode(
  admin: LinkedAdmin,
): Promise<LineReplyPayload> {
  await clearEditMode(admin.id);
  await logLineAdminActivity(admin, {
    action: "line.edit_mode.exit",
    summary: `ออกจากโหมดแก้ไขผ่าน LINE — ${admin.username}`,
  });
  return { text: "ออกจากโหมดแก้ไขแล้ว" };
}

async function loadOrderableMenus(branchId: string) {
  return prisma.branchMenuItem.findMany({
    where: { branchId, isHidden: false },
    include: {
      optionGroupLinks: {
        include: { group: { include: optionGroupDetailInclude } },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

function menuPageSlice<T>(items: T[], page: number) {
  const start = page * MENU_PAGE_SIZE;
  return {
    slice: items.slice(start, start + MENU_PAGE_SIZE),
    totalPages: Math.max(1, Math.ceil(items.length / MENU_PAGE_SIZE)),
    start,
  };
}

async function replyPickMenu(
  session: LineEditSession,
): Promise<LineReplyPayload> {
  const menus = await loadOrderableMenus(session.branchId);
  const page = Math.max(0, session.menuPage || 0);
  const { slice, totalPages, start } = menuPageSlice(menus, page);
  const lines = slice.map(
    (m, i) => `${start + i + 1}. ${m.name}`,
  );
  const qr = [
    ...(page > 0
      ? [{ label: "ก่อนหน้า", data: LINE_POSTBACK.EDIT_PREV }]
      : []),
    ...(page + 1 < totalPages
      ? [{ label: "ถัดไป", data: LINE_POSTBACK.EDIT_NEXT }]
      : []),
    { label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL },
  ];
  return {
    text: [
      session.editingLineIndex == null ? "เลือกเมนูที่จะเพิ่ม" : "เลือกเมนูแทนที่",
      `หน้า ${page + 1}/${totalPages}`,
      "",
      ...lines,
      "",
      "พิมพ์เลขเมนู เช่น 3",
    ].join("\n"),
    quickReply: qr,
  };
}

function groupsForMenu(
  menu: Awaited<ReturnType<typeof loadOrderableMenus>>[number],
) {
  return menu.optionGroupLinks.map((l) => l.group);
}

async function startOptionFlow(
  admin: LinkedAdmin,
  session: LineEditSession,
  menuId: string,
  menuName: string,
  qty: number,
): Promise<LineReplyPayload> {
  const menus = await loadOrderableMenus(session.branchId);
  const menu = menus.find((m) => m.id === menuId);
  const groups = menu ? groupsForMenu(menu) : [];
  const next: LineEditSession = {
    ...session,
    step: groups.length > 0 ? "pick_options" : "hub",
    pendingMenuId: menuId,
    pendingMenuName: menuName,
    pendingQty: qty,
    pendingOptionIds: [],
    optionGroupIndex: 0,
  };

  if (groups.length === 0) {
    return commitPendingLine(admin, next);
  }
  await saveSession(admin.id, next);
  return promptOptionGroup(next, groups[0]!);
}

function promptOptionGroup(
  session: LineEditSession,
  group: ReturnType<typeof groupsForMenu>[number],
): LineReplyPayload {
  const serialized = serializeOptionGroup(group);
  const opts = serialized.options;
  const lines = opts.map((o, i) => {
    const delta = Number(o.priceDelta);
    const price =
      delta !== 0 ? ` (${delta > 0 ? "+" : ""}${formatPrice(delta)})` : "";
    return `${i + 1}. ${o.name}${price}`;
  });
  const min = serialized.minSelect || (serialized.required ? 1 : 0);
  const max = serialized.maxSelect;
  const qr =
    min === 0
      ? [
          {
            label: "ข้าม",
            data: LINE_POSTBACK.EDIT_SKIP_OPTS,
            displayText: "ข้าม",
          },
          { label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL },
        ]
      : [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }];

  return {
    text: [
      `ตัวเลือก: ${serialized.name}`,
      max <= 1
        ? "เลือก 1 รายการ (พิมพ์เลข)"
        : `เลือก ${min}-${max} รายการ (เช่น 1,3 หรือ 1 1 2)`,
      "",
      ...lines,
    ].join("\n"),
    quickReply: qr,
  };
}

async function commitPendingLine(
  admin: LinkedAdmin,
  session: LineEditSession,
): Promise<LineReplyPayload> {
  if (!session.pendingMenuId || !session.pendingMenuName || !session.pendingQty) {
    const hub = { ...session, step: "hub" as const };
    await saveSession(admin.id, hub);
    return formatHub(hub);
  }
  const line: LineEditDraftItem = {
    branchMenuItemId: session.pendingMenuId,
    name: session.pendingMenuName,
    quantity: session.pendingQty,
    optionIds: session.pendingOptionIds ?? [],
  };
  const draft = [...session.draft];
  if (session.editingLineIndex != null && session.editingLineIndex >= 0) {
    draft[session.editingLineIndex] = line;
  } else {
    draft.push(line);
  }
  const hub: LineEditSession = {
    ...session,
    step: "hub",
    draft,
    editingLineIndex: null,
    pendingMenuId: undefined,
    pendingMenuName: undefined,
    pendingQty: undefined,
    pendingOptionIds: undefined,
    optionGroupIndex: undefined,
  };
  await saveSession(admin.id, hub);
  return formatHub(hub);
}

export async function startEditSession(
  admin: LinkedAdmin,
  orderNumber: string,
): Promise<LineReplyPayload> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      branch: { select: { id: true, name: true, brandId: true } },
      items: {
        orderBy: { id: "asc" },
        include: {
          branchMenuItem: {
            include: {
              optionGroupLinks: {
                include: { group: { include: optionGroupDetailInclude } },
              },
            },
          },
        },
      },
    },
  });

  if (!order) return { text: `ไม่พบออเดอร์ #${orderNumber}` };
  if (!canAdminManageBranchOrder(admin, order.branch.brandId)) {
    return { text: `ไม่มีสิทธิ์แก้ไขออเดอร์สาขา ${order.branch.name}` };
  }
  if (order.status === "CANCELLED") {
    return { text: "ไม่สามารถแก้ไขออเดอร์ที่ถูกยกเลิกแล้ว" };
  }
  if (order.awaitingPhotoKey) {
    return { text: "ออเดอร์รูปยังไม่ได้คีย์รายการ — ใช้หน้าคีย์ออเดอร์แทน" };
  }
  if (order.items.some((it) => !it.branchMenuItemId)) {
    return {
      text: "ออเดอร์นี้มีรายการไม่มีเมนูอ้างอิง — แก้ไขผ่านหน้าแอดมินแทน",
    };
  }

  await clearDeleteMode(admin.id);

  const draft: LineEditDraftItem[] = order.items.map((it) => {
    const groups =
      it.branchMenuItem?.optionGroupLinks.map((l) => l.group) ?? [];
    return {
      branchMenuItemId: it.branchMenuItemId!,
      name: it.itemName,
      quantity: it.quantity,
      optionIds: reconstructOptionIdsFromText(groups, it.optionsText),
      note: it.note ?? undefined,
    };
  });

  const session: LineEditSession = {
    expiresAt: Date.now() + LINE_EDIT_SESSION_TTL_MS,
    orderId: order.id,
    orderNumber: order.orderNumber,
    branchId: order.branch.id,
    branchName: order.branch.name,
    deliveryFee: Number(order.deliveryFee),
    discountAmount: Number(order.discountAmount),
    step: "hub",
    draft,
    menuPage: 0,
    editingLineIndex: null,
  };

  await prisma.admin.update({
    where: { id: admin.id },
    data: {
      lineEditModeExpiresAt: new Date(Date.now() + LINE_EDIT_MODE_TTL_MS),
      lineEditSession: session as unknown as Prisma.InputJsonValue,
    },
  });

  await logLineAdminActivity(admin, {
    action: "line.edit_mode.enter",
    summary: `เริ่มแก้ไขออเดอร์ #${order.orderNumber} สาขา ${order.branch.name} ผ่าน LINE — ${admin.username}`,
    brandId: order.branch.brandId,
    branchId: order.branch.id,
    branchName: order.branch.name,
    entityType: "order",
    entityId: order.id,
    entityName: order.orderNumber,
  });

  return {
    text: [
      formatHub(session).text,
      "",
      `สถานะ: ${ORDER_STATUS_LABELS[order.status]}`,
      `ประเภท: ${FULFILLMENT_LABELS[order.fulfillmentType]}`,
      `คิว ${formatQueueNumber(order.queueNumber)}`,
    ].join("\n"),
    quickReply: hubQuickReply(),
  };
}

async function beginAddOrReplace(
  admin: LinkedAdmin,
  session: LineEditSession,
  editingLineIndex: number | null,
): Promise<LineReplyPayload> {
  const next: LineEditSession = {
    ...session,
    step: "pick_menu",
    menuPage: 0,
    editingLineIndex,
    pendingMenuId: undefined,
    pendingMenuName: undefined,
    pendingQty: undefined,
    pendingOptionIds: undefined,
    optionGroupIndex: undefined,
  };
  await saveSession(admin.id, next);
  return replyPickMenu(next);
}

async function previewSave(
  admin: LinkedAdmin,
  session: LineEditSession,
): Promise<LineReplyPayload> {
  if (session.draft.length < 1) {
    return {
      text: "ต้องมีรายการอย่างน้อย 1 รายการก่อนบันทึก",
      quickReply: hubQuickReply(),
    };
  }

  // Validate options against current menus
  const menus = await loadOrderableMenus(session.branchId);
  const menuMap = new Map(menus.map((m) => [m.id, m]));
  for (const line of session.draft) {
    const menu = menuMap.get(line.branchMenuItemId);
    if (!menu) {
      return {
        text: `เมนู “${line.name}” ไม่พร้อมขายแล้ว — ลบหรือเปลี่ยนก่อนบันทึก`,
        quickReply: hubQuickReply(),
      };
    }
    const groups = groupsForMenu(menu).map(serializeOptionGroup);
    const err = validateOrderItemOptionIds(groups, line.optionIds);
    if (err) {
      return {
        text: `“${line.name}”: ${err}`,
        quickReply: hubQuickReply(),
      };
    }
  }

  const next: LineEditSession = { ...session, step: "confirm_save" };
  await saveSession(admin.id, next);
  return {
    text: [
      "ยืนยันบันทึกรายการใหม่",
      `#${session.orderNumber} · ${session.branchName}`,
      "",
      ...formatDraftLines(session.draft),
      "",
      "จะคืนสต๊อก (ถ้าเคยตัด) แล้วหักตามรายการใหม่",
      "กดยืนยัน หรือพิมพ์ ยืนยัน",
    ].join("\n"),
    quickReply: [
      {
        label: "ยืนยันบันทึก",
        data: LINE_POSTBACK.EDIT_CONFIRM,
        displayText: "ยืนยัน",
      },
      { label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL, displayText: "ยกเลิก" },
    ],
  };
}

async function confirmSave(
  admin: LinkedAdmin,
  session: LineEditSession,
): Promise<LineReplyPayload> {
  try {
    const result = await rewriteOrderItemsWithStock({
      orderId: session.orderId,
      branchId: session.branchId,
      items: session.draft.map((d) => ({
        branchMenuItemId: d.branchMenuItemId,
        quantity: d.quantity,
        optionIds: d.optionIds,
        note: d.note,
      })),
    });

    const ctx = await getBranchActivityContext(session.branchId);
    await logAdminActivity(sessionFromLineAdmin(admin), {
      action: "order.items_edit",
      summary: `แก้ไขรายการออเดอร์ผ่าน LINE #${session.orderNumber} (${result.order.items.length} รายการ)`,
      brandId: ctx?.brandId ?? ctx?.brand?.id ?? null,
      brandName: ctx?.brand?.name ?? null,
      branchId: session.branchId,
      branchName: ctx?.name ?? session.branchName,
      entityType: "order",
      entityId: session.orderId,
      entityName: session.orderNumber,
      metadata: {
        via: "line",
        stockRestored: result.stockRestored,
        stockDeducted: result.stockDeducted,
        totalAmount: result.totalAmount,
      },
    });
    await logLineAdminActivity(admin, {
      action: "line.order_edit.save",
      summary: `บันทึกแก้ไขออเดอร์ #${session.orderNumber} ผ่าน LINE — ${admin.username}`,
      branchId: session.branchId,
      branchName: session.branchName,
      entityType: "order",
      entityId: session.orderId,
      entityName: session.orderNumber,
    });

    await clearEditMode(admin.id);
    return {
      text: [
        "บันทึกแก้ไขออเดอร์แล้ว",
        `#${session.orderNumber} · ${session.branchName}`,
        `รวม ฿${formatPrice(result.totalAmount)}`,
        result.stockRestored ? "คืนสต๊อกเดิมแล้ว" : null,
        result.stockDeducted ? "หักสต๊อกตามรายการใหม่แล้ว" : null,
      ]
        .filter(Boolean)
        .join("\n"),
    };
  } catch (err) {
    if (err instanceof OrderItemRewriteError) {
      return {
        text: `บันทึกไม่สำเร็จ: ${err.message}`,
        quickReply: hubQuickReply(),
      };
    }
    console.error("[line] order edit failed", err);
    return {
      text: "บันทึกไม่สำเร็จ กรุณาลองใหม่จากหน้าแอดมิน",
      quickReply: hubQuickReply(),
    };
  }
}

function parseMultiIndices(text: string): number[] | null {
  const parts = text
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const nums: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const n = Number(p);
    if (!Number.isFinite(n) || n < 1) return null;
    nums.push(n);
  }
  return nums;
}

async function handleSessionText(
  admin: LinkedAdmin,
  session: LineEditSession,
  text: string,
): Promise<LineReplyPayload> {
  if (session.step === "hub") {
    if (text === "1" || /^เพิ่ม/.test(text)) {
      return beginAddOrReplace(admin, session, null);
    }
    if (text === "2" || /^แก้/.test(text)) {
      const next: LineEditSession = { ...session, step: "pick_line_edit" };
      await saveSession(admin.id, next);
      return {
        text: [
          "พิมพ์เลขบรรทัดที่จะแก้",
          ...formatDraftLines(session.draft),
        ].join("\n"),
        quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
      };
    }
    if (text === "3" || /^ลบ/.test(text)) {
      const next: LineEditSession = { ...session, step: "pick_line_delete" };
      await saveSession(admin.id, next);
      return {
        text: [
          "พิมพ์เลขบรรทัดที่จะลบ",
          ...formatDraftLines(session.draft),
        ].join("\n"),
        quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
      };
    }
    if (text === "4" || /^บันทึก/.test(text)) {
      return previewSave(admin, session);
    }
    if (text === "0" || /^ยกเลิก/.test(text)) {
      return exitEditMode(admin);
    }
    return formatHub(session);
  }

  if (session.step === "pick_line_edit" || session.step === "pick_line_delete") {
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > session.draft.length) {
      return {
        text: `พิมพ์เลข 1-${session.draft.length}`,
        quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
      };
    }
    const idx = n - 1;
    if (session.step === "pick_line_delete") {
      if (session.draft.length <= 1) {
        const hub = { ...session, step: "hub" as const };
        await saveSession(admin.id, hub);
        return {
          text: "ต้องเหลืออย่างน้อย 1 รายการ",
          quickReply: hubQuickReply(),
        };
      }
      const draft = session.draft.filter((_, i) => i !== idx);
      const hub: LineEditSession = { ...session, step: "hub", draft };
      await saveSession(admin.id, hub);
      return formatHub(hub);
    }
    return beginAddOrReplace(admin, session, idx);
  }

  if (session.step === "pick_menu") {
    const menus = await loadOrderableMenus(session.branchId);
    const n = Number(text);
    if (!Number.isInteger(n) || n < 1 || n > menus.length) {
      return {
        text: `พิมพ์เลขเมนู 1-${menus.length}`,
        quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
      };
    }
    const menu = menus[n - 1]!;
    const next: LineEditSession = {
      ...session,
      step: "pick_qty",
      pendingMenuId: menu.id,
      pendingMenuName: menu.name,
    };
    await saveSession(admin.id, next);
    return {
      text: `“${menu.name}”\nพิมพ์จำนวน (1-99)`,
      quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
    };
  }

  if (session.step === "pick_qty") {
    const qty = Number(text);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) {
      return {
        text: "พิมพ์จำนวน 1-99",
        quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
      };
    }
    return startOptionFlow(
      admin,
      session,
      session.pendingMenuId!,
      session.pendingMenuName!,
      qty,
    );
  }

  if (session.step === "pick_options") {
    const menus = await loadOrderableMenus(session.branchId);
    const menu = menus.find((m) => m.id === session.pendingMenuId);
    if (!menu) {
      const hub = { ...session, step: "hub" as const };
      await saveSession(admin.id, hub);
      return { text: "ไม่พบเมนูแล้ว", quickReply: hubQuickReply() };
    }
    const groups = groupsForMenu(menu);
    const gi = session.optionGroupIndex ?? 0;
    const group = groups[gi];
    if (!group) return commitPendingLine(admin, session);

    const serialized = serializeOptionGroup(group);
    const indices = parseMultiIndices(text);
    if (!indices) {
      return promptOptionGroup(session, group);
    }
    const pickedIds: string[] = [];
    for (const idx of indices) {
      const opt = serialized.options[idx - 1];
      if (!opt) {
        return {
          text: `เลขตัวเลือกไม่ถูกต้อง (1-${serialized.options.length})`,
          quickReply:
            (serialized.minSelect || (serialized.required ? 1 : 0)) === 0
              ? [
                  { label: "ข้าม", data: LINE_POSTBACK.EDIT_SKIP_OPTS },
                  { label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL },
                ]
              : [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
        };
      }
      pickedIds.push(opt.id);
    }
    const min = serialized.minSelect || (serialized.required ? 1 : 0);
    if (pickedIds.length < min || pickedIds.length > serialized.maxSelect) {
      return {
        text: `เลือกได้ ${min}-${serialized.maxSelect} รายการ`,
        quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
      };
    }

    const pendingOptionIds = [
      ...(session.pendingOptionIds ?? []),
      ...pickedIds,
    ];
    const nextGi = gi + 1;
    if (nextGi >= groups.length) {
      return commitPendingLine(admin, {
        ...session,
        pendingOptionIds,
        optionGroupIndex: nextGi,
      });
    }
    const next: LineEditSession = {
      ...session,
      pendingOptionIds,
      optionGroupIndex: nextGi,
    };
    await saveSession(admin.id, next);
    return promptOptionGroup(next, groups[nextGi]!);
  }

  if (session.step === "confirm_save") {
    if (CONFIRM_RE.test(text)) {
      return confirmSave(admin, session);
    }
    const hub = { ...session, step: "hub" as const };
    await saveSession(admin.id, hub);
    return formatHub(hub);
  }

  return formatHub(session);
}

export async function handleEditPostback(
  admin: LinkedAdmin,
  data: string,
): Promise<LineReplyPayload | null> {
  if (data === LINE_POSTBACK.MODE_EDIT) {
    return enterEditMode(admin);
  }

  const session = parseSession(admin.lineEditSession);
  if (
    data === LINE_POSTBACK.EDIT_CANCEL ||
    data === LINE_POSTBACK.MODE_EXIT
  ) {
    if (session && session.step !== "hub" && data === LINE_POSTBACK.EDIT_CANCEL) {
      const hub = { ...session, step: "hub" as const, editingLineIndex: null };
      await saveSession(admin.id, hub);
      return formatHub(hub);
    }
    if (isEditModeActive(admin) || session) {
      return exitEditMode(admin);
    }
    return null;
  }

  if (!session) {
    if (
      data.startsWith("admin:edit:") ||
      data === LINE_POSTBACK.MODE_EDIT
    ) {
      return {
        text: "ยังไม่มีเซสชันแก้ไข — พิมพ์เลขที่ออเดอร์ เช่น A1048",
      };
    }
    return null;
  }

  switch (data) {
    case LINE_POSTBACK.EDIT_ADD:
      return beginAddOrReplace(admin, session, null);
    case LINE_POSTBACK.EDIT_LINE: {
      const next: LineEditSession = { ...session, step: "pick_line_edit" };
      await saveSession(admin.id, next);
      return {
        text: ["พิมพ์เลขบรรทัดที่จะแก้", ...formatDraftLines(session.draft)].join(
          "\n",
        ),
        quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
      };
    }
    case LINE_POSTBACK.EDIT_DELETE_LINE: {
      const next: LineEditSession = { ...session, step: "pick_line_delete" };
      await saveSession(admin.id, next);
      return {
        text: ["พิมพ์เลขบรรทัดที่จะลบ", ...formatDraftLines(session.draft)].join(
          "\n",
        ),
        quickReply: [{ label: "ยกเลิก", data: LINE_POSTBACK.EDIT_CANCEL }],
      };
    }
    case LINE_POSTBACK.EDIT_SAVE:
      return previewSave(admin, session);
    case LINE_POSTBACK.EDIT_CONFIRM:
      return confirmSave(admin, session);
    case LINE_POSTBACK.EDIT_NEXT: {
      const menus = await loadOrderableMenus(session.branchId);
      const totalPages = Math.max(1, Math.ceil(menus.length / MENU_PAGE_SIZE));
      const next: LineEditSession = {
        ...session,
        step: "pick_menu",
        menuPage: Math.min(totalPages - 1, (session.menuPage || 0) + 1),
      };
      await saveSession(admin.id, next);
      return replyPickMenu(next);
    }
    case LINE_POSTBACK.EDIT_PREV: {
      const next: LineEditSession = {
        ...session,
        step: "pick_menu",
        menuPage: Math.max(0, (session.menuPage || 0) - 1),
      };
      await saveSession(admin.id, next);
      return replyPickMenu(next);
    }
    case LINE_POSTBACK.EDIT_SKIP_OPTS: {
      if (session.step !== "pick_options") return formatHub(session);
      const menus = await loadOrderableMenus(session.branchId);
      const menu = menus.find((m) => m.id === session.pendingMenuId);
      if (!menu) return formatHub(session);
      const groups = groupsForMenu(menu);
      const gi = session.optionGroupIndex ?? 0;
      const group = groups[gi];
      if (!group) return commitPendingLine(admin, session);
      const serialized = serializeOptionGroup(group);
      const min = serialized.minSelect || (serialized.required ? 1 : 0);
      if (min > 0) {
        return promptOptionGroup(session, group);
      }
      const nextGi = gi + 1;
      if (nextGi >= groups.length) {
        return commitPendingLine(admin, session);
      }
      const next: LineEditSession = { ...session, optionGroupIndex: nextGi };
      await saveSession(admin.id, next);
      return promptOptionGroup(next, groups[nextGi]!);
    }
    default:
      return null;
  }
}

/**
 * Admin LINE conversational edit-order text flow.
 */
export async function tryHandleLineOrderEdit(
  lineUserId: string,
  rawText: string,
): Promise<{ handled: boolean; reply: LineReplyPayload }> {
  const text = rawText.trim();
  const editMatch = text.match(EDIT_COMMAND_RE);
  const admin = await findLinkedAdmin(lineUserId);

  if (editMatch) {
    const orderNumber = editMatch[1]!.toUpperCase();
    if (!admin) {
      return {
        handled: true,
        reply: {
          text:
            "คำสั่งแก้ไขออเดอร์ใช้ได้เฉพาะแอดมินที่เชื่อม LINE แล้ว\nเข้าแอดมิน → เชื่อม LINE",
        },
      };
    }
    const reply = await startEditSession(admin, orderNumber);
    return { handled: true, reply };
  }

  if (!admin) {
    return { handled: false, reply: { text: "" } };
  }

  if (EXIT_MODE_RE.test(text) && (isEditModeActive(admin) || parseSession(admin.lineEditSession))) {
    return { handled: true, reply: await exitEditMode(admin) };
  }

  const session = parseSession(admin.lineEditSession);
  if (session) {
    // Bare order number while in session hub → switch order
    if (session.step === "hub") {
      const bare = text.match(BARE_ORDER_RE);
      if (bare) {
        const reply = await startEditSession(admin, bare[1]!.toUpperCase());
        return { handled: true, reply };
      }
    }
    const reply = await handleSessionText(admin, session, text);
    return { handled: true, reply };
  }

  if (isEditModeActive(admin)) {
    const bare = text.match(BARE_ORDER_RE);
    if (bare) {
      const reply = await startEditSession(admin, bare[1]!.toUpperCase());
      return { handled: true, reply };
    }
    return {
      handled: true,
      reply: {
        text: "โหมดแก้ไขเปิดอยู่ — พิมพ์เลขที่ออเดอร์ เช่น A1048\nหรือพิมพ์ ยกเลิกโหมด เพื่อออก",
      },
    };
  }

  if (admin.lineEditModeExpiresAt || admin.lineEditSession) {
    await clearEditMode(admin.id);
  }

  return { handled: false, reply: { text: "" } };
}
