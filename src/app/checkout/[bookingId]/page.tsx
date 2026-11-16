import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CreditCard, ShieldCheck, Lock } from "lucide-react";
import {
  getArsCheckoutSummaryAction,
  getUsdtCheckoutSummaryAction,
  createArsCheckoutPreferenceAction,
} from "@/modules/payments/actions";
import { UsdtCheckoutCard } from "@/components/booking/UsdtCheckoutCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pagar reserva · Motor Financiero Bi-Monetario · I-bita",
  robots: { index: false, follow: false },
};

interface CheckoutPageProps {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ token?: string; status?: string; error?: string }>;
}

const STATUS_MESSAGES: Record<string, string> = {
  success:
    "Mercado Pago informó el pago. Tu reserva se confirma cuando recibimos la notificación firmada; recargá en unos segundos.",
  pending: "Tu pago está pendiente de acreditación en Mercado Pago.",
  failure: "El pago no se completó. Podés intentarlo nuevamente.",
};

export default async function CheckoutPage({
  params,
  searchParams,
}: CheckoutPageProps) {
  const { bookingId } = await params;
  const { token, status, error } = await searchParams;

  // Consultar primero el resumen para determinar la moneda pactada (ARS vs USDT)
  const arsRes = await getArsCheckoutSummaryAction(bookingId, token ?? null);
  if (!arsRes.ok) notFound();
  const arsSummary = arsRes.data;

  // Si la reserva fue pactada en USDT, renderizar checkout on-chain en Polygon (Viem)
  if (arsSummary.paymentCurrency === "USDT") {
    const usdtRes = await getUsdtCheckoutSummaryAction(bookingId, token ?? null);
    if (!usdtRes.ok) notFound();
    const usdtSummary = usdtRes.data;

    return (
      <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
        <header className="space-y-2">
          <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Custodia Escrow · Red Polygon (USDT)
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Checkout en Stablecoins
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {usdtSummary.propertyTitle} · {usdtSummary.checkIn} al {usdtSummary.checkOut} (
            {usdtSummary.nightsCount} noches)
          </p>
        </header>

        <UsdtCheckoutCard
          bookingId={usdtSummary.bookingId}
          propertyTitle={usdtSummary.propertyTitle}
          checkIn={usdtSummary.checkIn}
          checkOut={usdtSummary.checkOut}
          nightsCount={usdtSummary.nightsCount}
          isMidTerm={usdtSummary.isMidTerm}
          amountUsdt={usdtSummary.amountUsdt}
          escrowDepositUsdt={usdtSummary.escrowDepositUsdt}
          treasuryWallet={usdtSummary.treasuryWallet}
          usdtContractAddress={usdtSummary.usdtContractAddress}
          network={usdtSummary.network}
          token={token ?? null}
          payable={usdtSummary.payable}
          status={usdtSummary.status}
        />
      </main>
    );
  }

  // Flujo ARS (Mercado Pago)
  const formattedAmount = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(Number(arsSummary.amountArs));

  async function startMercadoPagoCheckout() {
    "use server";
    const res = await createArsCheckoutPreferenceAction(bookingId, token ?? null);
    if (!res.ok) {
      redirect(
        `/checkout/${bookingId}?${token ? `token=${encodeURIComponent(token)}&` : ""}error=${encodeURIComponent(res.error.message)}`
      );
    }
    redirect(res.data.initPoint);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <header className="space-y-2">
        <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Pago seguro en pesos · Mercado Pago
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
          Pagar tu reserva
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          {arsSummary.propertyTitle} · {arsSummary.checkIn} al {arsSummary.checkOut} (
          {arsSummary.nightsCount} noches)
        </p>
      </header>

      {status && STATUS_MESSAGES[status] && (
        <p role="status" className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3 text-sm font-semibold">
          {STATUS_MESSAGES[status]}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border-2 border-red-900 bg-red-50 p-3 text-sm font-bold text-red-950">
          {error}
        </p>
      )}

      <section
        aria-labelledby="amount-heading"
        className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 space-y-3"
      >
        <h2 id="amount-heading" className="text-sm font-bold uppercase tracking-wide">
          Total a pagar
        </h2>
        <p className="text-4xl font-black" data-testid="ars-amount">
          {formattedAmount}
        </p>
        <p className="text-xs text-[var(--text-secondary)]">
          Pagás con QR, MODO o saldo en cuenta, o en hasta {arsSummary.maxInstallments}{" "}
          cuotas (3 y 6) según tu medio de pago. El costo financiero lo informa
          Mercado Pago antes de confirmar.
        </p>

        {arsSummary.payable ? (
          <form action={startMercadoPagoCheckout}>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-base font-extrabold text-white hover:bg-emerald-900 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-emerald-950"
            >
              <CreditCard className="h-5 w-5" aria-hidden="true" />
              Pagar con Mercado Pago
            </button>
          </form>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-sm font-bold">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Esta reserva no admite pago ARS en este momento (estado{" "}
            <code>{arsSummary.status}</code>, moneda {arsSummary.paymentCurrency}).
          </p>
        )}
      </section>
    </main>
  );
}
