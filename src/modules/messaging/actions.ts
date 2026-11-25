"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { z } from "zod";
import { env } from "@/env";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SendConversationMessageSchema,
  type ConversationMessageRecord,
  type ConversationSummary,
  type SendConversationMessageInput,
  type SenderRole,
} from "./validators";
import {
  canAccessConversationRow,
  ensureBookingConversationWithPg,
  ensureHostApprovalConversationWithPg,
  ensureSupportInquiryConversationWithPg,
  insertConversationMessageWithPg,
  isMessagingAdmin,
  mapConversationRow,
  mapMessageRow,
  markConversationReadWithPg,
  type ConversationMessageRow,
  type ConversationRow,
} from "./server";

function createPgClient(): Client {
  return new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
}

function toActionError(err: unknown) {
  const appErr =
    err instanceof AppError
      ? err
      : AppError.fromPostgresError(err as { code?: string; message?: string });
  return {
    ok: false as const,
    error: { code: appErr.code, message: appErr.message },
  };
}

const UuidSchema = z.string().uuid("Identificador inválido");

export async function listMyConversationsAction(): Promise<
  ActionResult<ConversationSummary[]>
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
        message: "Iniciá sesión para ver tus mensajes dentro de I-bita.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const isAdmin = await isMessagingAdmin(pg, user.id);

    const res = await pg.query<ConversationRow>(
      `SELECT
         c.id,
         c.kind,
         c.subject,
         c.status,
         c.guest_or_requester_id,
         c.requester_name,
         c.requester_email,
         c.host_id,
         hp.full_name AS host_name,
         c.property_id,
         p.title AS property_title,
         c.booking_id,
         b.status::text AS booking_status,
         c.contact_inquiry_id,
         c.last_message_preview,
         c.last_message_at,
         c.created_at,
         (
           SELECT COUNT(*)::int
           FROM public.conversation_messages m
           WHERE m.conversation_id = c.id
             AND m.sender_id IS DISTINCT FROM $2::uuid
             AND m.created_at > COALESCE(rs.last_read_at, '1970-01-01'::timestamptz)
         ) AS unread_count
       FROM public.conversations c
       LEFT JOIN public.profiles hp ON hp.id = c.host_id
       LEFT JOIN public.properties p ON p.id = c.property_id
       LEFT JOIN public.bookings b ON b.id = c.booking_id
       LEFT JOIN public.conversation_read_states rs
         ON rs.conversation_id = c.id AND rs.user_id = $2::uuid
       WHERE
         $1::boolean = TRUE
         OR c.guest_or_requester_id = $2::uuid
         OR c.host_id = $2::uuid
         OR (
           COALESCE($3, '') <> ''
           AND LOWER(COALESCE(c.requester_email, '')) = LOWER($3)
         )
       ORDER BY c.last_message_at DESC
       LIMIT 60`,
      [isAdmin, user.id, user.email ?? ""]
    );

    return {
      ok: true,
      data: res.rows.map(mapConversationRow),
    };
  } catch (err) {
    return toActionError(err);
  } finally {
    await pg.end();
  }
}

export async function getConversationMessagesAction(
  conversationId: string
): Promise<
  ActionResult<{
    conversation: ConversationSummary;
    messages: ConversationMessageRecord[];
  }>
> {
  const parsedId = UuidSchema.safeParse(conversationId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "El identificador de conversación es inválido.",
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
        message: "Iniciá sesión para leer esta conversación.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const isAdmin = await isMessagingAdmin(pg, user.id);

    const convRes = await pg.query<ConversationRow>(
      `SELECT
         c.id,
         c.kind,
         c.subject,
         c.status,
         c.guest_or_requester_id,
         c.requester_name,
         c.requester_email,
         c.host_id,
         hp.full_name AS host_name,
         c.property_id,
         p.title AS property_title,
         c.booking_id,
         b.status::text AS booking_status,
         c.contact_inquiry_id,
         c.last_message_preview,
         c.last_message_at,
         c.created_at
       FROM public.conversations c
       LEFT JOIN public.profiles hp ON hp.id = c.host_id
       LEFT JOIN public.properties p ON p.id = c.property_id
       LEFT JOIN public.bookings b ON b.id = c.booking_id
       WHERE c.id = $1
       LIMIT 1`,
      [parsedId.data]
    );

    const conv = convRes.rows[0];
    if (!conv) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "No encontramos esa conversación en I-bita.",
        },
      };
    }

    if (
      !canAccessConversationRow(conv, user.id, user.email ?? null, isAdmin)
    ) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No tenés permisos para ver esta conversación.",
        },
      };
    }

    const msgRes = await pg.query<ConversationMessageRow>(
      `SELECT
         id,
         conversation_id,
         sender_id,
         sender_role,
         sender_name,
         body,
         message_type,
         created_at
       FROM public.conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 200`,
      [conv.id]
    );

    await markConversationReadWithPg(pg, conv.id, user.id);

    return {
      ok: true,
      data: {
        conversation: mapConversationRow({ ...conv, unread_count: 0 }),
        messages: msgRes.rows.map(mapMessageRow),
      },
    };
  } catch (err) {
    return toActionError(err);
  } finally {
    await pg.end();
  }
}

