"use client";



import { useCallback, useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import Link from "next/link";

import type { OrderStatus } from "@prisma/client";

import {

  AdminEmptyState,

  AdminLoadingState,

  AdminPageHeader,

  adminCardClass,

  adminInputClass,

  adminLabelClass,

  adminTableClass,

  adminTableWrapClass,

  adminTheadClass,

  adminTrHoverClass,

  btnOutline,

  btnPrimary,

} from "@/components/admin/AdminShell";

import { useAdminSession } from "@/components/admin/AdminSessionProvider";

import {

  ORDER_STATUS_BADGE,

  ORDER_STATUS_LABELS,

  formatPrice,

  formatThaiPhone,

} from "@/lib/constants";

import { CustomerTypeBadge } from "@/components/CustomerTypeBadge";



type BrandOption = { id: string; name: string; code: string };

type BranchOption = { id: string; name: string; brandId: string | null };



type OrderRow = {

  id: string;

  orderNumber: string;
  queueNumber?: number | null;

  status: OrderStatus;

  fulfillmentType: string;

  customerName: string;

  customerPhone: string;

  isNewCustomer: boolean;

  createdAt: string;

  total: number;

  branch: {

    id: string;

    name: string;

    brandId: string | null;

    brand: { id: string; name: string; code: string } | null;

  };

};



const STATUS_FILTERS: { value: string; label: string }[] = [

  { value: "", label: "ทุกสถานะ" },

  ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({

    value,

    label,

  })),

];



