"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { OrderCard, type OrderCardData } from "@/components/OrderCard";
import { IconBack } from "@/components/icons";
import {
  adminInputClass,
  adminLabelClass,
} from "@/components/admin/AdminShell";
import type { StaffRole } from "@prisma/client";

type Brand = {
  id: string;
  code: string;
  name: string;
};

type BranchDetail = {
  id: string;
  brandId: string | null;
  code: string | null;
  name: string;
  imageUrl: string | null;
  address: string | null;
  phone: string | null;
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  allowAdvanceOrder: boolean;
  brand: Brand | null;
  staff: {
    id: string;
    phone: string;
    isActive: boolean;
    roles: { id: string; role: StaffRole }[];
  }[];
  menuItems: {
    id: string;
    name: string;
    price: string;
    description: string | null;
    category: string | null;
    imageUrl: string | null;
    isHidden: boolean;
    isOutOfStock: boolean;
    sortOrder: number;
  }[];
  deliveryLocations: { id: string; name: string }[];
  orders: OrderCardData[];
};

type BranchListItem = { id: string; name: string };

const sectionClass = "mt-6 rounded-xl border bg-white p-4";
const btnPrimary =
  "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white";
const btnDark =
  "rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white";
const btnOutline =
  "rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700";
const btnDanger =
  "rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700";

