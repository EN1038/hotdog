import type { Metadata } from "next";
import Link from "next/link";
import { PlatformMarkImage } from "@/components/PlatformMarkImage";
import { SiteBrandingProvider } from "@/components/customer/SiteBrandingProvider";
import {
  getPlatformSettings,
  resolvePlatformMarkForPlacement,
} from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "SkillSale — ระบบขายหน้าร้าน",
  description:
    "ระบบช่วยแม่ค้าขายหน้าร้าน คีย์ออเดอร์ รอบขาย สรุปยอด ค่าใช้จ่าย สต๊อก หลังบ้าน สั่งออนไลน์",
};

function Section({
  id,
  title,
  lead,
  children,
}: {
  id?: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-20 border-t border-[#e8e2db] py-10 sm:py-12"
    >
      <h2 className="text-xl font-bold tracking-tight text-[#1c1917] sm:text-2xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[#57534e]">
          {lead}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Item({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="border-b border-[#e8e2db] py-4 last:border-b-0">
      <h3 className="text-[15px] font-bold text-[#1c1917]">{title}</h3>
      <p className="mt-1.5 text-[15px] leading-relaxed text-[#57534e]">{body}</p>
    </div>
  );
}

export default async function ProductPage() {
  const settings = await getPlatformSettings();
  const homeMark = resolvePlatformMarkForPlacement(settings, "home");
  const brand = settings.siteName?.trim() || "SkillSale";

  return (
    <SiteBrandingProvider>
      <div className="min-h-screen bg-[#f7f4f0] text-[#1c1917]">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 overflow-hidden"
        >
          <div className="absolute -left-20 top-0 h-[28rem] w-[28rem] rounded-full bg-[#fdba74]/30 blur-3xl" />
          <div className="absolute -right-16 top-40 h-[22rem] w-[22rem] rounded-full bg-[#fde68a]/25 blur-3xl" />
        </div>

        <header className="relative z-10 border-b border-[#e8e2db]/80 bg-[#f7f4f0]/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2.5">
              <PlatformMarkImage
                src={homeMark.src}
                alt={brand}
                kind={homeMark.kind}
                height={32}
                priority
              />
              <span className="text-sm font-bold">{brand}</span>
            </Link>
            <Link
              href="/"
              className="text-sm font-semibold text-[#c2410c] underline-offset-2 hover:underline"
            >
              เข้าใช้งาน
            </Link>
          </div>
        </header>

        <main className="relative z-10 mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6">
          <p className="text-sm font-bold text-[#c2410c]">ระบบขายหน้าร้าน</p>
          <h1 className="mt-2 font-serif text-4xl font-bold leading-tight tracking-tight text-[#1c1917] sm:text-5xl">
            {brand}
          </h1>
          <p className="mt-4 text-lg leading-snug text-[#44403c]">
            ช่วยแม่ค้าร้านเล็ก ร้านกลาง ร้านตลาดนัด
            <br className="hidden sm:block" />
            ขายหน้าร้านง่ายขึ้น ไม่ต้องเขียนบิลกระดาษ
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[#57534e]">
            กดออเดอร์บนมือถือ · รู้ยอดปิดร้าน · จดค่าใช้จ่าย · ดูของในร้าน
            เจ้าของดูจากหลังบ้านได้
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            <a
              href="#staff"
              className="rounded-full bg-[#c2410c] px-5 py-2.5 text-sm font-bold text-white"
            >
              หน้าขาย (แม่ค้า)
            </a>
            <a
              href="#owner"
              className="rounded-full border border-[#d6d3d1] bg-white px-5 py-2.5 text-sm font-bold text-[#44403c]"
            >
              หลังบ้าน (เจ้าของ)
            </a>
            <a
              href="#customer"
              className="rounded-full border border-[#d6d3d1] bg-white px-5 py-2.5 text-sm font-bold text-[#44403c]"
            >
              ลูกค้าสั่งออนไลน์
            </a>
          </div>

          <Section
            id="who"
            title="เหมาะกับใคร"
            lead="ร้านที่ขายหน้าเคาน์เตอร์ แผงตลาดนัด ร้านเล็ก–กลาง ที่อยากรู้ยอดชัด"
          >
            <p className="mb-3 text-sm font-bold text-[#78716c]">
              ตัวอย่างประเภทร้าน
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 text-[15px] leading-relaxed text-[#44403c]">
              {[
                "ร้านหม่าล่า · ปิ้งย่างเสียบไม้",
                "ร้านเครื่องดื่ม · น้ำผลไม้ · กาแฟ",
                "ร้านของทอด · ลูกชิ้น · ไส้กรอก",
                "ร้านก๋วยเตี๋ยว · ข้าวแกง · อาหารจานด่วน",
                "ร้านของหวาน · โตเกียว · เครป",
                "ร้านข้าวกล่อง · อาหารตามสั่งเล็ก",
                "แผงตลาดนัด · รถเข็น · ตู้คอนเทนเนอร์",
                "ร้านที่มีโปรเซ็ต · เมนูหลายตัวเลือก",
              ].map((t) => (
                <li
                  key={t}
                  className="rounded-xl bg-white px-4 py-3 border border-[#e8e2db]"
                >
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-5 mb-3 text-sm font-bold text-[#78716c]">
              เหมาะถ้าคุณเป็นแบบนี้
            </p>
            <ul className="space-y-2 text-[15px] leading-relaxed text-[#44403c]">
              <li className="rounded-xl bg-white px-4 py-3 border border-[#e8e2db]">
                · แม่ค้าที่อยากรู้ว่ารอบนี้ขายได้กี่บาท
              </li>
              <li className="rounded-xl bg-white px-4 py-3 border border-[#e8e2db]">
                · ร้านที่มีคนช่วยขาย อยากให้กดออเดอร์แทนจดกระดาษ
              </li>
              <li className="rounded-xl bg-white px-4 py-3 border border-[#e8e2db]">
                · เจ้าของที่อยู่ไม่ตลอด อยากเช็กยอดจากมือถือ
              </li>
            </ul>
          </Section>

          <Section
            id="staff"
            title="หน้าขาย — สิ่งที่แม่ค้าใช้"
            lead="เปิดแอปพนักงาน แล้วเห็นเมนูเหล่านี้"
          >
            <div className="rounded-2xl border border-[#e8e2db] bg-white px-4 sm:px-5">
              <Item
                title="เปิดรอบ / ปิดรอบ"
                body="ก่อนขายกดเปิดรอบ เลิกขายกดปิดรอบ ยอดแต่ละรอบไม่ปนกัน เหมาะตลาดนัดหรือร้านที่ขายหลายรอบต่อวัน"
              />
              <Item
                title="คีย์ออเดอร์"
                body="ลูกค้าสั่งอะไร กดเมนูใส่จำนวน เลือกเงินสดหรือโอน ได้รายการชัด ลดเขียนบิลมือ"
              />
              <Item
                title="คีย์โปรโมชัน"
                body="กดเซ็ตโปรได้เร็ว ไม่ต้องเลือกทีละอย่าง"
              />
              <Item
                title="ประวัติออเดอร์"
                body="ดูออเดอร์ทั้งหมด ใครรอใครเสร็จ มีตัวเลขแจ้งของที่ยังไม่เคลียร์ รวมออเดอร์หน้าร้านกับออนไลน์"
              />
              <Item
                title="สรุปยอดขายตามรอบ"
                body="เลือกรอบดูว่ารอบนั้นได้กี่บาท เงินสดเท่าไหร่ โอนเท่าไหร่ แชร์รูปหรือเซฟรูปส่งไลน์เจ้าของได้"
              />
              <Item
                title="ค่าใช้จ่าย"
                body="จดค่าแก๊ส น้ำแข็ง ค่าเช่า ฯลฯ ได้ทันที เลือกดูเป็นช่วงวัน รู้รวมเงินสดและโอน แก้หรือลบได้"
              />
              <Item
                title="สต๊อก"
                body="ถ้าร้านเปิดใช้สต๊อก: รับของเข้า ดูของเหลือ จ่ายออก รับของจากคลังกลางได้"
              />
              <Item
                title="สรุปยอดสต๊อกและขายราย"
                body="ถ้าร้านเปิดใช้สต๊อก: ทำสรุปท้ายวัน เปรียบเทียบของที่ระบบคิด กับที่นับจริง"
              />
              <Item
                title="ตั้งค่า"
                body="เปิด–ปิดเสียงแจ้งออเดอร์ เลือกเสียง ตั้งเครื่องพิมพ์ (ถ้าวางเครื่องไว้) และออกจากระบบ"
              />
            </div>
            <p className="mt-4 rounded-xl bg-[#fffbeb] border border-[#fde68a] px-4 py-3 text-[14px] leading-relaxed text-[#78350f]">
              <strong>ใช้ยังไงในหนึ่งวัน:</strong> เปิดรอบ → กดออเดอร์ตามลูกค้า →
              มีค่าใช้จ่ายก็จด → ปิดรอบดูสรุปยอด
            </p>
          </Section>

          <Section
            id="owner"
            title="หลังบ้าน — สิ่งที่เจ้าของใช้"
            lead="เข้าแอดมิน ดูและตั้งค่าได้จากมือถือหรือคอม"
          >
            <div className="rounded-2xl border border-[#e8e2db] bg-white px-4 sm:px-5">
              <Item
                title="ดูยอดร้าน"
                body="ดูขายได้เท่าไหร่ ค่าใช้จ่ายเท่าไหร่ เหลือประมาณเท่าไหร่ เลือกช่วงวันได้"
              />
              <Item
                title="รอบขาย"
                body="ดูทุกรอบ ยอดต่อรอบ ถ้ามีปัญหา ยกเลิกรอบได้ (ระบบจัดการออเดอร์และสต๊อกตามที่ตั้งไว้)"
              />
              <Item
                title="เมนูและราคา"
                body="เพิ่มเมนู เปลี่ยนราคา หมดของ ซ่อนเมนู จัดหมวด ตั้งตัวเลือกเพิ่มเติม"
              />
              <Item
                title="พนักงาน"
                body="เพิ่มเบอร์คนขาย กำหนดสิทธิ์ ปิดใช้งานเมื่อลาออก"
              />
              <Item
                title="ค่าใช้จ่าย"
                body="ดูและจดค่าใช้จ่ายของสาขา แยกว่าจ่ายเงินสดหรือโอน"
              />
              <Item
                title="สต๊อกสาขา / บ้านกลาง"
                body="ถ้าเปิดใช้สต๊อก: ดูของในสาขา ส่งของจากคลังกลาง ตรวจนับ ยกเลิกรายการรับ–จ่ายที่ผิดได้"
              />
              <Item
                title="พื้นที่ส่ง / รับที่ร้าน"
                body="ตั้งว่าให้ลูกค้ามารับเองหรือส่งได้ โซนไหนส่งได้"
              />
              <Item
                title="ตั้งค่าสาขา"
                body="ชื่อร้าน รูป ที่อยู่ เวลาเปิด–ปิด เปิด–ปิดรับออเดอร์ ซ่อนสาขา ติดป้ายสาขาทดลอง (สำหรับร้านลองระบบ)"
              />
              <Item
                title="มีหลายสาขา"
                body="ดูรวมทุกสาขาได้ เทียบสาขาไหนขายดี ของเหลือเท่าไหร่"
              />
            </div>
          </Section>

          <Section
            id="customer"
            title="ลูกค้าสั่งออนไลน์"
            lead="ลูกค้าเปิดลิงก์ร้าน สั่งเองได้ ไม่บังคับ ใช้คู่กับหน้าร้าน"
          >
            <div className="rounded-2xl border border-[#e8e2db] bg-white px-4 sm:px-5">
              <Item
                title="เลือกเมนูในโทรศัพท์"
                body="เห็นรูป ราคา รายละเอียด ใสตะกร้า"
              />
              <Item
                title="รับเองหรือให้ส่ง"
                body="เลือกรับที่ร้าน หรือส่งตามโซนที่ร้านเปิด"
              />
              <Item
                title="ยืนยันออเดอร์"
                body="ออเดอร์เข้าคิวร้าน แม่ค้าเห็นในหน้าประวัติออเดอร์พร้อมกัน"
              />
              <Item
                title="ดูออเดอร์เก่า"
                body="ลูกค้าเข้าสู่ระบบแล้วดูประวัติการสั่งได้"
              />
            </div>
          </Section>

          <Section title="สรุปสั้น ๆ">
            <ul className="grid gap-2 sm:grid-cols-2">
              {[
                "กดออเดอร์แทนเขียนบิล",
                "เปิด–ปิดรอบ ยอดไม่เละ",
                "รู้ยอดเงินสด / โอน",
                "จดค่าใช้จ่ายง่าย",
                "สต๊อกเปิดเมื่อพร้อม",
                "เจ้าของเช็กยอดทางไกล",
                "ลูกค้าสั่งออนไลน์ได้",
                "ใช้มือถือได้",
              ].map((t) => (
                <li
                  key={t}
                  className="rounded-xl border border-[#e8e2db] bg-white px-4 py-3 text-[15px] font-semibold text-[#292524]"
                >
                  {t}
                </li>
              ))}
            </ul>
          </Section>

          <div className="mt-12 rounded-3xl border border-[#e8e2db] bg-white px-6 py-10 text-center shadow-sm">
            <p className="text-xl font-bold text-[#1c1917] sm:text-2xl">
              อยากลองไหม
            </p>
            <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-[#57534e]">
              เข้าหน้าขายสำหรับแม่ค้า หรือหลังบ้านสำหรับเจ้าของร้าน
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/staff/login"
                className="rounded-full bg-[#c2410c] px-5 py-2.5 text-sm font-bold text-white"
              >
                หน้าขาย (พนักงาน)
              </Link>
              <Link
                href="/admin/login"
                className="rounded-full border border-[#d6d3d1] bg-[#fafaf9] px-5 py-2.5 text-sm font-bold text-[#44403c]"
              >
                หลังบ้าน (เจ้าของ)
              </Link>
            </div>
          </div>
        </main>
      </div>
    </SiteBrandingProvider>
  );
}
