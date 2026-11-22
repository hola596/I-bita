import type { Metadata } from "next";
import Link from "next/link";
import { listPendingHostApplicationsAction } from "@/modules/auth/approval-actions";
import { HostApprovalQueueClient } from "@/components/admin/HostApprovalQueueClient";
import { Icon3D } from "@/components/ui/Icon3D";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aprobación de Anfitriones | I-bita Argentina",
  robots: { index: false, follow: false },
};

export default async function HostApprovalsPage() {
  const res = await listPendingHostApplicationsAction();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <header className="surface-card p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <Icon3D name="shield" size="lg" />
            <div>
              <span className="badge-consorcio-friendly rounded-full px-3 py-0.5 text-xs font-extrabold">
                Capa de aprobación de anfitriones
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
                Solicitudes para publicar en I-bita
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
            className="btn-secondary-3d inline-flex min-h-[38px] items-center rounded-full px-4 text-xs font-extrabold"
          >
            Consultas de ayuda
          </Link>
          <Link
            href="/admin/aprobaciones"
            aria-current="page"
            className="btn-primary-3d inline-flex min-h-[38px] items-center rounded-full px-4 text-xs font-extrabold"
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
        <HostApprovalQueueClient initialApplications={res.data} />
      )}
    </div>
  );
}
