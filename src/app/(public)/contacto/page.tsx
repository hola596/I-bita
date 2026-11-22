"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageSquare, ShieldCheck } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { submitContactInquiryAction } from "@/modules/contact/actions";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { ProgressiveFlowShell } from "@/components/ui/ProgressiveFlowShell";
import { usePreferences } from "@/components/providers/PreferencesProvider";

const HELP_TOPICS: readonly string[] = [
  "Publicar mi departamento",
  "Conectar calendario de Airbnb",
  "Consultar sobre un edificio o consorcio",
  "Ayuda con una reserva",
  "Otro tema",
];

const STEP_COPY: ReadonlyArray<{ title: string; subtitle: string }> = [
  {
    title: "¿En qué podemos ayudarte?",
    subtitle: "Elegí un tema rápido o escribí el motivo de tu consulta.",
  },
  {
    title: "Contanos cómo te ayudamos",
    subtitle:
      "Escribí tu duda en lenguaje simple; toda la charla sigue dentro de I-bita.",
  },
  {
    title: "¿A nombre de quién abrimos el hilo?",
    subtitle:
      "Dejanos tu nombre y correo para vincular la conversación con tu cuenta en I-bita.",
  },
];

export default function ContactoPage() {
  const { notify } = usePreferences();
  const [hasSession, setHasSession] = useState(false);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();

    async function syncSession() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (active) setHasSession(Boolean(user));
      } catch {
        if (active) setHasSession(false);
      }
    }

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setHasSession(Boolean(session?.user));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const [status, setStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
    conversationId?: string | null;
  }>({ type: "idle" });

  const isStep0Valid = subject.trim().length >= 4;
  const isStep1Valid = message.trim().length >= 10;
  const isStep2Valid =
    fullName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  function goToStep(next: 0 | 1 | 2) {
    setDirection(next > step ? "forward" : "backward");
    setStatus({ type: "idle" });
    setStep(next);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 0) {
      if (isStep0Valid) goToStep(1);
      return;
    }
    if (step === 1) {
      if (isStep1Valid) goToStep(2);
      return;
    }

    setStatus({ type: "loading" });

    const res = await submitContactInquiryAction({
      fullName: fullName.trim(),
      email: email.trim(),
      subject: subject.trim(),
      message: message.trim(),
    });

    if (res.ok) {
      setStatus({
        type: "success",
        message: hasSession
          ? "Creamos tu hilo de consulta dentro de I-bita. Podés seguir la respuesta desde el Centro de Mensajes."
          : "Registramos tu consulta dentro de I-bita. Iniciá sesión con el mismo correo para ver la respuesta desde tu cuenta.",
        conversationId: res.data.conversationId,
      });
      notify("¡Mensaje enviado dentro de I-bita!", "celebration", "chat");
    } else {
      setStatus({
        type: "error",
        message: res.error.message,
      });
    }
  }

  if (status.type === "success") {
    const messagesHref = status.conversationId
      ? `/mensajes?c=${encodeURIComponent(status.conversationId)}`
      : "/mensajes";

    return (
      <div className="mx-auto max-w-xl px-4 py-12 sm:px-6 space-y-5">
        <AchievementBanner
          icon="check"
          tone="emerald"
          title="¡Consulta registrada en I-bita!"
          description={
            hasSession
              ? status.message ?? "Ya podés seguir el hilo en Mensajes."
              : "Registramos tu consulta dentro de I-bita. Iniciá sesión con el mismo correo para ver la respuesta desde tu cuenta."
          }
          action={
            hasSession
              ? {
                  label: "Seguir la conversación en Mensajes",
                  href: messagesHref,
                }
              : {
                  label: "Ingresar a mi cuenta",
                  href: "/login",
                }
          }
        />
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="btn-secondary-3d inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-xs font-extrabold"
          >
            Volver al inicio
          </Link>
          <button
            type="button"
            onClick={() => {
              setSubject("");
              setMessage("");
              setFullName("");
              setEmail("");
              setStep(0);
              setStatus({ type: "idle" });
            }}
            className="btn-secondary-3d inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 text-xs font-extrabold"
          >
            Enviar otra consulta
          </button>
        </div>
      </div>
    );
  }

  const copy = STEP_COPY[step] ?? STEP_COPY[0]!;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <ProgressiveFlowShell
        eyebrow={`Paso ${step + 1} de 3 · Ayuda y contacto`}
        title={copy.title}
        subtitle={copy.subtitle}
        currentStep={step}
        totalSteps={3}
        direction={direction}
        mediaImageUrl="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80&fm=webp"
        mediaImageAlt="Atención cercana de I-bita para huéspedes, dueños y consorcios"
        mediaBadge="100% dentro de la plataforma"
        rightSlot={
          <div className="surface-card p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldCheck
                className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="text-xs font-extrabold text-[var(--text-primary)]">
                  Toda la comunicación ocurre dentro de I-bita
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {hasSession
                    ? "No derivamos chats afuera ni te pedimos salir de tu sesión. Si ya tenés una conversación abierta, podés responder directo en tu bandeja interna."
                    : "No derivamos chats afuera ni compartimos teléfonos. Cuando ingreses con tu cuenta vas a poder seguir todas tus consultas desde adentro."}
                </p>
              </div>
            </div>
            <div>
              {hasSession ? (
                <Link
                  href="/mensajes"
                  className="btn-secondary-3d inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold whitespace-nowrap"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                  <span>Abrir mis mensajes</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="btn-secondary-3d inline-flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold whitespace-nowrap"
                >
                  <span>Ingresar a mi cuenta</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
        }
        canGoBack={step > 0}
        onBack={() => goToStep(step === 2 ? 1 : 0)}
        canGoNext={
          step === 0 ? isStep0Valid : step === 1 ? isStep1Valid : isStep2Valid
        }
        onNext={
          step === 0
            ? () => goToStep(1)
            : step === 1
              ? () => goToStep(2)
              : undefined
        }
        nextLabel="Siguiente"
        submitButtonLabel={step === 2 ? "Enviar mi consulta" : undefined}
        isSubmitting={status.type === "loading"}
        submittingLabel="Enviando tu consulta..."
      >
        {step === 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {HELP_TOPICS.map((topic) => {
                const selected = subject.trim() === topic;
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() => setSubject(topic)}
                    aria-pressed={selected}
                    className={`rounded-full border px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                      selected
                        ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:border-[var(--brand-primary)]/40"
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>

            <div>
              <label htmlFor="subject" className="sr-only">
                ¿Sobre qué es tu consulta?
              </label>
              <input
                id="subject"
                name="subject"
                type="text"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="min-h-[52px] w-full rounded-full border-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] px-5 py-3 text-sm font-semibold focus:border-[var(--brand-primary)] focus:outline-none"
                placeholder="Escribí el asunto (mínimo 4 caracteres)"
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-1 text-xs">
              <span className="font-bold text-[var(--text-secondary)]">
                Tema:
              </span>
              <strong className="text-[var(--text-primary)]">{subject}</strong>
              <button
                type="button"
                onClick={() => goToStep(0)}
                className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
              >
                Cambiar
              </button>
            </div>

            <div>
              <label htmlFor="message" className="sr-only">
                Contanos cómo te ayudamos
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-primary)] p-4 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
                placeholder="Escribí tu duda con total tranquilidad (mínimo 10 caracteres)..."
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3.5">
            <div>
              <label
                htmlFor="fullName"
                className="block text-xs font-extrabold mb-1"
              >
                Tu nombre y apellido *
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
                placeholder="Ej: Martín Gómez"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-xs font-extrabold mb-1"
              >
                Tu correo de cuenta en I-bita *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
                placeholder="martin@ejemplo.com.ar"
              />
              <p className="mt-1 text-[11px] font-medium text-[var(--text-secondary)]">
                {hasSession
                  ? "Usamos tu correo para vincular esta consulta con tu centro de Mensajes dentro de I-bita."
                  : "Usamos tu correo para vincular esta consulta con tu cuenta en I-bita."}
              </p>
            </div>

            {status.type === "error" && (
              <p
                role="alert"
                className="rounded-xl bg-red-100 text-red-900 px-4 py-3 text-xs font-bold"
              >
                {status.message}
              </p>
            )}
          </div>
        )}
      </ProgressiveFlowShell>
    </form>
  );
}
