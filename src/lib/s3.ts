import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type UploadFolder =
  | "Products"
  | "Branch"
  | "Staff"
  | "Brand"
  | "Site"
  | "Alerts";

const FOLDER_ALIASES: Record<string, UploadFolder> = {
  products: "Products",
  product: "Products",
  menu: "Products",
  branch: "Branch",
  store: "Branch",
  staff: "Staff",
  brand: "Brand",
  logo: "Brand",
  site: "Site",
  alerts: "Alerts",
  alert: "Alerts",
  sounds: "Alerts",
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`ยังไม่ได้ตั้งค่า ${name}`);
  }
  return value;
}

export function isS3Configured() {
  return Boolean(
    process.env.S3_BUCKET?.trim() &&
      process.env.S3_ACCESS_KEY_ID?.trim() &&
      process.env.S3_SECRET_ACCESS_KEY?.trim() &&
      (process.env.S3_ENDPOINT?.trim() || process.env.S3_PUBLIC_URL?.trim()),
  );
}

let cachedClient: S3Client | null = null;

function getS3Client() {
  if (cachedClient) return cachedClient;

  const endpoint =
    process.env.S3_ENDPOINT?.trim() ||
    // Derive endpoint from public Spaces URL: https://bucket.region.digitaloceanspaces.com
    (() => {
      const publicUrl = process.env.S3_PUBLIC_URL?.trim();
      if (!publicUrl) return "";
      try {
        const host = new URL(publicUrl).hostname;
        const parts = host.split(".");
        // skillsale.sgp1.digitaloceanspaces.com → sgp1.digitaloceanspaces.com
        if (parts.length >= 4 && parts.at(-2) === "digitaloceanspaces") {
          return `https://${parts.slice(1).join(".")}`;
        }
      } catch {
        /* ignore */
      }
      return "";
    })();

  if (!endpoint) {
    throw new Error("ยังไม่ได้ตั้งค่า S3_ENDPOINT หรือ S3_PUBLIC_URL");
  }

  const region =
    process.env.S3_REGION?.trim() ||
    (() => {
      try {
        const host = new URL(endpoint).hostname;
        return host.split(".")[0] || "sgp1";
      } catch {
        return "sgp1";
      }
    })();

  cachedClient = new S3Client({
    region,
    endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("S3_SECRET_ACCESS_KEY"),
    },
  });

  return cachedClient;
}

export function sanitizeShopCode(code: string | null | undefined): string {
  const raw = (code ?? "").trim().toLowerCase();
  const cleaned = raw
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "unknown";
}

export function normalizeUploadFolder(
  value: string | null | undefined,
): UploadFolder {
  if (!value) return "Products";
  const direct = value.trim();
  if (
    direct === "Products" ||
    direct === "Branch" ||
    direct === "Staff" ||
    direct === "Brand" ||
    direct === "Site"
  ) {
    return direct;
  }
  return FOLDER_ALIASES[direct.toLowerCase()] ?? "Products";
}

export function buildObjectKey(opts: {
  shopCode: string;
  folder: UploadFolder;
  fileName: string;
}) {
  const prefix = (
    process.env.S3_KEY_PREFIX?.trim() || "SkillSale/Orders"
  ).replace(/^\/+|\/+$/g, "");
  const shop = sanitizeShopCode(opts.shopCode);
  return `${prefix}/${shop}/${opts.folder}/${opts.fileName}`;
}

export function publicObjectUrl(key: string): string {
  const base = (
    process.env.S3_PUBLIC_URL?.trim() ||
    `https://${requiredEnv("S3_BUCKET")}.${new URL(requiredEnv("S3_ENDPOINT")).host}`
  ).replace(/\/+$/g, "");
  return `${base}/${key.replace(/^\/+/g, "")}`;
}

export async function uploadBufferToS3(opts: {
  buffer: Buffer;
  contentType: string;
  shopCode?: string | null;
  folder: UploadFolder;
  fileName: string;
}): Promise<string> {
  const client = getS3Client();
  const bucket = requiredEnv("S3_BUCKET");
  const key = buildObjectKey({
    shopCode: opts.shopCode ?? "",
    folder: opts.folder,
    fileName: opts.fileName,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: opts.buffer,
      ContentType: opts.contentType,
      ACL: "public-read",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return publicObjectUrl(key);
}
