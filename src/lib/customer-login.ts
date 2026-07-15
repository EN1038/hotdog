import { createSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function completeCustomerLogin(opts: {
  phone: string;
  name?: string | null;
}) {
  const existing = await prisma.customer.findUnique({
    where: { phone: opts.phone },
  });
  const finalName = (opts.name ?? existing?.name ?? "").trim() || null;
  if (!existing && !finalName) {
    return { needsName: true as const };
  }

  const customer = await prisma.customer.upsert({
    where: { phone: opts.phone },
    update: { name: finalName },
    create: { phone: opts.phone, name: finalName },
  });

  await createSession({
    type: "customer",
    customerPhone: opts.phone,
    customerId: customer.id,
    customerName: finalName ?? undefined,
  });

  return {
    needsName: false as const,
    phone: opts.phone,
    name: finalName,
  };
}
