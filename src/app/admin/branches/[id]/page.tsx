"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { OrderCard, type OrderCardData } from "@/components/OrderCard";
import type { StaffRole } from "@prisma/client";

type BranchDetail = {
  id: string;
  name: string;
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
    isHidden: boolean;
    sortOrder: number;
  }[];
  deliveryLocations: { id: string; name: string }[];
  orders: OrderCardData[];
};

type BranchListItem = {
  id: string;
  name: string;
};

export default function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [locationName, setLocationName] = useState("");
  const [allBranches, setAllBranches] = useState<BranchListItem[]>([]);

  const [staffPhone, setStaffPhone] = useState("");
  const [staffSeller, setStaffSeller] = useState(true);
  const [staffDelivery, setStaffDelivery] = useState(false);

  const [menuName, setMenuName] = useState("");
  const [menuPrice, setMenuPrice] = useState("");
  const [menuDesc, setMenuDesc] = useState("");
  const [menuSort, setMenuSort] = useState("0");
  const [copyFromBranchId, setCopyFromBranchId] = useState("");
  const [copyOverwrite, setCopyOverwrite] = useState(false);

  async function load() {
    const [branchRes, branchesRes] = await Promise.all([
      fetch(`/api/admin/branches/${id}`),
      fetch("/api/admin/branches"),
    ]);
    if (branchRes.status === 401) {
      router.push("/admin/login");
      return;
    }
    setBranch(await branchRes.json());
    if (branchesRes.ok) setAllBranches(await branchesRes.json());
  }

  useEffect(() => {
    load();
  }, [id, router]);

  async function saveBranch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await fetch(`/api/admin/branches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
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
        sortOrder: parseInt(menuSort || "0", 10),
      }),
    });
    setMenuName("");
    setMenuPrice("");
    setMenuDesc("");
    setMenuSort("0");
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
    await fetch(`/api/admin/branches/${id}/menu-items/${menuId}`, {
      method: "DELETE",
    });
    load();
  }

  async function quickEditMenu(item: BranchDetail["menuItems"][number]) {
    const name = window.prompt("ชื่อเมนู", item.name) ?? item.name;
    const priceStr =
      window.prompt("ราคา", String(item.price)) ?? String(item.price);
    const desc =
      window.prompt("รายละเอียด (ว่างได้)", item.description ?? "") ??
      (item.description ?? "");
    const sortOrderStr =
      window.prompt("ลำดับ (ตัวเลข)", String(item.sortOrder)) ??
      String(item.sortOrder);

    await fetch(`/api/admin/branches/${id}/menu-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        price: parseFloat(priceStr),
        description: desc || null,
        sortOrder: parseInt(sortOrderStr || "0", 10),
      }),
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

  async function removeLocation(locationId: string) {
    await fetch(
      `/api/admin/branches/${id}/locations?locationId=${locationId}`,
      { method: "DELETE" },
    );
    load();
  }

  if (!branch) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">กำลังโหลด...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <Link href="/admin" className="text-sm text-red-600 hover:underline">
        ← กลับ
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{branch.name}</h1>

      <section className="mt-6 rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">ตั้งค่าสาขา</h2>
        <form onSubmit={saveBranch} className="grid gap-3 md:grid-cols-4">
          <input
            name="name"
            defaultValue={branch.name}
            className="rounded border px-3 py-2"
            required
          />
          <div className="md:col-span-2" />
          <button
            type="submit"
            className="rounded bg-red-600 px-4 py-2 text-white"
          >
            บันทึก
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">พนักงานประจำสาขา</h2>
        <form onSubmit={addStaff} className="mb-3 grid gap-2 md:grid-cols-4">
          <input
            className="rounded border px-3 py-2"
            placeholder="เบอร์โทรพนักงาน"
            value={staffPhone}
            onChange={(e) => setStaffPhone(e.target.value)}
            required
          />
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
          <button
            type="submit"
            className="rounded bg-gray-800 px-4 py-2 text-white"
          >
            เพิ่มพนักงาน
          </button>
        </form>
        <ul className="space-y-2">
          {branch.staff.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white px-3 py-2"
            >
              <div>
                <p className="font-medium">
                  {s.phone}{" "}
                  {!s.isActive && (
                    <span className="text-sm text-gray-500">(ปิดใช้งาน)</span>
                  )}
                </p>
                <p className="text-sm text-gray-600">
                  Role: {s.roles.map((r) => r.role).join(", ")}
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => toggleStaffActive(s.id, !s.isActive)}
                  className="rounded border px-3 py-1"
                >
                  {s.isActive ? "ปิด" : "เปิด"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteStaff(s.id)}
                  className="rounded border border-red-300 px-3 py-1 text-red-700"
                >
                  ลบ
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">เมนูของสาขานี้</h2>
          <form onSubmit={copyMenuFrom} className="flex flex-wrap gap-2 text-sm">
            <select
              className="rounded border px-2 py-1"
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
            <button
              type="submit"
              className="rounded bg-gray-800 px-3 py-1 text-white"
            >
              คัดลอก
            </button>
          </form>
        </div>

        <form onSubmit={createMenu} className="mt-3 grid gap-2 md:grid-cols-5">
          <input
            className="rounded border px-3 py-2"
            placeholder="ชื่อเมนู"
            value={menuName}
            onChange={(e) => setMenuName(e.target.value)}
            required
          />
          <input
            type="number"
            step="0.01"
            className="rounded border px-3 py-2"
            placeholder="ราคา"
            value={menuPrice}
            onChange={(e) => setMenuPrice(e.target.value)}
            required
          />
          <input
            className="rounded border px-3 py-2"
            placeholder="รายละเอียด (ไม่บังคับ)"
            value={menuDesc}
            onChange={(e) => setMenuDesc(e.target.value)}
          />
          <input
            type="number"
            className="rounded border px-3 py-2"
            placeholder="ลำดับ"
            value={menuSort}
            onChange={(e) => setMenuSort(e.target.value)}
          />
          <button
            type="submit"
            className="rounded bg-red-600 px-4 py-2 text-white"
          >
            เพิ่มเมนู
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {branch.menuItems.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2"
            >
              <div>
                <p className="font-medium">
                  {m.name} — {Number(m.price).toLocaleString("th-TH")} บาท{" "}
                  {m.isHidden && (
                    <span className="text-sm text-gray-500">(ซ่อน)</span>
                  )}
                </p>
                {m.description && (
                  <p className="text-sm text-gray-600">{m.description}</p>
                )}
                <p className="text-xs text-gray-500">ลำดับ: {m.sortOrder}</p>
              </div>
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => quickEditMenu(m)}
                  className="rounded border px-3 py-1"
                >
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={() => toggleHidden(m.id, !m.isHidden)}
                  className="rounded border px-3 py-1"
                >
                  {m.isHidden ? "แสดง" : "ซ่อน"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteMenu(m.id)}
                  className="rounded border border-red-300 px-3 py-1 text-red-700"
                >
                  ลบ
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-semibold">พื้นที่จัดส่ง</h2>
        <form onSubmit={addLocation} className="mb-3 flex gap-2">
          <input
            className="flex-1 rounded border px-3 py-2"
            placeholder="ชื่อพื้นที่ เช่น หอพัก A"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            required
          />
          <button
            type="submit"
            className="rounded bg-gray-800 px-4 py-2 text-white"
          >
            เพิ่ม
          </button>
        </form>
        <ul className="space-y-2">
          {branch.deliveryLocations.map((loc) => (
            <li
              key={loc.id}
              className="flex items-center justify-between rounded border px-3 py-2"
            >
              <span>{loc.name}</span>
              <button
                type="button"
                onClick={() => removeLocation(loc.id)}
                className="text-sm text-red-600"
              >
                ลบ
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-semibold">ออเดอร์ล่าสุด</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {branch.orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </section>
    </main>
  );
}
