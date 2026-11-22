"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  getConversationMessagesAction,
  listMyConversationsAction,
  sendConversationMessageAction,
} from "@/modules/messaging/actions";
import {
  CONVERSATION_KIND_LABELS,
  type ConversationKind,
  type ConversationMessageRecord,
  type ConversationSummary,
  type SenderRole,
} from "@/modules/messaging/validators";
import { Icon3D } from "@/components/ui/Icon3D";
import { usePreferences } from "@/components/providers/PreferencesProvider";

interface MessagesCenterClientProps {
  currentUserId: string;
  currentUserEmail: string;
  canAccessAdmin: boolean;
  initialConversations: ConversationSummary[];
  initialActiveConversation: ConversationSummary | null;
  initialMessages: ConversationMessageRecord[];
  startOnThreadMobile?: boolean;
}

const KIND_BADGE_CLASS: Record<ConversationKind, string> = {
  BOOKING_INTERVIEW:
    "bg-emerald-500/15 text-emerald-900 dark:text-emerald-300 border border-emerald-500/35",
  BOOKING_STAY:
    "bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] border border-sky-600/30",
  SUPPORT_INQUIRY:
    "bg-[var(--surface-tint)] text-[var(--brand-primary)] border border-[var(--brand-primary)]/30",
  HOST_APPROVAL:
    "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/35",
};

const ROLE_LABELS: Record<SenderRole, string> = {
  GUEST: "Huésped",
  HOST: "Anfitrión",
  ADMIN: "Equipo I-bita",
  SYSTEM: "Sistema I-bita",
};

const EXTERNAL_CONTACT_PATTERN =
  /(@[a-z0-9.-]+|https?:\/\/|wa\.me|whatsapp|\+?\d[\d\s()-]{7,})/i;

