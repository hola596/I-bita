import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Client } from "pg";
import { z } from "zod";
import { env } from "@/env";
import { getContractDetailsAction } from "@/modules/contracts/actions";
import { ContractSignCard } from "@/components/contracts/ContractSignCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tu acuerdo de estadía · I-bita",
  robots: { index: false, follow: false },
};

interface ContractPageProps {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function ContractPage({
  params,
  searchParams,
}: ContractPageProps) {
  const { bookingId } = await params;
  const { token } = await searchParams;

  const cleanBookingId = bookingId?.trim() ?? "";
  if (!z.string().uuid().safeParse(cleanBookingId).success) {
    notFound();
  }

  const rawToken = token?.trim() ?? "";
  const tokenIsUuid = z.string().uuid().safeParse(rawToken).success;

  const pg = new Client({
    connectionString: env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await pg.connect();

  let bookingRow;
  try {
    const res = await pg.query<{
      id: string;
      nights_count: number;
      is_mid_term: boolean;
      check_in: string;
      check_out: string;
      total_amount: string;
      payment_currency: string;
      escrow_deposit_usdt: string;
      property_title: string;
      token_valid: boolean;
    }>(
      `SELECT b.id, b.nights_count, b.is_mid_term,
              b.check_in::text AS check_in, b.check_out::text AS check_out,
              b.total_amount::text AS total_amount,
              b.payment_currency::text AS payment_currency,
              b.escrow_deposit_usdt::text AS escrow_deposit_usdt,
              p.title AS property_title,
              ($2::uuid IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.guest_verifications gv
                WHERE gv.booking_id = b.id AND gv.invite_token = $2::uuid
              )) AS token_valid
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE b.id = $1 LIMIT 1`,
      [cleanBookingId, tokenIsUuid ? rawToken : null]
    );
    bookingRow = res.rows[0];
  } finally {
    await pg.end();
  }

  if (!bookingRow) {
    notFound();
  }

  const safeToken = rawToken && bookingRow.token_valid ? rawToken : null;
  const contractRes = await getContractDetailsAction(bookingRow.id, safeToken);
  const initialContract = contractRes.ok ? contractRes.data : null;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <ContractSignCard
        bookingId={bookingRow.id}
        propertyTitle={bookingRow.property_title}
        checkIn={bookingRow.check_in}
        checkOut={bookingRow.check_out}
        nightsCount={Number(bookingRow.nights_count)}
        isMidTerm={Boolean(bookingRow.is_mid_term)}
        totalAmount={bookingRow.total_amount}
        currency={bookingRow.payment_currency}
        escrowDepositUsdt={bookingRow.escrow_deposit_usdt}
        initialContract={initialContract}
        token={safeToken}
        userRole="GUEST"
      />
    </div>
  );
}
