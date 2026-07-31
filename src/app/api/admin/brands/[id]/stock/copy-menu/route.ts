import { z } from "zod";
import { requireBrandAccess } from "@/lib/admin-access";
import { logAdminActivity } from "@/lib/admin-activity";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError, jsonOk } from "@/lib/api";

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("copy_from_branch_to_brand"),
    branchId: z.string().min(1),
  }),
  z.object({
    action: z.literal("copy_from_brand_to_branch"),
    branchId: z.string().min(1),
  }),
]);

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: brandId } = await params;
    const session = await requireBrandAccess(brandId);
    const body = postSchema.parse(await request.json());

    // Verify branch belongs to brand
    const branch = await prisma.branch.findFirst({
      where: { id: body.branchId, brandId },
    });
    if (!branch) {
      return jsonError("ไม่พบสาขา หรือสาขานี้ไม่อยู่ในแบรนด์", 404);
    }

    if (body.action === "copy_from_branch_to_brand") {
      // Find all menu items in this branch
      const menuItems = await prisma.branchMenuItem.findMany({
        where: { branchId: branch.id },
      });

      if (menuItems.length === 0) {
        return jsonError("ไม่พบเมนูขายในสาขานี้");
      }

      let createdCount = 0;
      let linkedCount = 0;

      for (const item of menuItems) {
        // Check if BrandProduct exists with same name
        let product = await prisma.brandProduct.findFirst({
          where: { brandId, name: item.name },
        });

        if (!product) {
          product = await prisma.brandProduct.create({
            data: {
              brandId,
              name: item.name,
              stockType: "SALE_ITEM",
              unit: "ชิ้น",
              sellingPrice: item.price,
              isActive: true,
              imageUrl: item.imageUrl,
              description: item.description,
            },
          });
          createdCount++;
        }

        // Link item to product if not linked
        if (item.brandProductId !== product.id) {
          await prisma.branchMenuItem.update({
            where: { id: item.id },
            data: { brandProductId: product.id },
          });
          linkedCount++;
        }
      }

      await logAdminActivity(session, {
        action: "brand.stock.copy_from_branch",
        summary: `คัดลอกเมนูจากสาขา ${branch.name} เข้าบ้านกลาง (สร้างใหม่ ${createdCount} รายการ, เชื่อมโยง ${linkedCount} รายการ)`,
        brandId,
        branchId: branch.id,
      });

      return jsonOk({
        success: true,
        createdCount,
        linkedCount,
        message: `สร้าง SKU ในบ้านกลาง ${createdCount} รายการ และผูกกับสาขา ${linkedCount} รายการสำเร็จ`,
      });
    }

    if (body.action === "copy_from_brand_to_branch") {
      // Find all active products in brand
      const products = await prisma.brandProduct.findMany({
        where: { brandId, isActive: true },
      });

      if (products.length === 0) {
        return jsonError("ไม่พบสินค้า SKU ในบ้านกลาง");
      }

      let createdCount = 0;
      let linkedCount = 0;

      for (const product of products) {
        let item = await prisma.branchMenuItem.findFirst({
          where: { branchId: branch.id, name: product.name },
        });

        if (!item) {
          item = await prisma.branchMenuItem.create({
            data: {
              branchId: branch.id,
              name: product.name,
              price: product.sellingPrice ?? 0,
              brandProductId: product.id,
              sellDelivery: true,
              sellPickup: true,
              sellStorefront: true,
              imageUrl: product.imageUrl,
              description: product.description,
            },
          });
          createdCount++;
        } else if (
          item.brandProductId !== product.id ||
          item.imageUrl !== product.imageUrl ||
          item.description !== product.description
        ) {
          await prisma.branchMenuItem.update({
            where: { id: item.id },
            data: { 
              brandProductId: product.id,
              imageUrl: product.imageUrl,
              description: product.description,
            },
          });
          linkedCount++;
        }
      }

      await logAdminActivity(session, {
        action: "brand.stock.copy_to_branch",
        summary: `คัดลอกเมนูจากบ้านกลางไปยังสาขา ${branch.name} (สร้างเมนูขาย ${createdCount} รายการ, เชื่อมโยง ${linkedCount} รายการ)`,
        brandId,
        branchId: branch.id,
      });

      return jsonOk({
        success: true,
        createdCount,
        linkedCount,
        message: `สร้างเมนูขายในสาขา ${createdCount} รายการ และผูกกับ SKU บ้านกลาง ${linkedCount} รายการสำเร็จ`,
      });
    }

    return jsonError("Action ไม่ถูกต้อง");
  } catch (error) {
    return handleApiError(error);
  }
}
