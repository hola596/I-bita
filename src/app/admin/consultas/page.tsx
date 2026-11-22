import type { Metadata } from "next";
import Link from "next/link";
import { listContactInquiriesAction } from "@/modules/contact/admin-actions";
import { ContactInquiriesInboxClient } from "@/components/admin/ContactInquiriesInboxClient";
import { Icon3D } from "@/components/ui/Icon3D";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bandeja de Consultas de Ayuda | I-bita Argentina",
  robots: { index: false, follow: false },
};

export default async function AdminContactInquiriesPage() {
  const res = await listContactInquiriesAction();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <header className="surface-card p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Icon3D name="chat" size="lg" />
            <div>
              <span className="badge-consorcio-friendly rounded-full px-3 py-0.5 text-xs font-extrabold">
                Bandeja operativa de Ayuda
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                Consultas entrantes de I-bita
              </h1>
            </div>
          </div>

          <Link
            href="/"
            className="btn-secondary-3d inline-flex min-h-[42px] items-center rounded-xl px-4 text-xs font-extrabold"
          >
            Volver al inicio
          </Link>
        </div>

        <nav
          aria-label="Secciones de administración"
          className="flex flex-wrap gap-2 border-t border-[var(--border-subtle)] pt-4"
        >
          <Link
            href="/admin/consultas"
            aria-current="page"
            className="btn-primary-3d inline-flex min-h-[38px] items-center rounded-full px-4 text-xs font-extrabold"
          >
            Consultas de ayuda
          </Link>
          <Link
            href="/admin/aprobaciones"
            className="btn-secondary-3d inline-flex min-h-[38px] items-center rounded-full px-4 text-xs font-extrabold"
          >
            Aprobación de anfitriones
          </Link>
        </nav>
      </header>

      {!res.ok ? (
        <section className="surface-card p-6 text-center space-y-3">
          <p className="text-sm font-extrabold">{res.error.message}</p>
          <Link
            href="/login"
            className="btn-primary-3d inline-flex min-h-[44px] items-center rounded-xl px-5 text-xs font-extrabold"
          >
            Ingresar a mi cuenta
          </Link>
        </section>
      ) : (
        <ContactInquiriesInboxClient initialInquiries={res.data} />
      )}
    </div>
  );
}
