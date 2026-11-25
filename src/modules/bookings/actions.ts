"use server";

import "server-only";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { Client } from "pg";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import {
  calculateStayPricing,
  type StayPricingBreakdown,
} from "@/lib/math/money";
import {
  CreateBookingRequestSchema,
  calculateNightsBetweenDates,
  type CreateBookingRequestInput,
  type BookingPaymentCurrency,
} from "./validators";
import { normalizeMidTermPolicy } from "@/modules/properties/mid-term-policy";
import { createBookingConversationWithPg } from "@/modules/messaging/server";
import {
  calculateScheduledResponseDeadline,
  computeSynchronizedHostResponseMetrics,
  formatDeadlineEsAr,
  formatResponseScheduleSummary,
  isWithinResponseSchedule,
  normalizeHostResponseSchedule,
  type BookingHostResponseWindowSummary,
} from "@/lib/host/response-schedule";
import { computeHoldExpiresAt } from "@/lib/bookings/partial-hold";
import { isCryptoPaymentsEnabled } from "@/lib/compliance/feature-flags";
import { sendPushNotificationToUser } from "@/lib/push";

export interface GuestVerificationSlot {
  id: string;
  bookingId: string;
  isPrimaryGuest: boolean;
  inviteToken: string;
  status: "PENDING" | "VERIFIED" | "REJECTED";
  checkinPath: string;
}

export interface CreatedBookingRecord {
  id: string;
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  guestId: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  isMidTerm: boolean;
  declaredAdultsCount: number;
  verifiedAdultsCount: number;
  status: "PENDING_PAYMENT" | "PENDING_HOST_APPROVAL";
  paymentCurrency: BookingPaymentCurrency;
  totalAmount: string;
  platformFeePct: string;
  platformFeeAmount: string;
  consortiumCanonAmount: string;
  hostNetAmount: string;
  escrowDepositUsdt: string;
  vehiclePlate: string | null;
  holdExpiresAt: string | null;
  hostConfirmedAt: string | null;
  createdAt: string;
}

export interface CreatedBookingResult {
  booking: CreatedBookingRecord;
  pricing: StayPricingBreakdown;
  guestVerifications: GuestVerificationSlot[];
  requiresHostApproval: boolean;
  hostResponseWindow: BookingHostResponseWindowSummary;
}

/**
 * Crea transaccionalmente una solicitud de reserva en `public.bookings` (`status = 'PENDING_PAYMENT'`)
 * recalculando todos los importes en el servidor con `calculateStayPricing` (`decimal.js`),
 * validando el límite de adultos (`declared_adults_count <= property.max_adults`),
 * capturando colisiones `SQLSTATE 23P01` (`btree_gist`) como `BOOKING_OVERLAP_CONFLICT` (HTTP 409)
 * y generando automáticamente los `N` registros en `public.guest_verifications`
 * (`1` titular + `N - 1` acompañantes adultos con `invite_token` UUID único).
 */
