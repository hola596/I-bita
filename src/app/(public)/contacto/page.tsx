"use client";

import { useState } from "react";
import { submitContactInquiryAction } from "@/modules/contact/actions";

export default function ContactoPage() {
  const [status, setStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ type: "loading" });
    const form = e.currentTarget;
    const formData = new FormData(form);

    const res = await submitContactInquiryAction({
      fullName: String(formData.get("fullName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      subject: String(formData.get("subject") ?? ""),
      message: String(formData.get("message") ?? ""),
    });

    if (res.ok) {
      form.reset();
      setStatus({
        type: "success",
        message: "Tu consulta fue registrada en Supabase Cloud correctamente. Te responderemos a la brevedad.",
      });
    } else {
      setStatus({
        type: "error",
        message: res.error.message,
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8 space-y-8">
      <header className="space-y-2">
        <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
          Soporte a Propietarios, Inquilinos y Administraciones de Consorcio
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight pt-2">
          Contacto Seguro I-bita
        </h1>
        <p className="text-sm text-[var(--text-secondary)]">
          ¿Querés sincronizar tus departamentos de Airbnb o habilitar el Pase Digital en tu consorcio? Escribinos.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 space-y-5 shadow-xs"
      >
        <div>
          <label htmlFor="fullName" className="block text-sm font-bold mb-1">
            Nombre y Apellido *
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
            placeholder="Ej: Martín Gómez"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="email" className="block text-sm font-bold mb-1">
              Correo Electrónico *
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
              placeholder="martin@ejemplo.com.ar"
            />
          </div>
          <div>
            <label htmlFor="phone" className="block text-sm font-bold mb-1">
              WhatsApp (Opcional)
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
              placeholder="+54 9 11 1234-5678"
            />
          </div>
        </div>

        <div>
          <label htmlFor="subject" className="block text-sm font-bold mb-1">
            Motivo de Consulta *
          </label>
          <input
            id="subject"
            name="subject"
            type="text"
            required
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
            placeholder="Alta de Anfitrión B2B2C / Consorcio Friendly"
          />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-bold mb-1">
            Mensaje *
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            required
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
            placeholder="Contanos cuántas unidades administrás o en qué corredor estás..."
          />
        </div>

        {status.type === "error" && (
          <p role="alert" className="rounded-xl bg-red-100 text-red-900 px-4 py-2.5 text-xs font-bold">
            {status.message}
          </p>
        )}

        {status.type === "success" && (
          <p role="status" className="badge-consorcio-friendly rounded-xl px-4 py-2.5 text-xs font-bold">
            {status.message}
          </p>
        )}

        <button
          type="submit"
          disabled={status.type === "loading"}
          className="w-full rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 cursor-pointer"
        >
          {status.type === "loading" ? "Enviando..." : "Enviar Consulta Verificada"}
        </button>
      </form>
    </div>
  );
}
