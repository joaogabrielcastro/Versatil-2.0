import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("isolamento multi-tenant (duas academias)", () => {
  it("tenant A não lista nem lê registros de B; FORCE RLS está ativo", async () => {
    const { getDb } = await import("@/lib/db/client");
    const {
      accessEvents,
      invoices,
      plans,
      students,
      tenants,
      tenantUsers,
      workoutTemplates,
    } = await import("@/lib/db/schema");
    const { withBypassRlsTransaction, withTenantTransaction } = await import(
      "@/lib/db/with-tenant"
    );
    const { reserveStoneChargeSlot } = await import(
      "@/lib/services/billing/stone-charge"
    );
    const { createTenantWithAdmin } = await import(
      "@/lib/services/onboarding/create-tenant"
    );

    const suffix = randomUUID().slice(0, 8);
    const slugA = `iso-a-${suffix}`;
    const slugB = `iso-b-${suffix}`;

    await getDb().execute(sql`select 1`);

    const createdA = await createTenantWithAdmin({
      name: "Academia A",
      slug: slugA,
      adminEmail: `admin-a-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });
    const createdB = await createTenantWithAdmin({
      name: "Academia B",
      slug: slugB,
      adminEmail: `admin-b-${suffix}@example.com`,
      adminPassword: "senha-segura-12",
    });

    expect(createdA.admin.tenantId).toBe(createdA.tenant.id);
    expect(createdA.admin.role).toBe("tenant_admin");
    expect(JSON.stringify(createdA)).not.toMatch(/senha-segura-12/);

    const [userA] = await withBypassRlsTransaction(async (tx) => {
      return tx
        .select({
          passwordHash: tenantUsers.passwordHash,
          email: tenantUsers.email,
        })
        .from(tenantUsers)
        .where(eq(tenantUsers.id, createdA.admin.id))
        .limit(1);
    });
    expect(userA?.email).toBe(`admin-a-${suffix}@example.com`);
    expect(userA?.passwordHash.startsWith("$2")).toBe(true);
    expect(await verifyPassword("senha-segura-12", userA!.passwordHash)).toBe(
      true,
    );

    const tenantA = createdA.tenant.id;
    const tenantB = createdB.tenant.id;

    const [planA, planB, tmplA, tmplB, stuA, invoiceId] =
      await withBypassRlsTransaction(async (tx) => {
        const [pA] = await tx
          .insert(plans)
          .values({
            tenantId: tenantA,
            name: "Plano A",
            priceCents: 1000,
          })
          .returning();
        const [pB] = await tx
          .insert(plans)
          .values({
            tenantId: tenantB,
            name: "Plano B",
            priceCents: 2000,
          })
          .returning();
        const [tA] = await tx
          .insert(workoutTemplates)
          .values({
            tenantId: tenantA,
            name: "Treino A",
            exercises: [],
          })
          .returning();
        const [tB] = await tx
          .insert(workoutTemplates)
          .values({
            tenantId: tenantB,
            name: "Treino B",
            exercises: [],
          })
          .returning();
        const [sA] = await tx
          .insert(students)
          .values({
            tenantId: tenantA,
            fullName: "Aluno A",
            cpf: "11144477735",
          })
          .returning();
        const [sB] = await tx
          .insert(students)
          .values({
            tenantId: tenantB,
            fullName: "Aluno B",
            cpf: "22233344456",
          })
          .returning();
        await tx.insert(accessEvents).values({
          tenantId: tenantA,
          studentId: sA!.id,
          allowed: true,
          reason: null,
        });
        await tx.insert(accessEvents).values({
          tenantId: tenantB,
          studentId: sB!.id,
          allowed: true,
          reason: null,
        });
        const due = new Date();
        due.setDate(due.getDate() + 7);
        const [inv] = await tx
          .insert(invoices)
          .values({
            tenantId: tenantA,
            studentId: sA!.id,
            amountCents: 5000,
            dueAt: due,
            status: "open",
          })
          .returning({ id: invoices.id });
        return [pA!, pB!, tA!, tB!, sA!, inv!.id];
      });

    const listedPlans = await withTenantTransaction(tenantA, async (tx) => {
      return tx.select().from(plans).where(eq(plans.tenantId, tenantA));
    });
    expect(listedPlans.map((p) => p.id)).toEqual([planA.id]);
    expect(listedPlans.some((p) => p.id === planB.id)).toBe(false);

    const listedTemplates = await withTenantTransaction(tenantA, async (tx) => {
      return tx
        .select()
        .from(workoutTemplates)
        .where(eq(workoutTemplates.tenantId, tenantA));
    });
    expect(listedTemplates.map((t) => t.id)).toEqual([tmplA.id]);

    const listedEvents = await withTenantTransaction(tenantA, async (tx) => {
      return tx
        .select()
        .from(accessEvents)
        .where(eq(accessEvents.tenantId, tenantA));
    });
    expect(listedEvents.length).toBe(1);
    expect(listedEvents[0]?.studentId).toBe(stuA.id);

    const stolenPlan = await withTenantTransaction(tenantA, async (tx) => {
      const [row] = await tx
        .select()
        .from(plans)
        .where(and(eq(plans.id, planB.id), eq(plans.tenantId, tenantA)))
        .limit(1);
      return row ?? null;
    });
    expect(stolenPlan).toBeNull();

    const stolenTemplate = await withTenantTransaction(tenantA, async (tx) => {
      const [row] = await tx
        .select()
        .from(workoutTemplates)
        .where(
          and(
            eq(workoutTemplates.id, tmplB.id),
            eq(workoutTemplates.tenantId, tenantA),
          ),
        )
        .limit(1);
      return row ?? null;
    });
    expect(stolenTemplate).toBeNull();

    const updatedB = await withTenantTransaction(tenantA, async (tx) => {
      return tx
        .update(plans)
        .set({ name: "hack" })
        .where(and(eq(plans.id, planB.id), eq(plans.tenantId, tenantA)))
        .returning({ id: plans.id });
    });
    expect(updatedB).toEqual([]);

    const deletedB = await withTenantTransaction(tenantA, async (tx) => {
      return tx
        .delete(workoutTemplates)
        .where(
          and(
            eq(workoutTemplates.id, tmplB.id),
            eq(workoutTemplates.tenantId, tenantA),
          ),
        )
        .returning({ id: workoutTemplates.id });
    });
    expect(deletedB).toEqual([]);

    const rawFlags = await getDb().execute(sql`
      select c.relname as name, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('plans', 'workout_templates', 'access_events', 'invoices', 'kiosk_devices')
    `);
    const list = (
      Array.isArray(rawFlags)
        ? rawFlags
        : ((rawFlags as { rows?: unknown[] }).rows ?? [])
    ) as { name: string; forced: boolean | string }[];
    for (const table of [
      "plans",
      "workout_templates",
      "access_events",
      "invoices",
      "kiosk_devices",
    ]) {
      const row = list.find((r) => r.name === table);
      const forced = row?.forced === true || row?.forced === "t" || row?.forced === "true";
      expect(forced, `FORCE RLS em ${table}`).toBe(true);
    }

    const concurrent = await Promise.all([
      reserveStoneChargeSlot(tenantA, invoiceId),
      reserveStoneChargeSlot(tenantA, invoiceId),
    ]);
    expect(concurrent.filter((x) => x === "created")).toHaveLength(1);
    expect(
      concurrent.filter((x) => x === "in_flight" || x === "reuse" || x === "hold_unknown")
        .length,
    ).toBeGreaterThanOrEqual(1);

    const crossCharge = await reserveStoneChargeSlot(tenantB, invoiceId);
    expect(crossCharge).toBe("not_found");

    await withBypassRlsTransaction(async (tx) => {
      await tx.delete(tenants).where(eq(tenants.id, tenantA));
      await tx.delete(tenants).where(eq(tenants.id, tenantB));
    });
  });
});

describe("onboarding senha", () => {
  it("bcrypt não devolve a senha em claro", async () => {
    const hash = await hashPassword("senha-segura-12");
    expect(hash).not.toBe("senha-segura-12");
    expect(await verifyPassword("senha-segura-12", hash)).toBe(true);
    expect(await verifyPassword("outra", hash)).toBe(false);
  });
});
