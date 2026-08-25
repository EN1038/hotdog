/**
 * Idempotent master menu seed for สาขา ทดสอบ.
 * One product name = one menu item; sell capabilities as flags (not duplicate SKUs).
 *
 * Run: npx tsx scripts/seed-test-branch-hotpot-menu.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

type Caps = {
  sellPiece: boolean;
  sellByWeight: boolean;
  sellSkewer: boolean;
  sellGrill: boolean;
  sellFry: boolean;
  sellShabu: boolean;
  price: number;
  pricePerKg: number | null;
};

type CatDef = {
  name: string;
  items: string[];
  caps: Omit<Caps, "price" | "pricePerKg"> & {
    price: number;
    pricePerKg: number | null;
  };
};

const CATALOG: CatDef[] = [
  {
    name: "หมู",
    caps: {
      sellPiece: true,
      sellByWeight: true,
      sellSkewer: false,
      sellGrill: true,
      sellFry: false,
      sellShabu: true,
      price: 25,
      pricePerKg: 220,
    },
    items: [
      "หมูสามชั้น",
      "หมูสามชั้นสไลซ์",
      "สันคอหมู",
      "สันคอหมูสไลซ์",
      "หมูนุ่ม",
      "หมูหมักงา",
      "หมูหมักพริกไทยดำ",
      "หมูหมักหม่าล่า",
      "หมูเด้ง",
      "ตับหมู",
      "ไส้หมู",
      "เบคอน",
    ],
  },
  {
    name: "เนื้อ",
    caps: {
      sellPiece: true,
      sellByWeight: true,
      sellSkewer: false,
      sellGrill: true,
      sellFry: false,
      sellShabu: true,
      price: 35,
      pricePerKg: 320,
    },
    items: [
      "เนื้อสไลซ์",
      "เนื้อสามชั้น",
      "เนื้อใบพาย",
      "เนื้อริบอาย",
      "เนื้อน่องลาย",
      "เนื้อหมักงา",
      "เนื้อหมักพริกไทยดำ",
      "เนื้อหมักหม่าล่า",
    ],
  },
  {
    name: "ทะเล",
    caps: {
      sellPiece: true,
      sellByWeight: true,
      sellSkewer: false,
      sellGrill: true,
      sellFry: false,
      sellShabu: true,
      price: 30,
      pricePerKg: 280,
    },
    items: [
      "กุ้งสด",
      "ปลาหมึก",
      "หมึกกรอบ",
      "หมึกบั้ง",
      "หอยแมลงภู่",
      "แมงกะพรุน",
      "ปูอัด",
    ],
  },
  {
    name: "ลูกชิ้น / ไส้กรอก",
    caps: {
      sellPiece: true,
      sellByWeight: false,
      sellSkewer: true,
      sellGrill: true,
      sellFry: true,
      sellShabu: true,
      price: 15,
      pricePerKg: null,
    },
    items: [
      "ลูกชิ้นหมู",
      "ลูกชิ้นเนื้อ",
      "ลูกชิ้นปลา",
      "ลูกชิ้นกุ้ง",
      "ลูกชิ้นเอ็นหมู",
      "ลูกชิ้นเอ็นเนื้อ",
      "ไส้กรอกแดง",
      "ไส้กรอกชีส",
      "ไส้กรอกหนังกรอบ",
      "ไส้กรอกค็อกเทล",
      "เต้าหู้ปลา",
      "เต้าหู้ชีส",
      "ชีสบอล",
      // ปูอัด already in ทะเล — do not duplicate
    ],
  },
  {
    name: "ผัก",
    caps: {
      sellPiece: true,
      sellByWeight: true,
      sellSkewer: false,
      sellGrill: false,
      sellFry: false,
      sellShabu: true,
      price: 15,
      pricePerKg: 90,
    },
    items: [
      "ผักบุ้ง",
      "ผักกาดขาว",
      "กวางตุ้ง",
      "กะหล่ำปลี",
      "ขึ้นฉ่าย",
      "ต้นหอม",
      "ข้าวโพดอ่อน",
      "ข้าวโพดหวาน",
      "บรอกโคลี",
      "แครอท",
      "ฟักทอง",
      "สาหร่ายวากาเมะ",
    ],
  },
  {
    name: "เห็ด",
    caps: {
      sellPiece: true,
      sellByWeight: true,
      sellSkewer: false,
      sellGrill: false,
      sellFry: false,
      sellShabu: true,
      price: 20,
      pricePerKg: 120,
    },
    items: [
      "เห็ดเข็มทอง",
      "เห็ดออรินจิ",
      "เห็ดชิเมจิขาว",
      "เห็ดชิเมจิดำ",
      "เห็ดหอมสด",
      "เห็ดนางรมหลวง",
    ],
  },
  {
    name: "เส้น",
    caps: {
      sellPiece: true,
      sellByWeight: true,
      sellSkewer: false,
      sellGrill: false,
      sellFry: false,
      sellShabu: true,
      price: 15,
      pricePerKg: 80,
    },
    items: [
      "วุ้นเส้น",
      "เส้นแก้ว",
      "เส้นบุก",
      "เส้นมันเทศ",
      "เส้นหนึบจีน",
      "บะหมี่หยก",
      "บะหมี่กึ่งสำเร็จรูป",
      "อุด้ง",
    ],
  },
  {
    name: "เต้าหู้ / ของชาบู",
    caps: {
      sellPiece: true,
      sellByWeight: true,
      sellSkewer: false,
      sellGrill: false,
      sellFry: false,
      sellShabu: true,
      price: 20,
      pricePerKg: 100,
    },
    items: [
      "เต้าหู้ขาว",
      "เต้าหู้ไข่",
      "ฟองเต้าหู้",
      "ฟองเต้าหู้ม้วน",
      "เกี๊ยวปลา",
      "เกี๊ยวกุ้ง",
      "ปลาม้วน",
      "ชิกูวะ",
    ],
  },
  {
    name: "ของทอด",
    caps: {
      sellPiece: true,
      sellByWeight: false,
      sellSkewer: false,
      sellGrill: false,
      sellFry: true,
      sellShabu: false,
      price: 29,
      pricePerKg: null,
    },
    items: [
      "เฟรนช์ฟรายส์",
      "นักเก็ตไก่",
      "ไก่ป๊อป",
      // ชีสบอล already in ลูกชิ้น
      "เกี๊ยวทอด",
      "ปูอัดทอด",
      "ไส้กรอกทอด",
      "ลูกชิ้นทอด",
    ],
  },
  {
    name: "น้ำจิ้ม",
    caps: {
      sellPiece: true,
      sellByWeight: false,
      sellSkewer: false,
      sellGrill: false,
      sellFry: false,
      sellShabu: false,
      // ถ้วยเพิ่ม — ถ้วยแรกมักผสมฟรีผ่านตัวเลือกน้ำจิ้ม
      price: 15,
      pricePerKg: null,
    },
    items: [
      "น้ำจิ้มสุกี้",
      "น้ำจิ้มสุกี้กวางตุ้ง",
      "น้ำจิ้มหม่าล่า",
      "น้ำจิ้มซีฟู้ด",
      "น้ำจิ้มแจ่ว",
      "น้ำจิ้มงา",
      "น้ำจิ้มพอนสึ",
    ],
  },
  {
    name: "เครื่องปรุง/เพิ่มเติม",
    caps: {
      sellPiece: true,
      sellByWeight: false,
      sellSkewer: false,
      sellGrill: false,
      sellFry: false,
      sellShabu: false,
      // ของโรยตามคำขอ — ฟรี (demo สมจริง)
      price: 0,
      pricePerKg: null,
    },
    items: [
      "พริก",
      "กระเทียม",
      // ต้นหอม already in ผัก
      "ผักชี",
      "งาขาว",
      "พริกหม่าล่า",
      "น้ำมันงา",
      "กระเทียมเจียว",
    ],
  },
];

const SUSPECT_SUFFIX =
  /(ปิ้ง|ชาบู|ชั่งกิโล|ชั่ง\s*กิโล|ทอด|เสียบไม้|ย่าง)\s*$/u;

async function main() {
  const adapter = new PrismaPg(
    { connectionString: process.env.DATABASE_URL },
    { schema: process.env.DATABASE_SCHEMA ?? "public" },
  );
  const prisma = new PrismaClient({ adapter });

  try {
    const branch = await prisma.branch.findFirst({
      where: {
        OR: [
          { name: "สาขา ทดสอบ" },
          { name: { contains: "ทดสอบ" } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    if (!branch) {
      throw new Error("ไม่พบสาขาทดสอบ");
    }
    console.log("branch:", branch.name, branch.id);

    // Deduplicate names across catalog (first category wins)
    const seenNames = new Set<string>();
    for (const cat of CATALOG) {
      cat.items = cat.items.filter((name) => {
        if (seenNames.has(name)) {
          console.log(`skip duplicate name "${name}" (kept earlier category)`);
          return false;
        }
        seenNames.add(name);
        return true;
      });
    }

    const categoryIds = new Map<string, string>();
    for (const [i, cat] of CATALOG.entries()) {
      const existing = await prisma.menuCategory.findFirst({
        where: { branchId: branch.id, name: cat.name },
      });
      if (existing) {
        await prisma.menuCategory.update({
          where: { id: existing.id },
          data: { sortOrder: i + 1 },
        });
        categoryIds.set(cat.name, existing.id);
      } else {
        const created = await prisma.menuCategory.create({
          data: {
            branchId: branch.id,
            name: cat.name,
            sortOrder: i + 1,
          },
        });
        categoryIds.set(cat.name, created.id);
        console.log("category+", cat.name);
      }
    }

    let created = 0;
    let updated = 0;
    let sortBase = 0;

    for (const cat of CATALOG) {
      const categoryId = categoryIds.get(cat.name)!;
      for (const [j, name] of cat.items.entries()) {
        sortBase += 1;
        const caps = {
          sellPiece: cat.caps.sellPiece,
          sellByWeight: cat.caps.sellByWeight,
          sellSkewer: cat.caps.sellSkewer,
          sellGrill: cat.caps.sellGrill,
          sellFry: cat.caps.sellFry,
          sellShabu: cat.caps.sellShabu,
          price: cat.caps.price,
          pricePerKg: cat.caps.sellByWeight ? cat.caps.pricePerKg : null,
        };
        const existing = await prisma.branchMenuItem.findFirst({
          where: { branchId: branch.id, name },
          select: { id: true },
        });
        if (existing) {
          await prisma.branchMenuItem.update({
            where: { id: existing.id },
            data: {
              categoryId,
              sortOrder: sortBase,
              price: caps.price,
              pickupPrice: caps.price,
              storefrontPrice: caps.price,
              sellPiece: caps.sellPiece,
              sellByWeight: caps.sellByWeight,
              pricePerKg: caps.pricePerKg,
              sellSkewer: caps.sellSkewer,
              sellGrill: caps.sellGrill,
              sellFry: caps.sellFry,
              sellShabu: caps.sellShabu,
              isHidden: false,
            },
          });
          updated += 1;
        } else {
          await prisma.branchMenuItem.create({
            data: {
              branchId: branch.id,
              name,
              categoryId,
              sortOrder: sortBase,
              price: caps.price,
              pickupPrice: caps.price,
              storefrontPrice: caps.price,
              sellDelivery: true,
              sellPickup: true,
              sellStorefront: true,
              sellPiece: caps.sellPiece,
              sellByWeight: caps.sellByWeight,
              pricePerKg: caps.pricePerKg,
              sellSkewer: caps.sellSkewer,
              sellGrill: caps.sellGrill,
              sellFry: caps.sellFry,
              sellShabu: caps.sellShabu,
            },
          });
          created += 1;
        }
        void j;
      }
    }

    const allItems = await prisma.branchMenuItem.findMany({
      where: { branchId: branch.id },
      select: { id: true, name: true, category: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    const masterNames = new Set(
      CATALOG.flatMap((c) => c.items),
    );
    const suspects = allItems.filter(
      (i) =>
        SUSPECT_SUFFIX.test(i.name) ||
        (/ปิ้ง|ชาบู|ชั่ง/.test(i.name) && !masterNames.has(i.name)),
    );

    console.log(
      JSON.stringify(
        {
          created,
          updated,
          catalogItems: masterNames.size,
          categories: CATALOG.length,
          branchTotalItems: allItems.length,
          suspectDuplicateStyleNames: suspects.map(
            (s) => `${s.name} (${s.category?.name ?? "-"})`,
          ),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
