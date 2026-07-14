import "dotenv/config";
import { Prisma, PrismaClient, StaffRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { migrateLegacyHours } from "../src/lib/branch-hours";

const adapter = new PrismaPg(
  { connectionString: process.env.DATABASE_URL },
  { schema: process.env.DATABASE_SCHEMA ?? "public" },
);
const prisma = new PrismaClient({ adapter });

const img = (seed: string) => `https://picsum.photos/seed/${seed}/400/300`;

const OPTION_LIBRARY = [
  {
    name: "ระดับความเผ็ด",
    required: true,
    maxSelect: 1,
    options: [
      { name: "ไม่เผ็ด", priceDelta: 0 },
      { name: "เผ็ดน้อย", priceDelta: 0 },
      { name: "เผ็ดกลาง", priceDelta: 0 },
      { name: "เผ็ดมาก", priceDelta: 0 },
    ],
  },
  {
    name: "เลือกซอส",
    required: false,
    maxSelect: 2,
    options: [
      { name: "ไม่ใส่ซอส", priceDelta: 0 },
      { name: "ซอสหม่าล่า", priceDelta: 0 },
      { name: "ซอสหวาน", priceDelta: 0 },
      { name: "ซอสศรีราชา", priceDelta: 0 },
      { name: "ซอสพริกเผา", priceDelta: 5 },
    ],
  },
  {
    name: "น้ำจิ้ม",
    required: false,
    maxSelect: 1,
    options: [
      { name: "ไม่เอาน้ำจิ้ม", priceDelta: 0 },
      { name: "แยกน้ำจิ้ม", priceDelta: 0 },
      { name: "ราดน้ำจิ้ม", priceDelta: 0 },
    ],
  },
];

const MENU = [
  { name: "ไส้กรอกชีส", price: 10, description: "ชีสเยิ้ม อร่อยเต็มคำ", category: "เมนูปิ้ง" },
  { name: "สันในหมู", price: 12, description: "นุ่ม สะอาด ย่างหอม", category: "เมนูปิ้ง" },
  { name: "เห็ดออรินจิพัน", price: 12, description: "หอมกรอบ เคี้ยวเพลิน", category: "ผัก" },
  { name: "ปลาหมึกหลอด", price: 15, description: "สด เด้ง กรุบกรอบ", category: "ทะเล" },
  { name: "ลูกชิ้นปลา", price: 10, description: "เนื้อแน่น เด้ง อร่อย", category: "ลูกชิ้น" },
  { name: "ลูกชิ้นไก่", price: 10, description: "นุ่มเด้ง รสกลมกล่อม", category: "ลูกชิ้น" },
  { name: "เนื้อไก่", price: 10, description: "ชิ้นใหญ่ นุ่ม อร่อย", category: "เมนูปิ้ง" },
  { name: "กุ้งเสียบไม้", price: 18, description: "กุ้งสดตัวโต", category: "ทะเล" },
];

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.admin.upsert({
    where: { username: "admin" },
    update: {},
    create: { username: "admin", passwordHash },
  });

  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      siteName: "หม่าล่า ไวไว",
      siteTitle: "หม่าล่า ไวไว - สั่งอาหารออนไลน์",
      siteDescription: "ระบบสั่งอาหารหม่าล่า ไวไว",
      logoUrl: img("mala-logo"),
      primaryColor: "#dc2626",
    },
  });

  const brand = await prisma.brand.upsert({
    where: { code: "malawaiwai" },
    update: { name: "หม่าล่า ไวไว", color: "#dc2626" },
    create: {
      code: "malawaiwai",
      name: "หม่าล่า ไวไว",
      logoUrl: img("mala-logo"),
      color: "#dc2626",
    },
  });

  const categoryNames = [...new Set(MENU.map((m) => m.category))];

  const branchDefs = [
    {
      id: "seed-branch-1",
      code: "klong6",
      name: "สาขาคลอง 6 สะพานชมพู",
      address: "คลอง 6 ต.คลองหก อ.คลองหลวง จ.ปทุมธานี",
      phone: "0812223333",
      isOpen: true,
      opensAt: "10:00",
      closesAt: "16:30",
    },
    {
      id: "seed-branch-2",
      code: "nakornchai2",
      name: "สาขานครชัยมงคลวิลล่า 2",
      address: "หมู่บ้านนครชัยมงคลวิลล่า 2 ต.บางลูด อ.ปากเกร็ด จ.นนทบุรี",
      phone: "0814445555",
      isOpen: true,
      opensAt: "09:00",
      closesAt: "18:00",
    },
    {
      id: "seed-branch-3",
      code: "nakornchai-soi1",
      name: "สาขานครชัย ซอย 1",
      address: "ซอยนครชัย 1 ต.บางลูด อ.ปากเกร็ด จ.นนทบุรี",
      phone: "0816667777",
      isOpen: false,
      opensAt: "17:00",
      closesAt: "23:00",
    },
  ];

  for (const [bi, def] of branchDefs.entries()) {
    const hours = migrateLegacyHours(def.opensAt, def.closesAt) as unknown as Prisma.InputJsonValue;
    const branch = await prisma.branch.upsert({
      where: { id: def.id },
      update: {
        brandId: brand.id,
        code: def.code,
        name: def.name,
        address: def.address,
        phone: def.phone,
        isOpen: def.isOpen,
        opensAt: def.opensAt,
        closesAt: def.closesAt,
        storefrontHours: hours,
        deliveryHours: hours,
        imageUrl: img(`branch-${bi + 1}`),
        allowAdvanceOrder: true,
      },
      create: {
        id: def.id,
        brandId: brand.id,
        code: def.code,
        name: def.name,
        address: def.address,
        phone: def.phone,
        isOpen: def.isOpen,
        opensAt: def.opensAt,
        closesAt: def.closesAt,
        storefrontHours: hours,
        deliveryHours: hours,
        imageUrl: img(`branch-${bi + 1}`),
      },
    });

    const categoryByName = new Map<string, string>();
    for (const [i, catName] of categoryNames.entries()) {
      const catId = `seed-${def.id}-cat-${i + 1}`;
      const cat = await prisma.menuCategory.upsert({
        where: { id: catId },
        update: { name: catName, sortOrder: i + 1 },
        create: {
          id: catId,
          branchId: branch.id,
          name: catName,
          sortOrder: i + 1,
        },
      });
      categoryByName.set(catName, cat.id);
    }

    const libraryGroupIds: string[] = [];
    for (const [gi, g] of OPTION_LIBRARY.entries()) {
      const groupId = `seed-${def.id}-optgroup-${gi + 1}`;
      await prisma.branchOptionGroup.upsert({
        where: { id: groupId },
        update: {
          name: g.name,
          required: g.required,
          maxSelect: g.maxSelect,
        },
        create: {
          id: groupId,
          branchId: branch.id,
          name: g.name,
          required: g.required,
          maxSelect: g.maxSelect,
          options: {
            create: g.options.map((o, oi) => ({
              id: `seed-${def.id}-opt-${gi + 1}-${oi + 1}`,
              name: o.name,
              priceDelta: o.priceDelta,
            })),
          },
        },
      });
      // Ensure options exist on update path
      const existingOpts = await prisma.branchOption.count({
        where: { groupId },
      });
      if (existingOpts === 0) {
        await prisma.branchOption.createMany({
          data: g.options.map((o, oi) => ({
            id: `seed-${def.id}-opt-${gi + 1}-${oi + 1}`,
            groupId,
            name: o.name,
            priceDelta: o.priceDelta,
          })),
        });
      }
      libraryGroupIds.push(groupId);
    }

    for (const [mi, m] of MENU.entries()) {
      const itemId = `seed-${def.id}-menu-${mi + 1}`;
      const existing = await prisma.branchMenuItem.findUnique({
        where: { id: itemId },
      });
      if (!existing) {
        await prisma.branchMenuItem.create({
          data: {
            id: itemId,
            branchId: branch.id,
            name: m.name,
            price: m.price,
            description: m.description,
            categoryId: categoryByName.get(m.category) ?? null,
            imageUrl: img(`food-${mi + 1}`),
            sortOrder: mi + 1,
            optionGroupLinks: {
              create: libraryGroupIds.map((groupId) => ({ groupId })),
            },
          },
        });
      } else {
        for (const groupId of libraryGroupIds) {
          await prisma.branchMenuItemOptionGroup.upsert({
            where: {
              menuItemId_groupId: { menuItemId: itemId, groupId },
            },
            update: {},
            create: { menuItemId: itemId, groupId },
          });
        }
      }
    }

    await prisma.deliveryLocation.upsert({
      where: { id: `seed-${def.id}-loc-1` },
      update: {},
      create: { id: `seed-${def.id}-loc-1`, branchId: branch.id, name: "หอพัก A" },
    });
    await prisma.deliveryLocation.upsert({
      where: { id: `seed-${def.id}-loc-2` },
      update: {},
      create: { id: `seed-${def.id}-loc-2`, branchId: branch.id, name: "ลานจอดรถ" },
    });
  }

  await prisma.staff.upsert({
    where: { phone: "0811111111" },
    update: { branchId: "seed-branch-1", isActive: true },
    create: {
      phone: "0811111111",
      branchId: "seed-branch-1",
      roles: { create: [{ role: StaffRole.SELLER }] },
    },
  });

  await prisma.staff.upsert({
    where: { phone: "0822222222" },
    update: { branchId: "seed-branch-1", isActive: true },
    create: {
      phone: "0822222222",
      branchId: "seed-branch-1",
      roles: { create: [{ role: StaffRole.DELIVERY }] },
    },
  });

  console.log("Seed complete:");
  console.log("- Admin: admin / admin123");
  console.log("- Staff seller: 0811111111 (สาขาคลอง 6)");
  console.log("- Staff delivery: 0822222222 (สาขาคลอง 6)");
  console.log("- Brand: หม่าล่า ไวไว (malawaiwai) / 3 สาขา / 8 เมนูต่อสาขา");
  console.log("- Branch URL ตัวอย่าง: /malawaiwai/klong6");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
