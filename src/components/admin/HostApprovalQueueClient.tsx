"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquare, X } from "lucide-react";
import {
  reviewHostApplicationAction,
  type HostApplicationSummary,
} from "@/modules/auth/approval-actions";
import { ensureHostApprovalConversationAction } from "@/modules/messaging/actions";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface HostApprovalQueueClientProps {
  initialApplications: HostApplicationSummary[];
}

export function HostApprovalQueueClient({
  initialApplications,
}: HostApprovalQueueClientProps) {
  const router = useRouter();
  const { notify } = usePreferences();
  const [applications, setApplications] =
    useState<HostApplicationSummary[]>(initialApplications);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function handleOpenInternalChat(profileId: string) {
    setOpeningChatId(profileId);
    setErrorText(null);

    const res = await ensureHostApprovalConversationAction(profileId);
    setOpeningChatId(null);

    if (!res.ok) {
      setErrorText(res.error.message);
      return;
    }

    router.push(`/mensajes?c=${encodeURIComponent(res.data.conversationId)}`);
  }

  async function handleReview(
    profileId: string,
    decision: "APPROVED" | "REJECTED"
  ) {
    setProcessingId(profileId);
    setErrorText(null);
    setBannerText(null);

    const res = await reviewHostApplicationAction({
      profileId,
      decision,
      notes: notesById[profileId],
    });

    setProcessingId(null);
    if (!res.ok) {
      setErrorText(res.error.message);
      return;
    }

    setApplications((prev) =>
      prev.map((item) =>
        item.id === profileId
          ? {
              ...item,
              approvalStatus: res.data.approvalStatus,
              role:
                res.data.approvalStatus === "APPROVED"
                  ? item.role === "SUPERADMIN"
                    ? "SUPERADMIN"
                    : "HOST"
                  : item.role,
              notes: notesById[profileId]?.trim() || item.notes,
              propertiesCount: res.data.existingPropertiesCount,
            }
          : item
      )
    );

    const msg =
      decision === "APPROVED"
        ? "Anfitrión aprobado con éxito. Ya puede publicar propiedades."
        : "Marcamos la solicitud para corrección.";
    setBannerText(msg);
    notify(msg, decision === "APPROVED" ? "celebration" : "info", "shield");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {bannerText && (
        <AchievementBanner
          icon="check"
          tone="emerald"
          title="Revisión guardada"
          description={bannerText}
        />
      )}

      {errorText && (
        <p
          role="alert"
          className="rounded-2xl border border-red-600/40 bg-red-100 text-red-950 p-4 text-xs font-bold"
        >
          {errorText}
        </p>
      )}

      {applications.length === 0 ? (
        <div className="surface-card p-8 text-center space-y-2">
          <p className="text-base font-extrabold">
            No hay solicitudes pendientes de revisión
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Cuando un usuario envíe su registro de anfitrión va a aparecer acá
            para aprobarlo o pedir correcciones.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {applications.map((app) => {
            const isPending = app.approvalStatus === "PENDING_APPROVAL";
            const isApproved = app.approvalStatus === "APPROVED";
            const busy = processingId === app.id;
            const openingChat = openingChatId === app.id;

            return (
              <li key={app.id} className="surface-card p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <Icon3D
                      name={isApproved ? "check" : "contract"}
                      size="md"
                    />
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-extrabold">
                          {app.fullName || app.email}
                        </h2>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${
                            isApproved
                              ? "badge-consorcio-friendly"
                              : isPending
                                ? "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40"
                                : "bg-red-100 text-red-900 border border-red-400/50"
                          }`}
                        >
                          {isApproved
                            ? "Aprobado"
                            : isPending
                              ? "Pendiente de aprobación"
                              : "Corrección pedida"}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {app.email} · Tel. verificación:{" "}
                        {app.phoneWhatsapp || "No cargado"} ·{" "}
                        {app.propertiesCount}{" "}
                        {app.propertiesCount === 1
                          ? "propiedad"
                          : "propiedades"}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={openingChat}
                    onClick={() => handleOpenInternalChat(app.id)}
                    className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold whitespace-nowrap disabled:opacity-50"
                  >
                    {openingChat ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <MessageSquare
                        className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                        aria-hidden="true"
                      />
                    )}
                    <span>Abrir chat interno</span>
                  </button>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                    <dt className="text-[var(--text-secondary)]">CUIT/CUIL</dt>
                    <dd className="font-mono font-bold mt-0.5">
                      {app.cuitCuil || "Sin CUIT"}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                    <dt className="text-[var(--text-secondary)]">
                      CBU / CVU ({app.payoutSplitArsPct}% ARS)
                    </dt>
                    <dd className="font-mono font-bold mt-0.5">
                      {app.maskedCbuCvu}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3">
                    <dt className="text-[var(--text-secondary)]">
                      Wallet Polygon ({100 - app.payoutSplitArsPct}% USDT)
                    </dt>
                    <dd className="font-mono font-bold mt-0.5">
                      {app.shortWallet}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                  <input
                    type="text"
                    value={notesById[app.id] ?? app.notes ?? ""}
                    onChange={(e) =>
                      setNotesById((prev) => ({
                        ...prev,
                        [app.id]: e.target.value,
                      }))
                    }
                    placeholder="Nota opcional para el anfitrión..."
                    className="min-h-[42px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs"
                  />

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleReview(app.id, "APPROVED")}
                    className="btn-primary-3d inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>Aprobar anfitrión</span>
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleReview(app.id, "REJECTED")}
                    className="btn-secondary-3d inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Pedir corrección</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
