import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Client } from "pg";
import { env } from "@/env";
import { getContractDetailsAction } from "@/modules/contracts/actions";
import { ContractSignCard } from "@/components/contracts/ContractSignCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Contrato de Locación Temporaria (Art. 1199 CCyC) · I-bita",
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

  // Consultar datos de la reserva y contrato
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
      property_title: string;
    }>(
      `SELECT b.id, b.nights_count, b.is_mid_term,
              b.check_in::text AS check_in, b.check_out::text AS check_out,
              b.total_amount::text AS total_amount,
              b.payment_currency::text AS payment_currency,
              p.title AS property_title
       FROM public.bookings b
       INNER JOIN public.properties p ON p.id = b.property_id
       WHERE b.id = $1 LIMIT 1`,
      [bookingId]
    );
    bookingRow = res.rows[0];
  } finally {
    await pg.end();
  }

  if (!bookingRow) {
    notFound();
  }

  const contractRes = await getContractDetailsAction(bookingId, token ?? null);
  const initialContract = contractRes.ok ? contractRes.data : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <ContractSignCard
        bookingId={bookingRow.id}
        propertyTitle={bookingRow.property_title}
        checkIn={bookingRow.check_in}
        checkOut={bookingRow.check_out}
        nightsCount={Number(bookingRow.nights_count)}
        totalAmount={bookingRow.total_amount}
        currency={bookingRow.payment_currency}
        initialContract={initialContract}
        token={token ?? null}
        userRole="GUEST"
      />
    </main>
  );
}
