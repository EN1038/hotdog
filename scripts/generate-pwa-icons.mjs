/**
 * Generate PWA / favicon icons: green canvas + SkillSale logo mark.
 * Run: node scripts/generate-pwa-icons.mjs
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public", "icons");
const publicDir = join(root, "public");
const logoPath = join(publicDir, "skillsale-icon.png");

/** App-icon green */
const GREEN = { r: 22, g: 163, b: 74 }; // #16a34a

async function logoOnGreen(size) {
  const pad = Math.round(size * 0.12);
  const markSize = size - pad * 2;

  const { data, info } = await sharp(logoPath)
    .ensureAlpha()
    .resize(markSize, markSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 28 && g < 28 && b < 28) data[i + 3] = 0;
  }

  const mark = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: GREEN,
    },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();
}

mkdirSync(outDir, { recursive: true });

const sizes = [
  { size: 16, path: join(outDir, "icon-16.png") },
  { size: 32, path: join(outDir, "icon-32.png") },
  { size: 180, path: join(outDir, "apple-touch-icon.png") },
  { size: 192, path: join(outDir, "icon-192.png") },
  { size: 512, path: join(outDir, "icon-512.png") },
];

for (const { size, path } of sizes) {
  const buf = await logoOnGreen(size);
  writeFileSync(path, buf);
  console.log("wrote", path);
}

// Browser favicon aliases (overwrite orange/legacy assets)
copyFileSync(join(outDir, "icon-192.png"), join(publicDir, "favicon-192.png"));
console.log("wrote", join(publicDir, "favicon-192.png"));

try {
  execFileSync(
    "convert",
    [
      join(outDir, "icon-16.png"),
      join(outDir, "icon-32.png"),
      join(outDir, "icon-192.png"),
      join(publicDir, "favicon.ico"),
    ],
    { stdio: "inherit" },
  );
  console.log("wrote", join(publicDir, "favicon.ico"));
} catch {
  // Fallback: copy 32px png renamed — some browsers accept png as ico poorly;
  // still better than leaving an old orange mark.
  copyFileSync(join(outDir, "icon-32.png"), join(publicDir, "favicon.ico"));
  console.log("wrote favicon.ico (png fallback)");
}
