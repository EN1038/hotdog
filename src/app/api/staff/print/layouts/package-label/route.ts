import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, jsonError } from "@/lib/api";
import {
  getBrandPackageLabelLayout,
} from "@/lib/print-layout/brand-package-label-layout";
import { layoutEtag } from "@/lib/print-layout/package-label-layout-schema";

/** GET — brand package-label print layout (versioned; 304 when unchanged) */
export async function GET(request: Request) {
  try {
    const session = await requireStaff();
    const branch = await prisma.branch.findUnique({
      where: { id: session.branchId },
      select: { brandId: true, stockEnabled: true },
    });
    if (!branch?.brandId) return jsonError("สาขาไม่มีแบรนด์", 400);
    if (!branch.stockEnabled) {
      return jsonError("สาขานี้ยังไม่เปิดระบบสต๊อก");
    }

    const clientVersion = Number(
      new URL(request.url).searchParams.get("version") ?? "",
    );
    const payload = await getBrandPackageLabelLayout(branch.brandId);
    const etag = layoutEtag(payload.version);
    const ifNoneMatch = request.headers.get("if-none-match");

    if (
      Number.isFinite(clientVersion) &&
      clientVersion === payload.version &&
      ifNoneMatch === etag
    ) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=86400",
          "X-Layout-Version": String(payload.version),
        },
      });
    }

    if (
      Number.isFinite(clientVersion) &&
      clientVersion === payload.version &&
      !ifNoneMatch
    ) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=86400",
          "X-Layout-Version": String(payload.version),
        },
      });
    }

    return Response.json(payload, {
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=86400",
        "X-Layout-Version": String(payload.version),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