export async function createBookingRequestAction(
  rawInput: CreateBookingRequestInput
): Promise<ActionResult<CreatedBookingResult>> {
  const parsed = CreateBookingRequestSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para iniciar la solicitud de reserva.",
        details: parsed.error.flatten(),
      },
    };
  }

  const {
    propertyId,
    checkIn,
    checkOut,
    declaredAdultsCount,
    paymentCurrency,
    vehiclePlate,
    midTermApplication,
    acknowledgedMidTermRequirements,
    guestId: explicitGuestId,
  } = parsed.data;

  const nightsCount = calculateNightsBetweenDates(checkIn, checkOut);

  // Resolver identidad autenticada desde cookies SSR (@supabase/ssr)
  let authenticatedUserId: string | null = null;
  let authenticatedEmail: string | null = null;
  let authenticatedName: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      authenticatedUserId = user.id;
      authenticatedEmail = user.email ?? null;
      authenticatedName =
        (user.user_metadata?.full_name as string | undefined) ?? null;
    }
  } catch {
    // Ejecución fuera del request scope de Next.js (ej: Gate CLI de verificación)
  }

  const effectiveGuestId = authenticatedUserId ?? explicitGuestId ?? null;
  if (!effectiveGuestId) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Debés iniciar sesión con tu cuenta de I-bita para confirmar la reserva y habilitar los pases biométricos.",
      },
    };
  }

  const pgClient = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });

  await pgClient.connect();

  try {
    await pgClient.query("BEGIN");

    // 1. Consultar explícitamente solo las columnas públicas de la propiedad (CERO access_code_*)
    const propRes = await pgClient.query<{
      id: string;
      host_id: string;
      slug: string;
      title: string;
      max_adults: number;
      base_currency: "ARS" | "USD" | "USDT";
      nightly_rate: string;
      monthly_discount_pct: string;
      absorb_installments_cost: boolean;
      accepts_usdt: boolean;
      is_published: boolean;
      mid_term_policy: unknown;
    }>(
      `SELECT
         id, host_id, slug, title, max_adults, base_currency,
         nightly_rate, monthly_discount_pct, absorb_installments_cost,
         accepts_usdt, is_published, mid_term_policy
       FROM public.properties
       WHERE id = $1 AND is_published = TRUE AND estado_regulatorio = 'activo'
       LIMIT 1`,
      [propertyId]
    );

    const property = propRes.rows[0];
    if (!property) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message:
            "La Unidad Funcional solicitada no existe o no se encuentra publicada.",
        },
      };
    }

    // 2. Validar capacidad máxima de adultos de la Unidad Funcional
    if (declaredAdultsCount > Number(property.max_adults)) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: `La cantidad de adultos declarados (${declaredAdultsCount}) supera la capacidad máxima permitida de esta unidad (${property.max_adults} adultos).`,
        },
      };
    }

    // 3. Validar soporte de moneda USDT y feature flag regulatorio (PSAV CNV - Ley 27.739)
    if (paymentCurrency === "USDT" && !isCryptoPaymentsEnabled()) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Los pagos en USDT se encuentran temporalmente deshabilitados por adecuación regulatoria (PSAV CNV - Ley 27.739). Seleccioná Pesos Argentinos (ARS).",
        },
      };
    }

    if (paymentCurrency === "USDT" && !property.accepts_usdt) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Esta Unidad Funcional solo admite pagos en Pesos Argentinos (ARS).",
        },
      };
    }

    // 4. Garantizar que el perfil del huésped exista en `public.profiles`
    const profileCheck = await pgClient.query<{
      id: string;
      full_name: string | null;
      email: string | null;
    }>(
      `SELECT id, full_name, email FROM public.profiles WHERE id = $1 LIMIT 1`,
      [effectiveGuestId]
    );

    let guestDisplayName =
      profileCheck.rows[0]?.full_name?.trim() || authenticatedName || "Huésped I-bita";
    let guestDisplayEmail =
      profileCheck.rows[0]?.email?.trim() || authenticatedEmail || null;

    if (profileCheck.rows.length === 0) {
      const authUserRes = await pgClient.query<{
        email: string | null;
        raw_user_meta_data: { full_name?: string } | null;
      }>(
        `SELECT email, raw_user_meta_data FROM auth.users WHERE id = $1 LIMIT 1`,
        [effectiveGuestId]
      );

      const authRow = authUserRes.rows[0];
      if (!authRow) {
        await pgClient.query("ROLLBACK");
        return {
          ok: false,
          error: {
            code: "UNAUTHORIZED",
            message: "El usuario indicado no posee una cuenta válida en I-bita.",
          },
        };
      }

      const fallbackEmail =
        authenticatedEmail ?? authRow.email ?? `${effectiveGuestId}@i-bita.ar`;
      const fallbackName =
        authenticatedName ??
        authRow.raw_user_meta_data?.full_name ??
        fallbackEmail.split("@")[0] ??
        "Huésped I-bita";

      guestDisplayEmail = fallbackEmail;
      guestDisplayName = fallbackName;

      await pgClient.query(
        `INSERT INTO public.profiles (id, email, full_name, role)
         VALUES ($1, $2, $3, 'GUEST')
         ON CONFLICT (id) DO NOTHING`,
        [effectiveGuestId, fallbackEmail, fallbackName]
      );
    }

    // 5. Consultar configuración Consorcio Friendly activa para obtener micro_canon_pct
    const consortiumRes = await pgClient.query<{ micro_canon_pct: string }>(
      `SELECT micro_canon_pct
       FROM public.consortium_configs
       WHERE property_id = $1 AND active = TRUE
       LIMIT 1`,
      [property.id]
    );

    const microCanonPct = consortiumRes.rows[0]?.micro_canon_pct ?? "0.00";

    // 5b. Consultar el intervalo confirmado de respuesta del anfitrión y su tasa sincronizada
    const [hostProfileRes, hostSlaBookingsRes] = await Promise.all([
      pgClient.query<{
        full_name: string | null;
        email: string | null;
        response_schedule: unknown;
      }>(
        `SELECT full_name, email, response_schedule
         FROM public.profiles
         WHERE id = $1
         LIMIT 1`,
        [property.host_id]
      ),
      pgClient.query<{
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
        [property.host_id]
      ),
    ]);

    const hostRow = hostProfileRes.rows[0];
    const hostDisplayName =
      hostRow?.full_name?.trim() ||
      hostRow?.email?.split("@")[0] ||
      "tu anfitrión";
    const {
      schedule: hostResponseSchedule,
      isConfigured: hostScheduleConfigured,
    } = normalizeHostResponseSchedule(hostRow?.response_schedule ?? null);

    const bookedAtNow = new Date();
    const hostResponseDueAt = calculateScheduledResponseDeadline(
      bookedAtNow,
      hostResponseSchedule
    );
    const hostResponseDueAtIso = hostResponseDueAt.toISOString();

    const hostSlaMetrics = computeSynchronizedHostResponseMetrics(
      hostSlaBookingsRes.rows.map((m) => ({
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
      hostResponseSchedule,
      hostScheduleConfigured,
      bookedAtNow
    );

    const hostResponseWindow: BookingHostResponseWindowSummary = {
      schedule: hostResponseSchedule,
      scheduleSummary: formatResponseScheduleSummary(hostResponseSchedule),
      dueAtIso: hostResponseDueAtIso,
      dueAtLabelEsAr: formatDeadlineEsAr(hostResponseDueAtIso, bookedAtNow),
      respondedAtIso: null,
      respondedOnTime: null,
      responseRatePct: hostSlaMetrics.responseRatePct,
      evaluatedCount: hostSlaMetrics.evaluatedCount,
      isWithinActiveScheduleAtBooking: isWithinResponseSchedule(
        bookedAtNow,
        hostResponseSchedule
      ),
    };

    // 6. Recalcular autoritativamente todos los montos en el servidor con decimal.js (CERO confianza en el cliente)
    const pricing = calculateStayPricing({
      nightlyRate: property.nightly_rate,
      nights: nightsCount,
      monthlyDiscountPct: property.monthly_discount_pct,
      microCanonPct,
      absorbInstallmentsCost: property.absorb_installments_cost,
      baseCurrency: property.base_currency,
      paymentCurrency,
    });

    const bookingId = crypto.randomUUID();
    const cleanVehiclePlate =
      vehiclePlate && vehiclePlate.trim().length > 0
        ? vehiclePlate.trim().toUpperCase()
        : null;

    const midTermPolicy = normalizeMidTermPolicy(property.mid_term_policy);
    const requiresHostApproval =
      pricing.isMidTerm &&
      midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW";
    const enabledRequiredReqs = midTermPolicy.requirements.filter(
      (req) => req.enabled && req.required
    );

    if (requiresHostApproval) {
      if (!midTermApplication) {
        await pgClient.query("ROLLBACK");
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Para estadías de 1 a 6 meses en esta propiedad, completá tus datos de contacto y entrevista previa antes de enviar la solicitud.",
          },
        };
      }

      if (
        !midTermPolicy.interviewChannels.includes(
          midTermApplication.preferredInterviewChannel
        )
      ) {
        await pgClient.query("ROLLBACK");
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Elegí uno de los canales de entrevista habilitados por el anfitrión.",
          },
        };
      }

      if (
        enabledRequiredReqs.length > 0 &&
        !midTermApplication.acknowledgedRequirements
      ) {
        await pgClient.query("ROLLBACK");
        return {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "Confirmá que conocés los requisitos obligatorios del anfitrión para estadías de 1 a 6 meses.",
          },
        };
      }

      if (midTermPolicy.screeningQuestions.length > 0) {
        const answersMap = new Map(
          midTermApplication.questionAnswers.map((qa) => [
            qa.question.trim(),
            qa.answer.trim(),
          ])
        );
        const missingQuestion = midTermPolicy.screeningQuestions.find((q) => {
          const ans = answersMap.get(q.trim());
          return !ans || ans.length === 0;
        });
        if (missingQuestion) {
          await pgClient.query("ROLLBACK");
          return {
            ok: false,
            error: {
              code: "VALIDATION_ERROR",
              message: `Respondé todas las preguntas previas del anfitrión (${missingQuestion}).`,
            },
          };
        }
      }
    } else if (
      pricing.isMidTerm &&
      enabledRequiredReqs.length > 0 &&
      acknowledgedMidTermRequirements === false
    ) {
      await pgClient.query("ROLLBACK");
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message:
            "Confirmá que conocés los requisitos obligatorios para estadías de 1 a 6 meses antes de continuar.",
        },
      };
    }

    const initialBookingStatus: "PENDING_PAYMENT" | "PENDING_HOST_APPROVAL" =
      requiresHostApproval ? "PENDING_HOST_APPROVAL" : "PENDING_PAYMENT";
    const holdExpiresAtIso =
      initialBookingStatus === "PENDING_PAYMENT"
        ? computeHoldExpiresAt(bookedAtNow).toISOString()
        : null;
    const midTermApplicationJson =
      requiresHostApproval && midTermApplication
        ? JSON.stringify(midTermApplication)
        : null;

    // 6b. Liberar cualquier reserva parcial de 1 hora vencida antes de verificar disponibilidad
    await pgClient.query(
      `UPDATE public.bookings
       SET status = 'EXPIRED',
           updated_at = NOW()
       WHERE property_id = $1
         AND status = 'PENDING_PAYMENT'
         AND hold_expires_at IS NOT NULL
         AND hold_expires_at <= NOW()`,
      [property.id]
    );

    // 7. Insertar la reserva en public.bookings (protegido físicamente por btree_gist `no_overlapping_active_bookings`)
    const insertBookingRes = await pgClient.query<{
      id: string;
      nights_count: number;
      is_mid_term: boolean;
      hold_expires_at: Date | string | null;
      host_confirmed_at: Date | string | null;
      created_at: Date | string;
    }>(
      `INSERT INTO public.bookings (
         id,
         property_id,
         guest_id,
         check_in,
         check_out,
         declared_adults_count,
         verified_adults_count,
         status,
         payment_currency,
         total_amount,
         platform_fee_pct,
         platform_fee_amount,
         consortium_canon_amount,
         host_net_amount,
         escrow_deposit_usdt,
         vehicle_plate,
         mid_term_application,
         host_response_schedule,
         host_response_due_at,
         hold_expires_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 0, $7::booking_status, $8,
         $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18::timestamptz, $19::timestamptz
       )
       RETURNING id, nights_count, is_mid_term, hold_expires_at, host_confirmed_at, created_at`,
      [
        bookingId,
        property.id,
        effectiveGuestId,
        checkIn,
        checkOut,
        declaredAdultsCount,
        initialBookingStatus,
        paymentCurrency,
        pricing.totalGuestPayable,
        pricing.platformFeePct,
        pricing.platformFeeAmount,
        pricing.consortiumCanonAmount,
        pricing.hostNetPayout,
        pricing.escrowDepositUsdt,
        cleanVehiclePlate,
        midTermApplicationJson,
        JSON.stringify(hostResponseSchedule),
        hostResponseDueAtIso,
        holdExpiresAtIso,
      ]
    );

    const insertedBooking = insertBookingRes.rows[0]!;

    // 8. Generar automáticamente los N slots en `public.guest_verifications` (1 titular + N-1 acompañantes adultos)
    const guestVerifications: GuestVerificationSlot[] = [];

    for (let i = 0; i < declaredAdultsCount; i += 1) {
      const slotId = crypto.randomUUID();
      const inviteToken = crypto.randomUUID();
      const isPrimaryGuest = i === 0;

      await pgClient.query(
        `INSERT INTO public.guest_verifications (
           id,
           booking_id,
           is_primary_guest,
           invite_token,
           document_type,
           status
         ) VALUES ($1, $2, $3, $4, 'DNI_ARG', 'PENDING')`,
        [slotId, bookingId, isPrimaryGuest, inviteToken]
      );

      guestVerifications.push({
        id: slotId,
        bookingId,
        isPrimaryGuest,
        inviteToken,
        status: "PENDING",
        checkinPath: `/checkin/${bookingId}?token=${inviteToken}`,
      });
    }

    await createBookingConversationWithPg(pgClient, {
      bookingId,
      guestId: effectiveGuestId,
      guestName: guestDisplayName,
      guestEmail: guestDisplayEmail,
      hostId: property.host_id,
      hostName: hostDisplayName,
      propertyId: property.id,
      propertyTitle: property.title,
      checkIn,
      checkOut,
      nightsCount: Number(insertedBooking.nights_count ?? nightsCount),
      conversationKind: requiresHostApproval
        ? "BOOKING_INTERVIEW"
        : "BOOKING_STAY",
      midTermApplication:
        requiresHostApproval && midTermApplication ? midTermApplication : null,
      hostResponseSchedule,
      hostResponseDueAtIso,
      hostResponseRatePct: hostSlaMetrics.responseRatePct,
    });

    await pgClient.query("COMMIT");

    if (property.host_id !== effectiveGuestId) {
      void sendPushNotificationToUser(property.host_id, {
        title: requiresHostApproval
          ? "Nueva solicitud de estadía larga"
          : "Nueva reserva en tu propiedad",
        body: `${guestDisplayName} solicitó ${property.title} (${checkIn} al ${checkOut}).`,
        url: "/dashboard/propiedades",
        tag: `booking-new-${bookingId}`,
      });
    }

    try {
      revalidatePath(`/p/${property.slug}`);
      revalidatePath("/dashboard/propiedades");
      revalidatePath("/perfil");
      revalidatePath("/mensajes");
    } catch {
      // Ignorar si se invoca desde script CLI fuera de Next.js request context
    }

    return {
      ok: true,
      data: {
        booking: {
          id: insertedBooking.id,
          propertyId: property.id,
          propertySlug: property.slug,
          propertyTitle: property.title,
          guestId: effectiveGuestId,
          checkIn,
          checkOut,
          nightsCount: Number(insertedBooking.nights_count ?? nightsCount),
          isMidTerm: Boolean(insertedBooking.is_mid_term ?? pricing.isMidTerm),
          declaredAdultsCount,
          verifiedAdultsCount: 0,
          status: initialBookingStatus,
          paymentCurrency,
          totalAmount: pricing.totalGuestPayable,
          platformFeePct: pricing.platformFeePct,
          platformFeeAmount: pricing.platformFeeAmount,
          consortiumCanonAmount: pricing.consortiumCanonAmount,
          hostNetAmount: pricing.hostNetPayout,
          escrowDepositUsdt: pricing.escrowDepositUsdt,
          vehiclePlate: cleanVehiclePlate,
          holdExpiresAt: insertedBooking.hold_expires_at
            ? new Date(insertedBooking.hold_expires_at).toISOString()
            : holdExpiresAtIso,
          hostConfirmedAt: insertedBooking.host_confirmed_at
            ? new Date(insertedBooking.host_confirmed_at).toISOString()
            : null,
          createdAt:
            insertedBooking.created_at instanceof Date
              ? insertedBooking.created_at.toISOString()
              : String(insertedBooking.created_at),
        },
        pricing,
        guestVerifications,
        requiresHostApproval,
        hostResponseWindow,
      },
    };
  } catch (err: unknown) {
    try {
      await pgClient.query("ROLLBACK");
    } catch {
      // Ignorar fallo de rollback secundario
    }

    const pgErr = err as { code?: string; message?: string };
    const appError =
      err instanceof AppError ? err : AppError.fromPostgresError(pgErr);

    return {
      ok: false,
      error: {
        code: appError.code,
        message: appError.message,
        details: appError.details,
      },
    };
  } finally {
    await pgClient.end();
  }
}
