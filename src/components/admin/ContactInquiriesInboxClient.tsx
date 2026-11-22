"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Clock,
  Loader2,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import {
  updateContactInquiryStatusAction,
  type ContactInquiryRecord,
  type ContactInquiryStatus,
} from "@/modules/contact/admin-actions";
import { ensureSupportInquiryConversationAction } from "@/modules/messaging/actions";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface ContactInquiriesInboxClientProps {
  initialInquiries: ContactInquiryRecord[];
}

function formatDateAr(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

const STATUS_BADGE: Record<
  ContactInquiryStatus,
  { label: string; className: string }
> = {
  OPEN: {
    label: "Abierta",
    className:
      "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40",
  },
  IN_PROGRESS: {
    label: "En curso",
    className:
      "bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] border border-sky-600/30",
  },
  RESOLVED: {
    label: "Resuelta",
    className: "badge-consorcio-friendly",
  },
};

export function ContactInquiriesInboxClient({
  initialInquiries,
}: ContactInquiriesInboxClientProps) {
  const router = useRouter();
  const { notify } = usePreferences();
  const [inquiries, setInquiries] =
    useState<ContactInquiryRecord[]>(initialInquiries);
  const [filter, setFilter] = useState<ContactInquiryStatus | "ALL">("OPEN");
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "idle" | "success" | "error";
    text?: string;
  }>({ type: "idle" });

  const openCount = inquiries.filter((i) => i.status === "OPEN").length;
  const inProgressCount = inquiries.filter(
    (i) => i.status === "IN_PROGRESS"
  ).length;
  const resolvedCount = inquiries.filter((i) => i.status === "RESOLVED").length;

  const visibleInquiries =
    filter === "ALL"
      ? inquiries
      : inquiries.filter((item) => item.status === filter);

  async function handleOpenChat(inquiryId: string) {
    setOpeningChatId(inquiryId);
    setFeedback({ type: "idle" });

    const res = await ensureSupportInquiryConversationAction(inquiryId);
    setOpeningChatId(null);

    if (!res.ok) {
      setFeedback({ type: "error", text: res.error.message });
      return;
    }

    router.push(`/mensajes?c=${encodeURIComponent(res.data.conversationId)}`);
  }

  async function handleStatusChange(
    inquiryId: string,
    nextStatus: ContactInquiryStatus
  ) {
    setProcessingId(inquiryId);
    setFeedback({ type: "idle" });

    const currentNotes =
      notesById[inquiryId] ??
      inquiries.find((i) => i.id === inquiryId)?.adminNotes ??
      "";

    const res = await updateContactInquiryStatusAction({
      inquiryId,
      status: nextStatus,
      adminNotes: currentNotes,
    });

    setProcessingId(null);
    if (!res.ok) {
      setFeedback({ type: "error", text: res.error.message });
      return;
    }

    setInquiries((prev) =>
      prev.map((item) =>
        item.id === inquiryId
          ? {
              ...item,
              status: res.data.status,
              adminNotes: res.data.adminNotes,
              resolvedAt: res.data.resolvedAt,
            }
          : item
      )
    );

    const statusMsg =
      nextStatus === "RESOLVED"
        ? "Marcamos la consulta como resuelta."
        : nextStatus === "IN_PROGRESS"
          ? "Consulta marcada en seguimiento."
          : "Consulta reabierta.";
    setFeedback({ type: "success", text: statusMsg });
    notify(statusMsg, nextStatus === "RESOLVED" ? "celebration" : "info", "chat");
  }

  return (
    <div className="space-y-6">
      {/* Filtros de estado */}
      <div
        role="tablist"
        aria-label="Filtrar consultas por estado"
        className="flex flex-wrap gap-2"
      >
        {(
          [
            { key: "OPEN", label: `Abiertas (${openCount})` },
            { key: "IN_PROGRESS", label: `En curso (${inProgressCount})` },
            { key: "RESOLVED", label: `Resueltas (${resolvedCount})` },
            { key: "ALL", label: `Todas (${inquiries.length})` },
          ] as const
        ).map((tab) => {
          const active = filter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(tab.key)}
              className={`min-h-[40px] rounded-full px-4 text-xs font-extrabold transition-colors cursor-pointer ${
                active
                  ? "bg-[var(--brand-primary)] text-white shadow-xs"
                  : "border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {feedback.type === "success" && feedback.text && (
        <AchievementBanner
          icon="check"
          tone="emerald"
          title="Estado actualizado"
          description={feedback.text}
        />
      )}

      {feedback.type === "error" && feedback.text && (
        <p
          role="alert"
          className="rounded-2xl border border-red-600/40 bg-red-100 text-red-950 p-4 text-xs font-bold"
        >
          {feedback.text}
        </p>
      )}

      {visibleInquiries.length === 0 ? (
        <div className="surface-card p-8 text-center space-y-2">
          <p className="text-base font-extrabold">
            No hay consultas en esta vista
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Cada mensaje que llegue desde /contacto aparecerá acá y creará su
            hilo interno en Mensajes automáticamente.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {visibleInquiries.map((inq) => {
            const badge = STATUS_BADGE[inq.status];
            const busy = processingId === inq.id;
            const openingChat = openingChatId === inq.id;

            return (
              <li key={inq.id} className="surface-card p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">
                        {formatDateAr(inq.createdAt)}
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
                      {inq.subject}
                    </h2>
                    <p className="text-xs text-[var(--text-secondary)]">
                      <strong className="text-[var(--text-primary)]">
                        {inq.fullName}
                      </strong>{" "}
                      · {inq.email}
                    </p>
                  </div>

                  {/* Respuesta directa 100% dentro de I-bita */}
                  <button
                    type="button"
                    disabled={openingChat}
                    onClick={() => handleOpenChat(inq.id)}
                    className="btn-primary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold whitespace-nowrap disabled:opacity-50"
                  >
                    {openingChat ? (
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                    ) : (
                      <MessageSquare
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                    )}
                    <span>Responder en Mensajes</span>
                  </button>
                </div>

                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs sm:text-sm text-[var(--text-primary)] whitespace-pre-line leading-relaxed">
                  {inq.message}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                  <input
                    type="text"
                    maxLength={600}
                    value={notesById[inq.id] ?? inq.adminNotes ?? ""}
                    onChange={(e) =>
                      setNotesById((prev) => ({
                        ...prev,
                        [inq.id]: e.target.value,
                      }))
                    }
                    aria-label={`Nota interna para consulta de ${inq.fullName}`}
                    placeholder="Nota interna opcional (ej: Respondido en Mensajes)"
                    className="min-h-[42px] flex-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 text-xs"
                  />

                  {inq.status !== "IN_PROGRESS" &&
                    inq.status !== "RESOLVED" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          handleStatusChange(inq.id, "IN_PROGRESS")
                        }
                        className="btn-secondary-3d inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                      >
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>En curso</span>
                      </button>
                    )}

                  {inq.status !== "RESOLVED" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleStatusChange(inq.id, "RESOLVED")}
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
                      <span>Marcar resuelta</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleStatusChange(inq.id, "OPEN")}
                      className="btn-secondary-3d inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Reabrir</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