function formatDateTimeAr(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function MessagesCenterClient({
  currentUserId,
  canAccessAdmin,
  initialConversations,
  initialActiveConversation,
  initialMessages,
  startOnThreadMobile = false,
}: MessagesCenterClientProps) {
  const { notify } = usePreferences();

  const [conversations, setConversations] = useState<ConversationSummary[]>(
    initialConversations
  );
  const [filterKind, setFilterKind] = useState<ConversationKind | "ALL">("ALL");
  const [activeConversation, setActiveConversation] =
    useState<ConversationSummary | null>(initialActiveConversation);
  const [messages, setMessages] =
    useState<ConversationMessageRecord[]>(initialMessages);
  const [mobileShowingThread, setMobileShowingThread] =
    useState<boolean>(startOnThreadMobile && Boolean(initialActiveConversation));

  const [draftText, setDraftText] = useState("");
  const [loadingThread, setLoadingThread] = useState(false);
  const [refreshingList, setRefreshingList] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const visibleConversations = useMemo(() => {
    if (filterKind === "ALL") return conversations;
    if (filterKind === "BOOKING_INTERVIEW") {
      return conversations.filter(
        (conv) =>
          conv.kind === "BOOKING_INTERVIEW" || conv.kind === "BOOKING_STAY"
      );
    }
    return conversations.filter((conv) => conv.kind === filterKind);
  }, [conversations, filterKind]);

  const hasExternalContactHint = EXTERNAL_CONTACT_PATTERN.test(draftText);

  const quickReplies: readonly string[] = useMemo(() => {
    if (!activeConversation) return [];
    if (activeConversation.kind === "BOOKING_STAY") {
      return [
        "¡Reserva confirmada! Te comparto las instrucciones de ingreso para tu llegada.",
        "¿A qué hora estimás llegar al edificio así coordinamos el ingreso?",
        "Recibimos tu verificación y pago correctamente. ¡Te esperamos!",
      ];
    }
    if (activeConversation.kind === "BOOKING_INTERVIEW") {
      return [
        "¿En qué horario te queda cómodo conversar por acá?",
        "Confirmo disponibilidad y los requisitos de la estadía.",
        "¿Podrías contarme un poco más sobre el motivo del viaje?",
      ];
    }
    if (activeConversation.kind === "HOST_APPROVAL") {
      return [
        "Acabo de actualizar mis datos para revisión.",
        "¿Falta algún comprobante o dato de mi cuenta?",
      ];
    }
    return [
      "Gracias, recibimos tu consulta y la estamos revisando.",
      "¿Podés sumarnos un detalle más por acá para ayudarte mejor?",
    ];
  }, [activeConversation]);

  async function selectConversation(convId: string) {
    setLoadingThread(true);
    setErrorText(null);
    setMobileShowingThread(true);

    const res = await getConversationMessagesAction(convId);
    setLoadingThread(false);

    if (!res.ok) {
      setErrorText(res.error.message);
      return;
    }

    setActiveConversation(res.data.conversation);
    setMessages(res.data.messages);
  }

  async function refreshAll() {
    setRefreshingList(true);
    setErrorText(null);

    const listRes = await listMyConversationsAction();
    if (!listRes.ok) {
      setRefreshingList(false);
      setErrorText(listRes.error.message);
      return;
    }

    setConversations(listRes.data);

    if (activeConversation) {
      const msgRes = await getConversationMessagesAction(activeConversation.id);
      if (msgRes.ok) {
        setActiveConversation(msgRes.data.conversation);
        setMessages(msgRes.data.messages);
      }
    }

    setRefreshingList(false);
    notify("Conversaciones actualizadas.", "info", "chat");
  }

  async function handleSendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activeConversation) return;
    const clean = draftText.trim();
    if (!clean || sending) return;

    setSending(true);
    setErrorText(null);

    const res = await sendConversationMessageAction({
      conversationId: activeConversation.id,
      body: clean,
      messageType:
        activeConversation.kind === "BOOKING_INTERVIEW"
          ? "INTERVIEW_PROPOSAL"
          : "TEXT",
    });

    setSending(false);
    if (!res.ok) {
      setErrorText(res.error.message);
      return;
    }

    const saved = res.data;
    setMessages((prev) => [...prev, saved]);
    setDraftText("");
    setConversations((prev) => {
      const updated = prev.map((item) =>
        item.id === activeConversation.id
          ? {
              ...item,
              lastMessagePreview: saved.body.slice(0, 140),
              lastMessageAt: saved.createdAt,
            }
          : item
      );
      return [...updated].sort((a, b) =>
        b.lastMessageAt.localeCompare(a.lastMessageAt)
      );
    });
  }

  function resolveContextAction(conv: ConversationSummary): {
    href: string;
    label: string;
  } | null {
    if (conv.bookingId) {
      if (conv.hostId === currentUserId) {
        return {
          href: "/dashboard/propiedades",
          label: "Gestionar solicitud en Panel",
        };
      }
      return {
        href: `/checkout/${conv.bookingId}`,
        label: "Ver estado de reserva / pago",
      };
    }
    if (conv.contactInquiryId && canAccessAdmin) {
      return {
        href: "/admin/consultas",
        label: "Ver bandeja de soporte",
      };
    }
    if (conv.kind === "HOST_APPROVAL") {
      return canAccessAdmin && conv.guestOrRequesterId !== currentUserId
        ? {
            href: "/admin/aprobaciones",
            label: "Revisar en Aprobaciones",
          }
        : {
            href: "/onboarding/anfitrion",
            label: "Ver estado de alta",
          };
    }
    return null;
  }

  const contextAction = activeConversation
    ? resolveContextAction(activeConversation)
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8 sm:px-6 lg:px-8 space-y-5">
      {/* Cabecera unificada */}
      <header className="surface-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Icon3D name="chat" size="lg" />
          <div className="space-y-1">
            <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[11px] font-extrabold">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              100% dentro de I-bita · Historial protegido
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Centro de Mensajes
            </h1>
            <p className="text-xs sm:text-sm text-[var(--text-secondary)]">
              Conversaciones de reservas, entrevistas de estadía larga,
              aprobaciones y soporte en un solo lugar.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshingList}
            className="btn-secondary-3d inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshingList ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>Actualizar</span>
          </button>
          <Link
            href="/contacto"
            className="btn-primary-3d inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold whitespace-nowrap"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Nueva consulta a soporte</span>
          </Link>
        </div>
      </header>

      {errorText && (
        <p
          role="alert"
          className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-900 dark:text-red-300"
        >
          {errorText}
        </p>
      )}

      {/* Split View responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Lista de conversaciones */}
        <aside
          aria-label="Lista de conversaciones"
          className={`lg:col-span-4 surface-card p-4 flex-col gap-3.5 ${
            mobileShowingThread && activeConversation ? "hidden lg:flex" : "flex"
          }`}
        >
          <div
            role="tablist"
            aria-label="Filtrar conversaciones"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1"
          >
            {(
              [
                { key: "ALL", label: `Todos (${conversations.length})` },
                { key: "BOOKING_INTERVIEW", label: "Estadías" },
                { key: "SUPPORT_INQUIRY", label: "Soporte" },
                { key: "HOST_APPROVAL", label: "Aprobación" },
              ] as const
            ).map((tab) => {
              const active = filterKind === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilterKind(tab.key)}
                  className={`min-h-[36px] shrink-0 rounded-full px-3 text-xs font-extrabold transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                      : "border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {visibleConversations.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 text-center space-y-2 my-auto">
              <p className="text-sm font-extrabold">
                No hay conversaciones acá todavía
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                Cuando envíes una consulta de ayuda, solicites una estadía de 1
                a 6 meses o inicies tu alta como anfitrión, vas a ver el chat en
                esta lista.
              </p>
            </div>
          ) : (
            <ul className="space-y-2 max-h-[540px] overflow-y-auto pr-0.5">
              {visibleConversations.map((conv) => {
                const isSelected = activeConversation?.id === conv.id;
                const counterpart =
                  conv.hostId === currentUserId
                    ? conv.requesterName || conv.requesterEmail || "Huésped"
                    : conv.hostName ||
                      (conv.kind === "SUPPORT_INQUIRY"
                        ? "Soporte I-bita"
                        : conv.kind === "HOST_APPROVAL"
                          ? conv.requesterName || "Equipo de aprobación"
                          : "Anfitrión I-bita");

                return (
                  <li key={conv.id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(conv.id)}
                      className={`w-full text-left rounded-2xl border p-3.5 space-y-1.5 transition-colors cursor-pointer ${
                        isSelected
                          ? "border-[var(--brand-primary)] bg-[var(--surface-tint)]/60 shadow-xs"
                          : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 hover:border-[var(--brand-primary)]/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${KIND_BADGE_CLASS[conv.kind]}`}
                        >
                          {CONVERSATION_KIND_LABELS[conv.kind]}
                        </span>
                        <span className="text-[10px] font-bold text-[var(--text-secondary)] shrink-0">
                          {formatDateTimeAr(conv.lastMessageAt)}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm font-extrabold text-[var(--text-primary)] line-clamp-1">
                        {conv.subject}
                      </p>

                      <p className="text-[11px] font-bold text-[var(--text-secondary)] truncate">
                        Con: {counterpart}
                      </p>

                      {conv.lastMessagePreview && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-snug">
                          {conv.lastMessagePreview}
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Hilo activo */}
        <section
          aria-label="Hilo de mensajes seleccionado"
          className={`lg:col-span-8 surface-card overflow-hidden flex-col min-h-[500px] ${
            !mobileShowingThread && activeConversation ? "hidden lg:flex" : "flex"
          }`}
        >
          {!activeConversation ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
              <Icon3D name="chat" size="lg" />
              <h2 className="text-lg font-extrabold">
                Elegí una conversación para empezar
              </h2>
              <p className="max-w-md text-xs sm:text-sm text-[var(--text-secondary)]">
                Todas tus consultas, entrevistas previas y revisiones quedan
                guardadas con seguridad dentro de I-bita.
              </p>
            </div>
          ) : (
            <>
              {/* Header del hilo */}
              <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileShowingThread(false)}
                    className="lg:hidden btn-secondary-3d inline-flex min-h-[38px] items-center gap-1 rounded-full px-3 text-xs font-extrabold shrink-0"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Conversaciones</span>
                  </button>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold ${KIND_BADGE_CLASS[activeConversation.kind]}`}
                      >
                        {CONVERSATION_KIND_LABELS[activeConversation.kind]}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                        Conversación protegida dentro de I-bita
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] truncate">
                      {activeConversation.subject}
                    </h2>
                  </div>
                </div>

                {contextAction && (
                  <Link
                    href={contextAction.href}
                    className="btn-secondary-3d inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold whitespace-nowrap"
                  >
                    <span>{contextAction.label}</span>
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>

              {/* Lista cronológica */}
              <div className="flex-1 max-h-[430px] overflow-y-auto p-4 sm:p-5 space-y-3 bg-[var(--bg-secondary)]/30">
                {loadingThread ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-xs font-bold text-[var(--text-secondary)]">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    <span>Cargando conversación...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-[var(--text-secondary)] py-10">
                    Todavía no hay mensajes en este hilo. Escribí el primero
                    abajo.
                  </p>
                ) : (
                  messages.map((msg) => {
                    if (
                      msg.senderRole === "SYSTEM" ||
                      msg.messageType === "SYSTEM_NOTICE"
                    ) {
                      return (
                        <div key={msg.id} className="flex justify-center">
                          <div className="max-w-lg rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2.5 text-center text-xs text-[var(--text-secondary)] space-y-1">
                            <p className="font-semibold text-[var(--text-primary)] whitespace-pre-line">
                              {msg.body}
                            </p>
                            <p className="text-[10px]">
                              {msg.senderName} · {formatDateTimeAr(msg.createdAt)}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    const isMine = msg.senderId === currentUserId;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 space-y-1.5 shadow-xs ${
                            isMine
                              ? "bg-[var(--brand-primary)] text-white rounded-br-sm"
                              : "border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-bl-sm"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-extrabold opacity-90">
                            <span>{msg.senderName}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 ${
                                isMine
                                  ? "bg-white/20 text-white"
                                  : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                              }`}
                            >
                              {ROLE_LABELS[msg.senderRole]}
                            </span>
                            {msg.messageType === "INTERVIEW_PROPOSAL" && (
                              <span
                                className={`rounded-full px-2 py-0.5 ${
                                  isMine
                                    ? "bg-emerald-400/25 text-white"
                                    : "bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)]"
                                }`}
                              >
                                Entrevista
                              </span>
                            )}
                          </div>

                          <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                            {msg.body}
                          </p>

                          <p className="text-[10px] opacity-75 text-right">
                            {formatDateTimeAr(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Composer + respuestas rápidas */}
              <form
                onSubmit={handleSendMessage}
                className="border-t border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 space-y-3"
              >
                {quickReplies.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {quickReplies.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setDraftText(chip)}
                        className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-[11px] font-bold text-[var(--text-secondary)] hover:border-[var(--brand-primary)] hover:text-[var(--text-primary)] cursor-pointer whitespace-nowrap"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}

                {hasExternalContactHint && (
                  <div
                    role="status"
                    className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-900 dark:text-amber-300"
                  >
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <span>
                      Por tu seguridad y respaldo ante disputas, evitá compartir
                      teléfonos, enlaces o correos externos. Coordiná toda la
                      conversación por acá.
                    </span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
                  <label htmlFor="in-platform-message-input" className="sr-only">
                    Escribí tu mensaje dentro de I-bita
                  </label>
                  <textarea
                    id="in-platform-message-input"
                    name="body"
                    rows={2}
                    maxLength={2500}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder="Escribí tu mensaje sin salir de I-bita..."
                    className="flex-1 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/60 p-3 text-xs sm:text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                  />

                  <button
                    type="submit"
                    disabled={sending || draftText.trim().length === 0}
                    className="btn-primary-3d inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl px-5 text-xs sm:text-sm font-extrabold disabled:opacity-50 whitespace-nowrap"
                  >
                    {sending ? (
                      <>
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" aria-hidden="true" />
                        <span>Enviar mensaje</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