export async function sendConversationMessageAction(
  rawInput: SendConversationMessageInput
): Promise<ActionResult<ConversationMessageRecord>> {
  const parsed = SendConversationMessageSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Revisá el texto del mensaje antes de enviar.",
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
        message: "Iniciá sesión para responder dentro de la plataforma.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const isAdmin = await isMessagingAdmin(pg, user.id);

    const convRes = await pg.query<
      Pick<
        ConversationRow,
        | "id"
        | "kind"
        | "booking_id"
        | "guest_or_requester_id"
        | "host_id"
        | "requester_email"
      >
    >(
      `SELECT id, kind, booking_id, guest_or_requester_id, host_id, requester_email
       FROM public.conversations
       WHERE id = $1
       LIMIT 1`,
      [parsed.data.conversationId]
    );

    const conv = convRes.rows[0];
    if (!conv) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "La conversación solicitada no existe.",
        },
      };
    }

    if (
      !canAccessConversationRow(conv, user.id, user.email ?? null, isAdmin)
    ) {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "No tenés permisos para escribir en esta conversación.",
        },
      };
    }

    const senderProfileRes = await pg.query<{
      full_name: string | null;
      role: string | null;
    }>(
      `SELECT full_name, role::text AS role FROM public.profiles WHERE id = $1 LIMIT 1`,
      [user.id]
    );

    const profile = senderProfileRes.rows[0];
    const isRequester =
      conv.guest_or_requester_id === user.id ||
      Boolean(
        user.email &&
          conv.requester_email &&
          conv.requester_email.trim().toLowerCase() ===
            user.email.trim().toLowerCase()
      );

    let senderRole: SenderRole = "GUEST";
    if (conv.host_id === user.id) {
      senderRole = "HOST";
    } else if (isRequester) {
      senderRole =
        conv.kind === "SUPPORT_INQUIRY" && profile?.role === "SUPERADMIN"
          ? "ADMIN"
          : "GUEST";
    } else if (isAdmin) {
      senderRole = "ADMIN";
    }

    const senderName =
      senderRole === "ADMIN"
        ? profile?.full_name?.trim() || "Equipo I-bita"
        : profile?.full_name?.trim() ||
          (user.user_metadata?.full_name as string | undefined)?.trim() ||
          user.email?.split("@")[0] ||
          "Usuario I-bita";

    const saved = await insertConversationMessageWithPg(pg, {
      conversationId: conv.id,
      senderId: user.id,
      senderRole,
      senderName,
      body: parsed.data.body,
      messageType: parsed.data.messageType,
    });

    await markConversationReadWithPg(pg, conv.id, user.id);

    if (conv.booking_id && senderRole === "HOST") {
      await pg.query(
        `UPDATE public.bookings
         SET host_responded_at = COALESCE(host_responded_at, NOW()),
             host_responded_on_time = COALESCE(
               host_responded_on_time,
               (host_response_due_at IS NULL OR NOW() <= host_response_due_at)
             ),
             updated_at = NOW()
         WHERE id = $1
           AND host_responded_at IS NULL`,
        [conv.booking_id]
      );
    }

    try {
      revalidatePath("/mensajes");
      revalidatePath("/admin/consultas");
      revalidatePath("/admin/aprobaciones");
      revalidatePath("/dashboard/propiedades");
      revalidatePath("/perfil");
      if (conv.booking_id) {
        revalidatePath(`/checkout/${conv.booking_id}`);
        revalidatePath(`/checkin/${conv.booking_id}`);
      }
    } catch {
      // Ignorar fuera de request scope
    }

    return { ok: true, data: saved };
  } catch (err) {
    return toActionError(err);
  } finally {
    await pg.end();
  }
}

export async function ensureBookingConversationAction(
  bookingId: string
): Promise<ActionResult<{ conversationId: string }>> {
  const parsedId = UuidSchema.safeParse(bookingId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de reserva inválido.",
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
        message: "Iniciá sesión para abrir el chat de la estadía.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const isAdmin = await isMessagingAdmin(pg, user.id);
    const conversationId = await ensureBookingConversationWithPg(pg, {
      bookingId: parsedId.data,
      actorUserId: user.id,
      isAdmin,
    });
    return { ok: true, data: { conversationId } };
  } catch (err) {
    return toActionError(err);
  } finally {
    await pg.end();
  }
}

export async function ensureSupportInquiryConversationAction(
  inquiryId: string
): Promise<ActionResult<{ conversationId: string }>> {
  const parsedId = UuidSchema.safeParse(inquiryId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de consulta inválido.",
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
        message: "Iniciá sesión para abrir la conversación.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const isAdmin = await isMessagingAdmin(pg, user.id);
    const conversationId = await ensureSupportInquiryConversationWithPg(pg, {
      inquiryId: parsedId.data,
      actorUserId: user.id,
      actorEmail: user.email ?? null,
      isAdmin,
    });
    return { ok: true, data: { conversationId } };
  } catch (err) {
    return toActionError(err);
  } finally {
    await pg.end();
  }
}

export async function ensureHostApprovalConversationAction(
  profileId: string
): Promise<ActionResult<{ conversationId: string }>> {
  const parsedId = UuidSchema.safeParse(profileId);
  if (!parsedId.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "ID de perfil inválido.",
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
        message: "Iniciá sesión para abrir el canal de aprobación.",
      },
    };
  }

  const pg = createPgClient();
  await pg.connect();
  try {
    const isAdmin = await isMessagingAdmin(pg, user.id);
    const conversationId = await ensureHostApprovalConversationWithPg(pg, {
      profileId: parsedId.data,
      actorUserId: user.id,
      isAdmin,
    });
    return { ok: true, data: { conversationId } };
  } catch (err) {
    return toActionError(err);
  } finally {
    await pg.end();
  }
}
