"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  getHostKycEvidenceSignedUrlsAction,
  reviewGuestIdentityAction,
  type HostGuestIdentityItem,
  type HostKycEvidenceUrls,
} from "@/modules/kyc/host-review-actions";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export interface HostIdentityReviewsPanelProps {
  initialItems: HostGuestIdentityItem[];
}

export function HostIdentityReviewsPanel({
  initialItems,
}: HostIdentityReviewsPanelProps) {
  const { notify } = usePreferences();
  const [items, setItems] = useState<HostGuestIdentityItem[]>(initialItems);

  const manualReviewCount = items.filter(
    (item) => item.status === "MANUAL_REVIEW"
  ).length;
  const verifiedCount = items.filter(
    (item) => item.status === "VERIFIED"
  ).length;

  const [filter, setFilter] = useState<"MANUAL_REVIEW" | "VERIFIED" | "ALL">(
    manualReviewCount > 0 ? "MANUAL_REVIEW" : "ALL"
  );
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadingPhotosId, setLoadingPhotosId] = useState<string | null>(null);
  const [photosById, setPhotosById] = useState<
    Record<string, HostKycEvidenceUrls | null>
  >({});
  const [feedback, setFeedback] = useState<{
    type: "idle" | "success" | "error";
    text?: string;
  }>({ type: "idle" });

  const visibleItems =
    filter === "MANUAL_REVIEW"
      ? items.filter((item) => item.status === "MANUAL_REVIEW")
      : filter === "VERIFIED"
        ? items.filter((item) => item.status === "VERIFIED")
        : items;

  async function handleTogglePhotos(verificationId: string) {
    if (photosById[verificationId]) {
      setPhotosById((prev) => ({ ...prev, [verificationId]: null }));
      return;
    }

    setLoadingPhotosId(verificationId);
    setFeedback({ type: "idle" });
    const res = await getHostKycEvidenceSignedUrlsAction(verificationId);
    setLoadingPhotosId(null);

    if (!res.ok) {
      setFeedback({ type: "error", text: res.error.message });
      return;
    }

    setPhotosById((prev) => ({ ...prev, [verificationId]: res.data }));
  }

  async function handleDecision(
    verificationId: string,
    decision: "APPROVE" | "REJECT"
  ) {
    setBusyId(verificationId);
    setFeedback({ type: "idle" });

    const res = await reviewGuestIdentityAction({
      verificationId,
      decision,
      notes: notesById[verificationId] ?? "",
    });

    setBusyId(null);

    if (!res.ok) {
      setFeedback({ type: "error", text: res.error.message });
      return;
    }

    const updated = res.data;
    setItems((prev) =>
      prev.map((item) => {
        if (item.bookingId !== updated.bookingId) return item;
        if (item.verificationId === updated.verificationId) {
          return {
            ...item,
            status: updated.status,
            bookingStatus: updated.bookingStatus,
            verifiedAdultsCount: updated.verifiedAdultsCount,
            declaredAdultsCount: updated.declaredAdultsCount,
            verifiedAt:
              updated.status === "VERIFIED" ? new Date().toISOString() : null,
          };
        }
        return {
          ...item,
          bookingStatus: updated.bookingStatus,
          verifiedAdultsCount: updated.verifiedAdultsCount,
          declaredAdultsCount: updated.declaredAdultsCount,
        };
      })
    );

    setFeedback({
      type: "success",
      text:
        decision === "APPROVE"
          ? "¡Identidad confirmada! Actualizamos la reserva y notificamos al huésped."
          : "Solicitamos al huésped una nueva foto del DNI y selfie en Mensajes y por Push.",
    });

    notify(
      decision === "APPROVE"
        ? "¡Identidad confirmada con éxito!"
        : "Pedido de nueva foto enviado al huésped.",
      decision === "APPROVE" ? "celebration" : "info",
      decision === "APPROVE" ? "trophy" : "shield"
    );
  }

  return (
    <section
      aria-labelledby="host-identity-reviews-heading"
      className="surface-card p-5 sm:p-6 space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <Icon3D name="face" size="md" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="host-identity-reviews-heading"
                className="text-lg sm:text-xl font-extrabold"
              >
                Identidades y check-in biométrico
              </h2>
              {manualReviewCount > 0 && (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:text-amber-300">
                  {manualReviewCount}{" "}
                  {manualReviewCount === 1
                    ? "pendiente de tu revisión"
                    : "pendientes de tu revisión"}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Si un huésped quedó en zona intermedia, revisá sus datos validados y las fotos temporales para confirmarlo o pedir una nueva captura.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Filtrar validaciones de identidad"
          className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs font-extrabold"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === "MANUAL_REVIEW"}
            onClick={() => setFilter("MANUAL_REVIEW")}
            className={`rounded-full px-3 py-1.5 cursor-pointer transition-colors ${
              filter === "MANUAL_REVIEW"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            En revisión ({manualReviewCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "VERIFIED"}
            onClick={() => setFilter("VERIFIED")}
            className={`rounded-full px-3 py-1.5 cursor-pointer transition-colors ${
              filter === "VERIFIED"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Confirmadas ({verifiedCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === "ALL"}
            onClick={() => setFilter("ALL")}
            className={`rounded-full px-3 py-1.5 cursor-pointer transition-colors ${
              filter === "ALL"
                ? "bg-[var(--brand-primary)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Todas ({items.length})
          </button>
        </div>
      </div>

      {feedback.type !== "idle" && feedback.text && (
        <p
          role={feedback.type === "error" ? "alert" : "status"}
          className={`rounded-2xl px-4 py-3 text-xs font-extrabold ${
            feedback.type === "error"
              ? "border border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300"
              : "badge-consorcio-friendly"
          }`}
        >
          {feedback.text}
        </p>
      )}

      {visibleItems.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs font-semibold text-[var(--text-secondary)]">
          {filter === "MANUAL_REVIEW"
            ? "No tenés identidades en revisión manual en este momento."
            : "Todavía no hay validaciones de identidad en esta vista."}
        </p>
      ) : (
        <ul className="space-y-3.5">
          {visibleItems.map((item) => {
            const isBusy = busyId === item.verificationId;
            const isLoadingPhotos = loadingPhotosId === item.verificationId;
            const photos = photosById[item.verificationId];
            const simPct =
              item.similarityScore !== null
                ? Math.round(item.similarityScore * 100)
                : item.biometricConfidenceScore !== null
                  ? Math.round(item.biometricConfidenceScore)
                  : null;
            const livePct =
              item.livenessScore !== null
                ? Math.round(item.livenessScore * 100)
                : null;
            const canReview =
              item.status === "MANUAL_REVIEW" || item.status === "REJECTED";

            return (
              <li
                key={item.verificationId}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/65 p-4 sm:p-5 space-y-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.status === "VERIFIED" ? (
                        <span className="badge-consorcio-friendly inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Identidad confirmada
                        </span>
                      ) : item.status === "MANUAL_REVIEW" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-950 dark:text-amber-200">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          En revisión manual
                        </span>
                      ) : item.status === "REJECTED" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-900 px-2.5 py-0.5 text-[11px] font-extrabold">
                          Requiere nueva captura
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                          Pendiente de huésped
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--text-secondary)]">
                        <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                        {item.checkIn} → {item.checkOut} ({item.nightsCount}{" "}
                        noches)
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold">
                      {item.fullNameExtracted ??
                        (item.isPrimaryGuest
                          ? "Adulto titular (aún sin escaneo)"
                          : "Acompañante adulto (aún sin escaneo)")}{" "}
                      ·{" "}
                      <span className="text-[var(--brand-primary)]">
                        {item.propertyTitle}
                      </span>
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                      {item.maskedDocumentNumber && (
                        <span className="font-mono font-bold text-[var(--text-primary)]">
                          DNI {item.maskedDocumentNumber}
                        </span>
                      )}
                      {item.birthDate && <span>Nac.: {item.birthDate}</span>}
                      {simPct !== null && (
                        <span className="rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-extrabold">
                          Similitud {simPct}%
                        </span>
                      )}
                      {livePct !== null && (
                        <span className="rounded-md bg-[var(--bg-primary)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-extrabold">
                          Vida {livePct}%
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" aria-hidden="true" />
                        Grupo: {item.verifiedAdultsCount}/
                        {item.declaredAdultsCount} confirmados
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.hasEvidencePhotos && (
                      <button
                        type="button"
                        disabled={isLoadingPhotos}
                        onClick={() => void handleTogglePhotos(item.verificationId)}
                        className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold disabled:opacity-50"
                      >
                        {isLoadingPhotos ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : photos ? (
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>
                          {photos ? "Ocultar fotos" : "Ver fotos (DNI + Selfie)"}
                        </span>
                      </button>
                    )}

                    <Link
                      href={`/mensajes?booking=${item.bookingId}`}
                      className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold"
                    >
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Abrir Mensajes</span>
                    </Link>
                  </div>
                </div>

                {photos && (
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
                      <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Comparación privada temporal (expira en 5 min · Ley 25.326)
                      </span>
                      {item.evidenceExpiresAt && (
                        <span>
                          Se elimina automáticamente antes de{" "}
                          {new Date(item.evidenceExpiresAt).toLocaleString("es-AR")}
                        </span>
                      )}
                    </div>

                    {photos.purged ? (
                      <p className="text-xs font-semibold text-[var(--text-secondary)]">
                        Las imágenes crudas ya fueron purgadas por política de privacidad.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <figure className="space-y-1.5">
                          <figcaption className="text-[11px] font-extrabold text-[var(--text-secondary)]">
                            Frente del DNI
                          </figcaption>
                          {photos.dniFrontUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={photos.dniFrontUrl}
                              alt="Frente del DNI enviado por el huésped"
                              className="w-full max-h-60 rounded-xl border border-[var(--border-subtle)] object-contain bg-black/5"
                            />
                          ) : (
                            <p className="text-xs text-[var(--text-secondary)]">
                              Imagen no disponible.
                            </p>
                          )}
                        </figure>

                        <figure className="space-y-1.5">
                          <figcaption className="text-[11px] font-extrabold text-[var(--text-secondary)]">
                            Selfie en vivo
                          </figcaption>
                          {photos.selfieUrl ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={photos.selfieUrl}
                              alt="Selfie en vivo tomada por el huésped"
                              className="w-full max-h-60 rounded-xl border border-[var(--border-subtle)] object-contain bg-black/5"
                            />
                          ) : (
                            <p className="text-xs text-[var(--text-secondary)]">
                              Imagen no disponible.
                            </p>
                          )}
                        </figure>
                      </div>
                    )}
                  </div>
                )}

                {canReview && (
                  <div className="space-y-2.5 border-t border-[var(--border-subtle)] pt-3">
                    <input
                      type="text"
                      maxLength={500}
                      value={notesById[item.verificationId] ?? ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({
                          ...prev,
                          [item.verificationId]: e.target.value,
                        }))
                      }
                      aria-label={`Nota para ${item.fullNameExtracted ?? "el huésped"}`}
                      placeholder="Nota opcional para el huésped (ej. motivo si pedís otra foto)"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void handleDecision(item.verificationId, "APPROVE")
                        }
                        className="btn-primary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2
                            className="h-3.5 w-3.5 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span>Confirmar identidad</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          void handleDecision(item.verificationId, "REJECT")
                        }
                        className="btn-secondary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold text-red-700 dark:text-red-400 disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Pedir nueva foto</span>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
