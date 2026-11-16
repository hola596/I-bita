"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [feedback, setFeedback] = useState<{ type: "idle" | "error" | "success"; text?: string }>({
    type: "idle",
  });
  const [loading, setLoading] = useState(false);

  async function handleAuth(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setFeedback({ type: "idle" });

    const supabase = createSupabaseBrowserClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });
      setLoading(false);
      if (error) {
        setFeedback({ type: "error", text: error.message });
      } else {
        setFeedback({
          type: "success",
          text: "Cuenta creada en Supabase Auth. Ahora podés iniciar sesión o completar tu Onboarding de Anfitrión.",
        });
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setFeedback({ type: "error", text: error.message });
    } else {
      window.location.href = "/onboarding/anfitrion";
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6 space-y-6">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {mode === "signin" ? "Ingresá a tu cuenta I-bita" : "Creá tu cuenta en I-bita"}
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Autenticación Multi-Rol segura respaldada por Supabase SSR y políticas RLS.
        </p>
      </header>

      <form
        onSubmit={handleAuth}
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 space-y-4 shadow-xs"
      >
        <div>
          <label htmlFor="email" className="block text-sm font-bold mb-1">
            Correo Electrónico
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
            placeholder="tu@email.com.ar"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-bold mb-1">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
            placeholder="Mínimo 8 caracteres"
          />
        </div>

        {feedback.type === "error" && (
          <p role="alert" className="rounded-xl bg-red-100 text-red-900 px-3.5 py-2 text-xs font-bold">
            {feedback.text}
          </p>
        )}

        {feedback.type === "success" && (
          <p role="status" className="badge-consorcio-friendly rounded-xl px-3.5 py-2 text-xs font-bold">
            {feedback.text}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[var(--brand-primary)] px-4 py-3 text-sm font-bold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 cursor-pointer"
        >
          {loading
            ? "Procesando..."
            : mode === "signin"
              ? "Iniciar Sesión"
              : "Registrar Cuenta"}
        </button>

        <div className="pt-2 text-center text-xs text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="underline font-bold text-[var(--text-primary)] cursor-pointer"
          >
            {mode === "signin"
              ? "¿No tenés cuenta? Registrate acá"
              : "¿Ya tenés cuenta? Iniciá sesión"}
          </button>
        </div>
      </form>
    </div>
  );
}
