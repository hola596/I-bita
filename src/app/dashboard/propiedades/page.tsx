import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listHostPropertiesAction } from "@/modules/properties/actions";
import { listPublicProperties } from "@/modules/properties/queries";
import { listHostConsortiumConfigsAction } from "@/modules/consortium/actions";
import { PropertyDashboardClient } from "@/components/properties/PropertyDashboardClient";

export const metadata: Metadata = {
  title: "Gestión de Unidades Funcionales, Consorcio Friendly y PIN AES-256-GCM",
  description:
    "Panel de Anfitriones I-bita: Alta y edición de Unidades Funcionales, configuración del Perfil Consorcio Friendly y Micro-Canon (1%–2%), sincronización iCal y cifrado AES-256-GCM del PIN de cerradura.",
};

export const dynamic = "force-dynamic";

export default async function HostPropertiesDashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [hostRes, publicProps, consortiumRes] = await Promise.all([
    listHostPropertiesAction(),
    listPublicProperties(),
    listHostConsortiumConfigsAction(),
  ]);

  const initialHostProperties = hostRes.ok ? hostRes.data : [];
  const initialConsortiumConfigs = consortiumRes.ok ? consortiumRes.data : {};

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-2 border-b border-[var(--border-subtle)] pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
            Épica 2 & 3 · Unidades Funcionales, Consorcio Friendly & AES-256-GCM
          </span>
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            Micro-Canon Consorcial (1%–2% c/ decimal.js) · Fotos WebP (CLS = 0)
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight pt-1">
          Panel de Unidades Funcionales y Perfil Consorcio Friendly
        </h1>
        <p className="max-w-3xl text-sm sm:text-base text-[var(--text-secondary)]">
          Publicá tus propiedades con link directo (<code>/p/[slug]</code>), activá el sello verificado <strong>&ldquo;Propiedad Consorcio Friendly · Pase QR&rdquo;</strong> configurando el WhatsApp de portería, email de administración y regla de Micro-Canon (<code>0%</code>, <code>1%</code>, <code>1.5%</code> o <code>2%</code>). El PIN de cerradura electrónica se cifra en servidor con <code>AES-256-GCM</code>.
        </p>
      </header>

      <PropertyDashboardClient
        initialHostProperties={initialHostProperties}
        initialPublicProperties={publicProps}
        initialConsortiumConfigs={initialConsortiumConfigs}
        authenticatedEmail={user?.email ?? null}
      />
    </div>
  );
}
