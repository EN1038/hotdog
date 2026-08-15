"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminPageHeader,
  adminInputClass,
  adminLabelClass,
  adminTableClass,
  adminTableWrapClass,
  adminTheadClass,
  adminTrHoverClass,
  btnDanger,
  btnOutline,
  btnPrimary,
  btnPrimaryXl,
} from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { useToast } from "@/components/admin/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { DateInput } from "@/components/DateInput";
import { IconBack, IconPlus } from "@/components/icons";
import {
  BrandPlanBanner,
  BRAND_STATUS_BADGE,
  BRAND_STATUS_EDITABLE,
  BRAND_STATUS_LABELS,
  type BrandPlanId,
  type BrandStatusId,
} from "@/components/admin/BrandPlanBanner";
import {
  BRAND_PLAN_HINTS,
  BRAND_PLAN_LABELS,
  BRAND_PLAN_PRESETS,
  BRAND_PLAN_PRICES,
  BRAND_PLANS_ORDERED,
} from "@/lib/brand-plan-shared";

type MemberRow = {
  membershipId: string;
  role: string;
  adminId: string;
  username: string;
  phone?: string | null;
  createdAt: string;
  isPrimary?: boolean;
  password?: string | null;
  passwordRecoverable?: boolean;
};

type InvoiceRow = {
  id: string;
  number: string;
  title: string;
  amountBaht: number;
  status: string;
  periodLabel: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  note: string | null;
  createdAt: string;
};

type BrandAccount = {
  id: string;
  name: string;
  code: string;
  contactPhone: string | null;
  status: BrandStatusId;
  plan: BrandPlanId;
  maxBranches: number;
  maxStaff: number;
  stockEnabled: boolean;
  kitchenEnabled: boolean;
  bbqEnabled: boolean;
  skewerEnabled: boolean;
  serviceStartsAt: string | null;
  trialEndsAt: string | null;
  primaryAdminId: string | null;
  billingNote: string | null;
  lastPaidAt: string | null;
  nextDueAt: string | null;
  suggestedPriceBaht: number | null;
  _count?: { branches: number; members: number };
};

type StaffBranchRow = {
  id: string;
  name: string;
  code: string;
  kind: string;
  isTest: boolean;
  staffActive: number;
  staffInactive: number;
  sellers: number;
  delivery: number;
  both: number;
  ownerIsStaff?: boolean;
};

type StaffOverview = {
  maxStaff: number;
  uniqueActivePhones: number;
  staffActive: number;
  staffInactive: number;
  sellerOnly: number;
  deliveryOnly: number;
  bothRoles: number;
  ownerStaffBranchCount?: number;
  ownerIsStaffEverywhere?: boolean;
  branches: StaffBranchRow[];
};

type StaffPersonBranch = {
  staffId: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  kind: string;
  isTest: boolean;
  isActive: boolean;
  roles: string[];
};

type StaffPersonSession = {
  id: string;
  deviceId: string;
  userAgent: string | null;
  deviceLabel: string;
  lastSeenAt: string;
  expiresAt: string;
  online: boolean;
};

type StaffPerson = {
  phone: string;
  name: string | null;
  phoneVerifiedAt: string | null;
  otpVerified: boolean;
  usageStatus: "active" | "inactive";
  branchCount: number;
  activeBranchCount: number;
  branches: StaffPersonBranch[];
  liveSessionCount: number;
  online: boolean;
  lastSeenAt: string | null;
  sessions: StaffPersonSession[];
};

type AccountTab = "accounts" | "staff" | "billing";

const STAFF_ROLE_TH: Record<string, string> = {
  SELLER: "คนขาย",
  DELIVERY: "คนส่ง",
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ACCOUNT_TABS: Array<{ id: AccountTab; label: string }> = [
  { id: "accounts", label: "บัญชีแอดมิน" },
  { id: "staff", label: "พนักงานสาขา" },
  { id: "billing", label: "แพ็กเกจ / บิล" },
];

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง",
  ISSUED: "แจ้งหนี้",
  PAID: "ชำระแล้ว",
  VOID: "ยกเลิก",
};

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dateInputToIso(value: string) {
  if (!value) return null;
  return `${value}T12:00:00.000+07:00`;
}