export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [allBranches, setAllBranches] = useState<BranchListItem[]>([]);

  const [settings, setSettings] = useState({
    name: "",
    brandId: "",
    code: "",
    imageUrl: "",
    address: "",
    phone: "",
    isOpen: true,
    opensAt: "",
    closesAt: "",
    allowAdvanceOrder: true,
  });

  const [staffPhone, setStaffPhone] = useState("");
  const [staffSeller, setStaffSeller] = useState(true);
  const [staffDelivery, setStaffDelivery] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editStaffSeller, setEditStaffSeller] = useState(false);
  const [editStaffDelivery, setEditStaffDelivery] = useState(false);

  const [menuName, setMenuName] = useState("");
  const [menuPrice, setMenuPrice] = useState("");
  const [menuDesc, setMenuDesc] = useState("");
  const [menuCategory, setMenuCategory] = useState("");
  const [menuImageUrl, setMenuImageUrl] = useState("");
  const [menuSort, setMenuSort] = useState("0");
  const [menuOutOfStock, setMenuOutOfStock] = useState(false);
  const [copyFromBranchId, setCopyFromBranchId] = useState("");
  const [copyOverwrite, setCopyOverwrite] = useState(false);

  const [locationName, setLocationName] = useState("");
  const [editingLocationId, setEditingLocationId] = useState<string | null>(
    null,
  );
  const [editLocationName, setEditLocationName] = useState("");

  async function load() {
    const [branchRes, branchesRes, brandsRes] = await Promise.all([
      fetch(`/api/admin/branches/${id}`),
      fetch("/api/admin/branches"),
      fetch("/api/admin/brands"),
    ]);
    if (branchRes.status === 401) {
      router.push("/admin/login");
      return;
    }
    const data: BranchDetail = await branchRes.json();
    setBranch(data);
    setSettings({
      name: data.name,
      brandId: data.brandId ?? "",
      code: data.code ?? "",
      imageUrl: data.imageUrl ?? "",
      address: data.address ?? "",
      phone: data.phone ?? "",
      isOpen: data.isOpen,
      opensAt: data.opensAt ?? "",
      closesAt: data.closesAt ?? "",
      allowAdvanceOrder: data.allowAdvanceOrder,
    });
    if (branchesRes.ok) setAllBranches(await branchesRes.json());
    if (brandsRes.ok) setBrands(await brandsRes.json());
  }

  useEffect(() => {
    load();
  }, [id, router]);

  async function saveBranch(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/admin/branches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settings.name,
        brandId: settings.brandId || null,
        code: settings.code.trim() || null,
        imageUrl: settings.imageUrl.trim() || null,
        address: settings.address.trim() || null,
        phone: settings.phone.trim() || null,
        isOpen: settings.isOpen,
        opensAt: settings.opensAt.trim() || null,
        closesAt: settings.closesAt.trim() || null,
        allowAdvanceOrder: settings.allowAdvanceOrder,
      }),
    });
    load();
  }

  async function addStaff(e: React.FormEvent) {
    e.preventDefault();
    const roles: StaffRole[] = [];
    if (staffSeller) roles.push("SELLER");
    if (staffDelivery) roles.push("DELIVERY");
    if (roles.length === 0) return;
    await fetch(`/api/admin/branches/${id}/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: staffPhone, roles }),
    });
    setStaffPhone("");
    setStaffSeller(true);
    setStaffDelivery(false);
    load();
  }

  function startEditRoles(staff: BranchDetail["staff"][number]) {
    setEditingStaffId(staff.id);
    setEditStaffSeller(staff.roles.some((r) => r.role === "SELLER"));
    setEditStaffDelivery(staff.roles.some((r) => r.role === "DELIVERY"));
  }

  async function saveStaffRoles(staffId: string) {
    const roles: StaffRole[] = [];
    if (editStaffSeller) roles.push("SELLER");
    if (editStaffDelivery) roles.push("DELIVERY");
    if (roles.length === 0) return;
    await fetch(`/api/admin/branches/${id}/staff/${staffId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles }),
    });
    setEditingStaffId(null);
    load();
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
    await fetch(`/api/admin/branches/${id}/staff/${staffId}`, {
      method: "DELETE",
    });
    load();
  }

  async function createMenu(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/admin/branches/${id}/menu-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: menuName,
        price: parseFloat(menuPrice),
        description: menuDesc || null,
        category: menuCategory || null,
        imageUrl: menuImageUrl || null,
        sortOrder: parseInt(menuSort || "0", 10),
        isOutOfStock: menuOutOfStock,
      }),
    });
    setMenuName("");
    setMenuPrice("");
    setMenuDesc("");
    setMenuCategory("");
    setMenuImageUrl("");
    setMenuSort("0");
    setMenuOutOfStock(false);
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
    if (!window.confirm("ลบเมนูนี้?")) return;
    await fetch(`/api/admin/branches/${id}/menu-items/${menuId}`, {
      method: "DELETE",
    });
    load();
  }

  async function copyMenuFrom(e: React.FormEvent) {
    e.preventDefault();
    if (!copyFromBranchId) return;
    await fetch(`/api/admin/branches/${id}/menu-items/copy-from`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceBranchId: copyFromBranchId,
        overwrite: copyOverwrite,
      }),
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
    await fetch(
      `/api/admin/branches/${id}/locations?locationId=${locationId}`,
      { method: "DELETE" },
    );
    load();
  }

  if (!branch) {
    return <p className="text-gray-500">กำลังโหลด...</p>;
  }

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
      >
        <IconBack size={16} />
        กลับ
      </Link>
      <h2 className="mt-2 text-xl font-bold text-gray-900">{branch.name}</h2>
      {branch.brand && branch.code && (
        <p className="text-sm text-gray-500">
          /{branch.brand.code}/{branch.code}
        </p>
      )}

      <section className={sectionClass}>
        <h3 className="mb-3 font-semibold">ตั้งค่าสาขา</h3>
        <form onSubmit={saveBranch} className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={adminLabelClass}>ชื่อสาขา</label>
            <input
              className={adminInputClass}
              value={settings.name}
              onChange={(e) =>
                setSettings((s) => ({ ...s, name: e.target.value }))
              }
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
            <label className={adminLabelClass}>รหัสสาขา (URL)</label>
            <input
              className={adminInputClass}
              value={settings.code}
              onChange={(e) =>
                setSettings((s) => ({ ...s, code: e.target.value }))
              }
              placeholder="klong6"
            />
          </div>
          <div>
            <label className={adminLabelClass}>URL รูปภาพ</label>
            <input
              className={adminInputClass}
              value={settings.imageUrl}
              onChange={(e) =>
                setSettings((s) => ({ ...s, imageUrl: e.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div>
            <label className={adminLabelClass}>ที่อยู่</label>
            <input
              className={adminInputClass}
              value={settings.address}
              onChange={(e) =>
                setSettings((s) => ({ ...s, address: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={adminLabelClass}>เบอร์โทรสาขา</label>
            <input
              className={adminInputClass}
              value={settings.phone}
              onChange={(e) =>
                setSettings((s) => ({ ...s, phone: e.target.value }))
              }
            />
          </div>
          <div>
            <label className={adminLabelClass}>เปิดเวลา</label>
            <input
              className={adminInputClass}
              value={settings.opensAt}
              onChange={(e) =>
                setSettings((s) => ({ ...s, opensAt: e.target.value }))
              }
              placeholder="09:00"
            />
          </div>
          <div>
            <label className={adminLabelClass}>ปิดเวลา</label>
            <input
              className={adminInputClass}
              value={settings.closesAt}
              onChange={(e) =>
                setSettings((s) => ({ ...s, closesAt: e.target.value }))
              }
              placeholder="21:00"
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={settings.isOpen}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, isOpen: e.target.checked }))
                }
              />
              เปิดรับออเดอร์
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={settings.allowAdvanceOrder}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    allowAdvanceOrder: e.target.checked,
                  }))
                }
              />
              รับสั่งล่วงหน้า
            </label>
          </div>
          <div className="md:col-span-2">
            <button type="submit" className={btnPrimary}>
              บันทึกตั้งค่า
            </button>
          </div>
        </form>
      </section>

      <section className={sectionClass}>
        <h3 className="mb-3 font-semibold">พนักงานประจำสาขา</h3>
        <form
          onSubmit={addStaff}
          className="mb-4 grid gap-3 md:grid-cols-4"
        >
          <div className="md:col-span-2">
            <label className={adminLabelClass}>เบอร์โทรพนักงาน</label>
            <input
              className={adminInputClass}
              value={staffPhone}
              onChange={(e) => setStaffPhone(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={staffSeller}
                onChange={(e) => setStaffSeller(e.target.checked)}
              />
              คนขาย
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={staffDelivery}
                onChange={(e) => setStaffDelivery(e.target.checked)}
              />
              คนส่ง
            </label>
          </div>
          <div className="flex items-end">
            <button type="submit" className={`w-full ${btnDark}`}>
              เพิ่มพนักงาน
            </button>
          </div>
        </form>
        <ul className="space-y-2">
          {branch.staff.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {s.phone}{" "}
                    {!s.isActive && (
                      <span className="text-sm text-gray-500">(ปิดใช้งาน)</span>
                    )}
                  </p>
                  {editingStaffId === s.id ? (
                    <div className="mt-1 flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editStaffSeller}
                          onChange={(e) =>
                            setEditStaffSeller(e.target.checked)
                          }
                        />
                        คนขาย
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={editStaffDelivery}
                          onChange={(e) =>
                            setEditStaffDelivery(e.target.checked)
                          }
                        />
                        คนส่ง
                      </label>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">
                      Role: {s.roles.map((r) => r.role).join(", ") || "—"}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {editingStaffId === s.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => saveStaffRoles(s.id)}
                        className={btnPrimary}
                      >
                        บันทึก
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingStaffId(null)}
                        className={btnOutline}
                      >
                        ยกเลิก
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEditRoles(s)}
                        className={btnOutline}
                      >
                        แก้ไข Role
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
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">เมนูของสาขานี้</h3>
          <form onSubmit={copyMenuFrom} className="flex flex-wrap gap-2 text-sm">
            <select
              className={adminInputClass}
              value={copyFromBranchId}
              onChange={(e) => setCopyFromBranchId(e.target.value)}
            >
              <option value="">คัดลอกจากสาขา...</option>
              {allBranches
                .filter((b) => b.id !== branch.id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
            <label className="flex items-center gap-2 text-gray-700">
              <input
                type="checkbox"
                checked={copyOverwrite}
                onChange={(e) => setCopyOverwrite(e.target.checked)}
              />
              แทนที่ทั้งหมด
            </label>
            <button type="submit" className={btnDark}>
              คัดลอก
            </button>
          </form>
        </div>

        <form
          onSubmit={createMenu}
          className="mt-4 grid gap-3 md:grid-cols-3 lg:grid-cols-4"
        >
          <div>
            <label className={adminLabelClass}>ชื่อเมนู</label>
            <input
              className={adminInputClass}
              value={menuName}
              onChange={(e) => setMenuName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={adminLabelClass}>ราคา</label>
            <input
              type="number"
              step="0.01"
              className={adminInputClass}
              value={menuPrice}
              onChange={(e) => setMenuPrice(e.target.value)}
              required
            />
          </div>
          <div>
            <label className={adminLabelClass}>หมวดหมู่</label>
            <input
              className={adminInputClass}
              value={menuCategory}
              onChange={(e) => setMenuCategory(e.target.value)}
            />
          </div>
          <div>
            <label className={adminLabelClass}>ลำดับ</label>
            <input
              type="number"
              className={adminInputClass}
              value={menuSort}
              onChange={(e) => setMenuSort(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={adminLabelClass}>รายละเอียด</label>
            <input
              className={adminInputClass}
              value={menuDesc}
              onChange={(e) => setMenuDesc(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={adminLabelClass}>URL รูปภาพ</label>
            <input
              className={adminInputClass}
              value={menuImageUrl}
              onChange={(e) => setMenuImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={menuOutOfStock}
                onChange={(e) => setMenuOutOfStock(e.target.checked)}
              />
              หมด
            </label>
            <button type="submit" className={btnPrimary}>
              เพิ่มเมนู
            </button>
          </div>
        </form>

        <ul className="mt-4 space-y-2">
          {branch.menuItems.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
            >
              {m.imageUrl ? (
                <img
                  src={m.imageUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
                  ไม่มีรูป
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {m.name}{" "}
                  <span className="text-gray-500">
                    — {Number(m.price).toLocaleString("th-TH")} บาท
                  </span>
                </p>
                {m.description && (
                  <p className="text-sm text-gray-600">{m.description}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {m.category && (
                    <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                      {m.category}
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
                  <span className="text-xs text-gray-500">
                    ลำดับ: {m.sortOrder}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/admin/branches/${id}/menu/${m.id}`}
                  className={btnOutline}
                >
                  แก้ไขเต็ม
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
      </section>

      <section className={sectionClass}>
        <h3 className="mb-3 font-semibold">พื้นที่จัดส่ง</h3>
        <form onSubmit={addLocation} className="mb-3 flex gap-2">
          <input
            className={`flex-1 ${adminInputClass}`}
            placeholder="ชื่อพื้นที่ เช่น หอพัก A"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            required
          />
          <button type="submit" className={btnDark}>
            เพิ่ม
          </button>
        </form>
        <ul className="space-y-2">
          {branch.deliveryLocations.map((loc) => (
            <li
              key={loc.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
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
                  <span>{loc.name}</span>
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
      </section>

      <section className="mt-6">
        <h3 className="mb-3 font-semibold">ออเดอร์ล่าสุด</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {branch.orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </section>
    </div>
  );
}
