"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { FulfillmentType } from "@prisma/client";
import { formatPrice } from "@/lib/constants";
import type { BranchData, MenuItemData } from "@/lib/customer-types";
import { lineTotal } from "@/lib/customer-types";
import {
  formatTodayHoursSummary,
  getBranchServiceStatus,
} from "@/lib/branch-hours";
import {
  localizedName,
  priceRangeLabel,
  restaurantCategoryLabel,
} from "@/lib/localized";
import { useCustomer } from "@/components/customer/CustomerProvider";
import { syncActiveBrandFromApi } from "@/components/customer/OrderBrandingShell";
import { StoreHistoryTab } from "@/components/customer/StoreHistoryTab";
import {
  MenuBestSellerTag,
  MenuPromoBadge,
  MenuPromoPrice,
  menuItemSellPrice,
  menuItemVisibleForFulfillment,
} from "@/components/customer/MenuChannelPrice";
import { LoadingState } from "@/components/LoadingState";
import {
  IconBack,
  IconBranchPlaceholder,
  IconPhone,
  IconPlus,
  IconSkewerPlaceholder,
} from "@/components/icons";
import { pillTabButtonClass } from "@/components/customer/CustomerOrderHistoryList";

type MainTab = "menu" | "history";

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z"
        stroke="#9ca3af"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" r="2.2" fill="#9ca3af" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path
        d="M8 11V8a4 4 0 118 0v3"
        stroke="white"
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l4 4 10-10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="5"
        width="16"
        height="15"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="#ea580c" strokeWidth="1.8" />
      <path
        d="M12 7v5l3 2"
        stroke="#ea580c"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StorefrontIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10h16l-1.2 9H5.2L4 10z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        className={active ? "text-site-primary" : "text-gray-400"}
      />
      <path
        d="M8 10V7a4 4 0 018 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        className={active ? "text-site-primary" : "text-gray-400"}
      />
    </svg>
  );
}

function DeliveryIcon({ active }: { active: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle
        cx="7"
        cy="17"
        r="2"
        stroke="currentColor"
        strokeWidth="1.8"
        className={active ? "text-site-primary" : "text-gray-400"}
      />
      <circle
        cx="17"
        cy="17"
        r="2"
        stroke="currentColor"
        strokeWidth="1.8"
        className={active ? "text-site-primary" : "text-gray-400"}
      />
      <path
        d="M9 17h6M5 17H3V9h12v8h-2M15 9l2-4h3v4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        className={active ? "text-site-primary" : "text-gray-400"}
      />
    </svg>
  );
}

function FulfillmentToggle({
  value,
  onChange,
  deliveryAvailable,
}: {
  value: FulfillmentType;
  onChange: (v: FulfillmentType) => void;
  deliveryAvailable: boolean;
}) {
  return (
    <div className="mx-4 mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-white p-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.04)]">
      <button
        type="button"
        onClick={() => onChange("PICKUP")}
        className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition-colors ${
          value === "PICKUP"
            ? "border-site-primary bg-site-primary-soft"
            : "border-transparent bg-white"
        }`}
      >
        <StorefrontIcon active={value === "PICKUP"} />
        <span
          className={`text-sm font-semibold ${
            value === "PICKUP" ? "text-site-primary" : "text-gray-400"
          }`}
        >
          รับที่ร้าน
        </span>
      </button>
      <button
        type="button"
        onClick={() => deliveryAvailable && onChange("DELIVERY")}
        disabled={!deliveryAvailable}
        className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition-colors disabled:opacity-40 ${
          value === "DELIVERY"
            ? "border-site-primary bg-site-primary-soft"
            : "border-transparent bg-white"
        }`}
      >
        <DeliveryIcon active={value === "DELIVERY"} />
        <span
          className={`text-sm font-semibold ${
            value === "DELIVERY" ? "text-site-primary" : "text-gray-400"
          }`}
        >
          จัดส่ง
        </span>
      </button>
    </div>
  );
}