function formatMoney(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

export default function BrandAdminsPage() {
  const { id: brandId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, loaded } = useAdminSession();
  const toast = useToast();
  const { confirm } = useConfirm();

  const tabParam = searchParams.get("tab");
  const tab: AccountTab =
    tabParam === "staff" || tabParam === "billing" || tabParam === "accounts"
      ? tabParam
      : "accounts";

  function setTab(next: AccountTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/admin/brands/${brandId}/admins?${params.toString()}`, {
      scroll: false,
    });
  }

  const [brand, setBrand] = useState<BrandAccount | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [staffOverview, setStaffOverview] = useState<StaffOverview | null>(
    null,
  );
  const [ownerPhone, setOwnerPhone] = useState<string | null>(null);
  const [syncingOwnerStaff, setSyncingOwnerStaff] = useState(false);
  const [staffPeople, setStaffPeople] = useState<StaffPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [expandedPhone, setExpandedPhone] = useState<string | null>(null);
  const [revokingKey, setRevokingKey] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MemberRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingBilling, setSavingBilling] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>(
    {},
  );
  const [form, setForm] = useState({
    username: "",
    password: "",
    role: "OWNER" as "OWNER" | "MANAGER",
  });
  const [billingForm, setBillingForm] = useState({
    contactPhone: "",
    billingNote: "",
    lastPaidAt: "",
    nextDueAt: "",
  });
  const [planForm, setPlanForm] = useState({
    status: "TRIAL" as BrandStatusId,
    plan: "RETAIL" as BrandPlanId,
    maxBranches: 1,
    maxStaff: 5,
    stockEnabled: false,
    kitchenEnabled: false,
    bbqEnabled: false,
    skewerEnabled: false,
    serviceStartsAt: "",
    trialEndsAt: "",
  });
  const [invoiceForm, setInvoiceForm] = useState({
    title: "ค่าบริการรายเดือน",
    amountBaht: "",
    periodLabel: "",
    note: "",
    markPaid: false,
  });

  const isPlatform = Boolean(session?.isPlatformAdmin);
  const primary = useMemo(
    () => members.find((m) => m.isPrimary) ?? members[0] ?? null,
    [members],
  );

  const loadPeople = useCallback(async () => {
    setPeopleLoading(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/staff-people`);
      if (!res.ok) return;
      const data = await res.json();
      setStaffPeople(data.people ?? []);
    } finally {
      setPeopleLoading(false);
    }
  }, [brandId]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/brands/${brandId}/account`);
    if (res.status === 401) {
      router.push("/admin/login");
      return;
    }
    if (res.status === 403 || res.status === 404) {
      router.replace("/admin");
      return;
    }
    if (!res.ok) {
      toast.error("โหลดไม่สำเร็จ");
      setLoading(false);
      return;
    }
    const data = await res.json();
    const b = data.brand as BrandAccount;
    setBrand(b);
    setMembers(data.members ?? []);
    setInvoices(data.invoices ?? []);
    setStaffOverview(data.staffOverview ?? null);
    setOwnerPhone(
      typeof data.ownerPhone === "string" && data.ownerPhone
        ? data.ownerPhone
        : null,
    );
    setCanManage(Boolean(data.canManage));
    setBillingForm({
      contactPhone: b.contactPhone ?? "",
      billingNote: b.billingNote ?? "",
      lastPaidAt: toDateInput(b.lastPaidAt),
      nextDueAt: toDateInput(b.nextDueAt),
    });
    setPlanForm({
      status: b.status,
      plan: b.plan,
      maxBranches: b.maxBranches,
      maxStaff: b.maxStaff,
      stockEnabled: b.stockEnabled,
      kitchenEnabled: b.kitchenEnabled,
      bbqEnabled: b.bbqEnabled,
      skewerEnabled: b.skewerEnabled,
      serviceStartsAt: toDateInput(b.serviceStartsAt) || toDateInput(new Date().toISOString()),
      trialEndsAt: toDateInput(b.trialEndsAt),
    });
    setInvoiceForm((f) => ({
      ...f,
      amountBaht: String(b.suggestedPriceBaht ?? BRAND_PLAN_PRICES[b.plan] ?? ""),
    }));
    setLoading(false);
  }, [brandId, router, toast]);

  useEffect(() => {
    if (!loaded) return;
    if (session && !session.isPlatformAdmin) {
      if (!session.brandIds.includes(brandId)) {
        router.replace("/admin");
        return;
      }
    }
    void load();
  }, [loaded, session, brandId, router, load]);

  useEffect(() => {
    if (!loaded || tab !== "staff") return;
    void loadPeople();
  }, [loaded, tab, loadPeople]);

  async function revokeStaffSessions(phone: string, sessionId?: string) {
    const key = sessionId ? `${phone}:${sessionId}` : phone;
    const ok = await confirm({
      title: sessionId ? "ปลดเซสชันเครื่องนี้?" : "ปลดทุกเครื่องเข้าใช้งาน?",
      message: sessionId
        ? `พนักงานจะถูกออกจากระบบบนเครื่องนี้ทันที`
        : `เบอร์ ${phone} จะถูกออกจากระบบทุกเครื่อง (สูงสุด 3 เครื่อง)`,
      confirmLabel: "ปลดเซสชัน",
    });
    if (!ok) return;
    setRevokingKey(key);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/staff-people`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("ปลดไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(sessionId ? "ปลดเครื่องแล้ว" : "ปลดทุกเครื่องแล้ว");
      await loadPeople();
    } finally {
      setRevokingKey(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ username: "", password: "", role: "MANAGER" });
    setModalOpen(true);
  }

  function openEdit(member: MemberRow) {
    setEditing(member);
    setForm({
      username: member.username,
      password: "",
      role: member.role === "MANAGER" ? "MANAGER" : "OWNER",
    });
    setModalOpen(true);
  }

  async function saveMember(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, string> = {};
        if (form.username.trim().toLowerCase() !== editing.username) {
          payload.username = form.username.trim().toLowerCase();
        }
        if (form.password.trim()) payload.password = form.password;
        if (form.role !== editing.role) payload.role = form.role;
        if (Object.keys(payload).length === 0) {
          toast.error("ยังไม่ได้เปลี่ยนอะไร");
          return;
        }
        const res = await fetch(
          `/api/admin/brands/${brandId}/admins/${editing.adminId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("บันทึกไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
          return;
        }
        toast.success("บันทึกแล้ว");
      } else {
        const res = await fetch(`/api/admin/brands/${brandId}/admins`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: form.username.trim().toLowerCase(),
            password: form.password,
            role: form.role,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error("เพิ่มไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
          return;
        }
        toast.success(
          data.linked ? "ผูกไอดีเดิมเข้าแบรนด์แล้ว" : "เพิ่มผู้ดูแลแล้ว",
        );
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function syncOwnerAsStaff(branchIds?: string[]) {
    if (!ownerPhone) {
      toast.error(
        "ยังไม่มีเบอร์เจ้าของ",
        "ตั้งเบอร์ในบัญชีเจ้าของหรือเบอร์ติดต่อแบรนด์ก่อน",
      );
      return;
    }
    setSyncingOwnerStaff(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/owner-as-staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(branchIds?.length ? { branchIds } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("เพิ่มไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      const created = (data.created as string[] | undefined)?.length ?? 0;
      const reactivated =
        (data.reactivated as string[] | undefined)?.length ?? 0;
      toast.success(
        "เบอร์เจ้าของพร้อมเป็นพนักงานแล้ว",
        `สร้าง ${created} สาขา · เติมสิทธิ์/เปิดใช้ ${reactivated} · เบอร์ ${data.phone ?? ownerPhone}`,
      );
      await load();
      await loadPeople();
    } finally {
      setSyncingOwnerStaff(false);
    }
  }

  async function removeMember(member: MemberRow) {
    if (!canManage) return;
    if (member.isPrimary) {
      toast.error("ลบเจ้าของหลักไม่ได้", "ตั้งเจ้าของหลักคนอื่นก่อน");
      return;
    }
    const ok = await confirm({
      title: "ถอดผู้ดูแลออกจากแบรนด์?",
      message: `ถอด ${member.username} ออกจาก ${brand?.name ?? "แบรนด์นี้"}`,
      confirmLabel: "ถอดออก",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/brands/${brandId}/admins/${member.adminId}`,
      { method: "DELETE" },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("ถอดไม่ออก", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("ถอดผู้ดูแลแล้ว");
    await load();
  }

  async function setAsPrimary(member: MemberRow) {
    if (!canManage || member.isPrimary) return;
    const ok = await confirm({
      title: "ตั้งเป็นเจ้าของหลัก?",
      message: `${member.username} จะเป็นบัญชีหลักที่ลบไม่ได้ของแบรนด์นี้`,
      confirmLabel: "ตั้งเป็นเจ้าของหลัก",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/brands/${brandId}/account`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryAdminId: member.adminId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("ตั้งไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("ตั้งเจ้าของหลักแล้ว");
    await load();
  }

  async function saveBilling(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSavingBilling(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/account`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactPhone: billingForm.contactPhone.trim() || null,
          billingNote: billingForm.billingNote.trim() || null,
          lastPaidAt: dateInputToIso(billingForm.lastPaidAt),
          nextDueAt: dateInputToIso(billingForm.nextDueAt),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกการชำระไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("บันทึกข้อมูลชำระเงินแล้ว");
      await load();
    } finally {
      setSavingBilling(false);
    }
  }

  function applyPlanLimits(plan: BrandPlanId) {
    const preset = BRAND_PLAN_PRESETS[plan];
    setPlanForm((f) => ({
      ...f,
      plan,
      maxBranches: preset.maxBranches,
      maxStaff: preset.maxStaff,
      stockEnabled: preset.stockEnabled,
      kitchenEnabled: preset.kitchenEnabled,
      bbqEnabled: preset.bbqEnabled,
      skewerEnabled: preset.skewerEnabled,
    }));
  }

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSavingPlan(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: planForm.status,
          plan: planForm.plan,
          applyPlanPreset: false,
          maxBranches: planForm.maxBranches,
          maxStaff: planForm.maxStaff,
          stockEnabled: planForm.stockEnabled,
          kitchenEnabled: planForm.kitchenEnabled,
          bbqEnabled: planForm.bbqEnabled,
          skewerEnabled: planForm.skewerEnabled,
          serviceStartsAt: planForm.serviceStartsAt
            ? `${planForm.serviceStartsAt}T00:00:00.000+07:00`
            : null,
          trialEndsAt:
            planForm.status === "TRIAL" && planForm.trialEndsAt
              ? dateInputToIso(planForm.trialEndsAt)
              : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("บันทึกแพ็กเกจไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success("อัปเดตแพ็กเกจแล้ว");
      await load();
    } finally {
      setSavingPlan(false);
    }
  }

  async function createInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const amount = Number(invoiceForm.amountBaht);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("กรอกจำนวนเงินให้ถูกต้อง");
      return;
    }
    setSavingInvoice(true);
    try {
      const res = await fetch(`/api/admin/brands/${brandId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: invoiceForm.title.trim() || "ค่าบริการรายเดือน",
          amountBaht: amount,
          periodLabel: invoiceForm.periodLabel.trim() || null,
          note: invoiceForm.note.trim() || null,
          markPaid: invoiceForm.markPaid,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("สร้างใบแจ้งหนี้ไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
        return;
      }
      toast.success(
        invoiceForm.markPaid ? "บันทึกใบเสร็จแล้ว" : "สร้างใบแจ้งหนี้แล้ว",
      );
      setInvoiceOpen(false);
      await load();
    } finally {
      setSavingInvoice(false);
    }
  }

  async function markInvoicePaid(invoice: InvoiceRow) {
    if (!canManage || invoice.status === "PAID") return;
    const ok = await confirm({
      title: "ยืนยันชำระแล้ว?",
      message: `${invoice.number} · ฿${formatMoney(invoice.amountBaht)}`,
      confirmLabel: "ชำระแล้ว",
    });
    if (!ok) return;
    const res = await fetch(
      `/api/admin/brands/${brandId}/invoices/${invoice.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAID" }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error("อัปเดตไม่สำเร็จ", data.error ?? "กรุณาลองใหม่");
      return;
    }
    toast.success("บันทึกชำระแล้ว · สถานะแบรนด์เป็นใช้งาน");
    await load();
  }

  if (!loaded || loading || !brand) {
    return <AdminLoadingState />;
  }

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-site-primary hover:underline"
      >
        <IconBack size={16} />
        กลับ
      </Link>

      <AdminPageHeader
        title={`บัญชีเจ้าของ · ${brand.name}`}
        description={
          tab === "staff"
            ? `ภาพรวมพนักงานทุกสาขา · โควต้าเบอร์ไม่ซ้ำ ${staffOverview?.uniqueActivePhones ?? 0}/${brand.maxStaff}`
            : tab === "billing"
              ? `แพ็กเกจ · การชำระเงิน · ใบแจ้งหนี้ ของ /${brand.code}`
              : canManage
                ? `จัดการบัญชีแอดมิน · สิทธิ์เจ้าของ/ผู้จัดการ ของ /${brand.code}`
                : `ดูบัญชีภายใต้ /${brand.code} — แก้รหัสให้ติดต่อแอดมินแพลตฟอร์ม`
        }
        actions={
          canManage && tab === "accounts" ? (
            <button type="button" onClick={openCreate} className={btnPrimaryXl}>
              <IconPlus size={16} />
              เพิ่มไอดี
            </button>
          ) : tab === "staff" ? (
            <Link
              href={`/admin/brands/${brandId}`}
              className={btnOutline}
            >
              ดูสาขาทั้งหมด
            </Link>
          ) : undefined
        }
      />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {ACCOUNT_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${
              tab === item.id
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {item.label}
            {item.id === "accounts" ? (
              <span className="ml-1 opacity-80">({members.length})</span>
            ) : null}
            {item.id === "staff" && staffOverview ? (
              <span className="ml-1 opacity-80">
                ({staffOverview.uniqueActivePhones}/{brand.maxStaff})
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "accounts" ? (
        <>
      {/* Primary owner */}
      <section className="mt-6 rounded-2xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-teal-800">
              เจ้าของหลัก (ลบไม่ได้)
            </p>
            {primary ? (
              <>
                <p className="mt-1 font-mono text-lg font-bold text-slate-900">
                  {primary.username}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  เข้าสู่ระบบที่{" "}
                  <Link href="/owner/login" className="font-semibold text-site-primary">
                    /owner/login
                  </Link>
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-600">ยังไม่มีผู้ดูแล</p>
            )}
          </div>
          {canManage && primary ? (
            <button
              type="button"
              onClick={() => openEdit(primary)}
              className={btnOutline}
            >
              แก้ไอดี/รหัส
            </button>
          ) : null}
        </div>
        {canManage && primary?.passwordRecoverable && primary.password ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">รหัสผ่าน</span>
            <code className="rounded bg-white px-2 py-1 font-mono text-xs text-slate-800 ring-1 ring-slate-200">
              {showPassword[primary.adminId] ? primary.password : "••••••••"}
            </code>
            <button
              type="button"
              className="text-xs font-medium text-site-primary hover:underline"
              onClick={() =>
                setShowPassword((s) => ({
                  ...s,
                  [primary.adminId]: !s[primary.adminId],
                }))
              }
            >
              {showPassword[primary.adminId] ? "ซ่อน" : "แสดง"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-bold text-slate-900">ภาพรวมสิทธิ์แอดมิน</h2>
        <p className="mt-1 text-sm text-slate-500">
          บัญชีเหล่านี้ล็อกอินที่ /owner/login — ไม่ใช่พนักงานหน้าร้าน (OTP)
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3">
            <p className="text-sm font-bold text-teal-900">เจ้าของ (OWNER)</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
              <li>เข้าหลังบ้านแบรนด์ / จัดการสาขา เมนู สต็อก ออเดอร์</li>
              <li>เจ้าของหลักลบหรือลดสิทธิ์ไม่ได้จนกว่าจะโอนหลักให้คนอื่น</li>
              <li>
                เบอร์เดียวกับพนักงานได้ — แม่ค้าคนเดียวใช้ /owner และ /staff
                คนละหน้า (สลับล็อกอิน)
              </li>
              <li>สร้าง/แก้ไอดีได้เฉพาะแอดมินแพลตฟอร์ม</li>
            </ul>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-bold text-slate-900">ผู้จัดการ (MANAGER)</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
              <li>เข้าหลังบ้านแบรนด์ได้เหมือนเจ้าของ (สิทธิ์ใช้งานเท่ากัน)</li>
              <li>ใช้แยกบทบาทในทีม — ไม่ใช่เจ้าของหลัก</li>
              <li>ลบหรือเปลี่ยนสิทธิ์ได้โดยแอดมินแพลตฟอร์ม</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Members */}
      <section className="mt-6">
        <h2 className="mb-3 text-base font-bold text-slate-900">
          ผู้ดูแลทั้งหมด
        </h2>
        {members.length === 0 ? (
          <AdminEmptyState
            title="ยังไม่มีผู้ดูแล"
            description={
              canManage
                ? "กดเพิ่มไอดีเพื่อสร้างบัญชีเข้าใช้หลังบ้านของแบรนด์นี้"
                : "ยังไม่มีบัญชีในแบรนด์นี้"
            }
          />
        ) : (
          <div className={adminTableWrapClass}>
            <table className={adminTableClass}>
              <thead className={adminTheadClass}>
                <tr>
                  <th className="px-4 py-3 font-semibold">ไอดี</th>
                  <th className="px-4 py-3 font-semibold">สิทธิ์</th>
                  {canManage && (
                    <th className="px-4 py-3 font-semibold">รหัสผ่าน</th>
                  )}
                  {canManage && <th className="px-4 py-3 font-semibold" />}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.membershipId} className={adminTrHoverClass}>
                    <td className="px-4 py-3 font-mono text-sm font-medium text-slate-900">
                      {m.username}
                      {m.isPrimary ? (
                        <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                          เจ้าของหลัก
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {m.role === "MANAGER" ? "ผู้จัดการ" : "เจ้าของ"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {m.passwordRecoverable && m.password ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <code className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">
                              {showPassword[m.adminId] ? m.password : "••••••••"}
                            </code>
                            <button
                              type="button"
                              className="text-xs font-medium text-site-primary hover:underline"
                              onClick={() =>
                                setShowPassword((s) => ({
                                  ...s,
                                  [m.adminId]: !s[m.adminId],
                                }))
                              }
                            >
                              {showPassword[m.adminId] ? "ซ่อน" : "แสดง"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    {canManage && (
                      <td className="space-x-2 px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(m)}
                          className={btnOutline}
                        >
                          แก้ไข
                        </button>
                        {!m.isPrimary ? (
                          <button
                            type="button"
                            onClick={() => void setAsPrimary(m)}
                            className={btnOutline}
                          >
                            ตั้งเป็นหลัก
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void removeMember(m)}
                          className={btnDanger}
                          disabled={Boolean(m.isPrimary) || members.length <= 1}
                          title={
                            m.isPrimary ? "ลบเจ้าของหลักไม่ได้" : undefined
                          }
                        >
                          ถอดออก
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!canManage && (
          <p className="mt-4 text-sm text-slate-500">
            หากต้องการเพิ่มไอดีหรือเปลี่ยนรหัสผ่าน ให้ติดต่อแอดมินแพลตฟอร์ม
          </p>
        )}
      </section>
        </>
      ) : null}

      {tab === "billing" ? (
        <>
      {/* Package */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-base font-bold text-slate-900">แพ็กเกจและการใช้งาน</h2>
        <div className="mt-3">
          <BrandPlanBanner brand={brand} />
        </div>
        {canManage ? (
          <form onSubmit={savePlan} className="mt-5 space-y-4 border-t border-slate-100 pt-4">
            <div>
              <p className={adminLabelClass}>สถานะ</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {BRAND_STATUS_EDITABLE.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setPlanForm((f) => ({ ...f, status }))}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                      planForm.status === status
                        ? BRAND_STATUS_BADGE[status]
                        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {BRAND_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabelClass}>วันเริ่มใช้งาน</label>
                <DateInput
                  className={adminInputClass}
                  value={planForm.serviceStartsAt}
                  onChange={(v) =>
                    setPlanForm((f) => ({
                      ...f,
                      serviceStartsAt: v,
                    }))
                  }
                  required
                />
              </div>
              {planForm.status === "TRIAL" ? (
                <div>
                  <label className={adminLabelClass}>วันสิ้นสุดทดลอง</label>
                  <DateInput
                    className={adminInputClass}
                    value={planForm.trialEndsAt}
                    onChange={(v) =>
                      setPlanForm((f) => ({
                        ...f,
                        trialEndsAt: v,
                      }))
                    }
                  />
                </div>
              ) : null}
            </div>
            <div>
              <p className={adminLabelClass}>แพ็กเกจ</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {BRAND_PLANS_ORDERED.map((plan) => {
                  const preset = BRAND_PLAN_PRESETS[plan];
                  const selected = planForm.plan === plan;
                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => applyPlanLimits(plan)}
                      className={`rounded-2xl border px-4 py-3 text-left transition ${
                        selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
                      }`}
                    >
                      <p className="font-semibold">{BRAND_PLAN_LABELS[plan]}</p>
                      <p
                        className={`mt-0.5 text-xs font-medium ${
                          selected ? "text-white/90" : "text-slate-600"
                        }`}
                      >
                        ฿{BRAND_PLAN_PRICES[plan]}/เดือน
                      </p>
                      <p
                        className={`mt-1 text-xs ${
                          selected ? "text-white/75" : "text-slate-500"
                        }`}
                      >
                        สาขา {preset.maxBranches} · พนักงาน {preset.maxStaff}
                      </p>
                      <p
                        className={`mt-1 text-[11px] leading-snug ${
                          selected ? "text-white/65" : "text-slate-400"
                        }`}
                      >
                        {BRAND_PLAN_HINTS[plan]}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={adminLabelClass}>โควต้าสาขา</span>
                <input
                  type="number"
                  min={1}
                  className={adminInputClass}
                  value={planForm.maxBranches}
                  onChange={(e) =>
                    setPlanForm((f) => ({
                      ...f,
                      maxBranches: Number(e.target.value) || 1,
                    }))
                  }
                />
              </label>
              <label>
                <span className={adminLabelClass}>โควต้าพนักงาน</span>
                <input
                  type="number"
                  min={1}
                  className={adminInputClass}
                  value={planForm.maxStaff}
                  onChange={(e) =>
                    setPlanForm((f) => ({
                      ...f,
                      maxStaff: Number(e.target.value) || 1,
                    }))
                  }
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              {(
                [
                  ["stockEnabled", "สต็อก"],
                  ["kitchenEnabled", "ครัว"],
                  ["bbqEnabled", "หมูกระทะ"],
                  ["skewerEnabled", "เสียบไม้"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={planForm[key]}
                    onChange={(e) =>
                      setPlanForm((f) => ({ ...f, [key]: e.target.checked }))
                    }
                  />
                  <span className="font-medium text-slate-700">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="submit" className={btnPrimary} disabled={savingPlan}>
                {savingPlan ? "กำลังบันทึก..." : "บันทึกแพ็กเกจ"}
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {/* Billing */}
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">
            การชำระเงิน · ใบแจ้งหนี้ / ใบเสร็จ
          </h2>
          {canManage ? (
            <button
              type="button"
              className={btnPrimary}
              onClick={() => setInvoiceOpen(true)}
            >
              <IconPlus size={14} />
              ออกใบแจ้งหนี้
            </button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          บันทึกด้วยมือสำหรับตอนนี้ — ยังไม่เชื่อมเกตเวย์ชำระเงินอัตโนมัติ
        </p>

        {canManage ? (
          <form onSubmit={saveBilling} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className={adminLabelClass}>เบอร์ติดต่อเจ้าของ</span>
              <input
                className={adminInputClass}
                value={billingForm.contactPhone}
                onChange={(e) =>
                  setBillingForm((f) => ({
                    ...f,
                    contactPhone: e.target.value,
                  }))
                }
                placeholder="08x-xxx-xxxx"
              />
            </label>
            <label className="sm:col-span-2">
              <span className={adminLabelClass}>บันทึกการชำระ / หมายเหตุ</span>
              <textarea
                className={`${adminInputClass} min-h-[72px]`}
                value={billingForm.billingNote}
                onChange={(e) =>
                  setBillingForm((f) => ({ ...f, billingNote: e.target.value }))
                }
                placeholder="เช่น โอนแล้ว 14 ส.ค. · สลิปในแชท LINE"
              />
            </label>
            <label>
              <span className={adminLabelClass}>ชำระล่าสุด</span>
              <DateInput
                className={adminInputClass}
                value={billingForm.lastPaidAt}
                onChange={(v) =>
                  setBillingForm((f) => ({ ...f, lastPaidAt: v }))
                }
              />
            </label>
            <label>
              <span className={adminLabelClass}>ครบกำหนดถัดไป</span>
              <DateInput
                className={adminInputClass}
                value={billingForm.nextDueAt}
                onChange={(v) =>
                  setBillingForm((f) => ({ ...f, nextDueAt: v }))
                }
              />
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="submit"
                className={btnPrimary}
                disabled={savingBilling}
              >
                {savingBilling ? "กำลังบันทึก..." : "บันทึกการชำระเงิน"}
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <p>เบอร์ติดต่อ: {brand.contactPhone || "—"}</p>
            <p>หมายเหตุ: {brand.billingNote || "—"}</p>
          </div>
        )}

        <div className="mt-5">
          {invoices.length === 0 ? (
            <AdminEmptyState
              title="ยังไม่มีใบแจ้งหนี้"
              description="เมื่อรับเงินแล้ว กดออกใบแจ้งหนี้/ใบเสร็จเพื่อเก็บประวัติ"
            />
          ) : (
            <div className={adminTableWrapClass}>
              <table className={adminTableClass}>
                <thead className={adminTheadClass}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">เลขที่</th>
                    <th className="px-4 py-3 font-semibold">รายการ</th>
                    <th className="px-4 py-3 font-semibold text-right">ยอด</th>
                    <th className="px-4 py-3 font-semibold">สถานะ</th>
                    {canManage ? (
                      <th className="px-4 py-3 font-semibold" />
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className={adminTrHoverClass}>
                      <td className="px-4 py-3 font-mono text-sm">{inv.number}</td>
                      <td className="px-4 py-3 text-sm">
                        <p className="font-medium text-slate-900">{inv.title}</p>
                        {inv.periodLabel ? (
                          <p className="text-xs text-slate-500">{inv.periodLabel}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                        ฿{formatMoney(inv.amountBaht)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {INVOICE_STATUS_LABEL[inv.status] ?? inv.status}
                      </td>
                      {canManage ? (
                        <td className="px-4 py-3 text-right">
                          {inv.status !== "PAID" && inv.status !== "VOID" ? (
                            <button
                              type="button"
                              className={btnOutline}
                              onClick={() => void markInvoicePaid(inv)}
                            >
                              ชำระแล้ว
                            </button>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

        </>
      ) : null}

      {tab === "staff" ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">
              เจ้าของคนเดียว · ทำได้ทุกอย่าง
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              ใช้เบอร์เดียวกันได้ทั้งหลังบ้าน{" "}
              <span className="font-semibold">/owner/login</span> และหน้าร้าน{" "}
              <span className="font-semibold">/staff/login</span>{" "}
              (สลับล็อกอินตามหน้าที่) — แม่ค้ามักมีแค่ 1 เบอร์
            </p>
            <p className="mt-2 text-sm text-slate-700">
              เบอร์เจ้าของ:{" "}
              <span className="font-mono font-semibold">
                {ownerPhone ?? "ยังไม่มี — ตั้งในบัญชีแอดมินหรือเบอร์ติดต่อ"}
              </span>
              {staffOverview?.ownerIsStaffEverywhere ? (
                <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  เป็นพนักงานครบทุกสาขาแล้ว
                </span>
              ) : null}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={!ownerPhone || syncingOwnerStaff}
                onClick={() => void syncOwnerAsStaff()}
              >
                {syncingOwnerStaff
                  ? "กำลังเพิ่ม..."
                  : "เพิ่มเจ้าของเป็นพนักงานทุกสาขา (ขาย+ส่ง)"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-bold text-slate-900">
              ภาพรวมพนักงาน
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              พนักงานล็อกอินด้วยเบอร์ + OTP — สร้างเพิ่มหรือแก้สิทธิ์ที่หน้าสาขาได้
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">
                  เบอร์ใช้งาน / โควต้า
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                  {staffOverview?.uniqueActivePhones ?? 0}/{brand.maxStaff}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                <p className="text-[11px] font-semibold text-slate-500">
                  บัญชีเปิดใช้
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">
                  {staffOverview?.staffActive ?? 0}
                </p>
              </div>
              <div className="rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-100">
                <p className="text-[11px] font-semibold text-amber-800">คนขาย</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-amber-950">
                  {(staffOverview?.sellerOnly ?? 0) +
                    (staffOverview?.bothRoles ?? 0)}
                </p>
              </div>
              <div className="rounded-xl bg-sky-50 px-3 py-2.5 ring-1 ring-sky-100">
                <p className="text-[11px] font-semibold text-sky-800">คนส่ง</p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-sky-950">
                  {(staffOverview?.deliveryOnly ?? 0) +
                    (staffOverview?.bothRoles ?? 0)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                <p className="text-sm font-bold text-amber-950">คนขาย (SELLER)</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>รับออเดอร์ · อัปเดตครัว · เปิด/ปิดร้าน</li>
                  <li>สต๊อกกลาง: เป็นพนักงานคลัง</li>
                </ul>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
                <p className="text-sm font-bold text-sky-950">คนส่ง (DELIVERY)</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-700">
                  <li>อัปเดตสถานะส่งของ</li>
                  <li>เลือกทั้งสองบทบาทได้ในคนเดียวกัน</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  ภาพรวมพนักงานทั้งแบรนด์
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  รายคน · สาขาที่มีสิทธิ์ · OTP · ออนไลน์ · เซสชันเครื่อง
                  (ออนไลน์ = ใช้งานภายใน 5 นาที)
                </p>
              </div>
              <button
                type="button"
                className={btnOutline}
                disabled={peopleLoading}
                onClick={() => void loadPeople()}
              >
                {peopleLoading ? "กำลังโหลด..." : "รีเฟรช"}
              </button>
            </div>

            {peopleLoading && staffPeople.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">กำลังโหลด...</p>
            ) : staffPeople.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">ยังไม่มีพนักงาน</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {staffPeople.map((person) => {
                  const open = expandedPhone === person.phone;
                  return (
                    <li
                      key={person.phone}
                      className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/50"
                    >
                      <button
                        type="button"
                        className="flex w-full flex-col gap-2 p-3 text-left sm:flex-row sm:items-center sm:justify-between"
                        onClick={() =>
                          setExpandedPhone(open ? null : person.phone)
                        }
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="font-bold text-slate-900">
                              {person.name || "ไม่ระบุชื่อ"}
                            </p>
                            <span className="font-mono text-xs text-slate-500">
                              {person.phone}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                person.online
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-200 text-slate-600"
                              }`}
                            >
                              {person.online ? "Online" : "Offline"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                person.usageStatus === "active"
                                  ? "bg-teal-100 text-teal-800"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {person.usageStatus === "active"
                                ? "ใช้งาน"
                                : "ไม่ใช้งาน"}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                person.otpVerified
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {person.otpVerified
                                ? "ยืนยัน OTP แล้ว"
                                : "ยังไม่ยืนยัน OTP"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            สาขา {person.activeBranchCount}/{person.branchCount}
                            {" · "}
                            เซสชัน {person.liveSessionCount}/3
                            {" · "}
                            เข้าใช้ล่าสุด {formatDateTime(person.lastSeenAt)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-semibold text-slate-500">
                          {open ? "ซ่อนรายละเอียด" : "ดูรายละเอียด"}
                        </span>
                      </button>

                      {open ? (
                        <div className="space-y-3 border-t border-slate-200 bg-white p-3">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                              สิทธิ์ตามสาขา
                            </p>
                            <ul className="mt-2 space-y-1.5">
                              {person.branches.map((b) => (
                                <li
                                  key={b.staffId}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
                                >
                                  <div>
                                    <p className="font-medium text-slate-900">
                                      {b.branchName}
                                      {b.kind === "WAREHOUSE"
                                        ? " · สต๊อกกลาง"
                                        : ""}
                                      {b.isTest ? " · ทดลอง" : ""}
                                    </p>
                                    <p className="text-[11px] text-slate-500">
                                      {b.roles
                                        .map((r) => STAFF_ROLE_TH[r] ?? r)
                                        .join(" · ") || "ไม่มีบทบาท"}
                                      {" · "}
                                      {b.isActive ? "เปิดใช้" : "ปิดใช้"}
                                    </p>
                                  </div>
                                  <Link
                                    href={`/admin/branches/${b.branchId}?tab=staff`}
                                    className="text-xs font-semibold text-site-primary hover:underline"
                                  >
                                    จัดการ
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                เซสชันที่เข้าใช้อยู่
                              </p>
                              {person.liveSessionCount > 0 ? (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
                                  disabled={revokingKey === person.phone}
                                  onClick={() =>
                                    void revokeStaffSessions(person.phone)
                                  }
                                >
                                  {revokingKey === person.phone
                                    ? "กำลังปลด..."
                                    : "ปลดทุกเครื่อง"}
                                </button>
                              ) : null}
                            </div>
                            {person.sessions.length === 0 ? (
                              <p className="mt-2 text-sm text-slate-500">
                                ไม่มีเครื่องที่ล็อกอินอยู่
                              </p>
                            ) : (
                              <ul className="mt-2 space-y-1.5">
                                {person.sessions.map((s) => (
                                  <li
                                    key={s.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm"
                                  >
                                    <div>
                                      <p className="font-medium text-slate-900">
                                        {s.deviceLabel}
                                        <span
                                          className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                            s.online
                                              ? "bg-emerald-100 text-emerald-800"
                                              : "bg-slate-200 text-slate-600"
                                          }`}
                                        >
                                          {s.online ? "Online" : "Offline"}
                                        </span>
                                      </p>
                                      <p className="text-[11px] text-slate-500">
                                        เห็นล่าสุด{" "}
                                        {formatDateTime(s.lastSeenAt)}
                                        {" · "}
                                        หมดอายุ {formatDateTime(s.expiresAt)}
                                      </p>
                                      <p className="truncate font-mono text-[10px] text-slate-400">
                                        device {s.deviceId.slice(0, 12)}…
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      className={`${btnDanger} !px-2 !py-1 text-xs`}
                                      disabled={
                                        revokingKey === `${person.phone}:${s.id}`
                                      }
                                      onClick={() =>
                                        void revokeStaffSessions(
                                          person.phone,
                                          s.id,
                                        )
                                      }
                                    >
                                      ปลดเครื่องนี้
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="text-sm font-bold text-slate-900">พนักงานตามสาขา</h3>
            <p className="mt-1 text-xs text-slate-500">
              กด «จัดการพนักงาน» เพื่อสร้าง แก้สิทธิ์ หรือปิดใช้งานที่สาขานั้น
            </p>
            {!staffOverview || staffOverview.branches.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">ยังไม่มีสาขา</p>
            ) : (
              <div className={`mt-4 ${adminTableWrapClass}`}>
                <table className={adminTableClass}>
                  <thead className={adminTheadClass}>
                    <tr>
                      <th className="px-4 py-3 font-semibold">สาขา</th>
                      <th className="px-4 py-3 font-semibold">เจ้าของ</th>
                      <th className="px-4 py-3 font-semibold">เปิดใช้</th>
                      <th className="px-4 py-3 font-semibold">คนขาย</th>
                      <th className="px-4 py-3 font-semibold">คนส่ง</th>
                      <th className="px-4 py-3 font-semibold">ทั้งสอง</th>
                      <th className="px-4 py-3 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {staffOverview.branches.map((b) => (
                      <tr key={b.id} className={adminTrHoverClass}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{b.name}</p>
                          <p className="font-mono text-[11px] text-slate-500">
                            /{b.code}
                            {b.kind === "WAREHOUSE" ? " · สต๊อกกลาง" : ""}
                            {b.isTest ? " · ทดลอง" : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {b.ownerIsStaff ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                              เป็นพนักงานแล้ว
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="text-xs font-semibold text-site-primary hover:underline disabled:opacity-50"
                              disabled={!ownerPhone || syncingOwnerStaff}
                              onClick={() => void syncOwnerAsStaff([b.id])}
                            >
                              เพิ่มเจ้าของ
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {b.staffActive}
                          {b.staffInactive > 0 ? (
                            <span className="ml-1 text-[11px] text-slate-400">
                              (+{b.staffInactive} ปิด)
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {b.sellers}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {b.delivery}
                        </td>
                        <td className="px-4 py-3 tabular-nums text-slate-700">
                          {b.both}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/branches/${b.id}?tab=staff`}
                            className={btnPrimary}
                          >
                            จัดการพนักงาน
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}


      {canManage && (
        <AdminModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          busy={saving}
          title={editing ? "แก้ไขผู้ดูแล" : "เพิ่มผู้ดูแลแบรนด์"}
          description={
            editing
              ? editing.isPrimary
                ? "เจ้าของหลัก — เปลี่ยนไอดี/รหัสได้ แต่ลดสิทธิ์หรือลบไม่ได้"
                : "เปลี่ยนไอดีหรือตั้งรหัสผ่านใหม่ (เว้นรหัสว่างถ้าไม่เปลี่ยน)"
              : "สร้างไอดีใหม่ หรือใส่ไอดีที่มีอยู่แล้วเพื่อผูกเข้าแบรนด์นี้"
          }
          maxWidthClassName="max-w-md"
        >
          <form onSubmit={saveMember} className="space-y-4 p-5">
            <div>
              <label className={adminLabelClass}>ไอดีผู้ใช้</label>
              <input
                className={adminInputClass}
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                required
                autoFocus
                autoComplete="off"
              />
            </div>
            <div>
              <label className={adminLabelClass}>
                รหัสผ่าน{" "}
                {editing && (
                  <span className="font-normal text-slate-400">
                    (ว่าง = ไม่เปลี่ยน)
                  </span>
                )}
              </label>
              <input
                type="text"
                className={adminInputClass}
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                required={!editing}
                minLength={editing ? undefined : 6}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={adminLabelClass}>สิทธิ์ในแบรนด์</label>
              <select
                className={adminInputClass}
                value={form.role}
                disabled={Boolean(editing?.isPrimary)}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    role: e.target.value as "OWNER" | "MANAGER",
                  }))
                }
              >
                <option value="OWNER">เจ้าของ</option>
                <option value="MANAGER">ผู้จัดการ</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className={btnOutline}
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                ยกเลิก
              </button>
              <button type="submit" className={btnPrimary} disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}

      {canManage && (
        <AdminModal
          open={invoiceOpen}
          onClose={() => setInvoiceOpen(false)}
          busy={savingInvoice}
          title="ออกใบแจ้งหนี้ / ใบเสร็จ"
          description={`ราคาแนะนำแพ็ก ${BRAND_PLAN_LABELS[brand.plan]} · ฿${formatMoney(brand.suggestedPriceBaht ?? BRAND_PLAN_PRICES[brand.plan])}/เดือน`}
          maxWidthClassName="max-w-md"
        >
          <form onSubmit={createInvoice} className="space-y-4 p-5">
            <div>
              <label className={adminLabelClass}>หัวข้อ</label>
              <input
                className={adminInputClass}
                value={invoiceForm.title}
                onChange={(e) =>
                  setInvoiceForm((f) => ({ ...f, title: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label className={adminLabelClass}>จำนวนเงิน (บาท)</label>
              <input
                type="number"
                min={0}
                step="1"
                className={adminInputClass}
                value={invoiceForm.amountBaht}
                onChange={(e) =>
                  setInvoiceForm((f) => ({ ...f, amountBaht: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label className={adminLabelClass}>งวด / ช่วงเวลา</label>
              <input
                className={adminInputClass}
                value={invoiceForm.periodLabel}
                onChange={(e) =>
                  setInvoiceForm((f) => ({
                    ...f,
                    periodLabel: e.target.value,
                  }))
                }
                placeholder="เช่น ส.ค. 2026"
              />
            </div>
            <div>
              <label className={adminLabelClass}>หมายเหตุ</label>
              <input
                className={adminInputClass}
                value={invoiceForm.note}
                onChange={(e) =>
                  setInvoiceForm((f) => ({ ...f, note: e.target.value }))
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={invoiceForm.markPaid}
                onChange={(e) =>
                  setInvoiceForm((f) => ({ ...f, markPaid: e.target.checked }))
                }
              />
              รับเงินแล้ว (บันทึกเป็นใบเสร็จ + เปิดสถานะใช้งาน)
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                className={btnOutline}
                onClick={() => setInvoiceOpen(false)}
                disabled={savingInvoice}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className={btnPrimary}
                disabled={savingInvoice}
              >
                {savingInvoice ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        </AdminModal>
      )}
    </div>
  );
}
