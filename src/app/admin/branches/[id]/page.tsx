"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  AdminLoadingState,
  adminInputClass,
  adminLabelClass,
  adminSelectClass,
  btnDanger,
  btnDark,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { ImageField } from "@/components/admin/ImageField";
import { AdminModal } from "@/components/admin/AdminModal";
import { OrdersTable, type AdminOrderRow } from "@/components/admin/OrdersTable";
import { RevenueBars } from "@/components/admin/RevenueBars";
import { DateInput } from "@/components/DateInput";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { PhoneInput } from "@/components/PhoneInput";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { BranchLocationPicker } from "@/components/admin/BranchLocationPicker";
import { AdminMapLocationPicker } from "@/components/admin/AdminMapLocationPicker";
import type { MapLocationValue } from "@/components/admin/AdminMapLocationField";
import { BranchHoursEditor } from "@/components/admin/BranchHoursEditor";
import { BranchOptionLibrary } from "@/components/admin/BranchOptionLibrary";
import { BranchCategoryLibrary } from "@/components/admin/BranchCategoryLibrary";
import { BranchBbqPanel } from "@/components/admin/BranchBbqPanel";
import {
  BRANCH_OPERATING_MODE_META,
  branchOperatingModeLabel,
  isBranchOperatingMode,
  type BranchOperatingModeId,
} from "@/lib/branch-operating-mode";
import { HOTPOT_COUNTER_GROUP } from "@/lib/hotpot-counter-group";
import { BranchShareCopyPanel } from "@/components/admin/BranchShareCopyPanel";
import { BranchCustomerQrCard } from "@/components/admin/BranchCustomerQrCard";
import { BranchMenuSalesPanel } from "@/components/admin/BranchMenuSalesPanel";
import { BranchOrdersPanel } from "@/components/admin/BranchOrdersPanel";
import { BranchSkewerOrdersPanel } from "@/components/admin/BranchSkewerOrdersPanel";
import { BranchShiftsPanel } from "@/components/admin/BranchShiftsPanel";
import { BranchStockPanel } from "@/components/admin/BranchStockPanel";
import { BranchExpensesPanel } from "@/components/admin/BranchExpensesPanel";
import { AdminCloseStoreModal } from "@/components/admin/AdminCloseStoreModal";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { MenuBestSellerTag } from "@/components/customer/MenuChannelPrice";
import { WAREHOUSE_UI_ENABLED } from "@/lib/warehouse-ui";
import {
  IconBack,
  IconChevronRight,
  IconClose,
  IconDelivery,
  IconEdit,
  IconPackage,
  IconPin,
  IconPlus,
  IconStore,
  IconTrash,
  IconUser,
} from "@/components/icons";
import {
  bangkokDateKey,
  bangkokMonthRangeToToday,
  formatThaiPhone,
  phoneDigits,
} from "@/lib/constants";
import {
  assignStableMenuSequence,
  sortMenuItemData,
} from "@/lib/staff-menu-order";
import { resolveMenuDisplayImageUrl } from "@/lib/skewer-order";
import {
  ensureWeeklySchedule,
  formatTodayHoursSummary,
  getBranchServiceStatus,
  type WeeklySchedule,
} from "@/lib/branch-hours";
import {
  PRICE_RANGE_OPTIONS,
} from "@/lib/localized";
import { slugifyCode } from "@/lib/slug";
import { BRANCH_IMAGE_SIZE_HINT } from "@/lib/image-guides";
import type { PriceRangeId } from "@/lib/localized";
import type { StaffRole } from "@prisma/client";

type PhoneCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; notice?: string | null }
  | { status: "incomplete" }
  | {
      status: "taken";
      staffName: string | null;
      branchName: string | null;
    }
  | { status: "error"; message: string };

type Brand = {
  id: string;
  code: string;
  name: string;
  nameTh?: string | null;
  nameEn?: string | null;
  stockEnabled?: boolean;
  bbqEnabled?: boolean;
};

type OrderStats = {
  completedRevenue: number;
  cancelledRevenue: number;
  completedCount: number;
  cancelledCount: number;
  openCount: number;
  totalOrders: number;
  last7Days: {
    date: string;
    label: string;
    revenue: number;
    cancelled: number;
  }[];
};

type BranchDetail = {
  id: string;
  brandId: string | null;
  code: string | null;
  name: string;
  nameTh: string | null;
  nameEn: string | null;
  imageUrl: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  primaryCategory: string | null;
  secondaryCategories: string[];
  priceRange: PriceRangeId | null;
  ownerMessage: string | null;
  extraMessage: string | null;
  isOpen: boolean;
  isHidden: boolean;
  isTest?: boolean;
  kind?: "STORE" | "WAREHOUSE";
  warehouseIssueMode?: "TRANSFER" | "ISSUE" | "BOTH";
  warehouseAllowedBranchIds?: string[];
  opensAt: string | null;
  closesAt: string | null;
  storefrontHours: unknown;
  deliveryHours: unknown;
  allowAdvanceOrder: boolean;
  autoAcceptOrders: boolean;
  stockEnabled: boolean;
  weighSalesEnabled?: boolean;
  operatingMode?: BranchOperatingModeId;
  brand: Brand | null;
  staff: {
    id: string;
    phone: string;
    name: string | null;
    gender: string | null;
    age: number | null;
    imageUrl: string | null;
    isActive: boolean;
    phoneVerifiedAt?: string | null;
    lineUserId?: string | null;
    lineNotifyEnabled?: boolean;
    roles: { id: string; role: StaffRole }[];
  }[];
  menuItems: {
    id: string;
    name: string;
    price: string;
    pickupPrice?: string | null;
    storefrontPrice?: string | null;
    sellDelivery?: boolean;
    sellPickup?: boolean;
    sellStorefront?: boolean;
    description: string | null;
    category: { id: string; name: string; sortOrder?: number } | null;
    imageUrl: string | null;
    skewerImageUrl?: string | null;
    isHidden: boolean;
    isOutOfStock: boolean;
    sortOrder: number;
    isBestSeller?: boolean;
  }[];
  menuCategories?: { id: string; name: string; sortOrder?: number }[];
  optionGroups?: { id: string; name: string; options?: unknown[] }[];
  deliveryLocations: {
    id: string;
    name: string;
    deliveryFee: string | number;
    isCustomAddress?: boolean;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  }[];
  orders: AdminOrderRow[];
  orderStats?: OrderStats;
};

type TabId =
  | "overview"
  | "menu"
  | "categories"
  | "options"
  | "copy"
  | "orders"
  | "skewer-orders"
  | "bbq-tables"
  | "bbq-sessions"
  | "bbq-bills"
  | "shifts"
  | "stock"
  | "expenses"
  | "staff"
  | "locations"
  | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "ภาพรวม" },
  { id: "orders", label: "ออเดอร์" },
  { id: "skewer-orders", label: "ออเดอร์เสียบไม้" },
  { id: "bbq-tables", label: "โต๊ะ / QR" },
  { id: "bbq-sessions", label: "บิลเปิด / ชั่ง" },
  { id: "bbq-bills", label: "บิลปิดแล้ว" },
  { id: "shifts", label: "รอบขาย" },
  { id: "stock", label: "สต๊อก" },
  { id: "expenses", label: "ค่าใช้จ่าย" },
  { id: "menu", label: "เมนู" },
  { id: "categories", label: "หมวดหมู่" },
  { id: "options", label: "ตัวเลือก" },
  { id: "staff", label: "พนักงาน" },
  { id: "locations", label: "พื้นที่จัดส่ง" },
  { id: "settings", label: "ตั้งค่าสาขา" },
  { id: "copy", label: "คัดลอก" },
];

type TabGroupId = "sales" | "menu" | "team" | "settings";

const TAB_GROUPS: {
  id: TabGroupId;
  label: string;
  tabIds: TabId[];
}[] = [
  {
    id: "sales",
    label: "ขาย",
    tabIds: [
      "overview",
      "orders",
      "skewer-orders",
      "bbq-tables",
      "bbq-sessions",
      "bbq-bills",
      "shifts",
      "stock",
      "expenses",
    ],
  },
  {
    id: "menu",
    label: "เมนู",
    tabIds: ["menu", "categories", "options"],
  },
  {
    id: "team",
    label: "ทีมและส่ง",
    tabIds: ["staff", "locations"],
  },
  {
    id: "settings",
    label: "ตั้งค่า",
    tabIds: ["settings", "copy"],
  },
];

const TAB_BY_ID = Object.fromEntries(TABS.map((t) => [t.id, t])) as Record<
  TabId,
  (typeof TABS)[number]
>;

const SKEWER_HIDDEN_TABS = new Set<TabId>([
  "orders",
  "bbq-tables",
  "bbq-sessions",
  "bbq-bills",
  "shifts",
  "stock",
  "expenses",
  "staff",
  "locations",
  "options",
]);

const NORMAL_HIDDEN_TABS = new Set<TabId>([
  "skewer-orders",
  "bbq-tables",
  "bbq-sessions",
  "bbq-bills",
]);

const BBQ_WEIGH_HIDDEN_TABS = new Set<TabId>([
  "orders",
  "skewer-orders",
  "shifts",
  "stock",
  "expenses",
  "locations",
  "options",
]);

const WAREHOUSE_HIDDEN_TABS = new Set<TabId>([
  "overview",
  "orders",
  "skewer-orders",
  "bbq-tables",
  "bbq-sessions",
  "bbq-bills",
  "shifts",
  "menu",
  "categories",
  "options",
  "locations",
  "copy",
]);

function hiddenTabsForMode(
  mode: BranchOperatingModeId,
  weighSalesEnabled = false,
  kind?: string | null,
): Set<TabId> {
  if (kind === "WAREHOUSE") return WAREHOUSE_HIDDEN_TABS;
  if (mode === "SKEWER") return SKEWER_HIDDEN_TABS;
  if (mode === "BBQ_WEIGH") return BBQ_WEIGH_HIDDEN_TABS;
  // Dual: mala + weigh — show BBQ tabs alongside NORMAL
  if (weighSalesEnabled) {
    return new Set<TabId>(["skewer-orders"]);
  }
  return NORMAL_HIDDEN_TABS;
}

function defaultTabForMode(
  mode: BranchOperatingModeId,
  kind?: string | null,
): TabId {
  if (kind === "WAREHOUSE") return "staff";
  if (mode === "SKEWER") return "skewer-orders";
  if (mode === "BBQ_WEIGH") return "bbq-tables";
  return "orders";
}

type TabAttention = {
  tone: "warn" | "info";
  title: string;
  badge?: string;
};

function hasBranchMapPin(branch: {
  latitude: number | null;
  longitude: number | null;
}) {
  return (
    branch.latitude != null &&
    branch.longitude != null &&
    Number.isFinite(branch.latitude) &&
    Number.isFinite(branch.longitude)
  );
}

function getBranchSettingsGaps(branch: {
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  primaryCategory: string | null;
}): string[] {
  const missing: string[] = [];
  if (!hasBranchMapPin(branch)) missing.push("หมุดร้าน");
  if (!branch.phone?.trim()) missing.push("เบอร์โทร");
  if (!branch.primaryCategory) missing.push("ประเภทอาหาร");
  return missing;
}

