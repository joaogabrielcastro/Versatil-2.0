import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { jsonError } from "@/lib/api/json";
import { getSession } from "@/lib/auth/session";
import { tenants } from "@/lib/db/schema";
import { withBypassRlsTransaction } from "@/lib/db/with-tenant";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: apenas minúsculas, números e hífen."),
});

export async function GET() {
  const session = await getSession();
  if (!session || session.typ !== "platform" || session.role !== "super_admin") {
    return jsonError(403, "Acesso restrito à plataforma.");
  }

  const items = await withBypassRlsTransaction(async (tx) => {
    return tx.select().from(tenants).orderBy(desc(tenants.createdAt));
  });

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.typ !== "platform" || session.role !== "super_admin") {
    return jsonError(403, "Acesso restrito à plataforma.");
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return jsonError(400, "Payload inválido.");
  }

  try {
    const [row] = await withBypassRlsTransaction(async (tx) => {
      const [t] = await tx
        .insert(tenants)
        .values({ name: body.name, slug: body.slug })
        .returning();
      return [t];
    });
    return NextResponse.json({ tenant: row }, { status: 201 });
  } catch {
    return jsonError(409, "Slug já existe ou dados inválidos.");
  }
}
