import "server-only";
import type { Client } from "pg";
import { AppError } from "@/lib/errors/app-error";
import {
  INTERVIEW_CHANNEL_LABELS,
  type MidTermGuestApplication,
} from "@/modules/properties/mid-term-policy";
import {
  buildAutoReservationResponseNotice,
  calculateScheduledResponseDeadline,
  computeSynchronizedHostResponseMetrics,
  normalizeHostResponseSchedule,
  type HostResponseSchedule,
} from "@/lib/host/response-schedule";
import type {
  ConversationKind,
  ConversationMessageRecord,
  ConversationSummary,
  MessageType,
  SenderRole,
} from "./validators";

export interface ConversationRow {
  id: string;
  kind: ConversationKind;
  subject: string;
  status: "OPEN" | "CLOSED";
  guest_or_requester_id: string | null;
  requester_name: string | null;
  requester_email: string | null;
  host_id: string | null;
  host_name: string | null;
  property_id: string | null;
  property_title: string | null;
  booking_id: string | null;
  booking_status: string | null;
  contact_inquiry_id: string | null;
  last_message_preview: string | null;
  last_message_at: Date | string;
  created_at: Date | string;
}

export interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_role: SenderRole;
  sender_name: string;
  body: string;
  message_type: MessageType;
  created_at: Date | string;
}

export function mapConversationRow(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    kind: row.kind,
    subject: row.subject,
    status: row.status,
    guestOrRequesterId: row.guest_or_requester_id,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    hostId: row.host_id,
    hostName: row.host_name,
    propertyId: row.property_id,
    propertyTitle: row.property_title,
    bookingId: row.booking_id,
    bookingStatus: row.booking_status,
    contactInquiryId: row.contact_inquiry_id,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt:
      row.last_message_at instanceof Date
        ? row.last_message_at.toISOString()
        : String(row.last_message_at),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export function mapMessageRow(
  row: ConversationMessageRow
): ConversationMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    senderName: row.sender_name,
    body: row.body,
    messageType: row.message_type,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  };
}

