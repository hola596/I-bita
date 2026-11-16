import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listHostPropertiesAction } from "@/modules/properties/actions";
import { listPublicProperties } from "@/modules/properties/queries";
import { PropertyDashboardClient } from "@/components/properties/PropertyDashboardClient";

export const metadata: Metadata = {
  title: "Gestión de Unidades Funcionales y PIN AES-256-GCM",
  description:
    "Panel de Anfitriones I-bita: Alta y edición de Unidades Funcionales con fotografías optimizadas (CLS = 0), descuento de Media Estadía y cifrado AES-256-GCM del PIN de cerradura.",
};

export const dynamic = "force-dynamic";

export default async function HostPropertiesDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [hostRes, publicProps] = await Promise.all([
    listHostPropertiesAction(),
    listPublicProperties(),
  ]);

  const initialHostProperties = hostRes.ok ? hostRes.data : [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
            Épica 2 · Story 2.1 — Unidades Funcionales & Cifrado AES-256-GCM
          </span>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            Fotos Optimizadas WebP/AVIF (CLS = 0 · Máx. 5 MB)
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight pt-1">
          Panel de Unidades Funcionales del Anfitrión
        </h1>
        <p className="max-w-3xl text-sm sm:text-base text-[var(--text-secondary)]">
          Publicá tus propiedades con link directo (<code>/p/[slug]</code>), configurá tu tarifa base en ARS/USD/USDT y descuento mensual de Media Estadía (15%–50%). El PIN e instrucciones de cerradura electrónica se cifran en servidor con <code>AES-256-GCM</code> vinculando el <code>propertyId</code> como AAD desde el primer instante.
        </p>
      </header>

      <PropertyDashboardClient
        initialHostProperties={initialHostProperties}
        initialPublicProperties={publicProps}
        authenticatedEmail={user?.email ?? null}
      />
    </div>
  );
}