function MainTabs({
  active,
  onChange,
}: {
  active: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  return (
    <div className="flex border-b border-gray-200 bg-white pt-3">
      <button
        type="button"
        onClick={() => onChange("menu")}
        className={`relative flex-1 pb-3 text-center text-sm font-semibold transition-colors ${
          active === "menu" ? "text-site-primary" : "text-gray-400"
        }`}
      >
        เมนูสินค้า
        {active === "menu" && (
          <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-site-primary" />
        )}
      </button>
      <button
        type="button"
        onClick={() => onChange("history")}
        className={`relative flex-1 pb-3 text-center text-sm font-semibold transition-colors ${
          active === "history" ? "text-site-primary" : "text-gray-400"
        }`}
      >
        ประวัติ
        {active === "history" && (
          <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-site-primary" />
        )}
      </button>
    </div>
  );
}

export default function StorePage() {
  const { branchId } = useParams<{ branchId: string }>();
  const router = useRouter();
  const { cart, cartBranchId, fulfillment, setFulfillment } = useCustomer();

  const [branch, setBranch] = useState<BranchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("ทั้งหมด");
  const [mainTab, setMainTab] = useState<MainTab>("menu");
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 150);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetch("/api/customer/branches")
      .then((res) => res.json())
      .then((data: BranchData[] | unknown) => {
        const branches = Array.isArray(data) ? data : [];
        const found = branches.find((b) => b.id === branchId) ?? null;
        setBranch(found);
        if (found?.brand) {
          syncActiveBrandFromApi({
            code: found.brand.code,
            name: found.brand.name,
            nameTh: found.brand.nameTh,
            nameEn: found.brand.nameEn,
            logoUrl: found.brand.logoUrl,
            coverImageUrl: found.brand.coverImageUrl,
            color: found.brand.color,
            contactPhone: found.brand.contactPhone,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [branchId]);

  const deliveryAvailable = (branch?.deliveryLocations.length ?? 0) > 0;

  useEffect(() => {
    if (!deliveryAvailable && fulfillment === "DELIVERY") {
      setFulfillment("PICKUP");
    }
  }, [deliveryAvailable, fulfillment, setFulfillment]);

  const categories = useMemo(() => {
    if (!branch) return [];
    const visible = branch.menuItems.filter((i) =>
      menuItemVisibleForFulfillment(i, fulfillment),
    );
    const byName = new Map<string, number>();
    for (const item of visible) {
      if (item.category?.name) {
        byName.set(item.category.name, item.category.sortOrder ?? 0);
      }
    }
    const sorted = [...byName.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0], "th"))
      .map(([name]) => name);
    return ["ทั้งหมด", ...sorted];
  }, [branch, fulfillment]);

  const items = useMemo(() => {
    if (!branch) return [];
    const visible = branch.menuItems.filter((i) =>
      menuItemVisibleForFulfillment(i, fulfillment),
    );
    if (category === "ทั้งหมด") return visible;
    return visible.filter((i) => i.category?.name === category);
  }, [branch, category, fulfillment]);

  const cartForThisBranch = cartBranchId === branchId ? cart : [];
  const cartCount = cartForThisBranch.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cartForThisBranch.reduce((s, l) => s + lineTotal(l), 0);

  const service = useMemo(() => {
    if (!branch) return null;
    return getBranchServiceStatus(branch, fulfillment);
  }, [branch, fulfillment]);

  const displayName = branch
    ? localizedName(branch.name, branch.nameTh, branch.nameEn)
    : "";
  const categoryLine = branch
    ? [
        restaurantCategoryLabel(branch.primaryCategory),
        ...(branch.secondaryCategories ?? []).map(restaurantCategoryLabel),
        priceRangeLabel(branch.priceRange)
          ? `฿${priceRangeLabel(branch.priceRange)}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const backHref = "/order";

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f5f6] px-4">
        <LoadingState className="w-full max-w-sm border-0 bg-transparent shadow-none" />
      </main>
    );
  }

  if (!branch) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f5f6]">
        <p className="text-gray-500">ไม่พบสาขานี้</p>
        <Link href="/order" className="text-site-primary underline">
          กลับไปเลือกสาขา
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f5f5f6] pb-28 relative">
      {/* Sticky Header (appears on scroll) */}
      <div
        className={`fixed inset-x-0 top-0 z-50 bg-white shadow-sm transition-opacity duration-200 ${
          isScrolled ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex h-[60px] items-center gap-3 px-4">
          <Link
            href={backHref}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-800"
          >
            <BackIcon />
          </Link>
          <p className="flex-1 truncate text-[17px] font-bold text-gray-900">
            {displayName}
          </p>
        </div>
      </div>

      {/* Floating Buttons (Top) */}
      <div
        className={`fixed inset-x-0 top-4 z-40 flex items-center justify-between px-4 transition-opacity duration-200 ${
          isScrolled ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <Link
          href={backHref}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-md"
        >
          <BackIcon />
        </Link>
        <div className="flex gap-2">
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-md">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          </button>
          <button className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-900 shadow-md">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/></svg>
          </button>
        </div>
      </div>

      {/* Cover Image */}
      <div className="relative h-72 w-full bg-stone-200">
        {branch.imageUrl || branch.brand?.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={branch.imageUrl || branch.brand?.coverImageUrl || ""}
            alt={displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-site-primary-soft">
            <IconSkewerPlaceholder size={64} />
          </div>
        )}
      </div>

      {/* Content Shell */}
      <div className="relative z-10 -mt-6 rounded-t-[28px] bg-white pt-6 shadow-sm">
        <div className="px-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-extrabold leading-tight text-gray-900">
              {displayName}
            </h1>
            <button className="mt-1 shrink-0 text-gray-400 hover:text-red-500">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-600">
            <span className="flex items-center gap-1 font-semibold text-gray-900">
              <span className="text-yellow-400">⭐</span> 4.9 (90)
            </span>
            <span>·</span>
            {categoryLine ? <span>{categoryLine}</span> : <span>฿9-฿35</span>}
            <span>·</span>
            <span>5.6 กม. (40 นาที)</span>
          </div>

          {/* Mockup Action Buttons */}
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button className="flex shrink-0 items-center gap-1.5 rounded-xl border border-green-600 bg-white px-3 py-1.5 text-sm font-bold text-green-600">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs">👥</span> สร้างกลุ่ม
            </button>
            <button className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-800">
              🛍️ สั่งสองร้านได้
            </button>
            <button className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-800">
              🌐 เปลี่ยนภาษา
            </button>
          </div>
          
          {/* Mockup Banner */}
          <div className="mt-4 flex items-center justify-between rounded-xl bg-[#e6f7f0] p-3 px-4 relative overflow-hidden">
             <div className="relative z-10">
               <p className="text-[13px] font-bold text-gray-900">ลดสูงสุด ฿100 แยกบิลได้!</p>
               <p className="mt-0.5 text-[11px] font-semibold text-gray-600">เริ่มสร้างกลุ่มเลย &gt;</p>
             </div>
             <div className="absolute right-[-10px] h-20 w-20 rounded-full bg-[#a7e4d0]/60 -skew-x-12"></div>
             <button className="absolute top-2 right-2 text-[#a7e4d0] hover:text-gray-500 z-10">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
             </button>
          </div>
        </div>

        {/* Status Messages */}
        <div className="mt-4">
          {!service?.openNow && service?.acceptingOrders && (
            <div className="mx-4 mb-3 flex items-start gap-3 rounded-2xl bg-[#fff4eb] px-4 py-3.5">
              <ClockIcon />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-site-primary">
                  {service.reason}
                </p>
                <p className="mt-0.5 text-xs text-site-primary/80">
                  ระบุเวลารับ/ส่งของวันนี้ตอนชำระเงิน — หลังปิดรอบสุดท้ายแล้วสั่งไม่ได้
                </p>
              </div>
            </div>
          )}

          {service && !service.acceptingOrders && (
            <div className="mx-4 mb-3 flex items-start gap-3 rounded-2xl bg-red-50 px-4 py-3.5">
              <LockIcon />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-red-600">{service.reason}</p>
                <p className="mt-0.5 text-xs text-red-500/80">
                  ตอนนี้ยังสั่งซื้อไม่ได้ — ลองเปลี่ยนโหมดรับสินค้าหรือกลับมาใหม่
                </p>
              </div>
            </div>
          )}
          
          {(branch.ownerMessage || branch.extraMessage) && (
            <div className="mx-4 mb-3 space-y-2">
              {branch.ownerMessage ? (
                <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100">
                  <p className="text-[11px] font-semibold text-site-primary">
                    ข้อความจากเจ้าของร้าน
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                    {branch.ownerMessage}
                  </p>
                </div>
              ) : null}
              {branch.extraMessage ? (
                <div className="rounded-2xl bg-white px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100">
                  <p className="text-[11px] font-semibold text-gray-500">
                    ข้อความเพิ่มเติม
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">
                    {branch.extraMessage}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
        
        <div className="bg-white pb-3">
          <FulfillmentToggle
            value={fulfillment}
            onChange={setFulfillment}
            deliveryAvailable={deliveryAvailable}
          />
          {!deliveryAvailable && (
            <p className="mx-4 mt-1.5 text-center text-xs text-gray-400">
              สาขานี้ยังไม่เปิดจัดส่ง — สั่งรับที่ร้านได้เท่านั้น
            </p>
          )}
        </div>

        <div className="w-full">
          <div className="px-4 bg-white border-b border-gray-100 pt-2 pb-1">
            <MainTabs active={mainTab} onChange={setMainTab} />
          </div>

          {mainTab === "menu" ? (
            <>
              {/* Sticky Filter Bar */}
              {categories.length > 1 && (
                <div 
                  className={`sticky top-[60px] z-40 bg-white border-b border-gray-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] transition-all ${
                    isScrolled ? "py-2" : "py-3"
                  }`}
                >
                  <div className="filter-scroll-row flex gap-3 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {categories.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCategory(c)}
                        className={`shrink-0 rounded-full px-4 py-1.5 text-[15px] font-medium transition-colors ${
                          category === c 
                          ? "bg-site-primary text-white" 
                          : "bg-white text-gray-600 border-b-2 border-transparent hover:text-gray-900"
                        }`}
                        style={category === c ? {} : { paddingLeft: 0, paddingRight: 0, paddingBottom: "4px", borderRadius: 0, marginRight: "8px", borderBottomColor: "transparent" }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 px-4 pb-4 pt-4 bg-[#f5f5f6]">
              {items.map((item) => {
                const priced = menuItemSellPrice(item, fulfillment);
                return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.03)]"
                >
                  <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-site-primary-soft">
                        <IconSkewerPlaceholder size={40} />
                      </div>
                    )}
                    <MenuPromoBadge label={priced.label} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-gray-900">
                      {item.name}
                    </p>
                    {item.description && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-gray-400">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                      <MenuPromoPrice priced={priced} />
                      <MenuBestSellerTag show={item.isBestSeller} />
                    </p>
                  </div>
                  <div className="shrink-0">
                    {item.isOutOfStock ? (
                      <span className="text-xs text-gray-400">หมด</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/order/store/${branch.id}/item/${item.id}`)
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-site-primary text-xl font-light text-white shadow-sm transition-transform active:scale-95 hover:opacity-90"
                        aria-label={`เพิ่ม ${item.name}`}
                      >
                        <IconPlus size={16} />
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
              {items.length === 0 && (
                <p className="py-8 text-center text-sm text-gray-400">
                  ไม่มีเมนูในหมวดนี้
                </p>
              )}
            </div>
          </>
        ) : (
          <StoreHistoryTab branchId={branch.id} />
        )}
      </div>
      </div>

      {cartCount > 0 && mainTab === "menu" && (
        <div className="fixed bottom-0 left-1/2 z-20 w-full max-w-md -translate-x-1/2 border-t bg-white p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={() => router.push("/order/checkout")}
            className="flex w-full items-center justify-between rounded-xl bg-site-primary px-4 py-3.5 font-semibold text-white hover:opacity-90"
          >
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-site-primary">
                {cartCount}
              </span>
              ดูตะกร้า
            </span>
            <span>฿{formatPrice(cartTotal)}</span>
          </button>
        </div>
      )}

    </main>
  );
}
