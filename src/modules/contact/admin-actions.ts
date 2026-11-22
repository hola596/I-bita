"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { z } from "zod";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/errors/app-error";

export type ContactInquiryStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

export interface ContactInquiryRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: ContactInquiryStatus;
  adminNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const UpdateContactStatusSchema = z.object({
  inquiryId: z.string().uuid("ID de consulta inválido"),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]),
  adminNotes: z
    .string()
    .trim()
    .max(600, "Las notas no pueden superar 600 caracteres")
    .optional()
    .default(""),
});

function createPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

async function canAccessAdminInbox(
  pg: Client,
  userId: string
): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const res = await pg.query<{ role: string }>(
    `SELECT role::text AS role FROM public.profiles WHERE id = $1 LIMIT 1`,
    [userId]
  );
  return res.rows[0]?.role === "SUPERADMIN";
}

function toSafeError(err: unknown) {
  const appErr =
    err instanceof AppError
      ? err
      : AppError.fromPostgresError(err as { code?: string; message?: string });
  return {
    ok: false as const,
    error: { code: appErr.code, message: appErr.message },
  };
}

export async function listContactInquiriesAction(): Promise<
  ActionResult<ContactInquiryRecord[]>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Debés iniciar sesión para ver la bandeja de consultas.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const allowed = await canAccessAdminInbox(pg, user.id);
    if (!allowed) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No tenés permisos para acceder a esta bandeja.",
        },
      };
    }

    const res = await pg.query<{
      id: string;
      full_name: string;
      email: string;
      phone: string | null;
      subject: string;
      message: string;
      status: ContactInquiryStatus;
      admin_notes: string | null;
      resolved_at: Date | string | null;
      created_at: Date | string;
    }>(
      `SELECT
         id,
         full_name,
         email,
         phone,
         subject,
         message,
         status,
         admin_notes,
         resolved_at,
         created_at
       FROM public.contact_inquiries
       ORDER BY
         CASE status
           WHEN 'OPEN' THEN 0
           WHEN 'IN_PROGRESS' THEN 1
           ELSE 2
         END ASC,
         created_at DESC
       LIMIT 60`
    );

    const items: ContactInquiryRecord[] = res.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      subject: row.subject,
      message: row.message,
      status: row.status,
      adminNotes: row.admin_notes,
      resolvedAt:
        row.resolved_at instanceof Date
          ? row.resolved_at.toISOString()
          : row.resolved_at
            ? String(row.resolved_at)
            : null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
    }));

    return { ok: true, data: items };
  } catch (err) {
    return toSafeError(err);
  } finally {
    await pg.end();
  }
}

export async function updateContactInquiryStatusAction(rawInput: {
  inquiryId: string;
  status: ContactInquiryStatus;
  adminNotes?: string;
}): Promise<
  ActionResult<{
    id: string;
    status: ContactInquiryStatus;
    adminNotes: string | null;
    resolvedAt: string | null;
  }>
> {
  const parsed = UpdateContactStatusSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ?? "Datos inválidos para actualizar.",
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Debés iniciar sesión para actualizar consultas.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const allowed = await canAccessAdminInbox(pg, user.id);
    if (!allowed) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No tenés permisos para modificar esta consulta.",
        },
      };
    }

    const cleanNotes =
      parsed.data.adminNotes.trim().length > 0
        ? parsed.data.adminNotes.trim()
        : null;

    const updateRes = await pg.query<{
      id: string;
      status: ContactInquiryStatus;
      admin_notes: string | null;
      resolved_at: Date | string | null;
    }>(
      `UPDATE public.contact_inquiries
       SET status = $2,
           admin_notes = $3,
           resolved_at = CASE WHEN $2 = 'RESOLVED' THEN NOW() ELSE NULL END
       WHERE id = $1
       RETURNING id, status, admin_notes, resolved_at`,
      [parsed.data.inquiryId, parsed.data.status, cleanNotes]
    );

    const row = updateRes.rows[0];
    if (!row) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No encontramos esa consulta en la base de datos.",
        },
      };
    }

    try {
      revalidatePath("/admin/consultas");
    } catch {
      // Ignorar fuera de Next.js request context
    }

    return {
      ok: true,
      data: {
        id: row.id,
        status: row.status,
        adminNotes: row.admin_notes,
        resolvedAt:
          row.resolved_at instanceof Date
            ? row.resolved_at.toISOString()
            : row.resolved_at
              ? String(row.resolved_at)
              : null,
      },
    };
  } catch (err) {
    return toSafeError(err);
  } finally {
    await pg.end();
  }
}