export default function AdminOrdersPage() {

  const router = useRouter();

  const { session, loaded } = useAdminSession();

  const isPlatform = Boolean(session?.isPlatformAdmin);



  const [brands, setBrands] = useState<BrandOption[]>([]);

  const [branches, setBranches] = useState<BranchOption[]>([]);

  const [brandId, setBrandId] = useState("");

  const [branchId, setBranchId] = useState("");

  const [status, setStatus] = useState("");

  const [query, setQuery] = useState("");

  const [orders, setOrders] = useState<OrderRow[]>([]);

  const [total, setTotal] = useState(0);

  const [requiresBrand, setRequiresBrand] = useState(false);

  const [loading, setLoading] = useState(true);



  const filteredBranches = useMemo(

    () =>

      brandId

        ? branches.filter((b) => b.brandId === brandId)

        : branches,

    [branches, brandId],

  );



  const loadFilters = useCallback(async () => {

    const [brandsRes, branchesRes] = await Promise.all([

      fetch("/api/admin/brands"),

      fetch("/api/admin/branches"),

    ]);

    if (brandsRes.status === 401 || branchesRes.status === 401) {

      router.push("/admin/login");

      return;

    }

    if (brandsRes.ok) {

      const data = await brandsRes.json();

      setBrands(data);

      if (!isPlatform && data.length === 1) {

        setBrandId(data[0].id);

      }

    }

    if (branchesRes.ok) {

      setBranches(await branchesRes.json());

    }

  }, [router, isPlatform]);



  const loadOrders = useCallback(async () => {

    if (isPlatform && !brandId) {

      setOrders([]);

      setTotal(0);

      setRequiresBrand(true);

      setLoading(false);

      return;

    }



    setLoading(true);

    const params = new URLSearchParams();

    if (brandId) params.set("brandId", brandId);

    if (branchId) params.set("branchId", branchId);

    if (status) params.set("status", status);

    if (query.trim()) params.set("q", query.trim());



    const res = await fetch(`/api/admin/orders?${params}`);

    if (res.status === 401) {

      router.push("/admin/login");

      return;

    }

    if (!res.ok) {

      setOrders([]);

      setLoading(false);

      return;

    }

    const data = await res.json();

    setOrders(data.orders ?? []);

    setTotal(data.total ?? 0);

    setRequiresBrand(Boolean(data.requiresBrand));

    setLoading(false);

  }, [brandId, branchId, status, query, isPlatform, router]);



  useEffect(() => {

    if (!loaded) return;

    loadFilters();

  }, [loaded, loadFilters]);



  useEffect(() => {

    if (!loaded) return;

    loadOrders();

  }, [loaded, loadOrders]);



  return (

    <div>

      <AdminPageHeader

        title="ออเดอร์ลูกค้า"

        description="ดูรายการสั่งซื้อตามแบรนด์และสาขา — กดแถวเพื่อดูรายละเอียดและสถานะ"

      />



      <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${adminCardClass}`}>

        {isPlatform && (

          <div>

            <label className={adminLabelClass}>แบรนด์</label>

            <select

              className={adminInputClass}

              value={brandId}

              onChange={(e) => {

                setBrandId(e.target.value);

                setBranchId("");

              }}

            >

              <option value="">เลือกแบรนด์...</option>

              {brands.map((b) => (

                <option key={b.id} value={b.id}>

                  {b.name} ({b.code})

                </option>

              ))}

            </select>

          </div>

        )}

        <div>

          <label className={adminLabelClass}>สาขา</label>

          <select

            className={adminInputClass}

            value={branchId}

            onChange={(e) => setBranchId(e.target.value)}

            disabled={isPlatform && !brandId}

          >

            <option value="">ทุกสาขา</option>

            {filteredBranches.map((b) => (

              <option key={b.id} value={b.id}>

                {b.name}

              </option>

            ))}

          </select>

        </div>

        <div>

          <label className={adminLabelClass}>สถานะ</label>

          <select

            className={adminInputClass}

            value={status}

            onChange={(e) => setStatus(e.target.value)}

          >

            {STATUS_FILTERS.map((s) => (

              <option key={s.value || "all"} value={s.value}>

                {s.label}

              </option>

            ))}

          </select>

        </div>

        <div>

          <label className={adminLabelClass}>ค้นหา</label>

          <div className="flex gap-2">

            <input

              className={adminInputClass}

              value={query}

              onChange={(e) => setQuery(e.target.value)}

              placeholder="เบอร์ / ชื่อ / เลขออเดอร์"

            />

            <button type="button" className={btnPrimary} onClick={loadOrders}>

              ค้นหา

            </button>

          </div>

        </div>

      </div>



      {requiresBrand && isPlatform ? (

        <div className="mt-6">

          <AdminEmptyState

            title="เลือกแบรนด์ก่อน"

            description="เลือกแบรนด์เพื่อดูออเดอร์ของแบรนด์นั้น (ไม่รวมทุกร้านเข้าด้วยกัน)"

          />

        </div>

      ) : loading ? (

        <AdminLoadingState className="mt-8" />

      ) : orders.length === 0 ? (

        <div className="mt-6">

          <AdminEmptyState

            title="ไม่พบออเดอร์"

            description="ลองเปลี่ยนตัวกรองหรือคำค้นหา"

          />

        </div>

      ) : (

        <>

          <p className="mt-4 text-sm text-slate-500">

            แสดง {orders.length} จากทั้งหมด {total} รายการ

          </p>

          <div className={`mt-3 ${adminTableWrapClass}`}>

            <table className={adminTableClass}>

              <thead className={adminTheadClass}>

                <tr>

                  <th className="px-4 py-3 font-semibold">ออเดอร์</th>

                  <th className="px-4 py-3 font-semibold">ลูกค้า</th>

                  <th className="px-4 py-3 font-semibold">สาขา</th>

                  <th className="px-4 py-3 font-semibold">สถานะ</th>

                  <th className="px-4 py-3 font-semibold">ยอด</th>

                  <th className="px-4 py-3 font-semibold">เวลา</th>

                  <th className="px-4 py-3 font-semibold" />

                </tr>

              </thead>

              <tbody>

                {orders.map((order) => (

                  <tr

                    key={order.id}

                    className={adminTrHoverClass}

                  >

                    <td className="px-4 py-3 font-medium text-slate-900">

                      คิว {order.queueNumber ?? "—"} · #{order.orderNumber}

                    </td>

                    <td className="px-4 py-3">

                      <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">

                        <span>{order.customerName || "—"}</span>

                        <CustomerTypeBadge

                          isNewCustomer={order.isNewCustomer}

                        />

                      </div>

                      <div className="text-xs text-slate-500">

                        {formatThaiPhone(order.customerPhone)}

                      </div>

                    </td>

                    <td className="px-4 py-3 text-slate-700">

                      {order.branch.name}

                    </td>

                    <td className="px-4 py-3">

                      <span

                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_BADGE[order.status]}`}

                      >

                        {ORDER_STATUS_LABELS[order.status]}

                      </span>

                    </td>

                    <td className="px-4 py-3 font-medium text-slate-900">

                      {formatPrice(order.total)}

                    </td>

                    <td className="px-4 py-3 text-xs text-slate-500">

                      {new Date(order.createdAt).toLocaleString("th-TH")}

                    </td>

                    <td className="px-4 py-3 text-right">

                      <Link

                        href={`/admin/orders/${order.id}`}

                        className={`${btnOutline} inline-block`}

                      >

                        ดูรายละเอียด

                      </Link>

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </>

      )}

    </div>

  );

}


