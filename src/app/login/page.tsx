"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  LogOut,
  Mail,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Icon3D } from "@/components/ui/Icon3D";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { ProgressiveFlowShell } from "@/components/ui/ProgressiveFlowShell";
import { usePreferences } from "@/components/providers/PreferencesProvider";

export default function LoginPage() {
  const router = useRouter();
  const { notify } = usePreferences();
  const [step, setStep] = useState<0 | 1>(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [isGuestRoleHint, setIsGuestRoleHint] = useState(false);
  const [activeEmail, setActiveEmail] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "idle" | "error" | "success";
    text?: string;
  }>({
    type: "idle",
  });
  const [loading, setLoading] = useState(false);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === 1) {
      passwordInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    let mounted = true;

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("rol") === "huesped") {
        setIsGuestRoleHint(true);
        setMode("signup");
      }
    } catch {
      // Sin parámetros
    }

    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (mounted && data.user?.email) {
          setActiveEmail(data.user.email);
        }
      })
      .catch(() => {
        // Sin sesión
      });
    return () => {
      mounted = false;
    };
  }, []);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordValid = password.length >= 8;

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    setActiveEmail(null);
    notify(
      "Cerraste sesión. Podés ingresar con otra cuenta cuando quieras.",
      "info",
      "user"
    );
    router.refresh();
  }

  function handleAdvanceEmailStep() {
    if (!isEmailValid) {
      setFeedback({
        type: "error",
        text: "Ingresá un correo electrónico válido para seguir.",
      });
      emailInputRef.current?.focus();
      return;
    }
    setFeedback({ type: "idle" });
    setDirection("forward");
    setStep(1);
  }

  async function handleFormSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step === 0) {
      handleAdvanceEmailStep();
      return;
    }

    if (!isPasswordValid) {
      setFeedback({
        type: "error",
        text: "Tu contraseña debe tener al menos 8 caracteres.",
      });
      passwordInputRef.current?.focus();
      return;
    }

    setLoading(true);
    setFeedback({ type: "idle" });

    const supabase = createSupabaseBrowserClient();
    const redirectOrigin =
      typeof window !== "undefined" ? window.location.origin : "";

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${redirectOrigin}/auth/callback?next=/perfil`,
        },
      });
      setLoading(false);
      if (error) {
        setFeedback({ type: "error", text: error.message });
      } else if (data.session) {
        notify(
          "¡Cuenta de huésped lista! Entrando a tu perfil...",
          "celebration",
          "trophy"
        );
        window.location.href = "/perfil";
      } else {
        setFeedback({
          type: "success",
          text: "¡Listo! Creamos tu cuenta para agendar hospedajes. Revisá tu correo para confirmarla y entrar directo a tu perfil.",
        });
        notify("¡Cuenta creada con éxito!", "celebration", "trophy");
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setFeedback({ type: "error", text: error.message });
    } else {
      notify("¡Bienvenido de nuevo! Abriendo tu perfil...", "success", "user");
      window.location.href = "/perfil";
    }
  }

  if (activeEmail) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6 space-y-6">
        <div className="surface-card p-6 sm:p-8 text-center space-y-5">
          <div className="flex justify-center">
            <Icon3D name="check" size="lg" />
          </div>
          <div className="space-y-1.5">
            <span className="badge-consorcio-friendly inline-block rounded-full px-3 py-1 text-xs font-extrabold">
              ● Sesión activa
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Ya ingresaste a tu cuenta
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Estás conectado como <strong>{activeEmail}</strong>.
            </p>
          </div>

          <div className="space-y-2.5 pt-2">
            <Link
              href="/perfil"
              className="btn-primary-3d inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-extrabold"
            >
              <span>Ir a mi perfil</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="btn-secondary-3d inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-xs font-extrabold"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Cerrar sesión y usar otra cuenta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleFormSubmit} noValidate>
      <ProgressiveFlowShell
        eyebrow={`Paso ${step + 1} de 2 · ${mode === "signin" ? "Ingresar a tu cuenta" : isGuestRoleHint ? "Experiencia de huésped" : "Cuenta nueva"}`}
        title={
          step === 0
            ? mode === "signin"
              ? "¡Qué bueno verte!"
              : "Creá tu perfil en I-bita"
            : mode === "signin"
              ? "Ingresá tu contraseña"
              : "Elegí una contraseña segura"
        }
        subtitle={
          step === 0
            ? "Comencemos con tu correo electrónico."
            : mode === "signin"
              ? "Escribí tu clave para abrir tu perfil y seguir tus reservas."
              : "Guardamos tu acceso de forma protegida para tus reservas y pases de ingreso."
        }
        currentStep={step}
        totalSteps={2}
        direction={direction}
        mediaImageUrl="https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp"
        mediaImageAlt="Departamento luminoso en Palermo Soho"
        mediaBadge="Cuenta protegida · Acceso a tus reservas y pases"
        compact
        hideFooter
        topBarSlot={
          <>
            <div
              role="group"
              aria-label="Elegir ingresar o crear cuenta"
              className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs sm:text-sm font-extrabold"
            >
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setFeedback({ type: "idle" });
                }}
                aria-pressed={mode === "signin"}
                className={`rounded-full px-4 sm:px-5 py-1.5 cursor-pointer transition-colors ${
                  mode === "signin"
                    ? "bg-[var(--brand-primary)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Ingresar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setFeedback({ type: "idle" });
                }}
                aria-pressed={mode === "signup"}
                className={`rounded-full px-4 sm:px-5 py-1.5 cursor-pointer transition-colors ${
                  mode === "signup"
                    ? "bg-[var(--brand-primary)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Crear cuenta
              </button>
            </div>

            <Link
              href="/onboarding/anfitrion"
              className="text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline"
            >
              ¿Querés publicar una propiedad? Ir a anfitriones →
            </Link>
          </>
        }
      >
        <div
          role="progressbar"
          aria-label="Avance paso a paso"
          aria-valuemin={1}
          aria-valuemax={2}
          aria-valuenow={step + 1}
          className="grid grid-cols-2 gap-1.5"
        >
          {[0, 1].map((idx) => {
            const completed = idx < step;
            const current = idx === step;
            return (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  completed
                    ? "bg-emerald-600"
                    : current
                      ? "bg-[var(--brand-primary)]"
                      : "bg-[var(--border-subtle)]"
                }`}
              />
            );
          })}
        </div>

        {step === 0 ? (
          <div className="space-y-3">
            <div className="rounded-3xl border-2 border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 shadow-[var(--shadow-card)] focus-within:border-[var(--brand-primary)] transition-colors space-y-2.5">
              <div>
                <label htmlFor="email" className="sr-only">
                  Tu correo electrónico
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-secondary)]"
                    aria-hidden="true"
                  />
                  <input
                    ref={emailInputRef}
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (feedback.type === "error") setFeedback({ type: "idle" });
                    }}
                    className="min-h-[52px] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] pl-11 pr-11 py-3 text-base font-semibold text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none"
                    placeholder="Ingresá tu correo electrónico"
                  />
                  {isEmailValid && (
                    <CheckCircle2
                      className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                  )}
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary-3d inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-6 text-base font-extrabold tracking-tight"
              >
                <span>
                  {mode === "signin"
                    ? "Ingresar con este correo"
                    : "Registrarme con este correo"}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {feedback.type === "error" && (
              <p
                role="alert"
                className="rounded-xl bg-red-100 text-red-900 px-3.5 py-2.5 text-xs font-bold"
              >
                {feedback.text}
              </p>
            )}

            <p className="px-1 text-xs text-[var(--text-secondary)]">
              {mode === "signin" ? (
                <>
                  ¿Todavía no tenés cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signup");
                      setFeedback({ type: "idle" });
                    }}
                    className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
                  >
                    Crear cuenta
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tenés cuenta?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setMode("signin");
                      setFeedback({ type: "idle" });
                    }}
                    className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
                  >
                    Ingresar
                  </button>
                </>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-4 py-1.5 text-xs">
              <span className="font-bold text-[var(--text-primary)]">{email}</span>
              <button
                type="button"
                onClick={() => {
                  setDirection("backward");
                  setStep(0);
                  setFeedback({ type: "idle" });
                }}
                className="font-extrabold text-[var(--brand-primary)] underline cursor-pointer"
              >
                Cambiar
              </button>
            </div>

            {feedback.type !== "success" && (
              <div className="rounded-3xl border-2 border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2.5 shadow-[var(--shadow-card)] focus-within:border-[var(--brand-primary)] transition-colors space-y-2.5">
                <div className="space-y-1.5">
                  <label htmlFor="password" className="sr-only">
                    Tu contraseña
                  </label>
                  <input
                    ref={passwordInputRef}
                    id="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete={
                      mode === "signin" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (feedback.type === "error") setFeedback({ type: "idle" });
                    }}
                    className="min-h-[52px] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-4 py-3 text-base font-semibold focus:border-[var(--brand-primary)] focus:outline-none"
                    placeholder="Tu contraseña (mínimo 8 caracteres)"
                  />

                  <div className="flex items-center justify-between px-2 text-xs">
                    {isPasswordValid ? (
                      <span className="inline-flex items-center gap-1 font-extrabold text-emerald-700 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Mínimo 8 caracteres ✓
                      </span>
                    ) : (
                      <span className="text-[var(--text-secondary)]">
                        Mínimo 8 caracteres
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary-3d inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-6 text-base font-extrabold tracking-tight disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      <span>
                        {mode === "signin"
                          ? "Ingresando de forma segura..."
                          : "Creando tu cuenta..."}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>
                        {mode === "signin"
                          ? "Ingresar a mi perfil"
                          : "Crear mi cuenta"}
                      </span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            )}

            {feedback.type === "error" && (
              <p
                role="alert"
                className="rounded-xl bg-red-100 text-red-900 px-3.5 py-2.5 text-xs font-bold"
              >
                {feedback.text}
              </p>
            )}

            {feedback.type === "success" && (
              <AchievementBanner
                icon="check"
                tone="emerald"
                title="¡Cuenta creada!"
                description={feedback.text ?? "Ya podés ingresar."}
              />
            )}

            {feedback.type !== "success" && (
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setDirection("backward");
                    setStep(0);
                    setFeedback({ type: "idle" });
                  }}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-1 text-xs font-extrabold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Cambiar correo</span>
                </button>
              </div>
            )}
          </div>
        )}
      </ProgressiveFlowShell>
    </form>
  );
}
