import { NextResponse, type NextRequest } from "next/server";
import { Client } from "pg";
import { z } from "zod";
import { env } from "@/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  generateMidTermContractPdf,
  generateShortStayAgreementPdf,
  type ContractGenerationInput,
} from "@/modules/contracts/pdf-generator";
import { CONTRACT_STORAGE_BUCKET } from "@/modules/contracts/types";

export const dynamic = "force-dynamic";

const BookingIdSchema = z.string().trim().uuid();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await context.params;
  const parsedId = BookingIdSchema.safeParse(bookingId);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "Identificador de reserva inválido." },
      { status: 400 }
    );
  }

  const tokenParam = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  const tokenIsUuid = z.string().uuid().safeParse(tokenParam).success;
  const hashParam = request.nextUrl.searchParams.get("hash")?.trim() ?? "";

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const pg = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await pg.connect();

  try {
    const res = await pg.query<{
      booking_id: string;
      nights_count: number;
      is_mid_term: boolean;
      check_in: string;
      check_out: string;
      total_amount: string;
      payment_currency: string;
      escrow_deposit_usdt: string;
      property_title: string;
      address_line: string;
      unit_identifier: string | null;
      corridor: string | null;
      host_id: string;
      host_name: string | null;
      host_email: string | null;
      host_cuit: string | null;
      guest_id: string | null;
      guest_name: string | null;
      guest_email: string | null;
      guest_phone: string | null;
      guest_cuit: string | null;
      token_match: boolean;
      stay_purpose: string | null;
      pdf_storage_path: string | null;
      pdf_sha256_hash: string | null;
      guest_signed_at: Date | string | null;
      guest_signer_ip: string | null;
      host_signed_at: Date | string | null;
    }>(
      `SELECT b.id AS booking_id,
              b.nights_count,
              b.is_mid_term,
              b.check_in::text AS check_in,
              b.check_out::text AS check_out,
              b.total_amount::text AS total_amount,
              b.payment_currency::text AS payment_currency,
              b.escrow_deposit_usdt::text AS escrow_deposit_usdt,
              p.title AS property_title,
              p.address_line,
              p.unit_identifier,
              p.corridor,
              p.host_id,
              phost.full_name AS host_name,
              phost.email AS host_email,
              phost.cuit_cuil AS host_cuit,
              b.guest_id,
              pguest.full_name AS guest_name,
              pguest.email AS guest_email,
              pguest.phone_whatsapp AS guest_phone,
              pguest.cuit_cuil AS guest_cuit,
              ($2::uuid IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.guest_verifications gv
                WHERE gv.booking_id = b.id AND gv.invite_token = $2::uuid
              )) AS token_match,
              c.stay_purpose,
              c.pdf_storage_path,
              c.pdf_sha256_hash,
              c.guest_signed_at,
              c.guest_signer_ip,
              c.host_signed_at
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       INNER JOIN public.profiles phost ON phost.id = p.host_id
       LEFT JOIN public.profiles pguest ON pguest.id = b.guest_id
       LEFT JOIN public.contracts c ON c.booking_id = b.id
       WHERE b.id = $1
       LIMIT 1`,
      [parsedId.data, tokenIsUuid ? tokenParam : null]
    );

    const row = res.rows[0];
    if (!row) {
      return NextResponse.json(
        { error: "Reserva no encontrada." },
        { status: 404 }
      );
    }

    const isHost = Boolean(userId && userId === row.host_id);
    const isGuest =
      Boolean(userId && row.guest_id && userId === row.guest_id) ||
      Boolean(row.token_match);

    if (!isHost && !isGuest && !row.token_match) {
      return NextResponse.json(
        { error: "No tenés autorización para descargar este acuerdo." },
        { status: 403 }
      );
    }

    if (!row.pdf_storage_path || !row.pdf_sha256_hash) {
      return NextResponse.json(
        { error: "El acuerdo todavía no fue generado ni firmado." },
        { status: 404 }
      );
    }

    if (hashParam && hashParam !== row.pdf_sha256_hash) {
      return NextResponse.json(
        { error: "El enlace de descarga no coincide con la versión vigente." },
        { status: 409 }
      );
    }

    const isShortStay =
      row.pdf_storage_path.includes("acuerdo-estadia-corta") ||
      (Number(row.nights_count) < 30 && !Boolean(row.is_mid_term));
    const downloadFileName = isShortStay
      ? "acuerdo-estadia-corta.pdf"
      : "contrato-art1199.pdf";

    let pdfBuffer: Buffer | null = null;
    try {
      const admin = createSupabaseAdminClient();
      const { data } = await admin.storage
        .from(CONTRACT_STORAGE_BUCKET)
        .download(row.pdf_storage_path);
      if (data) {
        pdfBuffer = Buffer.from(await data.arrayBuffer());
      }
    } catch {
      pdfBuffer = null;
    }

    if (!pdfBuffer) {
      const pdfInput: ContractGenerationInput = {
        booking: {
          bookingId: row.booking_id,
          checkIn: row.check_in,
          checkOut: row.check_out,
          nightsCount: Number(row.nights_count),
          totalAmount: row.total_amount,
          paymentCurrency: row.payment_currency,
          escrowDepositUsdt: row.escrow_deposit_usdt,
        },
        property: {
          title: row.property_title,
          addressLine: row.address_line,
          unitIdentifier: row.unit_identifier,
          corridor: row.corridor,
          city: row.corridor,
        },
        host: {
          fullName: row.host_name || "Anfitrión I-bita",
          email: row.host_email || "",
          cuitCuil: row.host_cuit,
        },
        guest: {
          fullName: row.guest_name || "Huésped Registrado",
          email: row.guest_email || "inquilino@i-bita.ar",
          phoneWhatsapp: row.guest_phone,
          cuitCuil: row.guest_cuit,
        },
        stayPurpose: row.stay_purpose || (isShortStay ? "ESTADIA_CORTA" : "TURISMO"),
        guestSignedAt: row.guest_signed_at,
        guestSignerIp: row.guest_signer_ip,
        hostSignedAt: row.host_signed_at,
      };

      const regenerated = isShortStay
        ? await generateShortStayAgreementPdf(pdfInput)
        : await generateMidTermContractPdf(pdfInput);
      pdfBuffer = Buffer.from(regenerated);
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${downloadFileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } finally {
    await pg.end();
  }
}