function formatMenuBaht(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  return `฿${n.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function MenuChannelPrices({
  item,
}: {
  item: {
    price: string;
    pickupPrice?: string | null;
    storefrontPrice?: string | null;
  };
}) {
  const rows = [
    {
      key: "delivery",
      label: "เดลิเวอรี่",
      icon: IconDelivery,
      iconClass: "text-green-600",
      value: formatMenuBaht(item.price),
    },
    {
      key: "pickup",
      label: "รับที่ร้าน",
      icon: IconPackage,
      iconClass: "text-sky-600",
      value: formatMenuBaht(item.pickupPrice ?? item.price),
    },
    {
      key: "storefront",
      label: "หน้าร้าน",
      icon: IconStore,
      iconClass: "text-amber-800",
      value: formatMenuBaht(item.storefrontPrice ?? item.price),
    },
  ] as const;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-gray-600">
      {rows.map(({ key, label, icon: Icon, iconClass, value }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1"
          title={label}
        >
          <Icon size={13} className={`shrink-0 ${iconClass}`} />
          <span className="font-medium text-gray-800">{value}</span>
        </span>
      ))}
    </div>
  );
}

function getTabAttention(
  tabId: TabId,
  branch: BranchDetail,
): TabAttention | null {
  switch (tabId) {
    case "orders": {
      const open = branch.orderStats?.openCount ?? 0;
      if (open <= 0) return null;
      return {
        tone: "info",
        title: `มีออเดอร์ค้าง ${open} รายการ`,
        badge: open > 99 ? "99+" : String(open),
      };
    }
    case "menu":
      if (branch.menuItems.length > 0) return null;
      return { tone: "warn", title: "ยังไม่มีเมนู" };
    case "categories":
      if ((branch.menuCategories?.length ?? 0) > 0) return null;
      return { tone: "warn", title: "ยังไม่มีหมวดหมู่" };
    case "staff":
      if ((branch.staff ?? []).some((s) => s.isActive)) return null;
      return { tone: "warn", title: "ยังไม่มีพนักงานที่เปิดใช้งาน" };
    case "locations":
      if (branch.deliveryLocations.length > 0) return null;
      return {
        tone: "warn",
        title: "ยังไม่มีพื้นที่จัดส่ง — ลูกค้าสั่งได้แค่รับที่ร้าน",
      };
    case "settings": {
      const missing = getBranchSettingsGaps(branch);
      if (missing.length === 0) return null;
      return {
        tone: "warn",
        title: `ตั้งค่ายังไม่ครบ: ${missing.join(", ")}`,
        badge: String(missing.length),
      };
    }
    default:
      return null;
  }
}

const GENDER_OPTIONS = [
  { value: "male" as const, label: "ชาย" },
  { value: "female" as const, label: "หญิง" },
  { value: "other" as const, label: "อื่น ๆ" },
];

const GENDER_LABELS: Record<string, string> = {
  male: "ชาย",
  female: "หญิง",
  other: "อื่น ๆ",
};

const ROLE_LABELS: Record<StaffRole, string> = {
  SELLER: "คนขาย",
  DELIVERY: "คนส่ง",
};

const panelClass = "rounded-2xl border border-gray-200 bg-white p-4 shadow-sm";

function StatusPill({
  on,
  onLabel,
  offLabel,
}: {
  on: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        on
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {on ? onLabel : offLabel}
    </span>
  );
}

function ServiceHourCard({
  icon,
  label,
  hours,
  statusLabel,
  statusTone,
}: {
  icon: ReactNode;
  label: string;
  hours: string;
  statusLabel: string;
  statusTone: "open" | "advance" | "closed";
}) {
  const toneClass =
    statusTone === "open"
      ? "text-emerald-600"
      : statusTone === "advance"
        ? "text-amber-600"
        : "text-slate-500";

  return (
    <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50/90 to-white p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-sm font-semibold text-slate-900">{hours}</p>
      <p className={`mt-0.5 text-xs ${toneClass}`}>{statusLabel}</p>
    </div>
  );
}

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

export default function BranchDetailPage() {
  return (
    <Suspense fallback={<AdminLoadingState />}>
      <BranchDetailContent />
    </Suspense>
  );
}

function BranchDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { session } = useAdminSession();
  const tabParam = searchParams.get("tab");
  const activeTab: TabId = isTabId(tabParam) ? tabParam : "overview";

  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);

  const [settings, setSettings] = useState({
    name: "",
    nameTh: "",
    nameEn: "",
    brandId: "",
    code: "",
    imageUrl: "",
    address: "",
    latitude: null as number | null,
    longitude: null as number | null,
    phone: "",
    primaryCategory: "",
    secondaryCategories: [] as string[],
    priceRange: "" as "" | PriceRangeId,
    ownerMessage: "",
    extraMessage: "",
    isOpen: true,
    isHidden: false,
    isTest: false,
    allowAdvanceOrder: true,
    autoAcceptOrders: false,
    stockEnabled: false,
    weighSalesEnabled: false,
    operatingMode: "NORMAL" as BranchOperatingModeId,
    storefrontHours: null as WeeklySchedule | null,
    deliveryHours: null as WeeklySchedule | null,
  });

  const [staffPhone, setStaffPhone] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffGender, setStaffGender] = useState<"" | "male" | "female" | "other">("");
  const [staffAge, setStaffAge] = useState("");
  const [staffImageUrl, setStaffImageUrl] = useState("");
  const [staffSeller, setStaffSeller] = useState(true);
  const [staffDelivery, setStaffDelivery] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffSaving, setStaffSaving] = useState(false);
  const [phoneCheck, setPhoneCheck] = useState<PhoneCheckState>({
    status: "idle",
  });
  const toast = useToast();
  const { confirm } = useConfirm();

  const emptyLocationMap = (): MapLocationValue => ({
    address: "",
    latitude: null,
    longitude: null,
  });
  const [locationName, setLocationName] = useState("");
  const [locationFee, setLocationFee] = useState("0");
  const [locationCustomAddress, setLocationCustomAddress] = useState(false);
  const [locationMap, setLocationMap] = useState<MapLocationValue>(emptyLocationMap);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null,
  );
  const [editLocationName, setEditLocationName] = useState("");
  const [editLocationFee, setEditLocationFee] = useState("0");
  const [editLocationCustomAddress, setEditLocationCustomAddress] =
    useState(false);
  const [editLocationMap, setEditLocationMap] =
    useState<MapLocationValue>(emptyLocationMap);
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [menuSetupModalOpen, setMenuSetupModalOpen] = useState(false);
  const [stockPasteOpen, setStockPasteOpen] = useState(false);
  const [stockPasteText, setStockPasteText] = useState("");
  const [stockPasteBusy, setStockPasteBusy] = useState(false);
  const [closeStoreOpen, setCloseStoreOpen] = useState(false);
  const [closeStoreBusy, setCloseStoreBusy] = useState(false);
  const [stockPasteResult, setStockPasteResult] = useState<{
    hiddenCount: number;
    toHide: { id: string; name: string; matchedFrom: string }[];
    alreadyHidden: { id: string; name: string; matchedFrom: string }[];
    notFound: { raw: string; name: string }[];
    soldOutParsed: { raw: string; name: string }[];
  } | null>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuCategoryFilter, setMenuCategoryFilter] = useState("ALL");
  const [menuStatusFilter, setMenuStatusFilter] = useState<
    "ALL" | "OUT_OF_STOCK" | "HIDDEN"
  >("ALL");
  const [menuDraggingId, setMenuDraggingId] = useState<string | null>(null);
  const [menuDragOverId, setMenuDragOverId] = useState<string | null>(null);
  const [menuReorderSaving, setMenuReorderSaving] = useState(false);
  const menuDragStartOrderRef = useRef<string[]>([]);
  const menuItemsOrderRef = useRef<string[]>([]);
  const [codeManual, setCodeManual] = useState(false);
  const [codeFieldOpen, setCodeFieldOpen] = useState(false);
  const [restaurantTypes, setRestaurantTypes] = useState<
    { code: string; name: string }[]
  >([]);
  const [overviewFrom, setOverviewFrom] = useState(
    () => bangkokMonthRangeToToday().from,
  );
  const [overviewTo, setOverviewTo] = useState(
    () => bangkokMonthRangeToToday().to,
  );
  const [overviewSummary, setOverviewSummary] = useState<{
    completedRevenue: number;
    cashRevenue: number;
    transferRevenue: number;
    completedOrderCount: number;
    stockQty: number;
    stockValue: number;
    wasteQty: number;
    wasteValue: number;
    expenseTotal: number;
    expenseCount: number;
    cashExpense: number;
    transferExpense: number;
    netRevenue: number;
    days: OrderStats["last7Days"];
  } | null>(null);
  const [overviewStatsLoading, setOverviewStatsLoading] = useState(false);

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function load() {
    const [branchRes, brandsRes, typesRes] = await Promise.all([
      fetch(`/api/admin/branches/${id}`),
      fetch("/api/admin/brands"),
      fetch("/api/admin/restaurant-types?active=1"),
    ]);
    if (branchRes.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (!branchRes.ok) {
      const err = await branchRes.json().catch(() => ({}));
      toast.error("โหลดสาขาไม่สำเร็จ", err.error ?? "กรุณาลองใหม่");
      return;
    }
    const data: BranchDetail = await branchRes.json();
    if (!WAREHOUSE_UI_ENABLED && data.kind === "WAREHOUSE") {
      router.replace(
        data.brandId ? `/admin/brands/${data.brandId}` : "/admin",
      );
      return;
    }
    setBranch({
      ...data,
      menuItems: data.menuItems ?? [],
      menuCategories: data.menuCategories ?? [],
      optionGroups: data.optionGroups ?? [],
      staff: data.staff ?? [],
      deliveryLocations: data.deliveryLocations ?? [],
      orders: data.orders ?? [],
    });
    if (typesRes.ok) {
      const types = await typesRes.json();
      setRestaurantTypes(
        Array.isArray(types)
          ? types.map((t: { code: string; name: string }) => ({
              code: t.code,
              name: t.name,
            }))
          : [],
      );
    }
    setSettings({
      name: data.name,
      nameTh: data.nameTh ?? "",
      nameEn: data.nameEn ?? "",
      brandId: data.brandId ?? "",
      code: data.code ?? "",
      imageUrl: data.imageUrl ?? "",
      address: data.address ?? "",
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      phone: data.phone ?? "",
      primaryCategory: data.primaryCategory ?? "",
      secondaryCategories: Array.isArray(data.secondaryCategories)
        ? data.secondaryCategories.slice(0, 2)
        : [],
      priceRange: data.priceRange ?? "",
      ownerMessage: data.ownerMessage ?? "",
      extraMessage: data.extraMessage ?? "",
      isOpen: data.isOpen,
      isHidden: data.isHidden ?? false,
      isTest: data.isTest ?? false,
      allowAdvanceOrder: data.allowAdvanceOrder,
      autoAcceptOrders: data.autoAcceptOrders ?? false,
      stockEnabled: data.stockEnabled ?? false,
      weighSalesEnabled: data.weighSalesEnabled ?? false,
      operatingMode: isBranchOperatingMode(data.operatingMode)
        ? data.operatingMode
        : "NORMAL",
      storefrontHours: ensureWeeklySchedule(
        data.storefrontHours,
        data.opensAt,
        data.closesAt,
      ),
      deliveryHours: ensureWeeklySchedule(
        data.deliveryHours,
        data.opensAt,
        data.closesAt,
      ),
    });
    if (brandsRes.ok) setBrands(await brandsRes.json());
  }

  useEffect(() => {
    load();
  }, [id, router]);

  useEffect(() => {
    if (activeTab !== "overview") return;
    let cancelled = false;
    setOverviewStatsLoading(true);
    const from = overviewFrom <= overviewTo ? overviewFrom : overviewTo;
    const to = overviewFrom <= overviewTo ? overviewTo : overviewFrom;
    const params = new URLSearchParams({ from, to });
    fetch(`/api/admin/branches/${id}/overview?${params}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "โหลดสรุปไม่สำเร็จ");
        return body as NonNullable<typeof overviewSummary>;
      })
      .then((body) => {
        if (cancelled) return;
        setOverviewSummary(body);
      })
      .catch(() => {
        if (!cancelled) setOverviewSummary(null);
      })
      .finally(() => {
        if (!cancelled) setOverviewStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, activeTab, overviewFrom, overviewTo]);

  useEffect(() => {
    if (!branch) return;
    const mode: BranchOperatingModeId = isBranchOperatingMode(
      branch.operatingMode,
    )
      ? branch.operatingMode
      : "NORMAL";
    const hidden = hiddenTabsForMode(
      mode,
      Boolean(branch.weighSalesEnabled),
      branch.kind,
    );
    if (hidden.has(activeTab)) {
      setTab(defaultTabForMode(mode, branch.kind));
    }
  }, [branch?.operatingMode, branch?.weighSalesEnabled, branch?.kind, activeTab, branch]);

  useEffect(() => {
    if (!staffModalOpen) {
      setPhoneCheck({ status: "idle" });
      return;
    }

    const digits = phoneDigits(staffPhone);
    if (digits.length < 9) {
      setPhoneCheck({
        status: digits.length === 0 ? "idle" : "incomplete",
      });
      return;
    }

    setPhoneCheck({ status: "checking" });
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ phone: digits });
        if (editingStaffId) params.set("excludeId", editingStaffId);
        if (id) params.set("branchId", id);
        const res = await fetch(`/api/admin/staff/phone-check?${params}`);
        const data = await res.json();
        if (!res.ok) {
          setPhoneCheck({
            status: "error",
            message: data.error ?? "ตรวจสอบเบอร์ไม่สำเร็จ",
          });
          return;
        }
        if (data.available === null) {
          setPhoneCheck({ status: "incomplete" });
        } else if (data.available) {
          const notice =
            data.multiBranch || data.otherBranches?.length
              ? `เบอร์นี้มีในสาขาอื่นแล้ว — เพิ่มในสาขานี้ได้ (คนเดียวกันหลายสาขา)`
              : null;
          setPhoneCheck({ status: "available", notice });
        } else {
          setPhoneCheck({
            status: "taken",
            staffName: data.staffName ?? null,
            branchName: data.branchName ?? null,
          });
        }
      } catch {
        setPhoneCheck({
          status: "error",
          message: "ตรวจสอบเบอร์ไม่สำเร็จ",
        });
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [staffPhone, staffModalOpen, editingStaffId, id]);

  async function saveBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!settings.storefrontHours || !settings.deliveryHours) {
      toast.error("บันทึกไม่สำเร็จ", "ตารางเวลายังไม่พร้อม");
      return;
    }
    if (settings.phone.trim() && phoneDigits(settings.phone).length < 9) {
      toast.error("เบอร์โทรไม่ถูกต้อง", "กรอกเบอร์อย่างน้อย 9 หลัก");
      return;
    }
    const code = settings.code.trim()
      ? slugifyCode(settings.code) || settings.code.trim().toLowerCase()
      : null;
    if (code && !/^[a-z0-9-]+$/.test(code)) {
      toast.error(
        "รหัสสาขาไม่ถูกต้อง",
        "ใช้ตัวพิมพ์เล็ก a-z ตัวเลข และขีด (-) เท่านั้น",
      );
      return;
    }
    if (branch && branch.deliveryLocations.length === 0) {
      const ok = await confirm({
        title: "ยังไม่มีพื้นที่จัดส่ง",
        message:
          "ลูกค้าสั่งได้แค่รับที่ร้านจนกว่าจะเพิ่มพื้นที่อย่างน้อย 1 โซน — เวลาเปิด–ปิดเดลิเวอรียังไม่มีผลจนกว่าจะมีพื้นที่",
        confirmLabel: "บันทึกต่อไป",
        cancelLabel: "ไปเพิ่มพื้นที่",
        tone: "primary",
      });
      if (!ok) {
        setTab("locations");
        return;
      }
    }

    const res = await fetch(`/api/admin/branches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settings.name.trim(),
        nameTh: settings.nameTh.trim() || null,
        nameEn: settings.nameEn.trim() || null,
        code,
        imageUrl: settings.imageUrl.trim() || null,
        address: settings.address.trim() || null,
        latitude: settings.latitude,
        longitude: settings.longitude,
        phone: settings.phone.trim() || null,
        primaryCategory: settings.primaryCategory || null,
        secondaryCategories: settings.secondaryCategories.filter(Boolean).slice(0, 2),
        priceRange: settings.priceRange || null,
        ownerMessage: settings.ownerMessage.trim() || null,
        extraMessage: settings.extraMessage.trim() || null,
        isOpen: settings.isOpen,
        allowAdvanceOrder: settings.allowAdvanceOrder,
        autoAcceptOrders: settings.autoAcceptOrders,
        storefrontHours: settings.storefrontHours,
        deliveryHours: settings.deliveryHours,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("บันทึกตั้งค่าแล้ว");
    load();
  }

  async function patchBranchSetting(
    payload: Record<string, unknown>,
    opts: {
      successMessage: string;
      errorTitle: string;
      confirm?: {
        title: string;
        message: string;
        confirmLabel: string;
        cancelLabel?: string;
        tone?: "danger" | "primary";
      };
      onSuccessLocal?: () => void;
    },
  ) {
    if (opts.confirm) {
      const ok = await confirm({
        ...opts.confirm,
        cancelLabel: opts.confirm.cancelLabel ?? "ยกเลิก",
        tone: opts.confirm.tone ?? "danger",
      });
      if (!ok) return;
    }
    const res = await fetch(`/api/admin/branches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(opts.errorTitle, data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success(opts.successMessage);
    opts.onSuccessLocal?.();
    load();
  }

  async function deleteBranch() {
    const ok = await confirm({
      title: "ลบสาขานี้?",
      message:
        "ลบถาวร — เมนู พนักงาน พื้นที่ส่ง และข้อมูลสาขาจะหายไป หากมีออเดอร์อยู่แล้วจะลบไม่ได้ ให้ซ่อนสาขาแทน",
      confirmLabel: "ลบสาขา",
      cancelLabel: "ยกเลิก",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/branches/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("ลบไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("ลบสาขาแล้ว");
    router.push("/admin");
  }

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    const roles: StaffRole[] = [];
    if (staffSeller || branch?.kind === "WAREHOUSE") roles.push("SELLER");
    if (staffDelivery && branch?.kind !== "WAREHOUSE") roles.push("DELIVERY");
    if (roles.length === 0) {
      toast.error("บันทึกไม่สำเร็จ", "เลือกอย่างน้อย 1 บทบาท");
      return;
    }
    if (phoneCheck.status === "taken") {
      toast.error("บันทึกไม่สำเร็จ", "เบอร์โทรนี้มีในสาขานี้แล้ว");
      return;
    }
    const ageNum = staffAge.trim() ? parseInt(staffAge, 10) : null;
    setStaffSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${id}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: staffPhone,
          name: staffName.trim() || null,
          gender: staffGender || null,
          age: Number.isFinite(ageNum) ? ageNum : null,
          imageUrl: staffImageUrl.trim() || null,
          roles,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เพิ่มพนักงานไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("เพิ่มพนักงานสำเร็จ", "บันทึกพนักงานใหม่เรียบร้อยแล้ว");
      resetStaffForm();
      setStaffModalOpen(false);
      await load();
    } catch {
      toast.error("เพิ่มพนักงานไม่สำเร็จ", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setStaffSaving(false);
    }
  }

  function resetStaffForm() {
    setStaffPhone("");
    setStaffName("");
    setStaffGender("");
    setStaffAge("");
    setStaffImageUrl("");
    setStaffSeller(true);
    setStaffDelivery(false);
    setEditingStaffId(null);
    setPhoneCheck({ status: "idle" });
  }

  function openCreateStaffModal() {
    resetStaffForm();
    setStaffModalOpen(true);
  }

  function startEditStaff(staff: BranchDetail["staff"][number]) {
    setEditingStaffId(staff.id);
    setStaffPhone(staff.phone);
    setStaffName(staff.name ?? "");
    setStaffImageUrl(staff.imageUrl ?? "");
    setStaffGender(
      staff.gender === "male" ||
        staff.gender === "female" ||
        staff.gender === "other"
        ? staff.gender
        : "",
    );
    setStaffAge(staff.age != null ? String(staff.age) : "");
    setStaffSeller(staff.roles.some((r) => r.role === "SELLER"));
    setStaffDelivery(staff.roles.some((r) => r.role === "DELIVERY"));
    setStaffModalOpen(true);
  }

  async function saveStaffEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStaffId) return;
    const roles: StaffRole[] = [];
    if (staffSeller || branch?.kind === "WAREHOUSE") roles.push("SELLER");
    if (staffDelivery && branch?.kind !== "WAREHOUSE") roles.push("DELIVERY");
    if (roles.length === 0) {
      toast.error("บันทึกไม่สำเร็จ", "เลือกอย่างน้อย 1 บทบาท");
      return;
    }
    if (phoneCheck.status === "taken") {
      toast.error("บันทึกไม่สำเร็จ", "เบอร์โทรนี้มีในสาขานี้แล้ว");
      return;
    }
    const ageNum = staffAge.trim() ? parseInt(staffAge, 10) : null;
    setStaffSaving(true);
    try {
      const res = await fetch(
        `/api/admin/branches/${id}/staff/${editingStaffId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: staffPhone,
            roles,
            imageUrl: staffImageUrl.trim() || null,
            name: staffName.trim() || null,
            gender: staffGender || null,
            age: Number.isFinite(ageNum) ? ageNum : null,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("แก้ไขไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("แก้ไขสำเร็จ", "อัปเดตข้อมูลพนักงานแล้ว");
      resetStaffForm();
      setStaffModalOpen(false);
      await load();
    } catch {
      toast.error("แก้ไขไม่สำเร็จ", "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setStaffSaving(false);
    }
  }

  function closeStaffModal() {
    setStaffModalOpen(false);
    resetStaffForm();
  }

  async function unlinkStaffLine(staffId: string) {
    const ok = await confirm({
      title: "ยกเลิกเชื่อม LINE?",
      message: "พนักงานคนนี้จะไม่ได้รับแจ้งเตือนทาง LINE จนกว่าจะผูกใหม่",
      confirmLabel: "ยกเลิกเชื่อม",
    });
    if (!ok) return;
    await fetch(`/api/admin/branches/${id}/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lineUserId: null }),
    });
    load();
  }

  async function revokeStaffSessions(staffId: string, name: string | null) {
    const ok = await confirm({
      title: "ปลดทุกเครื่องที่เข้าใช้งาน?",
      message:
        "เบอร์นี้จะถูกออกจากระบบทุกเครื่อง (สูงสุด 3 เครื่อง) พนักงานต้องเข้าสู่ระบบใหม่",
      confirmLabel: "ปลดเครื่อง",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/branches/${id}/staff/${staffId}/sessions`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("ปลดเครื่องไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("ปลดเครื่องแล้ว", `${name?.trim() || "พนักงาน"} ต้องเข้าสู่ระบบใหม่`);
  }

  async function toggleStaffActive(staffId: string, isActive: boolean) {
    await fetch(`/api/admin/branches/${id}/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    load();
  }

  async function deleteStaff(staffId: string) {
    const ok = await confirm({
      title: "ลบพนักงาน?",
      message: "ลบพนักงานออกจากสาขานี้",
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    await fetch(`/api/admin/branches/${id}/staff/${staffId}`, {
      method: "DELETE",
    });
    load();
  }

  async function applyStockPasteHide() {
    if (!stockPasteText.trim()) {
      toast.error("วางข้อความสต็อกก่อน");
      return;
    }
    setStockPasteBusy(true);
    setStockPasteResult(null);
    try {
      const res = await fetch(
        `/api/admin/branches/${id}/menu-items/hide-from-stock-paste`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: stockPasteText, apply: true }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "ซ่อนเมนูไม่สำเร็จ");
        return;
      }
      setStockPasteResult(data);
      const hidden = data.hiddenCount ?? 0;
      const notFoundCount = Array.isArray(data.notFound)
        ? data.notFound.length
        : 0;
      if (hidden > 0) {
        toast.success(
          `ซ่อนแล้ว ${hidden} รายการ`,
          notFoundCount
            ? `ไม่พบในระบบ ${notFoundCount} รายการ`
            : undefined,
        );
      } else {
        toast.pushToast({
          title: "ไม่มีรายการใหม่ที่ต้องซ่อน",
          message: notFoundCount
            ? `ไม่พบในระบบ ${notFoundCount} รายการ`
            : "รายการหมดอาจซ่อนไว้แล้ว",
          tone: "info",
        });
      }
      await load();
    } catch {
      toast.error("ซ่อนเมนูไม่สำเร็จ");
    } finally {
      setStockPasteBusy(false);
    }
  }

  async function toggleHidden(menuId: string, isHidden: boolean) {
    const patch = isHidden
      ? { isHidden: true, isOutOfStock: false }
      : { isHidden: false };
    setBranch((prev) =>
      prev
        ? {
            ...prev,
            menuItems: prev.menuItems.map((m) =>
              m.id === menuId ? { ...m, ...patch } : m,
            ),
          }
        : prev,
    );
    const res = await fetch(`/api/admin/branches/${id}/menu-items/${menuId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) load();
  }

  async function toggleOutOfStock(menuId: string, isOutOfStock: boolean) {
    const patch = isOutOfStock
      ? { isOutOfStock: true, isHidden: false }
      : { isOutOfStock: false };
    setBranch((prev) =>
      prev
        ? {
            ...prev,
            menuItems: prev.menuItems.map((m) =>
              m.id === menuId ? { ...m, ...patch } : m,
            ),
          }
        : prev,
    );
    const res = await fetch(`/api/admin/branches/${id}/menu-items/${menuId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) load();
  }

  async function deleteMenu(menuId: string) {
    const ok = await confirm({
      title: "ลบเมนู?",
      message: "ลบเมนูนี้ออกจากสาขา ไม่สามารถกู้คืนได้",
      confirmLabel: "ลบเมนู",
    });
    if (!ok) return;
    await fetch(`/api/admin/branches/${id}/menu-items/${menuId}`, {
      method: "DELETE",
    });
    load();
  }

  function branchReferencePin() {
    if (
      branch?.latitude == null ||
      branch?.longitude == null ||
      !Number.isFinite(branch.latitude) ||
      !Number.isFinite(branch.longitude)
    ) {
      return null;
    }
    return {
      latitude: branch.latitude,
      longitude: branch.longitude,
      label: branch.name,
    };
  }

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    const fee = Number(locationFee);
    const res = await fetch(`/api/admin/branches/${id}/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: locationName.trim(),
        deliveryFee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
        isCustomAddress: locationCustomAddress,
        address: locationMap.address.trim() || null,
        latitude: locationMap.latitude,
        longitude: locationMap.longitude,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("เพิ่มพื้นที่ไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    setLocationName("");
    setLocationFee("0");
    setLocationCustomAddress(false);
    setLocationMap(emptyLocationMap());
    setLocationModalOpen(false);
    toast.success("เพิ่มพื้นที่จัดส่งแล้ว");
    load();
  }

  async function saveLocation(locationId: string) {
    if (!editLocationName.trim()) return;
    const fee = Number(editLocationFee);
    const res = await fetch(`/api/admin/branches/${id}/locations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locationId,
        name: editLocationName.trim(),
        deliveryFee: Number.isFinite(fee) && fee >= 0 ? fee : 0,
        isCustomAddress: editLocationCustomAddress,
        address: editLocationMap.address.trim() || null,
        latitude: editLocationMap.latitude,
        longitude: editLocationMap.longitude,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    setEditingLocationId(null);
    toast.success("บันทึกพื้นที่แล้ว");
    load();
  }

  async function removeLocation(locationId: string) {
    const isLast = (branch?.deliveryLocations.length ?? 0) <= 1;
    const ok = await confirm({
      title: "ลบพื้นที่จัดส่ง?",
      message: isLast
        ? "นี่คือพื้นที่สุดท้าย — หลังลบลูกค้าจะสั่งได้แค่รับที่ร้าน จนกว่าจะเพิ่มพื้นที่ใหม่"
        : "ลบพื้นที่นี้ออกจากสาขา",
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    await fetch(
      `/api/admin/branches/${id}/locations?locationId=${locationId}`,
      { method: "DELETE" },
    );
    load();
  }

  const outOfStockCount = (branch?.menuItems ?? []).filter(
    (m) => m.isOutOfStock,
  ).length;
  const hiddenCount = (branch?.menuItems ?? []).filter((m) => m.isHidden).length;
  const menuCategoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of branch?.menuCategories ?? []) {
      map.set(c.id, c.name);
    }
    for (const m of branch?.menuItems ?? []) {
      if (m.category) map.set(m.category.id, m.category.name);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [branch?.menuCategories, branch?.menuItems]);

  const sortedMenuItems = useMemo(() => {
    return sortMenuItemData(branch?.menuItems ?? []);
  }, [branch?.menuItems]);

  const menuSeqById = useMemo(
    () => assignStableMenuSequence(sortedMenuItems),
    [sortedMenuItems],
  );

  const canReorderMenu =
    !menuSearch.trim() &&
    menuCategoryFilter === "ALL" &&
    menuStatusFilter === "ALL" &&
    !menuReorderSaving;

  const filteredMenuItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return sortedMenuItems.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q)) return false;
      if (menuCategoryFilter === "NONE") {
        if (m.category) return false;
      } else if (menuCategoryFilter !== "ALL") {
        if (m.category?.id !== menuCategoryFilter) return false;
      }
      if (menuStatusFilter === "OUT_OF_STOCK" && !m.isOutOfStock) return false;
      if (menuStatusFilter === "HIDDEN" && !m.isHidden) return false;
      return true;
    });
  }, [
    sortedMenuItems,
    menuSearch,
    menuCategoryFilter,
    menuStatusFilter,
  ]);

  useEffect(() => {
    menuItemsOrderRef.current = sortedMenuItems.map((m) => m.id);
  }, [sortedMenuItems]);

  function reorderMenuIds(list: string[], activeId: string, overId: string) {
    const fromIndex = list.findIndex((id) => id === activeId);
    const toIndex = list.findIndex((id) => id === overId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  async function persistMenuOrder(orderedIds: string[]) {
    setMenuReorderSaving(true);
    try {
      const res = await fetch(`/api/admin/branches/${id}/menu-items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error("บันทึกลำดับไม่สำเร็จ", data?.error ?? "กรุณาลองใหม่");
        return;
      }
      if (Array.isArray(data)) {
        setBranch((prev) => (prev ? { ...prev, menuItems: data } : prev));
      }
      toast.success("บันทึกลำดับเมนูแล้ว");
    } finally {
      setMenuReorderSaving(false);
      setMenuDraggingId(null);
      setMenuDragOverId(null);
    }
  }

  function onMenuDragStart(itemId: string) {
    if (!canReorderMenu) return;
    menuDragStartOrderRef.current = [...menuItemsOrderRef.current];
    setMenuDraggingId(itemId);
    setMenuDragOverId(itemId);
  }

  function onMenuDragOver(e: DragEvent, itemId: string) {
    if (!canReorderMenu || !menuDraggingId) return;
    e.preventDefault();
    if (menuDragOverId === itemId) return;
    setMenuDragOverId(itemId);
    const next = reorderMenuIds(menuItemsOrderRef.current, menuDraggingId, itemId);
    menuItemsOrderRef.current = next;
    setBranch((prev) => {
      if (!prev) return prev;
      const byId = new Map(prev.menuItems.map((m) => [m.id, m]));
      const nextItems = next
        .map((mid, index) => {
          const item = byId.get(mid);
          return item ? { ...item, sortOrder: index } : null;
        })
        .filter(Boolean) as BranchDetail["menuItems"];
      return { ...prev, menuItems: nextItems };
    });
  }

  async function onMenuDrop(itemId: string) {
    if (!canReorderMenu || !menuDraggingId) return;
    const orderedIds = reorderMenuIds(
      menuItemsOrderRef.current,
      menuDraggingId,
      itemId,
    );
    menuItemsOrderRef.current = orderedIds;
    const unchanged =
      orderedIds.length === menuDragStartOrderRef.current.length &&
      orderedIds.every((mid, i) => mid === menuDragStartOrderRef.current[i]);
    if (unchanged) {
      setMenuDraggingId(null);
      setMenuDragOverId(null);
      return;
    }
    await persistMenuOrder(orderedIds);
  }

  function onMenuDragEnd() {
    if (menuReorderSaving) return;
    setMenuDraggingId(null);
    setMenuDragOverId(null);
  }

  if (!branch) {
    return <AdminLoadingState />;
  }

  const activeStaff = (branch.staff ?? []).filter((s) => s.isActive).length;
  const stats = overviewSummary;
  const money = (n: number) =>
    n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
  const isWarehouse = branch.kind === "WAREHOUSE";
  const storefrontSchedule = ensureWeeklySchedule(
    branch.storefrontHours,
    branch.opensAt,
    branch.closesAt,
  );
  const deliverySchedule = ensureWeeklySchedule(
    branch.deliveryHours,
    branch.opensAt,
    branch.closesAt,
  );
  const hoursBranch = {
    isOpen: branch.isOpen,
    allowAdvanceOrder: branch.allowAdvanceOrder,
    storefrontHours: storefrontSchedule,
    deliveryHours: deliverySchedule,
    opensAt: branch.opensAt,
    closesAt: branch.closesAt,
  };
  const storefrontStatus = getBranchServiceStatus(hoursBranch, "PICKUP");
  const deliveryStatus = getBranchServiceStatus(hoursBranch, "DELIVERY");
  const serviceStatusLabel = (status: typeof storefrontStatus) => {
    if (status.openNow) return "เปิดรับออเดอร์";
    if (status.advanceOnly) return "สั่งล่วงหน้าได้";
    return status.reason;
  };
  const serviceStatusTone = (
    status: typeof storefrontStatus,
  ): "open" | "advance" | "closed" => {
    if (status.openNow) return "open";
    if (status.advanceOnly) return "advance";
    return "closed";
  };

  /** Header badge: schedule-aware, so users don't confuse the manual switch with "open now". */
  const branchLiveBadge = (() => {
    if (!branch.isOpen) {
      return {
        label: "ปิดร้าน",
        className: "bg-slate-200 text-slate-600",
        hint: "ปิดด้วยสวิตช์ร้าน — ลูกค้าสั่งไม่ได้",
      };
    }
    const deliveryEnabled = branch.deliveryLocations.length > 0;
    const anyOpenNow =
      storefrontStatus.openNow ||
      (deliveryEnabled && deliveryStatus.openNow);
    if (anyOpenNow) {
      return {
        label: "เปิดรับออเดอร์",
        className: "bg-emerald-100 text-emerald-700",
        hint: "อยู่ในเวลาทำการตอนนี้",
      };
    }
    const anyAdvance =
      storefrontStatus.advanceOnly ||
      (deliveryEnabled && deliveryStatus.advanceOnly);
    if (anyAdvance) {
      return {
        label: "สั่งล่วงหน้าได้",
        className: "bg-amber-100 text-amber-800",
        hint: "นอกเวลาเปิด แต่ยังรับออเดอร์ล่วงหน้าได้",
      };
    }
    return {
      label: "ปิดตามตาราง",
      className: "bg-rose-100 text-rose-800",
      hint: "วันนี้/ตอนนี้ไม่อยู่ในเวลาทำการตามตารางที่ตั้งไว้",
    };
  })();

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              {branch.name}
            </h2>
            <span
              title={branchLiveBadge.hint}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${branchLiveBadge.className}`}
            >
              {branchLiveBadge.label}
            </span>
            {isWarehouse ? (
              <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-900">
                สต๊อกกลาง · ไม่มีเมนูขาย
              </span>
            ) : null}
            {branch.isHidden && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                ซ่อนจากลูกค้า
              </span>
            )}
            {(branch.isTest || /ทดสอบ|test\b/i.test(branch.name)) && (
              <span
                title="สาขาทดลอง — ใช้ทดสอบระบบขาย ไม่ใช่สาขาเปิดจริง"
                className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-800"
              >
                ⚗ ทดลอง
              </span>
            )}
            {!isWarehouse && branch.operatingMode === "SKEWER" && (
              <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-900">
                โหมดเสียบไม้
              </span>
            )}
            {!isWarehouse && branch.operatingMode === "BBQ_WEIGH" && (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-900">
                โหมดหมูกระทะ
              </span>
            )}
            {!isWarehouse &&
              branch.operatingMode === "NORMAL" &&
              branch.weighSalesEnabled && (
              <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-medium text-rose-900">
                {HOTPOT_COUNTER_GROUP.withWeighLabel}
              </span>
            )}
            {!isWarehouse &&
              branch.operatingMode === "NORMAL" &&
              !branch.weighSalesEnabled && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800">
                {HOTPOT_COUNTER_GROUP.shortLabel}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {branch.brand && branch.code ? (
              <span>
                /{branch.brand.code}/{branch.code}
              </span>
            ) : null}
            <Link
              href={
                session?.isPlatformAdmin && branch.brandId
                  ? `/admin/brands/${branch.brandId}`
                  : "/admin"
              }
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition hover:text-site-primary"
            >
              <IconBack size={14} />
              {session?.isPlatformAdmin && branch.brandId
                ? "รายการสาขา"
                : "รายการ"}
            </Link>
          </div>
        </div>
      </div>

      <div className="sticky top-[3rem] z-20 -mx-1 mt-4 overflow-x-auto filter-scroll-row bg-slate-50/95 px-1 py-2 backdrop-blur lg:top-[3.25rem]">
        <div className="flex min-w-max items-center gap-0.5 rounded-2xl border border-slate-200 bg-white/90 p-1.5 shadow-sm">
          {TAB_GROUPS.map((group, groupIndex) => {
            const mode: BranchOperatingModeId = isBranchOperatingMode(
              branch.operatingMode,
            )
              ? branch.operatingMode
              : "NORMAL";
            const hidden = hiddenTabsForMode(
              mode,
              Boolean(branch.weighSalesEnabled),
              branch.kind,
            );
            const visibleTabIds = group.tabIds.filter(
              (tabId) => !hidden.has(tabId),
            );
            if (visibleTabIds.length === 0) return null;
            return (
            <div key={group.id} className="flex items-center gap-0.5">
              {groupIndex > 0 ? (
                <span
                  className="mx-1 h-6 w-px shrink-0 bg-slate-200"
                  aria-hidden
                />
              ) : null}
              {visibleTabIds.map((tabId) => {
                const tab = TAB_BY_ID[tabId];
                const active = activeTab === tab.id;
                const attention = getTabAttention(tab.id, branch);
                const warn = attention?.tone === "warn";
                const info = attention?.tone === "info";
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTab(tab.id)}
                    title={attention?.title}
                    aria-label={
                      attention
                        ? `${tab.label} — ${attention.title}`
                        : tab.label
                    }
                    className={`relative inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm transition ${
                      active
                        ? "bg-site-primary font-semibold text-white shadow-sm shadow-slate-900/20"
                        : warn
                          ? "font-medium text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-50"
                          : info
                            ? "font-medium text-sky-800 ring-1 ring-inset ring-sky-200 hover:bg-sky-50"
                            : "font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {attention &&
                      (attention.badge ? (
                        <span
                          className={`inline-flex min-w-[1.15rem] items-center justify-center rounded-full px-1 py-0.5 text-[10px] font-bold leading-none tabular-nums ${
                            active
                              ? warn
                                ? "bg-amber-300 text-amber-950"
                                : "bg-white/95 text-site-primary"
                              : warn
                                ? "bg-amber-500 text-white"
                                : "bg-sky-500 text-white"
                          }`}
                        >
                          {attention.badge}
                        </span>
                      ) : (
                        <span
                          className={`tab-attention-dot inline-block size-2 shrink-0 rounded-full ${
                            active
                              ? "bg-amber-300"
                              : warn
                                ? "bg-amber-500"
                                : "bg-sky-500"
                          }`}
                          aria-hidden
                        />
                      ))}
                  </button>
                );
              })}
            </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {branch.operatingMode === "BBQ_WEIGH" && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                โหมดหมูกระทะชั่งกิโล — ใช้แท็บ{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setTab("bbq-tables")}
                >
                  โต๊ะ / QR
                </button>
                {" · "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setTab("bbq-sessions")}
                >
                  บิลเปิด / ชั่ง
                </button>
                {" · "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => setTab("bbq-bills")}
                >
                  บิลปิดแล้ว
                </button>
              </div>
            )}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-slate-900">
                    สรุปภาพรวม
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    สรุปรายได้ เงินสด/โอน สต๊อก ของเสีย และค่าใช้จ่ายตามช่วงวันที่เลือก
                  </p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-[10.5rem]">
                    <label className={adminLabelClass}>วันที่เริ่ม</label>
                    <DateInput
                      className={adminInputClass}
                      value={overviewFrom}
                      max={overviewTo || bangkokDateKey()}
                      onChange={(v) => {
                        if (v) setOverviewFrom(v);
                      }}
                    />
                  </div>
                  <div className="w-[10.5rem]">
                    <label className={adminLabelClass}>วันที่สิ้นสุด</label>
                    <DateInput
                      className={adminInputClass}
                      value={overviewTo}
                      min={overviewFrom}
                      max={bangkokDateKey()}
                      onChange={(v) => {
                        if (v) setOverviewTo(v);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                className={`mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${
                  overviewStatsLoading ? "opacity-60" : ""
                }`}
              >
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                  <p className="text-sm text-emerald-700">รายได้ที่เสร็จสิ้น</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800">
                    {money(stats?.completedRevenue ?? 0)} ฿
                  </p>
                  <p className="mt-1 text-xs text-emerald-600/80">
                    ออเดอร์สำเร็จในช่วงที่เลือก
                  </p>
                </div>
                <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4 shadow-sm">
                  <p className="text-sm text-sky-700">เงินโอน</p>
                  <p className="mt-1 text-2xl font-bold text-sky-800">
                    {money(stats?.transferRevenue ?? 0)} ฿
                  </p>
                  <p className="mt-1 text-xs text-sky-600/80">
                    รายได้สำเร็จชำระโอน
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                  <p className="text-sm text-emerald-700">เงินสด</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800">
                    {money(stats?.cashRevenue ?? 0)} ฿
                  </p>
                  <p className="mt-1 text-xs text-emerald-600/80">
                    รายได้สำเร็จชำระเงินสด
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab("orders")}
                  className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 text-left shadow-sm transition hover:border-amber-300"
                >
                  <p className="text-sm text-amber-700">จำนวนออเดอร์</p>
                  <p className="mt-1 text-2xl font-bold text-amber-800">
                    {stats?.completedOrderCount ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-amber-600/80">
                    ออเดอร์สำเร็จ · ดูแท็บออเดอร์
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTab("stock")}
                  className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 text-left shadow-sm transition hover:border-violet-300"
                >
                  <p className="text-sm text-violet-700">จำนวนสต๊อกขาย</p>
                  <p className="mt-1 text-2xl font-bold text-violet-800">
                    {money(stats?.stockQty ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-violet-600/80">
                    เมนูขายคงเหลือ · ดูแท็บสต๊อก
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTab("stock")}
                  className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 text-left shadow-sm transition hover:border-violet-300"
                >
                  <p className="text-sm text-violet-700">มูลค่าสต๊อกขาย</p>
                  <p className="mt-1 text-2xl font-bold text-violet-800">
                    {money(stats?.stockValue ?? 0)} ฿
                  </p>
                  <p className="mt-1 text-xs text-violet-600/80">
                    เมนูขายคงเหลือ · ดูแท็บสต๊อก
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("tab", "stock");
                    params.set("view", "movements");
                    params.set("type", "WASTE");
                    const from =
                      overviewFrom <= overviewTo ? overviewFrom : overviewTo;
                    const to =
                      overviewFrom <= overviewTo ? overviewTo : overviewFrom;
                    params.set("from", from);
                    params.set("to", to);
                    router.replace(`${pathname}?${params.toString()}`, {
                      scroll: false,
                    });
                  }}
                  className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 text-left shadow-sm transition hover:border-orange-300"
                >
                  <p className="text-sm text-orange-700">จำนวนของเสียขาย</p>
                  <p className="mt-1 text-2xl font-bold text-orange-800">
                    {money(stats?.wasteQty ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-orange-600/80">
                    ชิ้นเมนูขายที่ตัดของเสีย · ดูรายการที่ร้านบันทึก
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("tab", "stock");
                    params.set("view", "movements");
                    params.set("type", "WASTE");
                    const from =
                      overviewFrom <= overviewTo ? overviewFrom : overviewTo;
                    const to =
                      overviewFrom <= overviewTo ? overviewTo : overviewFrom;
                    params.set("from", from);
                    params.set("to", to);
                    router.replace(`${pathname}?${params.toString()}`, {
                      scroll: false,
                    });
                  }}
                  className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-4 text-left shadow-sm transition hover:border-orange-300"
                >
                  <p className="text-sm text-orange-700">มูลค่าของเสียขาย</p>
                  <p className="mt-1 text-2xl font-bold text-orange-800">
                    {money(stats?.wasteValue ?? 0)} ฿
                  </p>
                  <p className="mt-1 text-xs text-orange-600/80">
                    คิดจากราคาเมนู × จำนวนของเสีย · ดูรายการที่ร้านบันทึก
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setTab("expenses")}
                  className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 text-left shadow-sm transition hover:border-rose-300"
                >
                  <p className="text-sm text-rose-700">ค่าใช้จ่ายรวม</p>
                  <p className="mt-1 text-2xl font-bold text-rose-800">
                    {money(stats?.expenseTotal ?? 0)} ฿
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-rose-800/90">
                    <span>
                      เงินสด{" "}
                      <span className="font-semibold tabular-nums">
                        {money(stats?.cashExpense ?? 0)} ฿
                      </span>
                    </span>
                    <span className="text-rose-300">·</span>
                    <span>
                      เงินโอน{" "}
                      <span className="font-semibold tabular-nums">
                        {money(stats?.transferExpense ?? 0)} ฿
                      </span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-rose-600/80">
                    {stats?.expenseCount ?? 0} รายการ · กดดูแท็บค่าใช้จ่าย
                  </p>
                </button>
                <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
                  <p className="text-sm text-indigo-700">รายได้ − ค่าใช้จ่าย</p>
                  <p className="mt-1 text-2xl font-bold text-indigo-900">
                    {money(stats?.netRevenue ?? 0)} ฿
                  </p>
                  <div className="mt-2 space-y-0.5 text-xs text-indigo-800/85">
                    <p>
                      เงินสด{" "}
                      <span className="font-semibold tabular-nums">
                        {money(
                          (stats?.cashRevenue ?? 0) - (stats?.cashExpense ?? 0),
                        )}{" "}
                        ฿
                      </span>
                    </p>
                    <p>
                      เงินโอน{" "}
                      <span className="font-semibold tabular-nums">
                        {money(
                          (stats?.transferRevenue ?? 0) -
                            (stats?.transferExpense ?? 0),
                        )}{" "}
                        ฿
                      </span>
                    </p>
                  </div>
                  <p className="mt-1.5 text-xs text-indigo-600/80">
                    รายได้สำเร็จหักค่าใช้จ่ายช่วงนี้
                  </p>
                </div>
              </div>
            </div>

            <BranchMenuSalesPanel
              branchId={id}
              dateFrom={overviewFrom}
              dateTo={overviewTo}
              showDatePicker={false}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className={panelClass}>
                <h3 className="mb-3 font-semibold text-gray-900">
                  กราฟรายได้ / ยกเลิก
                </h3>
                {stats?.days?.length ? (
                  <RevenueBars
                    days={stats.days}
                    revenueTitle="รายได้ที่เสร็จสิ้นในช่วงที่เลือก"
                  />
                ) : (
                  <p className="text-sm text-gray-500">ยังไม่มีข้อมูลพอสำหรับกราฟ</p>
                )}
              </div>

              <div className={`${panelClass} overflow-hidden`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">สถานะร้าน</h3>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <span
                          title={branchLiveBadge.hint}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${branchLiveBadge.className}`}
                        >
                          {branchLiveBadge.label}
                        </span>
                        {branch.isOpen &&
                          branchLiveBadge.label !== "เปิดรับออเดอร์" && (
                            <span
                              title="สวิตช์ร้านยังเปิด — แต่ตอนนี้อยู่นอกเวลาทำการหรือปิดตามตาราง"
                              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                            >
                              สวิตช์ร้าน: เปิด
                            </span>
                          )}
                        {branch.isHidden && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                            ซ่อนจากลูกค้า
                          </span>
                        )}
                        {branch.deliveryLocations.length === 0 && (
                          <button
                            type="button"
                            onClick={() => setTab("locations")}
                            className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 transition hover:bg-amber-200"
                          >
                            ปิดจัดส่ง (ยังไม่มีพื้นที่)
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <ServiceHourCard
                        icon={<IconStore size={14} className="text-slate-400" />}
                        label="หน้าร้านวันนี้"
                        hours={formatTodayHoursSummary(storefrontSchedule)}
                        statusLabel={serviceStatusLabel(storefrontStatus)}
                        statusTone={serviceStatusTone(storefrontStatus)}
                      />
                      <ServiceHourCard
                        icon={
                          <IconDelivery size={14} className="text-slate-400" />
                        }
                        label="เดลิเวอรีวันนี้"
                        hours={
                          branch.deliveryLocations.length === 0
                            ? "ยังไม่มีพื้นที่จัดส่ง"
                            : formatTodayHoursSummary(deliverySchedule)
                        }
                        statusLabel={
                          branch.deliveryLocations.length === 0
                            ? "ปิดจัดส่ง"
                            : serviceStatusLabel(deliveryStatus)
                        }
                        statusTone={
                          branch.deliveryLocations.length === 0
                            ? "closed"
                            : serviceStatusTone(deliveryStatus)
                        }
                      />
                    </div>

                    <dl className="mt-3 divide-y divide-slate-100 text-sm">
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-slate-500">สั่งล่วงหน้า</dt>
                        <dd>
                          <StatusPill
                            on={branch.allowAdvanceOrder}
                            onLabel="รับ"
                            offLabel="ไม่รับ"
                          />
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-slate-500">รับออเดอร์อัตโนมัติ</dt>
                        <dd>
                          <StatusPill
                            on={branch.autoAcceptOrders}
                            onLabel="เปิด"
                            offLabel="ปิด"
                          />
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2">
                        <dt className="text-slate-500">เบอร์สาขา</dt>
                        <dd className="font-medium text-slate-800">
                          {branch.phone ? (
                            <PhoneCallButton phone={branch.phone} showNumber />
                          ) : (
                            <span className="text-slate-400">ยังไม่ระบุ</span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setTab("staff")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-white"
                      >
                        <IconUser size={14} className="text-slate-400" />
                        พนักงาน {activeStaff}/{branch.staff.length}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTab("locations")}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                          branch.deliveryLocations.length === 0
                            ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white"
                        }`}
                      >
                        <IconPin
                          size={14}
                          className={
                            branch.deliveryLocations.length === 0
                              ? "text-amber-600"
                              : "text-slate-400"
                          }
                        />
                        {branch.deliveryLocations.length === 0
                          ? "ยังไม่มีพื้นที่ส่ง"
                          : `พื้นที่ส่ง ${branch.deliveryLocations.length}`}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTab("settings")}
                      className="mt-4 inline-flex w-fit items-center gap-1 rounded-xl border border-site-primary-soft bg-site-primary-soft px-3.5 py-2 text-sm font-medium text-site-primary transition hover:border-site-primary hover:bg-site-primary-soft"
                    >
                      ไปตั้งค่าสาขา
                      <IconChevronRight size={16} />
                    </button>
                  </div>

                  <div className="flex shrink-0 items-center justify-center sm:w-36 lg:w-44">
                    {branch.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={branch.imageUrl}
                        alt=""
                        className="h-28 w-full max-w-[11rem] rounded-2xl border border-slate-100 bg-slate-50 object-contain p-3 sm:h-full sm:min-h-[10rem]"
                      />
                    ) : (
                      <div className="flex h-28 w-full max-w-[11rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center sm:h-full sm:min-h-[10rem]">
                        <IconStore size={28} className="text-slate-300" />
                        <span className="text-xs text-slate-400">
                          ยังไม่มีรูปสาขา
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className={panelClass}>
              {branch.brand?.code && branch.code ? (
                <BranchCustomerQrCard
                  brandCode={branch.brand.code}
                  branchCode={branch.code}
                />
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  ตั้งแบรนด์และรหัสสาขาในแท็บตั้งค่าก่อน เพื่อสร้างลิงก์/QR
                  ให้ลูกค้าเข้าสาขานี้โดยตรง
                </div>
              )}
            </div>

            <div className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">ออเดอร์ล่าสุด</h3>
                <button
                  type="button"
                  onClick={() => setTab("orders")}
                  className="text-sm text-site-primary hover:underline"
                >
                  ดูตารางทั้งหมด
                </button>
              </div>
              <OrdersTable orders={branch.orders.slice(0, 8)} />
            </div>
          </div>
        )}

        {activeTab === "menu" && (
          <div className={panelClass}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">
                    เมนูของสาขานี้
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {filteredMenuItems.length === branch.menuItems.length
                      ? `${branch.menuItems.length} รายการ`
                      : `แสดง ${filteredMenuItems.length} จาก ${branch.menuItems.length} รายการ`}
                    {canReorderMenu
                      ? " · ลากรายการเพื่อจัดลำดับแสดงผลหน้าร้าน"
                      : " · ล้างตัวกรองเพื่อจัดลำดับ"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStockPasteResult(null);
                      setStockPasteText("");
                      setStockPasteOpen(true);
                    }}
                    className={btnOutline}
                  >
                    วางข้อความสต็อก
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("copy")}
                    className={btnOutline}
                  >
                    คัดลอกด้วยโค้ด
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const [catRes, optRes] = await Promise.all([
                        fetch(`/api/admin/branches/${id}/categories`),
                        fetch(`/api/admin/branches/${id}/option-groups`),
                      ]);
                      const cats = catRes.ok ? await catRes.json() : [];
                      const opts = optRes.ok ? await optRes.json() : [];
                      const categoryList = Array.isArray(cats)
                        ? cats
                        : (cats.categories ?? []);
                      const optionList = Array.isArray(opts)
                        ? opts
                        : (opts.groups ?? opts.optionGroups ?? []);
                      const missingCategories = categoryList.length === 0;
                      const missingOptions = optionList.length === 0;

                      setBranch((prev) =>
                        prev
                          ? {
                              ...prev,
                              menuCategories: categoryList.map(
                                (c: { id: string; name: string }) => ({
                                  id: c.id,
                                  name: c.name,
                                }),
                              ),
                              optionGroups: optionList.map(
                                (g: { id: string; name: string }) => ({
                                  id: g.id,
                                  name: g.name,
                                }),
                              ),
                            }
                          : prev,
                      );

                      if (missingCategories || missingOptions) {
                        setMenuSetupModalOpen(true);
                        return;
                      }
                      router.push(`/admin/branches/${id}/menu/new`);
                    }}
                    className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
                  >
                    <IconPlus size={16} />
                    เพิ่มเมนู
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  id="menu-search"
                  className={`${adminInputClass} sm:max-w-xs sm:flex-1`}
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="ค้นหาเมนู..."
                  aria-label="ค้นหาเมนู"
                />
                <select
                  id="menu-category-filter"
                  className={`${adminSelectClass} sm:w-44`}
                  value={menuCategoryFilter}
                  onChange={(e) => setMenuCategoryFilter(e.target.value)}
                  aria-label="กรองหมวดหมู่"
                >
                  <option value="ALL">ทุกหมวดหมู่</option>
                  <option value="NONE">ไม่มีหมวดหมู่</option>
                  {menuCategoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                  {(
                    [
                      { id: "ALL", label: "ทั้งหมด" },
                      {
                        id: "OUT_OF_STOCK",
                        label: `หมด${outOfStockCount ? ` (${outOfStockCount})` : ""}`,
                      },
                      {
                        id: "HIDDEN",
                        label: `ซ่อน${hiddenCount ? ` (${hiddenCount})` : ""}`,
                      },
                    ] as const
                  ).map((chip) => {
                    const active = menuStatusFilter === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setMenuStatusFilter(chip.id)}
                        className={`rounded-full px-2.5 py-1.5 text-xs font-medium transition ${
                          active
                            ? "bg-slate-900 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                  {(menuSearch ||
                    menuCategoryFilter !== "ALL" ||
                    menuStatusFilter !== "ALL") && (
                    <button
                      type="button"
                      onClick={() => {
                        setMenuSearch("");
                        setMenuCategoryFilter("ALL");
                        setMenuStatusFilter("ALL");
                      }}
                      className="rounded-full px-2.5 py-1.5 text-xs font-medium text-site-primary hover:bg-site-primary-soft"
                    >
                      ล้าง
                    </button>
                  )}
                </div>
              </div>
            </div>

            {filteredMenuItems.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
                {branch.menuItems.length === 0
                  ? "ยังไม่มีเมนู — กด “เพิ่มเมนู” เพื่อสร้างรายการแรก"
                  : "ไม่พบเมนูที่ตรงเงื่อนไข"}
              </p>
            ) : (
            <ul className="mt-4 space-y-2">
              {filteredMenuItems.map((m) => (
                <li
                  key={m.id}
                  draggable={canReorderMenu}
                  onDragStart={() => onMenuDragStart(m.id)}
                  onDragOver={(e) => onMenuDragOver(e, m.id)}
                  onDragEnd={onMenuDragEnd}
                  onDrop={(e) => {
                    e.preventDefault();
                    void onMenuDrop(m.id);
                  }}
                  className={`flex flex-wrap items-stretch gap-3 rounded-lg border px-3 py-2.5 transition ${
                    menuDraggingId === m.id
                      ? "border-slate-300 opacity-60 shadow-sm"
                      : menuDragOverId === m.id
                        ? "border-amber-300 bg-amber-50/70"
                        : "border-gray-200"
                  } ${canReorderMenu ? "cursor-move" : ""}`}
                >
                  <div className="flex w-8 shrink-0 flex-col items-center justify-center gap-1 self-center">
                    {canReorderMenu ? (
                      <span className="select-none text-slate-400" aria-hidden>
                        ::
                      </span>
                    ) : null}
                    <span className="text-xs font-bold tabular-nums text-slate-400">
                      {menuSeqById.get(m.id) ?? "—"}
                    </span>
                  </div>
                  {(() => {
                    const thumb = resolveMenuDisplayImageUrl(
                      branch?.operatingMode,
                      m,
                    );
                    return thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className={`h-20 w-20 shrink-0 rounded-lg sm:h-24 sm:w-24 ${
                          branch?.operatingMode === "SKEWER"
                            ? "object-contain bg-neutral-900"
                            : "object-cover"
                        }`}
                      />
                    ) : (
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500 sm:h-24 sm:w-24">
                        ไม่มีรูป
                      </div>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-gray-900">
                      <span>{m.name}</span>
                      <MenuBestSellerTag show={m.isBestSeller} />
                    </p>
                    {m.description && (
                      <p className="mt-0.5 truncate text-sm text-gray-700">
                        {m.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      {m.category ? (
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                          {m.category.name}
                        </span>
                      ) : (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                          ไม่มีหมวดหมู่
                        </span>
                      )}
                      <MenuChannelPrices item={m} />
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <AdminToggle
                        checked={m.isHidden}
                        onChange={(next) => toggleHidden(m.id, next)}
                        label="ซ่อนจากลูกค้า"
                      />
                      <AdminToggle
                        checked={m.isOutOfStock}
                        onChange={(next) => toggleOutOfStock(m.id, next)}
                        label="หมดชั่วคราว"
                      />
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col justify-center gap-2 self-center">
                    <Link
                      href={`/admin/branches/${id}/menu/${m.id}`}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                      aria-label={`แก้ไข ${m.name}`}
                      title="แก้ไข"
                    >
                      <IconEdit size={18} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => deleteMenu(m.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-sm transition hover:border-red-300 hover:bg-red-50"
                      aria-label={`ลบ ${m.name}`}
                      title="ลบ"
                    >
                      <IconTrash size={18} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            )}
          </div>
        )}

        {activeTab === "options" && (
          <div className={panelClass}>
            <BranchOptionLibrary branchId={id} />
          </div>
        )}

        {activeTab === "categories" && (
          <div className={panelClass}>
            <BranchCategoryLibrary branchId={id} />
          </div>
        )}

        {activeTab === "copy" && (
          <div className={panelClass}>
            <BranchShareCopyPanel branchId={id} onImported={() => load()} />
          </div>
        )}

        {activeTab === "orders" && <BranchOrdersPanel branchId={id} />}

        {activeTab === "skewer-orders" && (
          <BranchSkewerOrdersPanel branchId={id} />
        )}

        {(activeTab === "bbq-tables" ||
          activeTab === "bbq-sessions" ||
          activeTab === "bbq-bills") &&
          branch.brand?.code &&
          branch.code && (
            <BranchBbqPanel
              branchId={id}
              brandCode={branch.brand.code}
              branchCode={branch.code}
              section={
                activeTab === "bbq-tables"
                  ? "tables"
                  : activeTab === "bbq-sessions"
                    ? "sessions"
                    : "bills"
              }
            />
          )}

        {activeTab === "shifts" && <BranchShiftsPanel branchId={id} />}

        {activeTab === "stock" &&
          (isWarehouse ? (
            <div className={panelClass}>
              <h3 className="text-base font-semibold text-gray-900">
                สต๊อกกลาง
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                บันทึกนำเข้า เสียบไม้ และจ่ายออกที่หน้าสต๊อกแบรนด์
                ไม่มีเมนูขายที่นี่
              </p>
              {branch.brandId ? (
                <Link
                  href={`/admin/brands/${branch.brandId}/stock`}
                  className={`mt-4 inline-flex ${btnPrimary}`}
                >
                  เปิดหน้าสต๊อกกลาง
                </Link>
              ) : null}
            </div>
          ) : (
            <BranchStockPanel branchId={id} />
          ))}

        {activeTab === "expenses" && <BranchExpensesPanel branchId={id} />}

        {activeTab === "staff" && (
          <div className={panelClass}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {isWarehouse ? "พนักงานสต๊อกกลาง" : "พนักงานประจำสาขา"}
                </h3>
                <p className="mt-0.5 text-sm text-gray-600">
                  {isWarehouse
                    ? `${branch.staff.length} คน · เข้าแอปสต๊อกกลางได้ (ไม่มีเมนูขาย) · สูงสุด 3 เครื่องต่อเบอร์`
                    : `${branch.staff.length} คน · รูปไม่บังคับ · เข้าใช้งานได้สูงสุด 3 เครื่องต่อเบอร์`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  เชื่อม LINE: เพิ่มเพื่อน Official Account แล้วส่งเบอร์โทรในระบบมาในแชท
                  (ตั้งค่าที่เมนู LINE แจ้งเตือน)
                </p>
              </div>
              <button
                type="button"
                onClick={openCreateStaffModal}
                className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
              >
                <IconPlus size={16} />
                เพิ่มพนักงาน
              </button>
            </div>

            <ul className="space-y-2">
              {branch.staff.map((s) => (
                <li
                  key={s.id}
                  className="rounded-xl border border-gray-200 bg-gradient-to-r from-white to-gray-50/60 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                      {s.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={s.imageUrl}
                          alt=""
                          className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 ring-2 ring-white shadow-sm">
                          <IconUser size={22} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900">
                          {s.name?.trim() || "ยังไม่มีชื่อ"}{" "}
                          {!s.isActive && (
                            <span className="text-sm font-medium text-gray-600">
                              (ปิดใช้งาน)
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-gray-700">
                          {formatThaiPhone(s.phone)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                          {s.phoneVerifiedAt ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                              ยืนยันเบอร์แล้ว
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                              ยังไม่ยืนยันเบอร์
                            </span>
                          )}
                          {s.roles.map((r) => (
                            <span
                              key={r.id}
                              className="rounded-full bg-gray-900/90 px-2 py-0.5 font-medium text-white"
                            >
                              {isWarehouse && r.role === "SELLER"
                                ? "พนักงานคลัง"
                                : ROLE_LABELS[r.role] ?? r.role}
                            </span>
                          ))}
                          {s.lineUserId ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                              LINE เชื่อมแล้ว
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                              LINE ยังไม่เชื่อม
                            </span>
                          )}
                          {s.gender && (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                              {GENDER_LABELS[s.gender] ?? s.gender}
                            </span>
                          )}
                          {s.age != null && (
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                              อายุ {s.age}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <PhoneCallButton phone={s.phone} />
                      {s.lineUserId ? (
                        <button
                          type="button"
                          onClick={() => unlinkStaffLine(s.id)}
                          className={btnOutline}
                        >
                          ยกเลิก LINE
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => startEditStaff(s)}
                        className={btnOutline}
                      >
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => revokeStaffSessions(s.id, s.name)}
                        className={btnOutline}
                      >
                        ปลดเครื่อง
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleStaffActive(s.id, !s.isActive)}
                        className={btnOutline}
                      >
                        {s.isActive ? "ปิด" : "เปิด"}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteStaff(s.id)}
                        className={btnDanger}
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <AdminModal
              open={staffModalOpen}
              title={editingStaffId ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"}
              description={
                editingStaffId
                  ? "แก้ไขข้อมูลแล้วกดบันทึก — บังคับเฉพาะเบอร์โทร"
                  : "บังคับเฉพาะเบอร์โทร — ชื่อ เพศ อายุ และรูปไม่บังคับ"
              }
              onClose={closeStaffModal}
              maxWidthClassName="max-w-2xl"
            >
              <form
                onSubmit={editingStaffId ? saveStaffEdit : addStaff}
                className="p-5"
              >
                <div className="grid gap-5 lg:grid-cols-[200px_1fr]">
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-gradient-to-b from-slate-50/60 to-white p-3">
                    <ImageField
                      label="รูปโปรไฟล์"
                      value={staffImageUrl}
                      onChange={setStaffImageUrl}
                      shopCode={branch.code ?? branch.brand?.code}
                      folder="Staff"
                      aspectClassName="aspect-square"
                      size="compact"
                    />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className={adminLabelClass}>
                        เบอร์โทร{" "}
                        <span className="font-normal text-red-600">*</span>
                      </label>
                      <PhoneInput
                        value={staffPhone}
                        onChange={setStaffPhone}
                        className={`${adminInputClass} ${
                          phoneCheck.status === "taken"
                            ? "border-red-400 focus:border-red-500"
                            : phoneCheck.status === "available"
                              ? "border-emerald-400"
                              : ""
                        }`}
                        required
                        autoFocus
                      />
                      {phoneCheck.status === "checking" && (
                        <p className="mt-1.5 text-xs text-gray-500">
                          กำลังตรวจสอบเบอร์ในระบบ…
                        </p>
                      )}
                      {phoneCheck.status === "available" && (
                        <p className="mt-1.5 text-xs font-medium text-emerald-700">
                          {phoneCheck.notice ?? "เบอร์นี้ใช้ได้"}
                        </p>
                      )}
                      {phoneCheck.status === "incomplete" && (
                        <p className="mt-1.5 text-xs text-amber-700">
                          กรอกเบอร์ให้ครบอย่างน้อย 9 หลัก
                        </p>
                      )}
                      {phoneCheck.status === "taken" && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">
                          เบอร์ซ้ำในสาขานี้ — ใช้โดย{" "}
                          {phoneCheck.staffName || "พนักงาน"}
                          {phoneCheck.branchName
                            ? ` (สาขา ${phoneCheck.branchName})`
                            : ""}
                        </p>
                      )}
                      {phoneCheck.status === "error" && (
                        <p className="mt-1.5 text-xs text-red-600">
                          {phoneCheck.message}
                        </p>
                      )}
                      {editingStaffId ? (
                        <p className="mt-1.5 text-xs text-gray-500">
                          {branch.staff.find((s) => s.id === editingStaffId)
                            ?.phoneVerifiedAt
                            ? "ยืนยันเบอร์แล้ว — ถ้าเปลี่ยนเบอร์ พนักงานต้องยืนยัน OTP ใหม่ตอนเข้าสู่ระบบ"
                            : "ยังไม่ยืนยันเบอร์ — พนักงานจะยืนยัน OTP ครั้งแรกตอนเข้าสู่ระบบ"}
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-gray-500">
                          พนักงานจะยืนยัน OTP ครั้งแรกตอนเข้าสู่ระบบ
                        </p>
                      )}
                    </div>
                    <div>
                      <label className={adminLabelClass}>ชื่อ</label>
                      <input
                        className={adminInputClass}
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                        placeholder="ไม่บังคับ"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={adminLabelClass}>เพศ</label>
                        <div className="flex flex-wrap gap-1.5">
                          {GENDER_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() =>
                                setStaffGender((g) =>
                                  g === opt.value ? "" : opt.value,
                                )
                              }
                              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                staffGender === opt.value
                                  ? "bg-violet-600 text-white shadow-sm"
                                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className={adminLabelClass}>อายุ</label>
                        <input
                          type="number"
                          min={1}
                          max={120}
                          className={adminInputClass}
                          value={staffAge}
                          onChange={(e) => setStaffAge(e.target.value)}
                          placeholder="เช่น 25"
                        />
                      </div>
                    </div>
                    <div>
                      <p className={`${adminLabelClass} mb-1.5`}>
                        บทบาท{" "}
                        <span className="font-normal text-red-600">*</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setStaffSeller((v) => !v)}
                          className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                            staffSeller
                              ? "bg-site-primary text-white shadow-sm"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          {isWarehouse ? "พนักงานคลัง" : "คนขาย"}
                        </button>
                        {isWarehouse ? null : (
                        <button
                          type="button"
                          onClick={() => setStaffDelivery((v) => !v)}
                          className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                            staffDelivery
                              ? "bg-site-primary text-white shadow-sm"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          คนส่ง
                        </button>
                        )}
                      </div>
                      {!staffSeller && !staffDelivery && (
                        <p className="mt-1.5 text-xs text-red-600">
                          เลือกอย่างน้อย 1 บทบาท
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={closeStaffModal}
                    className={btnOutline}
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={
                      staffSaving ||
                      (!staffSeller && !staffDelivery) ||
                      phoneCheck.status === "taken" ||
                      phoneCheck.status === "checking" ||
                      phoneDigits(staffPhone).length < 9
                    }
                    className={btnPrimary}
                  >
                    {staffSaving
                      ? "กำลังบันทึก…"
                      : editingStaffId
                        ? "บันทึกการแก้ไข"
                        : "บันทึกพนักงาน"}
                  </button>
                </div>
              </form>
            </AdminModal>
          </div>
        )}

        {activeTab === "locations" && (
          <div className={panelClass}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  พื้นที่จัดส่ง
                </h3>
                <p className="mt-0.5 text-sm text-gray-600">
                  {branch.deliveryLocations.length} พื้นที่ · ตัวเลือกให้ลูกค้าตอนสั่ง
                  (รายละเอียดที่อยู่จริงลูกค้าพิมพ์เอง)
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocationName("");
                  setLocationFee("0");
                  setLocationCustomAddress(false);
                  setLocationMap(emptyLocationMap());
                  setLocationModalOpen(true);
                }}
                className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
              >
                <IconPlus size={16} />
                เพิ่มพื้นที่
              </button>
            </div>
            {!branchReferencePin() && (
              <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                ยังไม่มีหมุดร้าน — ไปแท็บตั้งค่าสาขาปักหมุดร้านก่อน
                จะช่วยจัดกึ่งกลางแผนที่ตอนตั้งพื้นที่จัดส่ง
              </p>
            )}
            {branch.deliveryLocations.length === 0 && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-semibold text-amber-900">
                  ลูกค้าสั่งได้แค่รับที่ร้าน
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  ยังไม่มีพื้นที่จัดส่ง — ปุ่มจัดส่งฝั่งลูกค้าจะถูกปิดจนกว่าจะเพิ่มอย่างน้อย
                  1 โซน (ไม่บังคับถ้าสาขาเปิดเฉพาะรับที่ร้าน)
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLocationName("");
                    setLocationFee("0");
                    setLocationCustomAddress(false);
                    setLocationMap(emptyLocationMap());
                    setLocationModalOpen(true);
                  }}
                  className={`mt-3 inline-flex items-center gap-1.5 ${btnPrimary}`}
                >
                  <IconPlus size={16} />
                  เพิ่มพื้นที่จัดส่ง
                </button>
              </div>
            )}
            <ul className="space-y-3">
              {branch.deliveryLocations.map((loc) => (
                <li
                  key={loc.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  {editingLocationId === loc.id ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                        <div>
                          <label className={adminLabelClass}>ชื่อพื้นที่</label>
                          <input
                            className={adminInputClass}
                            value={editLocationName}
                            onChange={(e) => setEditLocationName(e.target.value)}
                            autoFocus
                          />
                        </div>
                        <div>
                          <label className={adminLabelClass}>ค่าส่ง (฿)</label>
                          <input
                            type="number"
                            min={0}
                            step="1"
                            className={adminInputClass}
                            value={editLocationFee}
                            onChange={(e) => setEditLocationFee(e.target.value)}
                          />
                        </div>
                      </div>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300"
                          checked={editLocationCustomAddress}
                          onChange={(e) =>
                            setEditLocationCustomAddress(e.target.checked)
                          }
                        />
                        <span>
                          <span className="block text-sm font-medium text-slate-900">
                            ลูกค้ากำหนดที่อยู่เอง
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-600">
                            เหมาะกับ “พื้นที่อื่นๆ” — ลูกค้าพิมพ์ที่อยู่เต็มตอนสั่ง
                            ไม่ต้องพึ่งหมุดโซน
                          </span>
                        </span>
                      </label>
                      {!editLocationCustomAddress ? (
                        <AdminMapLocationPicker
                          value={editLocationMap}
                          onChange={setEditLocationMap}
                          addressLabel="ที่อยู่โซน (ไม่บังคับ · ช่วย admin)"
                          addressPlaceholder="ที่อยู่หรือจุดอ้างอิงของพื้นที่นี้"
                          referencePin={branchReferencePin()}
                          onSuggestLabel={(label) => {
                            if (!editLocationName.trim()) {
                              setEditLocationName(label);
                            }
                          }}
                        />
                      ) : (
                        <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                          โหมดนี้ไม่บังคับปักหมุดโซน — ลูกค้าจะกรอกที่อยู่จัดส่งเองตอน checkout
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingLocationId(null)}
                          className={btnOutline}
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          onClick={() => saveLocation(loc.id)}
                          className={btnPrimary}
                        >
                          บันทึก
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {loc.name}
                          <span className="ml-2 text-sm font-normal text-slate-500">
                            ค่าส่ง ฿
                            {Number(loc.deliveryFee || 0).toLocaleString("th-TH")}
                          </span>
                          {loc.isCustomAddress ? (
                            <span className="ml-2 inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                              กรอกที่อยู่เอง
                            </span>
                          ) : null}
                        </p>
                        {loc.isCustomAddress ? (
                          <p className="mt-1 text-sm text-slate-500">
                            ลูกค้าพิมพ์ที่อยู่จัดส่งเองตอนสั่ง
                          </p>
                        ) : loc.address ? (
                          <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                            {loc.address}
                          </p>
                        ) : null}
                        {!loc.isCustomAddress &&
                        loc.latitude != null &&
                        loc.longitude != null ? (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {loc.latitude}, {loc.longitude}
                          </p>
                        ) : !loc.isCustomAddress ? (
                          <p className="mt-0.5 text-xs text-slate-400">
                            ยังไม่มีหมุดโซน
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLocationId(loc.id);
                            setEditLocationName(loc.name);
                            setEditLocationFee(
                              String(Number(loc.deliveryFee || 0)),
                            );
                            setEditLocationCustomAddress(
                              Boolean(loc.isCustomAddress),
                            );
                            setEditLocationMap({
                              address: loc.address ?? "",
                              latitude: loc.latitude ?? null,
                              longitude: loc.longitude ?? null,
                            });
                          }}
                          className={btnOutline}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLocation(loc.id)}
                          className={btnDanger}
                        >
                          ลบ
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            <AdminModal
              open={locationModalOpen}
              title="เพิ่มพื้นที่จัดส่ง"
              description="ตั้งชื่อโซน ค่าส่ง และใช้แผนที่ (หมุดร้านอ้างอิง) เพื่อช่วยจัดจุด"
              onClose={() => setLocationModalOpen(false)}
              maxWidthClassName="max-w-2xl"
            >
              <form onSubmit={addLocation} className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                  <div>
                    <label className={adminLabelClass}>ชื่อพื้นที่</label>
                    <input
                      className={adminInputClass}
                      placeholder="เช่น หอพัก A หรือ พื้นที่อื่นๆ"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className={adminLabelClass}>ค่าส่ง (บาท)</label>
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className={adminInputClass}
                      value={locationFee}
                      onChange={(e) => setLocationFee(e.target.value)}
                    />
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                    checked={locationCustomAddress}
                    onChange={(e) => setLocationCustomAddress(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      ลูกค้ากำหนดที่อยู่เอง
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      เหมาะกับ “พื้นที่อื่นๆ” — ลูกค้าพิมพ์ที่อยู่เต็มตอนสั่ง
                      ไม่ต้องพึ่งหมุดโซน
                    </span>
                  </span>
                </label>
                {!locationCustomAddress ? (
                  <AdminMapLocationPicker
                    value={locationMap}
                    onChange={setLocationMap}
                    addressLabel="ที่อยู่โซน (ไม่บังคับ · ช่วย admin)"
                    addressPlaceholder="ค้นหาหรือปักหมุด — ใช้เป็นจุดอ้างอิงโซน"
                    referencePin={branchReferencePin()}
                    onSuggestLabel={(label) => {
                      if (!locationName.trim()) setLocationName(label);
                    }}
                  />
                ) : (
                  <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    โหมดนี้ไม่บังคับปักหมุดโซน — ลูกค้าจะกรอกที่อยู่จัดส่งเองตอน checkout
                  </p>
                )}
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => setLocationModalOpen(false)}
                    className={btnOutline}
                  >
                    ยกเลิก
                  </button>
                  <button type="submit" className={btnPrimary}>
                    บันทึกพื้นที่
                  </button>
                </div>
              </form>
            </AdminModal>
          </div>
        )}

        {activeTab === "settings" && (
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-5 py-4">
              <h3 className="font-semibold text-gray-900">ตั้งค่าสาขา</h3>
              <p className="mt-0.5 text-sm text-gray-600">
                จัดการสถานะรับออเดอร์ ข้อมูลร้าน แผนที่ และเวลาทำการ
              </p>
            </div>
            <form onSubmit={saveBranch} className="space-y-8 p-5">
              {(() => {
                const draftGaps = getBranchSettingsGaps({
                  latitude: settings.latitude,
                  longitude: settings.longitude,
                  phone: settings.phone.trim() || null,
                  primaryCategory: settings.primaryCategory || null,
                });
                if (draftGaps.length === 0) return null;
                const jump = (id: string) => {
                  document
                    .getElementById(id)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                };
                return (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-sm font-semibold text-amber-900">
                      แบดจ์แท็บนี้มาจากข้อมูลที่ยังไม่ครบ ({draftGaps.length})
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      กรอกแล้วกดบันทึกตั้งค่า — badge จะหายหลังบันทึกสำเร็จ
                    </p>
                    <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
                      {draftGaps.includes("เบอร์โทร") && (
                        <li>
                          <button
                            type="button"
                            onClick={() => jump("settings-phone")}
                            className="font-medium underline underline-offset-2"
                          >
                            เบอร์โทรสาขา
                          </button>
                          {" — "}ส่วนตัวตนสาขาด้านล่าง
                        </li>
                      )}
                      {draftGaps.includes("หมุดร้าน") && (
                        <li>
                          <button
                            type="button"
                            onClick={() => jump("settings-map")}
                            className="font-medium underline underline-offset-2"
                          >
                            หมุดร้านบนแผนที่
                          </button>
                          {" — "}ส่วนที่อยู่และแผนที่
                        </li>
                      )}
                      {draftGaps.includes("ประเภทอาหาร") && (
                        <li>
                          <button
                            type="button"
                            onClick={() => jump("settings-category")}
                            className="font-medium underline underline-offset-2"
                          >
                            ประเภทอาหารหลัก
                          </button>
                          {" — "}ส่วนประเภทและช่วงราคา
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })()}
              {/* Operating mode (locked after create) */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    โหมดการทำงานของสาขา
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    เลือกตอนสร้างสาขาแล้วเปลี่ยนไม่ได้
                  </p>
                </div>
                <div
                  className={`rounded-xl border px-4 py-3 ${
                    BRANCH_OPERATING_MODE_META[
                      isBranchOperatingMode(settings.operatingMode)
                        ? settings.operatingMode
                        : "NORMAL"
                    ].badgeClass
                  }`}
                >
                  <p className="text-sm font-semibold">
                    {branchOperatingModeLabel(settings.operatingMode)}
                  </p>
                  <p className="mt-0.5 text-xs opacity-80">
                    {
                      BRANCH_OPERATING_MODE_META[
                        isBranchOperatingMode(settings.operatingMode)
                          ? settings.operatingMode
                          : "NORMAL"
                      ].description
                    }
                  </p>
                </div>
              </div>
              {/* 1. Daily ops status */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    สถานะการรับออเดอร์
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ใช้บ่อย — เปิด/ปิดร้านและวิธีรับออเดอร์
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        สวิตช์เปิด/ปิดร้าน
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {settings.isOpen
                          ? "เปิดอยู่ — ซิงก์กับรอบขายของพนักงาน (ลูกค้าสั่งได้เฉพาะตอนอยู่ในตารางเวลาด้วย)"
                          : "ปิดแล้ว — ปิดรอบขายของพนักงานด้วย ลูกค้าและพนักงานขายต่อไม่ได้จนกว่าจะเปิดใหม่"}
                      </p>
                    </div>
                    {settings.isOpen ? (
                      <button
                        type="button"
                        className={`${btnDanger} shrink-0`}
                        onClick={() => setCloseStoreOpen(true)}
                      >
                        ปิดร้าน
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${btnPrimary} shrink-0`}
                        onClick={() =>
                          patchBranchSetting(
                            { isOpen: true },
                            {
                              successMessage: "เปิดร้านแล้ว",
                              errorTitle: "เปิดร้านไม่สำเร็จ",
                              confirm: {
                                title: "เปิดร้าน?",
                                message:
                                  "จะเปิดรอบขายใหม่ให้พนักงาน (ตังทอนเริ่มต้น 0) — พนักงานควรกรอกตังทอนเองจากหน้า Staff หากต้องการ",
                                confirmLabel: "เปิดร้าน",
                                tone: "primary",
                              },
                              onSuccessLocal: () =>
                                setSettings((s) => ({ ...s, isOpen: true })),
                            },
                          )
                        }
                      >
                        เปิดร้าน
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        รับสั่งล่วงหน้า
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {settings.allowAdvanceOrder
                          ? "เปิดอยู่ — สั่งได้เฉพาะวันเดียวกันก่อนถึงเวลาเปิดรอบถัดไป"
                          : "ปิดอยู่ — นอกเวลาร้านแล้วลูกค้าสั่งไม่ได้"}
                      </p>
                    </div>
                    {settings.allowAdvanceOrder ? (
                      <button
                        type="button"
                        className={`${btnDanger} shrink-0`}
                        onClick={() =>
                          patchBranchSetting(
                            { allowAdvanceOrder: false },
                            {
                              successMessage: "ปิดรับสั่งล่วงหน้าแล้ว",
                              errorTitle: "บันทึกไม่สำเร็จ",
                              onSuccessLocal: () =>
                                setSettings((s) => ({
                                  ...s,
                                  allowAdvanceOrder: false,
                                })),
                            },
                          )
                        }
                      >
                        ปิดรับล่วงหน้า
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${btnPrimary} shrink-0`}
                        onClick={() =>
                          patchBranchSetting(
                            { allowAdvanceOrder: true },
                            {
                              successMessage: "เปิดรับสั่งล่วงหน้าแล้ว",
                              errorTitle: "บันทึกไม่สำเร็จ",
                              onSuccessLocal: () =>
                                setSettings((s) => ({
                                  ...s,
                                  allowAdvanceOrder: true,
                                })),
                            },
                          )
                        }
                      >
                        เปิดรับล่วงหน้า
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        รับออเดอร์อัตโนมัติ
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {settings.autoAcceptOrders
                          ? "เปิดอยู่ — ออเดอร์ใหม่เข้าสถานะกำลังเตรียมทันที"
                          : "ปิดอยู่ — พนักงานต้องกดรับออเดอร์เอง"}
                      </p>
                    </div>
                    {settings.autoAcceptOrders ? (
                      <button
                        type="button"
                        className={`${btnDanger} shrink-0`}
                        onClick={() =>
                          patchBranchSetting(
                            { autoAcceptOrders: false },
                            {
                              successMessage: "ปิดรับอัตโนมัติแล้ว",
                              errorTitle: "บันทึกไม่สำเร็จ",
                              onSuccessLocal: () =>
                                setSettings((s) => ({
                                  ...s,
                                  autoAcceptOrders: false,
                                })),
                            },
                          )
                        }
                      >
                        ปิดรับอัตโนมัติ
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${btnPrimary} shrink-0`}
                        onClick={() =>
                          patchBranchSetting(
                            { autoAcceptOrders: true },
                            {
                              successMessage: "เปิดรับอัตโนมัติแล้ว",
                              errorTitle: "บันทึกไม่สำเร็จ",
                              onSuccessLocal: () =>
                                setSettings((s) => ({
                                  ...s,
                                  autoAcceptOrders: true,
                                })),
                            },
                          )
                        }
                      >
                        เปิดรับอัตโนมัติ
                      </button>
                    )}
                  </div>

                  {settings.operatingMode === "NORMAL" ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          {HOTPOT_COUNTER_GROUP.weighAddonTitle}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {branch?.brand && branch.brand.bbqEnabled === false
                            ? "แพ็กเกจแบรนด์ยังไม่เปิดโหมดชั่งกิโล"
                            : settings.weighSalesEnabled
                              ? `เปิดอยู่ — ${HOTPOT_COUNTER_GROUP.withWeighLabel} · พนักงานสลับโหมดได้`
                              : `ปิดอยู่ — เปิดเพื่อครอบคลุม ${HOTPOT_COUNTER_GROUP.withWeighLabel}`}
                        </p>
                      </div>
                      {settings.weighSalesEnabled ? (
                        <button
                          type="button"
                          className={`${btnDanger} shrink-0`}
                          onClick={() =>
                            patchBranchSetting(
                              { weighSalesEnabled: false },
                              {
                                successMessage: "ปิดขายชั่งกิโลแล้ว",
                                errorTitle: "บันทึกไม่สำเร็จ",
                                onSuccessLocal: () => {
                                  setSettings((s) => ({
                                    ...s,
                                    weighSalesEnabled: false,
                                  }));
                                  setBranch((prev) =>
                                    prev
                                      ? { ...prev, weighSalesEnabled: false }
                                      : prev,
                                  );
                                },
                              },
                            )
                          }
                        >
                          ปิดชั่งกิโล
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${btnPrimary} shrink-0 disabled:opacity-50`}
                          disabled={branch?.brand?.bbqEnabled === false}
                          onClick={() =>
                            patchBranchSetting(
                              { weighSalesEnabled: true },
                              {
                                successMessage: "เปิดขายชั่งกิโลแล้ว",
                                errorTitle: "บันทึกไม่สำเร็จ",
                                onSuccessLocal: () => {
                                  setSettings((s) => ({
                                    ...s,
                                    weighSalesEnabled: true,
                                  }));
                                  setBranch((prev) =>
                                    prev
                                      ? { ...prev, weighSalesEnabled: true }
                                      : prev,
                                  );
                                },
                              },
                            )
                          }
                        >
                          เปิดชั่งกิโล
                        </button>
                      )}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900">
                        ระบบสต๊อกสาขา
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {!branch?.brandId
                          ? "ใช้ได้เฉพาะสาขาที่อยู่ใต้แบรนด์"
                          : !branch.brand?.stockEnabled
                            ? "เปิดสต๊อกที่แบรนด์ก่อน แล้วค่อยเปิดที่สาขา"
                            : settings.stockEnabled
                              ? "เปิดอยู่ — ตัดจำนวนตอนรับออเดอร์ (เมนูที่ผูกสินค้า)"
                              : "ปิดอยู่ — ใช้ระบบเดิม (หมด/ยังมี) ได้ตามปกติ"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {branch?.brandId && (
                        <Link
                          href={`/admin/branches/${id}?tab=stock`}
                          className={`${btnOutline} shrink-0`}
                        >
                          จัดการสต๊อก
                        </Link>
                      )}
                      {settings.stockEnabled ? (
                        <button
                          type="button"
                          className={`${btnDanger} shrink-0`}
                          onClick={async () => {
                            const res = await fetch(
                              `/api/admin/branches/${id}/stock`,
                              {
                                method: "PATCH",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({ stockEnabled: false }),
                              },
                            );
                            const body = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              toast.error(
                                "บันทึกไม่สำเร็จ",
                                body.error ?? "กรุณาลองใหม่",
                              );
                              return;
                            }
                            setSettings((s) => ({
                              ...s,
                              stockEnabled: false,
                            }));
                            setBranch((prev) =>
                              prev
                                ? { ...prev, stockEnabled: false }
                                : prev,
                            );
                            toast.success("ปิดสต๊อกสาขาแล้ว");
                          }}
                        >
                          ปิดใช้งานสต๊อก
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={`${btnPrimary} shrink-0 disabled:opacity-50`}
                          disabled={
                            !branch?.brandId || !branch.brand?.stockEnabled
                          }
                          onClick={async () => {
                            const res = await fetch(
                              `/api/admin/branches/${id}/stock`,
                              {
                                method: "PATCH",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({ stockEnabled: true }),
                              },
                            );
                            const body = await res.json().catch(() => ({}));
                            if (!res.ok) {
                              toast.error(
                                "บันทึกไม่สำเร็จ",
                                body.error ?? "กรุณาลองใหม่",
                              );
                              return;
                            }
                            setSettings((s) => ({
                              ...s,
                              stockEnabled: true,
                            }));
                            setBranch((prev) =>
                              prev
                                ? { ...prev, stockEnabled: true }
                                : prev,
                            );
                            toast.success("เปิดสต๊อกสาขาแล้ว");
                          }}
                        >
                          เปิดใช้งานสต๊อก
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Identity */}
              <div className="space-y-3 border-t border-slate-100 pt-8">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    ตัวตนสาขา
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    รูป ชื่อ และเบอร์ที่ลูกค้าเห็น
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
                  <ImageField
                    label="รูปสาขา"
                    value={settings.imageUrl}
                    onChange={(url) =>
                      setSettings((s) => ({ ...s, imageUrl: url }))
                    }
                    shopCode={settings.code || branch.code || branch.brand?.code}
                    folder="Branch"
                    aspectClassName="aspect-[3/2]"
                    hint={BRANCH_IMAGE_SIZE_HINT}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 content-start">
                    <div className="sm:col-span-2">
                      <p className="text-xs text-slate-500">
                        ถ้าไม่กรอกชื่อไทย/อังกฤษ ระบบจะใช้ชื่อหลักแทน
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={adminLabelClass}>ชื่อสาขา (หลัก)</label>
                      <input
                        className={adminInputClass}
                        value={settings.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          setSettings((s) => ({
                            ...s,
                            name,
                            ...(!codeManual
                              ? { code: slugifyCode(name) }
                              : {}),
                          }));
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>ชื่อสาขาภาษาไทย</label>
                      <input
                        className={adminInputClass}
                        value={settings.nameTh}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, nameTh: e.target.value }))
                        }
                        placeholder="ว่าง = ใช้ชื่อหลัก"
                      />
                    </div>
                    <div>
                      <label className={adminLabelClass}>
                        ชื่อสาขาภาษาอังกฤษ
                      </label>
                      <input
                        className={adminInputClass}
                        value={settings.nameEn}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, nameEn: e.target.value }))
                        }
                        placeholder="ว่าง = ใช้ชื่อหลัก"
                      />
                    </div>
                    <div className="sm:col-span-2" id="settings-phone">
                      <label className={adminLabelClass}>
                        เบอร์โทรสาขา
                        {!settings.phone.trim() && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            ยังไม่มี
                          </span>
                        )}
                      </label>
                      <PhoneInput
                        value={settings.phone}
                        onChange={(digits) =>
                          setSettings((s) => ({ ...s, phone: digits }))
                        }
                        className={`${adminInputClass}${
                          !settings.phone.trim()
                            ? " border-amber-300 ring-1 ring-amber-200"
                            : ""
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Address + map */}
              <div id="settings-map" className="space-y-3 border-t border-slate-100 pt-8">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    ที่อยู่และแผนที่
                    {!hasBranchMapPin({
                      latitude: settings.latitude,
                      longitude: settings.longitude,
                    }) && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        ยังไม่มีหมุด
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    หมุดร้านใช้เป็นจุดอ้างอิงตอนตั้งพื้นที่จัดส่งด้วย
                  </p>
                </div>
                {!hasBranchMapPin({
                  latitude: settings.latitude,
                  longitude: settings.longitude,
                }) && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    ปักหมุดร้านบนแผนที่ด้านล่าง — badge แท็บตั้งค่าจะนับจุดนี้ด้วย
                  </p>
                )}
                <BranchLocationPicker
                  value={{
                    address: settings.address,
                    latitude: settings.latitude,
                    longitude: settings.longitude,
                  }}
                  onChange={(loc) =>
                    setSettings((s) => ({
                      ...s,
                      address: loc.address,
                      latitude: loc.latitude,
                      longitude: loc.longitude,
                    }))
                  }
                />
              </div>

              {/* 4. Hours */}
              <div className="space-y-3 border-t border-slate-100 pt-8">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    เวลาทำการ
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    มีผลเฉพาะฝั่งลูกค้าสั่งออนไลน์ — พนักงานเปิด/ปิดรอบขายเองจากหน้า Staff
                  </p>
                </div>
                <div className="space-y-6">
                  {settings.storefrontHours && (
                    <BranchHoursEditor
                      title="เวลาเปิด–ปิดหน้าร้าน"
                      description="ใช้กับออเดอร์รับที่ร้าน (Pickup)"
                      value={settings.storefrontHours}
                      onChange={(storefrontHours) =>
                        setSettings((s) => ({ ...s, storefrontHours }))
                      }
                    />
                  )}
                  {settings.deliveryHours && settings.storefrontHours && (
                    <div className="space-y-3">
                      {branch.deliveryLocations.length === 0 && (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          ยังไม่มีพื้นที่จัดส่ง — ตารางเวลานี้ยังไม่มีผลกับลูกค้า
                          จนกว่าจะเพิ่มอย่างน้อย 1 โซน{" "}
                          <button
                            type="button"
                            onClick={() => setTab("locations")}
                            className="font-semibold underline underline-offset-2"
                          >
                            ไปเพิ่มพื้นที่
                          </button>
                        </p>
                      )}
                      <BranchHoursEditor
                        title="เวลาเปิด–ปิดเดลิเวอรี"
                        description="ใช้กับออเดอร์จัดส่ง"
                        value={settings.deliveryHours}
                        onChange={(deliveryHours) =>
                          setSettings((s) => ({ ...s, deliveryHours }))
                        }
                        extraActions={
                          <button
                            type="button"
                            className={btnOutline}
                            onClick={() =>
                              setSettings((s) => ({
                                ...s,
                                deliveryHours: s.storefrontHours
                                  ? s.storefrontHours.map((d) => ({
                                      ...d,
                                      slots: d.slots.map((slot) => ({
                                        ...slot,
                                      })),
                                    }))
                                  : s.deliveryHours,
                              }))
                            }
                          >
                            คัดลอกจากหน้าร้าน
                          </button>
                        }
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Types & price */}
              <div
                id="settings-category"
                className="space-y-3 border-t border-slate-100 pt-8"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    ประเภทและช่วงราคา
                    {!settings.primaryCategory && (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        ยังไม่มีประเภทหลัก
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    แสดงให้ลูกค้าเวลาเลือกร้าน
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={adminLabelClass}>ประเภทหลัก</label>
                    <select
                      className={`${adminInputClass}${
                        !settings.primaryCategory
                          ? " border-amber-300 ring-1 ring-amber-200"
                          : ""
                      }`}
                      value={settings.primaryCategory}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSettings((s) => ({
                          ...s,
                          primaryCategory: value,
                          secondaryCategories: s.secondaryCategories.filter(
                            (c) => c && c !== value,
                          ),
                        }));
                      }}
                    >
                      <option value="">— ไม่ระบุ —</option>
                      {restaurantTypes.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={adminLabelClass}>
                      ประเภทรอง{" "}
                      <span className="font-normal text-slate-400">
                        (ไม่บังคับ · สูงสุด 2 · ไม่ซ้ำกับหลัก)
                      </span>
                    </label>
                    <div className="mt-1 space-y-2">
                      {settings.secondaryCategories.map((catId, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            className={adminInputClass}
                            value={catId}
                            onChange={(e) =>
                              setSettings((s) => {
                                const next = [...s.secondaryCategories];
                                next[idx] = e.target.value;
                                return { ...s, secondaryCategories: next };
                              })
                            }
                          >
                            <option value="">— เลือกประเภท —</option>
                            {restaurantTypes.map((c) => (
                              <option
                                key={c.code}
                                value={c.code}
                                disabled={
                                  c.code === settings.primaryCategory ||
                                  (settings.secondaryCategories.includes(
                                    c.code,
                                  ) &&
                                    c.code !== catId)
                                }
                              >
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="shrink-0 cursor-pointer rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            onClick={() =>
                              setSettings((s) => ({
                                ...s,
                                secondaryCategories:
                                  s.secondaryCategories.filter(
                                    (_, i) => i !== idx,
                                  ),
                              }))
                            }
                          >
                            ลบ
                          </button>
                        </div>
                      ))}
                      {settings.secondaryCategories.length < 2 && (
                        <button
                          type="button"
                          className={`${btnOutline} w-full sm:w-auto`}
                          onClick={() =>
                            setSettings((s) => ({
                              ...s,
                              secondaryCategories: [
                                ...s.secondaryCategories,
                                "",
                              ],
                            }))
                          }
                        >
                          + เพิ่มประเภทร้าน
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={adminLabelClass}>ช่วงราคา</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {PRICE_RANGE_OPTIONS.map((opt) => {
                        const active = settings.priceRange === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setSettings((s) => ({
                                ...s,
                                priceRange: active ? "" : opt.id,
                              }))
                            }
                            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition ${
                              active
                                ? "border-site-primary bg-site-primary-soft font-medium text-site-primary"
                                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* 6. Messages */}
              <div className="space-y-3 border-t border-slate-100 pt-8">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    ข้อความหน้าร้าน
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ไม่บังคับ — แสดงถึงลูกค้าบนหน้าร้าน
                  </p>
                </div>
                <div className="grid gap-3">
                  <div>
                    <label className={adminLabelClass}>ข้อความเจ้าของร้าน</label>
                    <textarea
                      className={`${adminInputClass} min-h-[80px]`}
                      value={settings.ownerMessage}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          ownerMessage: e.target.value,
                        }))
                      }
                      placeholder="ข้อความสั้นๆ จากเจ้าของถึงลูกค้า"
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className={adminLabelClass}>ข้อความเพิ่มเติม</label>
                    <textarea
                      className={`${adminInputClass} min-h-[80px]`}
                      value={settings.extraMessage}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          extraMessage: e.target.value,
                        }))
                      }
                      placeholder="ข้อมูลเสริม เช่น หมายเหตุการสั่ง / จุดสังเกตร้าน"
                      rows={3}
                    />
                  </div>
                </div>
              </div>

              {/* 7. Brand + URL (rare) */}
              <div className="space-y-3 border-t border-slate-100 pt-8">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    แบรนด์และลิงก์สาขา
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    แบรนด์ผูกตอนสร้างสาขา — แก้ได้แค่รหัส URL ของสาขา
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={adminLabelClass}>แบรนด์</label>
                    <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-800">
                      {branch.brand?.name ??
                        brands.find((b) => b.id === settings.brandId)?.name ??
                        "— ไม่ระบุ —"}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    {!codeFieldOpen ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-2.5">
                        <div className="min-w-0 text-sm text-gray-600">
                          <span className="font-medium text-gray-800">
                            รหัสสาขา (URL)
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-gray-500">
                            {settings.code
                              ? `/${
                                  brands.find((b) => b.id === settings.brandId)
                                    ?.code ?? "brand"
                                }/${settings.code}`
                              : "สร้างอัตโนมัติจากชื่อสาขา"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCodeFieldOpen(true)}
                          className={btnOutline}
                        >
                          แสดง / แก้รหัส
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-gray-200 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className={`${adminLabelClass} mb-0`}>
                            รหัสสาขา (URL)
                          </label>
                          <div className="flex items-center gap-2">
                            {codeManual ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setCodeManual(false);
                                  setSettings((s) => ({
                                    ...s,
                                    code: slugifyCode(s.name),
                                  }));
                                }}
                                className="text-xs text-site-primary hover:underline"
                              >
                                ใช้แบบอัตโนมัติ
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setCodeManual(true)}
                                className="text-xs text-gray-500 hover:text-gray-800"
                              >
                                แก้เอง
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setCodeFieldOpen(false)}
                              className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
                              aria-label="ซ่อนรหัสสาขา"
                              title="ซ่อน"
                            >
                              <IconClose size={16} />
                            </button>
                          </div>
                        </div>
                        <input
                          className={`${adminInputClass} ${
                            codeManual ? "" : "bg-gray-50 text-gray-600"
                          }`}
                          value={settings.code}
                          onChange={(e) => {
                            setCodeManual(true);
                            setSettings((s) => ({
                              ...s,
                              code:
                                slugifyCode(e.target.value) ||
                                e.target.value.toLowerCase(),
                            }));
                          }}
                          readOnly={!codeManual}
                          placeholder="สร้างอัตโนมัติจากชื่อ"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          {codeManual
                            ? "กำลังกำหนดรหัสเอง (a-z 0-9 และ -)"
                            : "สร้างอัตโนมัติจากชื่อสาขา"}
                          {settings.brandId && settings.code
                            ? ` · /${
                                brands.find((b) => b.id === settings.brandId)
                                  ?.code ?? "…"
                              }/${settings.code}`
                            : null}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <button type="submit" className={`${btnPrimary} w-full sm:w-auto`}>
                  บันทึกตั้งค่า
                </button>
              </div>
            </form>

            <div className="mt-8 space-y-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4 sm:p-5">
              <div>
                <p className="text-sm font-semibold text-violet-950">
                  สาขาทดลอง
                </p>
                <p className="mt-0.5 text-xs text-violet-900/70">
                  ได้ 1 สล็อตต่อแบรนด์ — ไม่นับโควต้าแพ็กเกจ และไม่โชว์หน้าร้านลูกค้า
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/80 bg-white px-4 py-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {settings.isTest
                      ? "ติดป้ายสาขาทดลองอยู่"
                      : "ทำเครื่องหมายเป็นสาขาทดลอง"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {settings.isTest
                      ? "แอดมินจะเห็นป้ายม่วง “⚗ ทดลอง” — ยกเลิกได้ถ้ามีโควต้าสาขาจริงว่าง"
                      : "แบรนด์ละ 1 สาขาเท่านั้น สำหรับเทรนพนักงาน / ทดลอง stock และออเดอร์"}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${
                    settings.isTest ? btnOutline : btnPrimary
                  } shrink-0`}
                  onClick={() =>
                    patchBranchSetting(
                      { isTest: !settings.isTest },
                      {
                        successMessage: settings.isTest
                          ? "ยกเลิกป้ายทดลองแล้ว"
                          : "ตั้งเป็นสาขาทดลองแล้ว",
                        errorTitle: "บันทึกไม่สำเร็จ",
                        onSuccessLocal: () =>
                          setSettings((s) => ({
                            ...s,
                            isTest: !s.isTest,
                          })),
                      },
                    )
                  }
                >
                  {settings.isTest ? "ยกเลิกป้ายทดลอง" : "ตั้งเป็นสาขาทดลอง"}
                </button>
              </div>
            </div>

            <div className="mt-8 space-y-3 rounded-2xl border border-red-200 bg-red-50/40 p-4 sm:p-5">
              <div>
                <p className="text-sm font-semibold text-red-900">
                  โซนอันตราย
                </p>
                <p className="mt-0.5 text-xs text-red-800/80">
                  ซ่อนสาขาออกจากหน้าร้านลูกค้า หรือลบสาขาถาวร — กดแล้วจะมีหน้าต่างยืนยันก่อนทุกครั้ง
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/80 bg-white px-4 py-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {settings.isHidden ? "สาขาถูกซ่อนอยู่" : "ซ่อนสาขาจากลูกค้า"}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {settings.isHidden
                      ? "ลูกค้าไม่เห็นสาขานี้ในหน้าร้าน — แอดมินยังจัดการได้ตามปกติ"
                      : "ซ่อนออกจากรายการร้านของลูกค้า โดยยังเก็บข้อมูลไว้ในระบบ"}
                  </p>
                </div>
                {settings.isHidden ? (
                  <button
                    type="button"
                    className={`${btnPrimary} shrink-0`}
                    onClick={() =>
                      patchBranchSetting(
                        { isHidden: false },
                        {
                          successMessage: "แสดงสาขาให้ลูกค้าแล้ว",
                          errorTitle: "แสดงสาขาไม่สำเร็จ",
                          confirm: {
                            title: "แสดงสาขานี้ให้ลูกค้า?",
                            message:
                              "สาขาจะกลับไปโผล่ในหน้าร้านตามสถานะเปิด/ปิดร้านปกติ",
                            confirmLabel: "แสดงสาขา",
                          },
                          onSuccessLocal: () =>
                            setSettings((s) => ({ ...s, isHidden: false })),
                        },
                      )
                    }
                  >
                    แสดงสาขา
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${btnDanger} shrink-0`}
                    onClick={() =>
                      patchBranchSetting(
                        { isHidden: true },
                        {
                          successMessage: "ซ่อนสาขาแล้ว",
                          errorTitle: "ซ่อนสาขาไม่สำเร็จ",
                          confirm: {
                            title: "ซ่อนสาขานี้?",
                            message:
                              "ลูกค้าจะไม่เห็นสาขานี้ในหน้าร้าน และสั่งออเดอร์ใหม่ไม่ได้ จนกว่าคุณจะกดแสดงอีกครั้ง",
                            confirmLabel: "ซ่อนสาขา",
                          },
                          onSuccessLocal: () =>
                            setSettings((s) => ({ ...s, isHidden: true })),
                        },
                      )
                    }
                  >
                    ซ่อนสาขา
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/80 bg-white px-4 py-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">ลบสาขา</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    ลบถาวร — ถ้ามีออเดอร์อยู่แล้วจะลบไม่ได้ ให้ใช้ซ่อนสาขาแทน
                  </p>
                </div>
                <button
                  type="button"
                  className={`${btnDanger} shrink-0`}
                  onClick={() => void deleteBranch()}
                >
                  ลบสาขา
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      <AdminModal
        open={stockPasteOpen}
        title="ซ่อนเมนูจากข้อความสต็อก"
        description='วางข้อความเช็คสต็อก — ระบบจะซ่อนเมนูที่ลงท้ายด้วยคำว่า "หมด"'
        onClose={() => {
          if (!stockPasteBusy) setStockPasteOpen(false);
        }}
        busy={stockPasteBusy}
        maxWidthClassName="max-w-xl"
      >
        <div className="space-y-4 p-5">
          <div>
            <label className={adminLabelClass} htmlFor="stock-paste-text">
              ข้อความจาก LINE / โน้ต
            </label>
            <textarea
              id="stock-paste-text"
              className={`${adminInputClass} min-h-[220px] font-mono text-xs leading-relaxed`}
              value={stockPasteText}
              onChange={(e) => setStockPasteText(e.target.value)}
              placeholder={
                "ตัวอย่าง\n3.เห็ดออริจิพัน            หมด\n7.บล็อคโคลี่            หมด\n11ปลาเส้น            หมด"
              }
              disabled={stockPasteBusy}
            />
          </div>

          {stockPasteResult && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
              <p className="font-semibold text-slate-900">
                พบรายการหมด {stockPasteResult.soldOutParsed.length} ชื่อ ·
                ซ่อนใหม่ {stockPasteResult.hiddenCount} รายการ
                {stockPasteResult.alreadyHidden.length
                  ? ` · ซ่อนอยู่แล้ว ${stockPasteResult.alreadyHidden.length}`
                  : ""}
              </p>
              {stockPasteResult.toHide.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-emerald-800">
                    ซ่อนแล้ว
                  </p>
                  <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-slate-700">
                    {stockPasteResult.toHide.map((m) => (
                      <li key={m.id}>
                        {m.name}
                        {m.matchedFrom !== m.name ? (
                          <span className="text-slate-400">
                            {" "}
                            (จาก “{m.matchedFrom}”)
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {stockPasteResult.notFound.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-amber-800">
                    ไม่พบในระบบ ({stockPasteResult.notFound.length})
                  </p>
                  <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5 text-xs text-slate-700">
                    {stockPasteResult.notFound.map((n, i) => (
                      <li key={`${n.name}-${i}`}>{n.name || n.raw}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              className={btnOutline}
              disabled={stockPasteBusy}
              onClick={() => setStockPasteOpen(false)}
            >
              ปิด
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={stockPasteBusy || !stockPasteText.trim()}
              onClick={() => void applyStockPasteHide()}
            >
              {stockPasteBusy ? "กำลังซ่อน..." : "ยืนยันซ่อนเมนูที่หมด"}
            </button>
          </div>
        </div>
      </AdminModal>

      <AdminModal
        open={menuSetupModalOpen}
        title="ยังตั้งค่าเมนูไม่ครบ"
        description="ก่อนเพิ่มเมนู ต้องมีหมวดหมู่และชุดตัวเลือกอย่างน้อยอย่างละ 1 รายการ กดการ์ดด้านล่างเพื่อไปสร้าง"
        onClose={() => setMenuSetupModalOpen(false)}
        maxWidthClassName="max-w-lg"
      >
        <div className="space-y-3 p-5">
          {(branch.menuCategories?.length ?? 0) === 0 && (
            <button
              type="button"
              onClick={() => {
                setMenuSetupModalOpen(false);
                setTab("categories");
              }}
              className="flex w-full items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-left transition hover:border-amber-300 hover:bg-amber-50"
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700 shadow-sm">
                #
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">
                  ยังไม่มีหมวดหมู่
                </span>
                <span className="mt-0.5 block text-sm text-slate-600">
                  ไปแท็บหมวดหมู่เพื่อสร้าง เช่น เมนูปิ้ง ลูกชิ้น เครื่องดื่ม
                </span>
                <span className="mt-2 inline-block text-sm font-medium text-site-primary">
                  ไปสร้างหมวดหมู่ →
                </span>
              </span>
            </button>
          )}
          {(branch.optionGroups?.length ?? 0) === 0 && (
            <button
              type="button"
              onClick={() => {
                setMenuSetupModalOpen(false);
                setTab("options");
              }}
              className="flex w-full items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-4 text-left transition hover:border-sky-300 hover:bg-sky-50"
            >
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm">
                ≡
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">
                  ยังไม่มีตัวเลือก
                </span>
                <span className="mt-0.5 block text-sm text-slate-600">
                  ไปแท็บตัวเลือกเพื่อสร้างชุด เช่น ระดับความเผ็ด ซอส
                </span>
                <span className="mt-2 inline-block text-sm font-medium text-site-primary">
                  ไปสร้างตัวเลือก →
                </span>
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMenuSetupModalOpen(false)}
            className={`w-full ${btnOutline}`}
          >
            ปิด
          </button>
        </div>
      </AdminModal>

      <AdminCloseStoreModal
        open={closeStoreOpen}
        branchId={id}
        busy={closeStoreBusy}
        onClose={() => {
          if (!closeStoreBusy) setCloseStoreOpen(false);
        }}
        onConfirm={async () => {
          setCloseStoreBusy(true);
          try {
            const res = await fetch(`/api/admin/branches/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ isOpen: false }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              toast.error("ปิดร้านไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
              return;
            }
            toast.success("ปิดร้านแล้ว");
            setSettings((s) => ({ ...s, isOpen: false }));
            setCloseStoreOpen(false);
            load();
          } finally {
            setCloseStoreBusy(false);
          }
        }}
      />
    </div>
  );
}