export async function isMessagingAdmin(
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

export function canAccessConversationRow(
  row: Pick<
    ConversationRow,
    "guest_or_requester_id" | "host_id" | "requester_email"
  >,
  userId: string,
  userEmail: string | null,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (row.guest_or_requester_id === userId) return true;
  if (row.host_id === userId) return true;
  if (
    userEmail &&
    row.requester_email &&
    row.requester_email.trim().toLowerCase() === userEmail.trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

function buildBookingInterviewSeedMessage(params: {
  guestName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  midTermApplication: MidTermGuestApplication | null;
}): string {
  const {
    guestName,
    propertyTitle,
    checkIn,
    checkOut,
    nightsCount,
    midTermApplication,
  } = params;

  const lines = [
    `Solicitud de entrevista previa para ${propertyTitle} (${checkIn} -> ${checkOut}, ${nightsCount} noches).`,
  ];

  if (midTermApplication) {
    const channelLabel =
      INTERVIEW_CHANNEL_LABELS[midTermApplication.preferredInterviewChannel] ??
      midTermApplication.preferredInterviewChannel;
    lines.push(`Modalidad elegida en I-bita: ${channelLabel}`);
    if (midTermApplication.availabilityNote) {
      lines.push(`Disponibilidad horaria: ${midTermApplication.availabilityNote}`);
    }
    lines.push("", `Presentación de ${guestName}:`, midTermApplication.guestIntro);

    if (midTermApplication.questionAnswers.length > 0) {
      lines.push("", "Respuestas a tus preguntas previas:");
      for (const qa of midTermApplication.questionAnswers) {
        lines.push(`• ${qa.question}: ${qa.answer}`);
      }
    }
  }

  return lines.join("\n").slice(0, 2900);
}

export async function insertConversationMessageWithPg(
  pg: Client,
  input: {
    conversationId: string;
    senderId: string | null;
    senderRole: SenderRole;
    senderName: string;
    body: string;
    messageType: MessageType;
  }
): Promise<ConversationMessageRecord> {
  const preview = input.body.replace(/\s+/g, " ").trim().slice(0, 140);
  const res = await pg.query<ConversationMessageRow>(
    `INSERT INTO public.conversation_messages (
       conversation_id, sender_id, sender_role, sender_name, body, message_type
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, conversation_id, sender_id, sender_role, sender_name, body, message_type, created_at`,
    [
      input.conversationId,
      input.senderId,
      input.senderRole,
      input.senderName.slice(0, 100) || "Usuario I-bita",
      input.body.slice(0, 2990),
      input.messageType,
    ]
  );

  await pg.query(
    `UPDATE public.conversations
     SET last_message_preview = $2,
         last_message_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [input.conversationId, preview]
  );

  return mapMessageRow(res.rows[0]!);
}

export async function createSupportConversationWithPg(
  pg: Client,
  input: {
    inquiryId: string;
    userId: string | null;
    fullName: string;
    email: string;
    subject: string;
    message: string;
  }
): Promise<string> {
  const insertConv = await pg.query<{ id: string }>(
    `INSERT INTO public.conversations (
       kind, subject, status, guest_or_requester_id, requester_name,
       requester_email, contact_inquiry_id, last_message_preview
     ) VALUES ('SUPPORT_INQUIRY', $1, 'OPEN', $2, $3, $4, $5, $6)
     ON CONFLICT (contact_inquiry_id) WHERE contact_inquiry_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      input.subject.slice(0, 140),
      input.userId,
      input.fullName.slice(0, 100),
      input.email.slice(0, 150),
      input.inquiryId,
      input.message.replace(/\s+/g, " ").trim().slice(0, 140),
    ]
  );

  let conversationId = insertConv.rows[0]?.id;
  if (!conversationId) {
    const existing = await pg.query<{ id: string }>(
      `SELECT id FROM public.conversations WHERE contact_inquiry_id = $1 LIMIT 1`,
      [input.inquiryId]
    );
    return existing.rows[0]!.id;
  }

  await insertConversationMessageWithPg(pg, {
    conversationId,
    senderId: input.userId,
    senderRole: "GUEST",
    senderName: input.fullName,
    body: input.message,
    messageType: "TEXT",
  });

  return conversationId;
}

export async function ensureSupportInquiryConversationWithPg(
  pg: Client,
  input: {
    inquiryId: string;
    actorUserId: string;
    actorEmail: string | null;
    isAdmin: boolean;
  }
): Promise<string> {
  const inqRes = await pg.query<{
    id: string;
    full_name: string;
    email: string;
    subject: string;
    message: string;
  }>(
    `SELECT id, full_name, email, subject, message
     FROM public.contact_inquiries
     WHERE id = $1
     LIMIT 1`,
    [input.inquiryId]
  );

  const inquiry = inqRes.rows[0];
  if (!inquiry) {
    throw new AppError(
      "NOT_FOUND",
      "No encontramos esa consulta de ayuda en la base de datos.",
      404
    );
  }

  const emailMatches =
    Boolean(input.actorEmail) &&
    input.actorEmail!.trim().toLowerCase() === inquiry.email.trim().toLowerCase();

  if (!input.isAdmin && !emailMatches) {
    throw new AppError(
      "FORBIDDEN",
      "No tenés permisos para abrir esta consulta.",
      403
    );
  }

  const existing = await pg.query<{ id: string }>(
    `SELECT id FROM public.conversations WHERE contact_inquiry_id = $1 LIMIT 1`,
    [inquiry.id]
  );
  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const profileRes = await pg.query<{ id: string }>(
    `SELECT id FROM public.profiles WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [inquiry.email]
  );

  return createSupportConversationWithPg(pg, {
    inquiryId: inquiry.id,
    userId: profileRes.rows[0]?.id ?? (emailMatches ? input.actorUserId : null),
    fullName: inquiry.full_name,
    email: inquiry.email,
    subject: inquiry.subject,
    message: inquiry.message,
  });
}

export async function ensureHostApprovalConversationWithPg(
  pg: Client,
  input: {
    profileId: string;
    actorUserId: string;
    isAdmin: boolean;
    systemNoticeBody?: string;
  }
): Promise<string> {
  if (!input.isAdmin && input.actorUserId !== input.profileId) {
    throw new AppError(
      "FORBIDDEN",
      "No tenés permisos para abrir el chat de esta solicitud.",
      403
    );
  }

  const profileRes = await pg.query<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>(
    `SELECT id, full_name, email FROM public.profiles WHERE id = $1 LIMIT 1`,
    [input.profileId]
  );

  const profile = profileRes.rows[0];
  if (!profile) {
    throw new AppError(
      "NOT_FOUND",
      "No encontramos el perfil del solicitante.",
      404
    );
  }

  const displayName =
    profile.full_name?.trim() || profile.email?.split("@")[0] || "Anfitrión I-bita";

  const existing = await pg.query<{ id: string }>(
    `SELECT id
     FROM public.conversations
     WHERE guest_or_requester_id = $1 AND kind = 'HOST_APPROVAL'
     LIMIT 1`,
    [profile.id]
  );

  let conversationId = existing.rows[0]?.id;
  const seedNotice =
    input.systemNoticeBody ??
    `Canal directo de aprobación de perfil para ${displayName}. Todas las consultas y aclaraciones con el equipo de I-bita quedan registradas acá.`;

  if (!conversationId) {
    const insertConv = await pg.query<{ id: string }>(
      `INSERT INTO public.conversations (
         kind, subject, status, guest_or_requester_id, requester_name,
         requester_email, last_message_preview
       ) VALUES (
         'HOST_APPROVAL',
         $1,
         'OPEN',
         $2,
         $3,
         $4,
         $5
       )
       ON CONFLICT (guest_or_requester_id, kind)
         WHERE kind = 'HOST_APPROVAL' AND guest_or_requester_id IS NOT NULL
         DO NOTHING
       RETURNING id`,
      [
        `Aprobación de anfitrión · ${displayName}`,
        profile.id,
        displayName,
        profile.email,
        seedNotice.slice(0, 140),
      ]
    );

    conversationId = insertConv.rows[0]?.id;
    if (!conversationId) {
      const retry = await pg.query<{ id: string }>(
        `SELECT id
         FROM public.conversations
         WHERE guest_or_requester_id = $1 AND kind = 'HOST_APPROVAL'
         LIMIT 1`,
        [profile.id]
      );
      conversationId = retry.rows[0]!.id;
    } else {
      await insertConversationMessageWithPg(pg, {
        conversationId,
        senderId: null,
        senderRole: "SYSTEM",
        senderName: "Equipo I-bita",
        body: seedNotice,
        messageType: "SYSTEM_NOTICE",
      });
      return conversationId;
    }
  }

  if (input.systemNoticeBody) {
    await insertConversationMessageWithPg(pg, {
      conversationId,
      senderId: null,
      senderRole: "SYSTEM",
      senderName: "Equipo I-bita",
      body: input.systemNoticeBody,
      messageType: "SYSTEM_NOTICE",
    });
  }

  return conversationId;
}

export async function createBookingConversationWithPg(
  pg: Client,
  input: {
    bookingId: string;
    guestId: string;
    guestName: string;
    guestEmail: string | null;
    hostId: string;
    hostName?: string | null;
    propertyId: string;
    propertyTitle: string;
    checkIn: string;
    checkOut: string;
    nightsCount: number;
    conversationKind?: "BOOKING_INTERVIEW" | "BOOKING_STAY";
    midTermApplication: MidTermGuestApplication | null;
    hostResponseSchedule?: HostResponseSchedule | null;
    hostResponseDueAtIso?: string | null;
    hostResponseRatePct?: number | null;
  }
): Promise<string> {
  const existing = await pg.query<{ id: string }>(
    `SELECT id FROM public.conversations WHERE booking_id = $1 LIMIT 1`,
    [input.bookingId]
  );
  if (existing.rows[0]?.id) {
    return existing.rows[0].id;
  }

  const resolvedKind =
    input.conversationKind ??
    (input.midTermApplication ? "BOOKING_INTERVIEW" : "BOOKING_STAY");

  const resolvedSchedule = input.hostResponseSchedule ?? null;
  const resolvedDueAtIso = input.hostResponseDueAtIso ?? null;

  const autoResponseNotice =
    resolvedSchedule && resolvedDueAtIso
      ? buildAutoReservationResponseNotice({
          propertyTitle: input.propertyTitle,
          hostName: input.hostName?.trim() || "tu anfitrión",
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          nightsCount: input.nightsCount,
          schedule: resolvedSchedule,
          dueAtIso: resolvedDueAtIso,
          requiresHostApproval: resolvedKind === "BOOKING_INTERVIEW",
          responseRatePct: input.hostResponseRatePct ?? null,
        })
      : null;

  const interviewSeedText = input.midTermApplication
    ? buildBookingInterviewSeedMessage({
        guestName: input.guestName,
        propertyTitle: input.propertyTitle,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        nightsCount: input.nightsCount,
        midTermApplication: input.midTermApplication,
      })
    : null;

  const initialPreview =
    autoResponseNotice ??
    interviewSeedText ??
    `Reserva en ${input.propertyTitle} (${input.checkIn} -> ${input.checkOut})`;

  const insertConv = await pg.query<{ id: string }>(
    `INSERT INTO public.conversations (
       kind, subject, status, guest_or_requester_id, requester_name,
       requester_email, host_id, property_id, booking_id, last_message_preview
     ) VALUES (
       $1,
       $2,
       'OPEN',
       $3,
       $4,
       $5,
       $6,
       $7,
       $8,
       $9
     )
     ON CONFLICT (booking_id) WHERE booking_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      resolvedKind,
      `Estadía en ${input.propertyTitle}`.slice(0, 140),
      input.guestId,
      input.guestName.slice(0, 100),
      input.guestEmail,
      input.hostId,
      input.propertyId,
      input.bookingId,
      initialPreview.replace(/\s+/g, " ").trim().slice(0, 140),
    ]
  );

  const conversationId = insertConv.rows[0]?.id;
  if (!conversationId) {
    const retry = await pg.query<{ id: string }>(
      `SELECT id FROM public.conversations WHERE booking_id = $1 LIMIT 1`,
      [input.bookingId]
    );
    return retry.rows[0]!.id;
  }

  if (interviewSeedText) {
    await insertConversationMessageWithPg(pg, {
      conversationId,
      senderId: input.guestId,
      senderRole: "GUEST",
      senderName: input.guestName,
      body: interviewSeedText,
      messageType: "INTERVIEW_PROPOSAL",
    });
  }

  if (autoResponseNotice) {
    await insertConversationMessageWithPg(pg, {
      conversationId,
      senderId: null,
      senderRole: "SYSTEM",
      senderName: "I-bita Reservas",
      body: autoResponseNotice,
      messageType: "SYSTEM_NOTICE",
    });
  }

  return conversationId;
}

export async function ensureBookingConversationWithPg(
  pg: Client,
  input: {
    bookingId: string;
    actorUserId: string;
    isAdmin: boolean;
  }
): Promise<string> {
  const existing = await pg.query<{
    id: string;
    guest_or_requester_id: string | null;
    host_id: string | null;
  }>(
    `SELECT id, guest_or_requester_id, host_id
     FROM public.conversations
     WHERE booking_id = $1
     LIMIT 1`,
    [input.bookingId]
  );

  if (existing.rows[0]?.id) {
    const row = existing.rows[0];
    if (
      !input.isAdmin &&
      row.guest_or_requester_id !== input.actorUserId &&
      row.host_id !== input.actorUserId
    ) {
      throw new AppError(
        "FORBIDDEN",
        "No tenés permisos para ver la conversación de esta reserva.",
        403
      );
    }
    return row.id;
  }

  const bookingRes = await pg.query<{
    id: string;
    property_id: string;
    guest_id: string;
    host_id: string;
    property_title: string;
    check_in: Date | string;
    check_out: Date | string;
    nights_count: number;
    created_at: Date | string;
    status: string;
    host_response_schedule: unknown;
    host_response_due_at: Date | string | null;
    guest_name: string | null;
    guest_email: string | null;
    host_name: string | null;
    current_host_schedule: unknown;
    mid_term_application: MidTermGuestApplication | null;
  }>(
    `SELECT
       b.id,
       b.property_id,
       b.guest_id,
       p.host_id,
       p.title AS property_title,
       b.check_in,
       b.check_out,
       b.nights_count,
       b.created_at,
       b.status::text AS status,
       b.host_response_schedule,
       b.host_response_due_at,
       g.full_name AS guest_name,
       g.email AS guest_email,
       h.full_name AS host_name,
       h.response_schedule AS current_host_schedule,
       b.mid_term_application
     FROM public.bookings b
     JOIN public.properties p ON p.id = b.property_id
     LEFT JOIN public.profiles g ON g.id = b.guest_id
     LEFT JOIN public.profiles h ON h.id = p.host_id
     WHERE b.id = $1
     LIMIT 1`,
    [input.bookingId]
  );

  const row = bookingRes.rows[0];
  if (!row) {
    throw new AppError(
      "NOT_FOUND",
      "No encontramos esa reserva en I-bita.",
      404
    );
  }

  if (
    !input.isAdmin &&
    row.guest_id !== input.actorUserId &&
    row.host_id !== input.actorUserId
  ) {
    throw new AppError(
      "FORBIDDEN",
      "No tenés permisos para abrir el chat de esta reserva.",
      403
    );
  }

  const formatYmd = (val: Date | string) =>
    val instanceof Date ? val.toISOString().slice(0, 10) : String(val).slice(0, 10);

  const { schedule, isConfigured } = normalizeHostResponseSchedule(
    row.host_response_schedule ?? row.current_host_schedule
  );
  const createdAtDate = new Date(row.created_at);
  const dueAtIso = row.host_response_due_at
    ? new Date(row.host_response_due_at).toISOString()
    : calculateScheduledResponseDeadline(createdAtDate, schedule).toISOString();

  const metricsRows = await pg.query<{
    id: string;
    created_at: Date | string;
    status: string;
    host_response_due_at: Date | string | null;
    host_responded_at: Date | string | null;
    host_responded_on_time: boolean | null;
  }>(
    `SELECT b.id, b.created_at, b.status::text AS status,
            b.host_response_due_at, b.host_responded_at, b.host_responded_on_time
     FROM public.bookings b
     INNER JOIN public.properties p ON p.id = b.property_id
     WHERE p.host_id = $1
       AND b.status NOT IN ('CANCELLED', 'EXPIRED', 'ICAL_BLOCK')
     ORDER BY b.created_at DESC
     LIMIT 250`,
    [row.host_id]
  );

  const hostMetrics = computeSynchronizedHostResponseMetrics(
    metricsRows.rows.map((m) => ({
      id: m.id,
      createdAt:
        m.created_at instanceof Date
          ? m.created_at.toISOString()
          : new Date(m.created_at).toISOString(),
      status: String(m.status),
      hostResponseDueAt: m.host_response_due_at
        ? new Date(m.host_response_due_at).toISOString()
        : null,
      hostRespondedAt: m.host_responded_at
        ? new Date(m.host_responded_at).toISOString()
        : null,
      hostRespondedOnTime:
        m.host_responded_on_time === null ||
        m.host_responded_on_time === undefined
          ? null
          : Boolean(m.host_responded_on_time),
    })),
    schedule,
    isConfigured
  );

  return createBookingConversationWithPg(pg, {
    bookingId: row.id,
    guestId: row.guest_id,
    guestName:
      row.guest_name?.trim() ||
      row.guest_email?.split("@")[0] ||
      "Huésped I-bita",
    guestEmail: row.guest_email,
    hostId: row.host_id,
    hostName: row.host_name?.trim() || "tu anfitrión",
    propertyId: row.property_id,
    propertyTitle: row.property_title,
    checkIn: formatYmd(row.check_in),
    checkOut: formatYmd(row.check_out),
    nightsCount: Number(row.nights_count ?? 1),
    conversationKind: row.mid_term_application
      ? "BOOKING_INTERVIEW"
      : "BOOKING_STAY",
    midTermApplication: row.mid_term_application,
    hostResponseSchedule: schedule,
    hostResponseDueAtIso: dueAtIso,
    hostResponseRatePct: hostMetrics.responseRatePct,
  });
}
