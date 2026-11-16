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
  status: "PENDING_PAYMENT";
  paymentCurrency: BookingPaymentCurrency;
  totalAmount: string;
  platformFeePct: string;
  platformFeeAmount: string;
  consortiumCanonAmount: string;
  hostNetAmount: string;
  escrowDepositUsdt: string;
  vehiclePlate: string | null;
  createdAt: string;
}

export interface CreatedBookingResult {
  booking: CreatedBookingRecord;
  pricing: StayPricingBreakdown;
  guestVerifications: GuestVerificationSlot[];
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
    }>(
      `SELECT
         id, host_id, slug, title, max_adults, base_currency,
         nightly_rate, monthly_discount_pct, absorb_installments_cost,
         accepts_usdt, is_published
       FROM public.properties
       WHERE id = $1 AND is_published = TRUE
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

    // 3. Validar soporte de moneda USDT en la propiedad
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
    const profileCheck = await pgClient.query<{ id: string }>(
      `SELECT id FROM public.profiles WHERE id = $1 LIMIT 1`,
      [effectiveGuestId]
    );

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

    // 7. Insertar la reserva en public.bookings (protegido físicamente por btree_gist `no_overlapping_active_bookings`)
    const insertBookingRes = await pgClient.query<{
      id: string;
      nights_count: number;
      is_mid_term: boolean;
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
         vehicle_plate
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 0, 'PENDING_PAYMENT', $7,
         $8, $9, $10, $11, $12, $13, $14
       )
       RETURNING id, nights_count, is_mid_term, created_at`,
      [
        bookingId,
        property.id,
        effectiveGuestId,
        checkIn,
        checkOut,
        declaredAdultsCount,
        paymentCurrency,
        pricing.totalGuestPayable,
        pricing.platformFeePct,
        pricing.platformFeeAmount,
        pricing.consortiumCanonAmount,
        pricing.hostNetPayout,
        pricing.escrowDepositUsdt,
        cleanVehiclePlate,
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

    await pgClient.query("COMMIT");

    try {
      revalidatePath(`/p/${property.slug}`);
      revalidatePath("/dashboard/propiedades");
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
          status: "PENDING_PAYMENT",
          paymentCurrency,
          totalAmount: pricing.totalGuestPayable,
          platformFeePct: pricing.platformFeePct,
          platformFeeAmount: pricing.platformFeeAmount,
          consortiumCanonAmount: pricing.consortiumCanonAmount,
          hostNetAmount: pricing.hostNetPayout,
          escrowDepositUsdt: pricing.escrowDepositUsdt,
          vehiclePlate: cleanVehiclePlate,
          createdAt:
            insertedBooking.created_at instanceof Date
              ? insertedBooking.created_at.toISOString()
              : String(insertedBooking.created_at),
        },
        pricing,
        guestVerifications,
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
