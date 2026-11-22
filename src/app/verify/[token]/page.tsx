import type { Metadata } from "next";
import { ShieldCheck, ShieldX, Building2, Calendar, Car, Users } from "lucide-react";
import { verifyPorteriaPassTokenAction } from "@/modules/consortium/actions";

export const dynamic = "force-dynamic";

// Credencial privada: nunca indexable ni cacheable.
export const metadata: Metadata = {
  title: "Verificación de Pase de Portería · I-bita",
  robots: { index: false, follow: false, nocache: true },
};

interface VerifyPageProps {
  params: Promise<{ token: string }>;
}

export default async function VerifyPorteriaPassPage({ params }: VerifyPageProps) {
  const { token } = await params;
  const res = await verifyPorteriaPassTokenAction(token);

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <section
          role="alert"
          aria-live="assertive"
          className="rounded-3xl border-4 border-red-900 bg-red-50 p-8 text-center text-red-950"
        >
          <ShieldX className="mx-auto h-16 w-16" aria-hidden="true" />
          <h1 className="mt-4 text-3xl font-black">INGRESO NO AUTORIZADO</h1>
          <p className="mt-3 text-lg font-semibold">{res.error.message}</p>
          <p className="mt-2 text-sm">
            No permita el acceso. Contacte a la administración del consorcio.
          </p>
        </section>
      </div>
    );
  }

  const pass = res.data;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <section
        aria-labelledby="pass-title"
        className="rounded-3xl border-4 border-emerald-900 bg-emerald-50 p-6 text-emerald-950 space-y-5"
      >
        <header className="text-center space-y-2">
          <ShieldCheck className="mx-auto h-16 w-16" aria-hidden="true" />
          <h1 id="pass-title" className="text-2xl sm:text-3xl font-black">
            INGRESO AUTORIZADO — CONSORCIO FRIENDLY
          </h1>
          <p className="inline-flex items-center gap-2 text-lg font-bold">
            <Building2 className="h-5 w-5" aria-hidden="true" />
            {pass.consortiumName}
          </p>
        </header>

        <dl className="space-y-3 text-lg">
          <div>
            <dt className="text-sm font-bold uppercase tracking-wide">Unidad Funcional</dt>
            <dd className="font-black">
              {pass.unitIdentifier} · {pass.addressLine}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold uppercase tracking-wide inline-flex items-center gap-1">
              <Calendar className="h-4 w-4" aria-hidden="true" /> Vigencia de estadía
            </dt>
            <dd className="font-black">
              {pass.checkIn} → {pass.checkOut}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-bold uppercase tracking-wide inline-flex items-center gap-1">
              <Car className="h-4 w-4" aria-hidden="true" /> Patente declarada
            </dt>
            <dd className="font-black">{pass.vehiclePlate ?? "Sin vehículo declarado"}</dd>
          </div>
        </dl>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide inline-flex items-center gap-1">
            <Users className="h-4 w-4" aria-hidden="true" /> Adultos verificados (
            {pass.verifiedAdultsCount}/{pass.declaredAdultsCount})
          </h2>
          <ul className="mt-2 space-y-2">
            {pass.verifiedGuests.map((g) => (
              <li
                key={g.slotIndex}
                className="rounded-xl border-2 border-emerald-900 bg-white px-4 py-2 font-bold"
              >
                {g.fullName}{" "}
                <span className="font-mono text-sm">
                  · DNI {g.maskedDni}
                  {g.isPrimaryGuest ? " · Titular" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
