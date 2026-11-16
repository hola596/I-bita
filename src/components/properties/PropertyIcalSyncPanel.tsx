"use client";

import { useState } from "react";
import { CalendarSync, ExternalLink, ShieldAlert, CheckCircle2 } from "lucide-react";
import { syncExternalIcalAction } from "@/modules/ical/actions";
import { ICAL_SOURCES, type IcalSourceName } from "@/modules/ical/validators";

interface PropertyIcalSyncPanelProps {
  propertyId: string;
  propertyTitle: string;
}

export function PropertyIcalSyncPanel({
  propertyId,
  propertyTitle,
}: PropertyIcalSyncPanelProps) {
  const [sourceName, setSourceName] = useState<IcalSourceName>("Airbnb");
  const [feedUrl, setFeedUrl] = useState("");
  const [syncState, setSyncState] = useState<{
    type: "idle" | "loading" | "success" | "error";
    code?: string;
    message?: string;
  }>({ type: "idle" });

  const exportIcsPath = `/api/ical/${propertyId}.ics`;

  async function handleSyncSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSyncState({ type: "loading" });

    try {
      const res = await syncExternalIcalAction({
        propertyId,
        feedUrl,
        sourceName,
      });

      if (!res.ok) {
        setSyncState({
          type: "error",
          code: res.error.code,
          message: res.error.message,
        });
        return;
      }

      setSyncState({
        type: "success",
        message: `Sincronización ${res.data.sourceName} completada (${res.data.parsedEventsCount} eventos VEVENT: ${res.data.insertedCount} nuevos, ${res.data.updatedCount} actualizados, ${res.data.conflictsCount} colisiones 23P01 omitidas).`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSyncState({
        type: "error",
        code: "SSRF_BLOCKED_ERROR",
        message: msg,
      });
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
          <CalendarSync className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
          Channel Manager iCal (Anti-SSRF + RFC 5545)
        </span>
        <a
          href={exportIcsPath}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Exportar calendario iCal de ${propertyTitle}`}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1 text-[11px] font-mono font-bold hover:bg-[var(--bg-elevated)]"
        >
          <span>{exportIcsPath.slice(0, 22)}...ics</span>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>

      <form onSubmit={handleSyncSubmit} className="space-y-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            aria-label={`Plataforma iCal para ${propertyTitle}`}
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value as IcalSourceName)}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-semibold"
          >
            {ICAL_SOURCES.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>

          <input
            type="url"
            required
            value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://www.airbnb.com.ar/calendar/ical/..."
            aria-label={`URL externa .ics para ${propertyTitle}`}
            className="sm:col-span-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={syncState.type === "loading"}
          className="w-full rounded-lg bg-[var(--text-primary)] text-[var(--bg-primary)] px-3 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {syncState.type === "loading"
            ? "Verificando DNS/IP Anti-SSRF e importando VEVENT..."
            : "Sincronizar Calendario .ics Externo"}
        </button>
      </form>

      {syncState.type === "error" && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-lg bg-red-100 text-red-900 p-2 text-[11px] font-bold"
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            {syncState.code ? `[${syncState.code}] ` : ""}
            {syncState.message}
          </span>
        </div>
      )}

      {syncState.type === "success" && (
        <div
          role="status"
          className="flex items-start gap-1.5 badge-consorcio-friendly rounded-lg p-2 text-[11px] font-bold"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{syncState.message}</span>
        </div>
      )}
    </div>
  );
}
