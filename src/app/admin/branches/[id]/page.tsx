"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  adminInputClass,
  adminLabelClass,
  btnDanger,
  btnDark,
  btnOutline,
  btnPrimary,
} from "@/components/admin/AdminShell";
import { ImageField } from "@/components/admin/ImageField";
import { AdminModal } from "@/components/admin/AdminModal";
import { OrdersTable, type AdminOrderRow } from "@/components/admin/OrdersTable";
import { RevenueBars } from "@/components/admin/RevenueBars";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { PhoneInput } from "@/components/PhoneInput";
import { PhoneCallButton } from "@/components/PhoneCallButton";
import { BranchLocationPicker } from "@/components/admin/BranchLocationPicker";
import { BranchHoursEditor } from "@/components/admin/BranchHoursEditor";
import { BranchOptionLibrary } from "@/components/admin/BranchOptionLibrary";
import { BranchCategoryLibrary } from "@/components/admin/BranchCategoryLibrary";
import { BranchShareCopyPanel } from "@/components/admin/BranchShareCopyPanel";
import { IconBack, IconClose, IconPlus, IconUser } from "@/components/icons";
import {
  formatThaiPhone,
  phoneDigits,
} from "@/lib/constants";
import {
  ensureWeeklySchedule,
  formatTodayHoursSummary,
  type WeeklySchedule,
} from "@/lib/branch-hours";
import {
  PRICE_RANGE_OPTIONS,
  RESTAURANT_CATEGORIES,
} from "@/lib/localized";
import { slugifyCode } from "@/lib/slug";
import type { PriceRangeId } from "@/lib/localized";
import type { StaffRole } from "@prisma/client";

type PhoneCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
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
  opensAt: string | null;
  closesAt: string | null;
  storefrontHours: unknown;
  deliveryHours: unknown;
  allowAdvanceOrder: boolean;
  autoAcceptOrders: boolean;
  brand: Brand | null;
  staff: {
    id: string;
    phone: string;
    name: string | null;
    gender: string | null;
    age: number | null;
    imageUrl: string | null;
    isActive: boolean;
    roles: { id: string; role: StaffRole }[];
  }[];
  menuItems: {
    id: string;
    name: string;
    price: string;
    description: string | null;
    category: { id: string; name: string } | null;
    imageUrl: string | null;
    isHidden: boolean;
    isOutOfStock: boolean;
    sortOrder: number;
  }[];
  deliveryLocations: { id: string; name: string }[];
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
  | "staff"
  | "locations"
  | "settings";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "ภาพรวม" },
  { id: "menu", label: "เมนู" },
  { id: "categories", label: "หมวดหมู่" },
  { id: "options", label: "ตัวเลือก" },
  { id: "copy", label: "คัดลอก" },
  { id: "orders", label: "ออเดอร์" },
  { id: "staff", label: "พนักงาน" },
  { id: "locations", label: "พื้นที่จัดส่ง" },
  { id: "settings", label: "ตั้งค่าสาขา" },
];

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

function isTabId(value: string | null): value is TabId {
  return TABS.some((t) => t.id === value);
}

export default function BranchDetailPage() {
  return (
    <Suspense fallback={<p className="text-gray-500">กำลังโหลด...</p>}>
      <BranchDetailContent />
    </Suspense>
  );
}

function BranchDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
    allowAdvanceOrder: true,
    autoAcceptOrders: false,
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

  const [locationName, setLocationName] = useState("");
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null,
  );
  const [editLocationName, setEditLocationName] = useState("");
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [codeManual, setCodeManual] = useState(false);
  const [codeFieldOpen, setCodeFieldOpen] = useState(false);

  function setTab(next: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function load() {
    const [branchRes, brandsRes] = await Promise.all([
      fetch(`/api/admin/branches/${id}`),
      fetch("/api/admin/brands"),
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
    setBranch({
      ...data,
      menuItems: data.menuItems ?? [],
      staff: data.staff ?? [],
      deliveryLocations: data.deliveryLocations ?? [],
      orders: data.orders ?? [],
    });
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
      allowAdvanceOrder: data.allowAdvanceOrder,
      autoAcceptOrders: data.autoAcceptOrders ?? false,
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
          setPhoneCheck({ status: "available" });
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
  }, [staffPhone, staffModalOpen, editingStaffId]);

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

    const res = await fetch(`/api/admin/branches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settings.name.trim(),
        nameTh: settings.nameTh.trim() || null,
        nameEn: settings.nameEn.trim() || null,
        brandId: settings.brandId || null,
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
      };
      onSuccessLocal?: () => void;
    },
  ) {
    if (opts.confirm) {
      const ok = await confirm(opts.confirm);
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

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    const roles: StaffRole[] = [];
    if (staffSeller) roles.push("SELLER");
    if (staffDelivery) roles.push("DELIVERY");
    if (roles.length === 0) {
      toast.error("บันทึกไม่สำเร็จ", "เลือกอย่างน้อย 1 บทบาท");
      return;
    }
    if (phoneCheck.status === "taken") {
      toast.error("บันทึกไม่สำเร็จ", "เบอร์โทรนี้ถูกใช้ในระบบแล้ว");
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
    if (staffSeller) roles.push("SELLER");
    if (staffDelivery) roles.push("DELIVERY");
    if (roles.length === 0) {
      toast.error("บันทึกไม่สำเร็จ", "เลือกอย่างน้อย 1 บทบาท");
      return;
    }
    if (phoneCheck.status === "taken") {
      toast.error("บันทึกไม่สำเร็จ", "เบอร์โทรนี้ถูกใช้ในระบบแล้ว");
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

  async function toggleHidden(menuId: string, isHidden: boolean) {
    await fetch(`/api/admin/branches/${id}/menu-items/${menuId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isHidden }),
    });
    load();
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

  async function addLocation(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/admin/branches/${id}/locations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: locationName }),
    });
    setLocationName("");
    setLocationModalOpen(false);
    load();
  }

  async function renameLocation(locationId: string) {
    if (!editLocationName.trim()) return;
    await fetch(`/api/admin/branches/${id}/locations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, name: editLocationName.trim() }),
    });
    setEditingLocationId(null);
    load();
  }

  async function removeLocation(locationId: string) {
    const ok = await confirm({
      title: "ลบพื้นที่จัดส่ง?",
      message: "ลบพื้นที่นี้ออกจากสาขา",
      confirmLabel: "ลบ",
    });
    if (!ok) return;
    await fetch(
      `/api/admin/branches/${id}/locations?locationId=${locationId}`,
      { method: "DELETE" },
    );
    load();
  }

  if (!branch) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  const outOfStockCount = (branch.menuItems ?? []).filter(
    (m) => m.isOutOfStock,
  ).length;
  const hiddenCount = (branch.menuItems ?? []).filter((m) => m.isHidden).length;
  const activeStaff = (branch.staff ?? []).filter((s) => s.isActive).length;
  const stats = branch.orderStats;
  const money = (n: number) =>
    n.toLocaleString("th-TH", { maximumFractionDigits: 0 });

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
      >
        <IconBack size={16} />
        กลับ
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">{branch.name}</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                branch.isOpen
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-200 text-gray-600"
              }`}
            >
              {branch.isOpen ? "เปิดอยู่" : "ปิดร้าน"}
            </span>
          </div>
          {branch.brand && branch.code && (
            <p className="mt-0.5 text-sm text-gray-500">
              /{branch.brand.code}/{branch.code}
            </p>
          )}
        </div>
      </div>

      <div className="sticky top-[3.25rem] z-20 -mx-1 mt-4 overflow-x-auto bg-slate-50/95 px-1 py-2 backdrop-blur lg:top-[3.5rem]">
        <div className="flex min-w-max gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-red-600 font-semibold text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                <p className="text-sm text-emerald-700">รายได้ที่เสร็จสิ้น</p>
                <p className="mt-1 text-2xl font-bold text-emerald-800">
                  {money(stats?.completedRevenue ?? 0)} ฿
                </p>
                <p className="mt-1 text-xs text-emerald-600/80">
                  {stats?.completedCount ?? 0} ออเดอร์ · ไม่นับที่ยกเลิก/ค้าง
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-4 shadow-sm">
                <p className="text-sm text-gray-600">ยอดที่ถูกยกเลิก</p>
                <p className="mt-1 text-2xl font-bold text-gray-800">
                  {money(stats?.cancelledRevenue ?? 0)} ฿
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {stats?.cancelledCount ?? 0} ออเดอร์
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTab("orders")}
                className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 text-left shadow-sm transition hover:border-amber-300"
              >
                <p className="text-sm text-amber-700">ออเดอร์ระหว่างทาง</p>
                <p className="mt-1 text-2xl font-bold text-amber-800">
                  {stats?.openCount ?? 0}
                </p>
                <p className="mt-1 text-xs text-amber-600/80">
                  ทั้งหมด {stats?.totalOrders ?? 0} ออเดอร์
                </p>
              </button>
              <button
                type="button"
                onClick={() => setTab("menu")}
                className="rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-red-200"
              >
                <p className="text-sm text-gray-500">เมนู</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {branch.menuItems.length}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {outOfStockCount || hiddenCount
                    ? `หมด ${outOfStockCount} · ซ่อน ${hiddenCount}`
                    : "รายการทั้งหมด"}
                </p>
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className={panelClass}>
                <h3 className="mb-3 font-semibold text-gray-900">
                  กราฟรายได้ / ยกเลิก
                </h3>
                {stats?.last7Days?.length ? (
                  <RevenueBars days={stats.last7Days} />
                ) : (
                  <p className="text-sm text-gray-500">ยังไม่มีข้อมูลพอสำหรับกราฟ</p>
                )}
              </div>

              <div className={`${panelClass} grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2`}>
                <div>
                  <h3 className="font-semibold text-gray-900">สถานะร้าน</h3>
                  <ul className="mt-2 space-y-1 text-sm text-gray-600">
                    <li>
                      วันนี้ (หน้าร้าน):{" "}
                      {formatTodayHoursSummary(
                        ensureWeeklySchedule(
                          branch.storefrontHours,
                          branch.opensAt,
                          branch.closesAt,
                        ),
                      )}
                    </li>
                    <li>
                      วันนี้ (เดลิเวอรี):{" "}
                      {formatTodayHoursSummary(
                        ensureWeeklySchedule(
                          branch.deliveryHours,
                          branch.opensAt,
                          branch.closesAt,
                        ),
                      )}
                    </li>
                    <li>
                      สั่งล่วงหน้า:{" "}
                      {branch.allowAdvanceOrder ? "รับ" : "ไม่รับ"}
                    </li>
                    <li>
                      รับออเดอร์อัตโนมัติ:{" "}
                      {branch.autoAcceptOrders ? "เปิด" : "ปิด"}
                    </li>
                    <li className="flex flex-wrap items-center gap-2">
                    เบอร์สาขา:{" "}
                    {branch.phone ? (
                      <PhoneCallButton phone={branch.phone} showNumber />
                    ) : (
                      "—"
                    )}
                  </li>
                    <li>
                      พนักงาน: {activeStaff}/{branch.staff.length} · พื้นที่ส่ง{" "}
                      {branch.deliveryLocations.length}
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={() => setTab("settings")}
                    className={`${btnOutline} mt-3`}
                  >
                    ไปตั้งค่าสาขา
                  </button>
                </div>
                <div>
                  {branch.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={branch.imageUrl}
                      alt=""
                      className="h-40 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-400">
                      ยังไม่มีรูปสาขา
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-semibold text-gray-900">ออเดอร์ล่าสุด</h3>
                <button
                  type="button"
                  onClick={() => setTab("orders")}
                  className="text-sm text-red-600 hover:underline"
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  เมนูของสาขานี้
                </h3>
                <p className="mt-0.5 text-sm text-gray-600">
                  {branch.menuItems.length} รายการ
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTab("categories")}
                  className={btnOutline}
                >
                  หมวดหมู่
                </button>
                <button
                  type="button"
                  onClick={() => setTab("options")}
                  className={btnOutline}
                >
                  ตัวเลือก
                </button>
                <button
                  type="button"
                  onClick={() => setTab("copy")}
                  className={btnOutline}
                >
                  คัดลอกด้วยโค้ด
                </button>
                <Link
                  href={`/admin/branches/${id}/menu/new`}
                  className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
                >
                  <IconPlus size={16} />
                  เพิ่มเมนู
                </Link>
              </div>
            </div>

            <ul className="mt-4 space-y-2">
              {branch.menuItems.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 px-3 py-2"
                >
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.imageUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-[10px] text-gray-500">
                      ไม่มี
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">
                      {m.name}{" "}
                      <span className="font-medium text-gray-600">
                        — {Number(m.price).toLocaleString("th-TH")} บาท
                      </span>
                    </p>
                    {m.description && (
                      <p className="truncate text-sm text-gray-700">
                        {m.description}
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {m.category && (
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                          {m.category.name}
                        </span>
                      )}
                      {m.isHidden && (
                        <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                          ซ่อน
                        </span>
                      )}
                      {m.isOutOfStock && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          หมด
                        </span>
                      )}
                      <span className="text-xs text-gray-600">
                        ลำดับ: {m.sortOrder}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/admin/branches/${id}/menu/${m.id}`}
                      className={btnOutline}
                    >
                      แก้ไข
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleHidden(m.id, !m.isHidden)}
                      className={btnOutline}
                    >
                      {m.isHidden ? "แสดง" : "ซ่อน"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMenu(m.id)}
                      className={btnDanger}
                    >
                      ลบ
                    </button>
                  </div>
                </li>
              ))}
            </ul>
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

        {activeTab === "orders" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-semibold text-gray-900">ออเดอร์</h3>
                <p className="text-sm text-gray-500">
                  แสดงล่าสุดสูงสุด 100 รายการ · ยอดคำนวณจากรายการ + ค่าส่ง − ส่วนลด
                </p>
              </div>
              {stats && (
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                    รายได้ {money(stats.completedRevenue)} ฿
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600">
                    ยกเลิก {money(stats.cancelledRevenue)} ฿
                  </span>
                </div>
              )}
            </div>
            <OrdersTable orders={branch.orders} />
          </div>
        )}

        {activeTab === "staff" && (
          <div className={panelClass}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  พนักงานประจำสาขา
                </h3>
                <p className="mt-0.5 text-sm text-gray-600">
                  {branch.staff.length} คน · รูปไม่บังคับ
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
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 ring-2 ring-white shadow-sm">
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
                          {s.roles.map((r) => (
                            <span
                              key={r.id}
                              className="rounded-full bg-gray-900/90 px-2 py-0.5 font-medium text-white"
                            >
                              {ROLE_LABELS[r.role] ?? r.role}
                            </span>
                          ))}
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
                      <button
                        type="button"
                        onClick={() => startEditStaff(s)}
                        className={btnOutline}
                      >
                        แก้ไข
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
                  <div className="rounded-2xl border border-dashed border-red-100 bg-gradient-to-b from-red-50/60 to-white p-3">
                    <ImageField
                      label="รูปโปรไฟล์"
                      value={staffImageUrl}
                      onChange={setStaffImageUrl}
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
                          เบอร์นี้ใช้ได้
                        </p>
                      )}
                      {phoneCheck.status === "incomplete" && (
                        <p className="mt-1.5 text-xs text-amber-700">
                          กรอกเบอร์ให้ครบอย่างน้อย 9 หลัก
                        </p>
                      )}
                      {phoneCheck.status === "taken" && (
                        <p className="mt-1.5 text-xs font-medium text-red-600">
                          เบอร์ซ้ำ — ใช้โดย{" "}
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
                              ? "bg-red-600 text-white shadow-sm"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          คนขาย
                        </button>
                        <button
                          type="button"
                          onClick={() => setStaffDelivery((v) => !v)}
                          className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                            staffDelivery
                              ? "bg-red-600 text-white shadow-sm"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          คนส่ง
                        </button>
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
                  {branch.deliveryLocations.length} พื้นที่
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLocationModalOpen(true)}
                className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
              >
                <IconPlus size={16} />
                เพิ่มพื้นที่
              </button>
            </div>
            <ul className="space-y-2">
              {branch.deliveryLocations.map((loc) => (
                <li
                  key={loc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2"
                >
                  {editingLocationId === loc.id ? (
                    <div className="flex flex-1 gap-2">
                      <input
                        className={adminInputClass}
                        value={editLocationName}
                        onChange={(e) => setEditLocationName(e.target.value)}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => renameLocation(loc.id)}
                        className={btnPrimary}
                      >
                        บันทึก
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingLocationId(null)}
                        className={btnOutline}
                      >
                        ยกเลิก
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900">
                        {loc.name}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLocationId(loc.id);
                            setEditLocationName(loc.name);
                          }}
                          className={btnOutline}
                        >
                          เปลี่ยนชื่อ
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLocation(loc.id)}
                          className={btnDanger}
                        >
                          ลบ
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>

            <AdminModal
              open={locationModalOpen}
              title="เพิ่มพื้นที่จัดส่ง"
              description="เช่น หอพัก อาคาร หรือโซนที่ร้านส่งถึง"
              onClose={() => setLocationModalOpen(false)}
              maxWidthClassName="max-w-lg"
            >
              <form onSubmit={addLocation} className="p-5">
                <label className={adminLabelClass}>ชื่อพื้นที่</label>
                <input
                  className={adminInputClass}
                  placeholder="เช่น หอพัก A"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  required
                  autoFocus
                />
                <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-4">
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
            <div className="border-b border-gray-100 bg-gradient-to-r from-red-50 via-white to-orange-50 px-5 py-4">
              <h3 className="font-semibold text-gray-900">ตั้งค่าสาขา</h3>
              <p className="mt-0.5 text-sm text-gray-600">
                อัปโหลดรูปหน้าร้าน และข้อมูลที่ใช้แสดงฝั่งลูกค้า
              </p>
            </div>
            <form onSubmit={saveBranch} className="p-5">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr]">
                <ImageField
                  label="รูปสาขา"
                  value={settings.imageUrl}
                  onChange={(url) =>
                    setSettings((s) => ({ ...s, imageUrl: url }))
                  }
                  aspectClassName="aspect-[4/3]"
                />
                <div className="grid gap-3 sm:grid-cols-2 content-start">
                  <div className="sm:col-span-2">
                    <p className="text-sm font-semibold text-gray-900">
                      ชื่อสาขา
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      ถ้าไม่กรอกชื่อไทย/อังกฤษ ระบบจะใช้ชื่อหลักแทน
                    </p>
                  </div>
                  <div>
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
                    <label className={adminLabelClass}>แบรนด์</label>
                    <select
                      className={adminInputClass}
                      value={settings.brandId}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, brandId: e.target.value }))
                      }
                    >
                      <option value="">— ไม่ระบุ —</option>
                      {brands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
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
                    <label className={adminLabelClass}>ชื่อสาขาภาษาอังกฤษ</label>
                    <input
                      className={adminInputClass}
                      value={settings.nameEn}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, nameEn: e.target.value }))
                      }
                      placeholder="ว่าง = ใช้ชื่อหลัก"
                    />
                  </div>
                  <div>
                    <label className={adminLabelClass}>ประเภทหลัก</label>
                    <select
                      className={adminInputClass}
                      value={settings.primaryCategory}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          primaryCategory: e.target.value,
                        }))
                      }
                    >
                      <option value="">— ไม่ระบุ —</option>
                      {RESTAURANT_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={adminLabelClass}>
                      ประเภทรอง{" "}
                      <span className="font-normal text-gray-400">
                        (ไม่บังคับ · สูงสุด 2)
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
                            {RESTAURANT_CATEGORIES.map((c) => (
                              <option
                                key={c.id}
                                value={c.id}
                                disabled={
                                  c.id === settings.primaryCategory ||
                                  (settings.secondaryCategories.includes(
                                    c.id,
                                  ) &&
                                    c.id !== catId)
                                }
                              >
                                {c.label}
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
                                ? "border-red-500 bg-red-50 font-medium text-red-700"
                                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
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
                  <div className="sm:col-span-2">
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
                                className="text-xs text-red-600 hover:underline"
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
                  <div>
                    <label className={adminLabelClass}>เบอร์โทรสาขา</label>
                    <PhoneInput
                      value={settings.phone}
                      onChange={(digits) =>
                        setSettings((s) => ({ ...s, phone: digits }))
                      }
                      className={adminInputClass}
                    />
                  </div>
                  <div className="space-y-3 sm:col-span-2">
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900">
                          สถานะร้านตอนนี้
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {settings.isOpen
                            ? "ร้านเปิด — กดปิดร้านถ้าต้องการหยุดรับออเดอร์ชั่วคราว"
                            : "ร้านปิดชั่วคราว — ลูกค้าสั่งไม่ได้จนกว่าจะเปิดใหม่"}
                        </p>
                      </div>
                      {settings.isOpen ? (
                        <button
                          type="button"
                          className={`${btnDanger} shrink-0`}
                          onClick={() =>
                            patchBranchSetting(
                              { isOpen: false },
                              {
                                successMessage: "ปิดร้านแล้ว",
                                errorTitle: "ปิดร้านไม่สำเร็จ",
                                confirm: {
                                  title: "ปิดร้าน?",
                                  message:
                                    "ยืนยันปิดร้านชั่วคราว ลูกค้าจะไม่สามารถสั่งได้จนกว่าคุณจะเปิดร้านอีกครั้ง",
                                  confirmLabel: "ปิดร้าน",
                                },
                                onSuccessLocal: () =>
                                  setSettings((s) => ({ ...s, isOpen: false })),
                              },
                            )
                          }
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
                  </div>
                  <div className="sm:col-span-2 space-y-6 border-t border-gray-100 pt-5">
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
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <button type="submit" className={`${btnPrimary} w-full`}>
                      บันทึกตั้งค่า
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
