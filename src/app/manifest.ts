import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SkillSale Order",
    short_name: "SkillSale",
    description: "แอปร้านค้า — คีย์ออเดอร์ คิว และยอดขาย",
    start_url: "/staff/login",
    id: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f0fdf4",
    theme_color: "#16a34a",
    orientation: "portrait-primary",
    lang: "th",
    icons: [
      {
        src: "/icons/icon-192.png?v=20260813",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png?v=20260813",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/apple-touch-icon.png?v=20260813",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png?v=20260813",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "พนักงาน",
        short_name: "พนักงาน",
        url: "/staff/login",
        description: "เข้าคีย์ออเดอร์และคิว",
      },
      {
        name: "เจ้าของร้าน",
        short_name: "เจ้าของ",
        url: "/owner/login",
        description: "เข้าหลังบ้านร้าน",
      },
    ],
  };
}
