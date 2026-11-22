import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, MessageSquare } from "lucide-react";
import {
  getArsCheckoutSummaryAction,
  getUsdtCheckoutSummaryAction,
  createArsCheckoutPreferenceAction,
} from "@/modules/payments/actions";
import { ArsCheckoutCard } from "@/components/booking/ArsCheckoutCard";
import { UsdtCheckoutCard } from "@/components/booking/UsdtCheckoutCard";
import { Icon3D } from "@/components/ui/Icon3D";
import { getBookingHostResponseState } from "@/modules/hosts/response-sla";
import { HostResponseWindowCard } from "@/components/host/HostResponseWindowCard";
import { PartialHoldStatusCard } from "@/components/booking/PartialHoldStatusCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pagar tu reserva · I-bita",
  robots: { index: false, follow: false },
};

interface CheckoutPageProps {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ token?: string; status?: string; error?: string }>;
}

export default async function CheckoutPage({
  params,
  searchParams,
}: CheckoutPageProps) {
  const { bookingId } = await params;
  const { token, status, error } = await searchParams;

  const [arsRes, hostResponseState] = await Promise.all([
    getArsCheckoutSummaryAction(bookingId, token ?? null),
    getBookingHostResponseState(bookingId),
  ]);
  if (!arsRes.ok) notFound();
  const arsSummary = arsRes.data;

  if (arsSummary.status === "PENDING_HOST_APPROVAL") {
    return (
      <div className="mx-auto max-w-xl px-4 py-10 space-y-6">
        <section className="surface-card p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3.5">
            <Icon3D name="calendar" size="lg" />
            <div className="space-y-1.5">
              <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/40 px-3 py-0.5 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                Paso previo en curso · Sin cobro aún
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight">
                Tu solicitud está esperando la entrevista con el anfitrión
              </h1>
            </div>
          </div>

          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Recibimos tu pedido para <strong>{arsSummary.propertyTitle}</strong>{" "}
            del <strong>{arsSummary.checkIn}</strong> al{" "}
            <strong>{arsSummary.checkOut}</strong> ({arsSummary.nightsCount}{" "}
            noches). El anfitrión conversará con vos dentro del centro de
            Mensajes de I-bita antes de habilitar el pago.
          </p>

          <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs text-[var(--text-secondary)] leading-relaxed">
            No se realizó ningún cargo todavía. Apenas el anfitrión apruebe tu
            estadía larga, se va a habilitar el botón de pago seguro acá y en{" "}
            <strong>Mi perfil</strong>.
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href={`/mensajes?booking=${bookingId}`}
              className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <span>Hablar con el anfitrión en Mensajes</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/perfil"
              className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold"
            >
              <span>Seguir estado en Mi perfil</span>
            </Link>
            <Link
              href="/"
              className="btn-secondary-3d inline-flex min-h-[46px] items-center justify-center rounded-2xl px-5 text-sm font-extrabold"
            >
              Volver al inicio
            </Link>
          </div>
        </section>

        {hostResponseState && (
          <HostResponseWindowCard
            mode="booking-status"
            bookingId={hostResponseState.bookingId}
            hostName={hostResponseState.hostName}
            bookingStatus={hostResponseState.bookingStatus}
            windowSummary={hostResponseState}
          />
        )}
      </div>
    );
  }

  // Flujo USDT
  if (arsSummary.paymentCurrency === "USDT") {
    const usdtRes = await getUsdtCheckoutSummaryAction(bookingId, token ?? null);
    if (!usdtRes.ok) notFound();
    const usdtSummary = usdtRes.data;

    return (
      <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
        <header className="surface-card p-6 space-y-3">
          <div className="flex items-center gap-3.5">
            <Icon3D name="coin" size="lg" />
            <div className="space-y-1">
              <span className="badge-consorcio-friendly inline-flex items-center rounded-full px-3 py-0.5 text-xs font-extrabold">
                Pago en dólares digitales (USDT)
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Completá tu transferencia
              </h1>
            </div>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {usdtSummary.propertyTitle} · Del {usdtSummary.checkIn} al{" "}
            {usdtSummary.checkOut} ({usdtSummary.nightsCount} noches)
          </p>
        </header>

        <PartialHoldStatusCard
          propertySlug={usdtSummary.propertySlug}
          status={usdtSummary.status}
          holdExpiresAt={usdtSummary.holdExpiresAt}
          hostConfirmedAt={usdtSummary.hostConfirmedAt}
          checkIn={usdtSummary.checkIn}
          checkOut={usdtSummary.checkOut}
          nightsCount={usdtSummary.nightsCount}
        />

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

        {hostResponseState && (
          <HostResponseWindowCard
            mode="booking-status"
            bookingId={hostResponseState.bookingId}
            hostName={hostResponseState.hostName}
            bookingStatus={hostResponseState.bookingStatus}
            windowSummary={hostResponseState}
          />
        )}
      </div>
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
    <div className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <header className="surface-card p-6 space-y-3">
        <div className="flex items-center gap-3.5">
          <Icon3D name="card" size="lg" />
          <div className="space-y-1">
            <span className="badge-consorcio-friendly inline-flex items-center rounded-full px-3 py-0.5 text-xs font-extrabold">
              Pago protegido en pesos · Mercado Pago
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Confirmá el pago de tu reserva
            </h1>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          {arsSummary.propertyTitle} · Del {arsSummary.checkIn} al{" "}
          {arsSummary.checkOut} ({arsSummary.nightsCount} noches)
        </p>
      </header>

      <PartialHoldStatusCard
        propertySlug={arsSummary.propertySlug}
        status={arsSummary.status}
        holdExpiresAt={arsSummary.holdExpiresAt}
        hostConfirmedAt={arsSummary.hostConfirmedAt}
        checkIn={arsSummary.checkIn}
        checkOut={arsSummary.checkOut}
        nightsCount={arsSummary.nightsCount}
      />

      <ArsCheckoutCard
        bookingId={bookingId}
        token={token ?? null}
        status={status}
        error={error}
        formattedAmount={formattedAmount}
        maxInstallments={arsSummary.maxInstallments}
        payable={arsSummary.payable}
        onStartMercadoPago={startMercadoPagoCheckout}
      />

      {hostResponseState && (
        <HostResponseWindowCard
          mode="booking-status"
          bookingId={hostResponseState.bookingId}
          hostName={hostResponseState.hostName}
          bookingStatus={hostResponseState.bookingStatus}
          windowSummary={hostResponseState}
        />
      )}
    </div>
  );
}
