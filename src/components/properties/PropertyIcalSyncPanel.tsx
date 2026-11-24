"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarSync,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  confirmIcalExportStepAction,
  deleteIcalFeedAction,
  listPropertyIcalFeedsAction,
  syncExternalIcalAction,
  type IcalFeedRecord,
} from "@/modules/ical/actions";
import { ICAL_SOURCES, type IcalSourceName } from "@/modules/ical/validators";
import {
  ICAL_PLATFORM_GUIDES,
  diagnoseIcalUrlClient,
  normalizeExternalIcalUrlInput,
  type IcalPlatformSource,
} from "@/lib/ical/platform-guides";

interface PropertyIcalSyncPanelProps {
  propertyId: string;
  propertyTitle: string;
  initialFeeds?: IcalFeedRecord[];
  preferredSources?: IcalPlatformSource[];
  onFeedsChanged?: (feeds: IcalFeedRecord[]) => void;
}

function formatArgentinaDateTime(iso: string | null): string {
  if (!iso) return "Aún sin sincronizar";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PropertyIcalSyncPanel({
  propertyId,
  propertyTitle,
  initialFeeds = [],
  preferredSources = [],
  onFeedsChanged,
}: PropertyIcalSyncPanelProps) {
  const [feeds, setFeeds] = useState<IcalFeedRecord[]>(initialFeeds);
  const [sourceName, setSourceName] = useState<IcalSourceName>(
    preferredSources[0] ?? "Airbnb"
  );
  const [feedUrl, setFeedUrl] = useState("");
  const [urlBlurred, setUrlBlurred] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [showExportGuide, setShowExportGuide] = useState(false);
  const [showConsolidatedLink, setShowConsolidatedLink] = useState(false);

  const [copiedMode, setCopiedMode] = useState<"native" | "all" | null>(null);
  const [busyFeedId, setBusyFeedId] = useState<string | null>(null);
  const [confirmingExport, setConfirmingExport] = useState(false);

  const [syncState, setSyncState] = useState<{
    type: "idle" | "loading" | "success" | "error";
    code?: string;
    message?: string;
  }>({ type: "idle" });

  useEffect(() => {
    setFeeds(initialFeeds);
  }, [initialFeeds]);

  const activeGuide =
    ICAL_PLATFORM_GUIDES[sourceName] ?? ICAL_PLATFORM_GUIDES["Airbnb"];

  const exportNativePath = `/api/ical/${propertyId}.ics?scope=native`;
  const exportAllPath = `/api/ical/${propertyId}.ics`;

  const hasFeeds = feeds.length > 0;
  const allExportsConfirmed =
    hasFeeds && feeds.every((f) => Boolean(f.export_confirmed_at));

  const statusBadge = allExportsConfirmed
    ? {
        label: "✓ Bidireccional activo",
        cls: "badge-consorcio-friendly",
      }
    : hasFeeds
      ? {
          label: "Paso 2 pendiente · Falta pegar enlace de vuelta",
          cls: "bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/40",
        }
      : {
          label: "Solo calendario I-bita",
          cls: "border border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)]",
        };

  async function refreshFeedsFromServer() {
    const listRes = await listPropertyIcalFeedsAction(propertyId);
    if (listRes.ok) {
      setFeeds(listRes.data);
      onFeedsChanged?.(listRes.data);
    }
  }

  function updateFeedUrlInput(raw: string) {
    setFeedUrl(raw);
    setUrlBlurred(false);
    if (syncState.type === "error") {
      setSyncState({ type: "idle" });
    }
  }

  function handleUrlBlur() {
    const { normalizedUrl, convertedWebcal } =
      normalizeExternalIcalUrlInput(feedUrl);
    if (convertedWebcal && normalizedUrl !== feedUrl) {
      setFeedUrl(normalizedUrl);
    }
    setUrlBlurred(true);
  }

  const clientDiagnosis = urlBlurred
    ? diagnoseIcalUrlClient(feedUrl, sourceName)
    : {
        status: "empty" as const,
        normalizedUrl: feedUrl,
        convertedWebcal: false,
        message: "",
      };

  async function handleSyncSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUrlBlurred(true);

    const diagnosis = diagnoseIcalUrlClient(feedUrl, sourceName);
    if (diagnosis.status === "error") {
      setSyncState({
        type: "error",
        code: "VALIDATION_ERROR",
        message: `${diagnosis.message}${diagnosis.actionHint ? ` ${diagnosis.actionHint}` : ""}`,
      });
      return;
    }

    setSyncState({ type: "loading" });

    try {
      const res = await syncExternalIcalAction({
        propertyId,
        feedUrl: diagnosis.normalizedUrl || feedUrl,
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

      setFeedUrl("");
      setUrlBlurred(false);
      await refreshFeedsFromServer();

      const cancelledInfo =
        res.data.cancelledCount > 0
          ? `, ${res.data.cancelledCount} liberados por cancelación`
          : "";
      setSyncState({
        type: "success",
        message: `Sincronización ${res.data.sourceName} completada (${res.data.parsedEventsCount} eventos: ${res.data.insertedCount} nuevos, ${res.data.updatedCount} actualizados${cancelledInfo}, ${res.data.conflictsCount} colisiones 23P01 omitidas).`,
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

  async function handleResyncFeed(feed: IcalFeedRecord) {
    setBusyFeedId(feed.id);
    setSyncState({ type: "idle" });
    try {
      const res = await syncExternalIcalAction({
        propertyId,
        feedId: feed.id,
        feedUrl: feed.feed_url,
        sourceName: feed.source_name,
      });
      await refreshFeedsFromServer();

      if (!res.ok) {
        setSyncState({
          type: "error",
          code: res.error.code,
          message: `${feed.source_name}: ${res.error.message}`,
        });
        return;
      }

      const cancelledInfo =
        res.data.cancelledCount > 0
          ? `, ${res.data.cancelledCount} liberados por cancelación`
          : "";
      setSyncState({
        type: "success",
        message: `${feed.source_name} actualizado (${res.data.insertedCount} nuevos, ${res.data.updatedCount} actualizados${cancelledInfo}).`,
      });
    } catch (err) {
      setSyncState({
        type: "error",
        code: "SSRF_BLOCKED_ERROR",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyFeedId(null);
    }
  }

  async function handleDeleteFeed(feed: IcalFeedRecord) {
    setBusyFeedId(feed.id);
    setSyncState({ type: "idle" });
    try {
      const res = await deleteIcalFeedAction({
        feedId: feed.id,
        propertyId,
      });
      if (!res.ok) {
        setSyncState({
          type: "error",
          code: res.error.code,
          message: res.error.message,
        });
        return;
      }
      await refreshFeedsFromServer();
      setSyncState({
        type: "success",
        message: `Desconectamos ${feed.source_name} y liberamos ${res.data.releasedBlocksCount} bloqueos externos en I-bita.`,
      });
    } finally {
      setBusyFeedId(null);
    }
  }

  async function handleCopyExportUrl(mode: "native" | "all") {
    const path = mode === "native" ? exportNativePath : exportAllPath;
    const fullUrl =
      typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode(null), 2600);
    } catch {
      setSyncState({
        type: "error",
        message: `No pudimos copiar automáticamente. Copiá esta URL: ${fullUrl}`,
      });
    }
  }

  async function handleToggleExportConfirmed() {
    if (feeds.length === 0) return;
    const nextConfirmed = !allExportsConfirmed;
    setConfirmingExport(true);
    try {
      await Promise.all(
        feeds.map((f) =>
          confirmIcalExportStepAction({
            feedId: f.id,
            propertyId,
            confirmed: nextConfirmed,
          })
        )
      );
      await refreshFeedsFromServer();
      setSyncState({
        type: "success",
        message: nextConfirmed
          ? "¡Excelente! Confirmaste la sincronización bidireccional en tus plataformas."
          : "Marcamos el Paso 2 como pendiente para recordártelo.",
      });
    } finally {
      setConfirmingExport(false);
    }
  }

  return (
    <div className="mt-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-4">
      {/* Cabecera + Estado real */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold">
          <CalendarSync
            className="h-4 w-4 text-[var(--brand-primary)]"
            aria-hidden="true"
          />
          Sincronización de Calendarios (.ics)
        </span>

        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${statusBadge.cls}`}
        >
          {statusBadge.label}
        </span>
      </div>

      {/* PASO 1: IMPORTAR DESDE OTROS PORTALES */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-[var(--text-primary)]">
            Paso 1 · Importar hacia I-bita (traer reservas externas)
          </p>
          <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
            {feeds.length} {feeds.length === 1 ? "canal conectado" : "canales conectados"}
          </span>
        </div>

        {/* Lista de feeds guardados */}
        {feeds.length > 0 && (
          <ul className="space-y-2">
            {feeds.map((feed) => {
              const isBusy = busyFeedId === feed.id;
              const isErrorStatus =
                Boolean(feed.last_error_message) ||
                Boolean(feed.last_sync_status?.startsWith("ERROR:"));
              return (
                <li
                  key={feed.id}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/70 p-2.5 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <strong className="text-[var(--text-primary)]">
                          {feed.source_name}
                        </strong>
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          Última rev.: {formatArgentinaDateTime(feed.last_synced_at)}
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-[var(--text-secondary)] truncate max-w-[260px] sm:max-w-md">
                        {feed.feed_url}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleResyncFeed(feed)}
                        aria-label={`Sincronizar ${feed.source_name} ahora`}
                        className="btn-secondary-3d inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2
                            className="h-3 w-3 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <RefreshCw className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>Sincronizar</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeleteFeed(feed)}
                        aria-label={`Desconectar ${feed.source_name}`}
                        className="inline-flex min-h-[32px] items-center justify-center rounded-lg border border-red-600/30 bg-red-50 dark:bg-red-950/30 px-2 text-red-700 dark:text-red-300 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {feed.last_sync_status && (
                    <p
                      className={`text-[11px] font-semibold ${
                        isErrorStatus
                          ? "text-red-700 dark:text-red-300"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}
                    >
                      {feed.last_sync_status}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Formulario para agregar / actualizar feed */}
        <form onSubmit={handleSyncSubmit} className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              aria-label={`Plataforma iCal para ${propertyTitle}`}
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value as IcalSourceName)}
              className="min-h-[40px] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs font-semibold"
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
              onChange={(e) => updateFeedUrlInput(e.target.value)}
              onBlur={handleUrlBlur}
              placeholder={activeGuide.urlPlaceholder}
              aria-label={`URL externa .ics para ${propertyTitle}`}
              className={`sm:col-span-2 min-h-[40px] rounded-lg border bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs font-mono focus:outline-none ${
                urlBlurred && clientDiagnosis.status === "error"
                  ? "border-red-600"
                  : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
              }`}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <button
              type="button"
              onClick={() => setShowImportGuide((v) => !v)}
              className="font-bold text-[var(--brand-primary)] underline cursor-pointer"
            >
              {showImportGuide
                ? `Ocultar pasos para ${activeGuide.label}`
                : `¿Cómo copio el enlace en ${activeGuide.label}? (3 pasos)`}
            </button>
            <span className="text-[var(--text-secondary)] font-semibold">
              {activeGuide.syncFrequencyLabel}
            </span>
          </div>

          {showImportGuide && (
            <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5 space-y-1.5 text-[11px]">
              {activeGuide.platformWarning && (
                <p className="flex items-start gap-1.5 font-semibold text-amber-900 dark:text-amber-200">
                  <AlertTriangle
                    className="h-3.5 w-3.5 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{activeGuide.platformWarning}</span>
                </p>
              )}
              <ol className="list-decimal list-inside space-y-1 text-[var(--text-secondary)]">
                {activeGuide.importSteps.map((step, i) => (
                  <li key={i}>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {urlBlurred && clientDiagnosis.status === "error" && (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-lg bg-red-50 dark:bg-red-950/35 border border-red-600/35 p-2 text-[11px] text-red-950 dark:text-red-200"
            >
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-extrabold">{clientDiagnosis.message}</p>
                {clientDiagnosis.actionHint && (
                  <p className="font-semibold">{clientDiagnosis.actionHint}</p>
                )}
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={syncState.type === "loading"}
            className="w-full min-h-[40px] rounded-xl bg-[var(--text-primary)] text-[var(--bg-primary)] px-3 py-1.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {syncState.type === "loading"
              ? "Validando Anti-SSRF e importando eventos .ics..."
              : `Conectar y sincronizar ${activeGuide.label} ahora`}
          </button>
        </form>
      </div>

      {/* PASO 2: EXPORTAR DESDE I-BITA HACIA OTROS PORTALES */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-extrabold text-[var(--text-primary)]">
            Paso 2 · Exportar desde I-bita (evitar eco circular en OTAs)
          </p>
          <a
            href={exportNativePath}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir calendario iCal nativo de ${propertyTitle}`}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--brand-primary)] hover:underline"
          >
            <span>Ver .ics</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => handleCopyExportUrl("native")}
            className="btn-secondary-3d inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-extrabold"
          >
            {copiedMode === "native" ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                <span>✓ Enlace copiado para Airbnb / Booking</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copiar mi calendario I-bita (.ics)</span>
              </>
            )}
          </button>

          {hasFeeds && (
            <button
              type="button"
              disabled={confirmingExport}
              onClick={handleToggleExportConfirmed}
              aria-pressed={allExportsConfirmed}
              className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold cursor-pointer disabled:opacity-50 ${
                allExportsConfirmed
                  ? "badge-consorcio-friendly border-emerald-600/40"
                  : "border-[var(--brand-primary)]/40 bg-[var(--surface-tint)] text-[var(--brand-primary)]"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {allExportsConfirmed
                  ? "Paso 2 completado ✓"
                  : "Ya lo pegué en mi plataforma"}
              </span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setShowExportGuide((v) => !v)}
            className="font-bold text-[var(--brand-primary)] underline cursor-pointer"
          >
            {showExportGuide
              ? "Ocultar guía de exportación"
              : `Cómo pegarlo en ${activeGuide.label}`}
          </button>

          <button
            type="button"
            onClick={() => setShowConsolidatedLink((v) => !v)}
            className="font-semibold text-[var(--text-secondary)] underline cursor-pointer"
          >
            {showConsolidatedLink
              ? "Ocultar link Google/Apple"
              : "Link consolidado para Google / Apple Calendar"}
          </button>
        </div>

        {showExportGuide && (
          <ol className="list-decimal list-inside rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5 space-y-1 text-[11px] text-[var(--text-secondary)]">
            {activeGuide.exportSteps.map((step, i) => (
              <li key={i}>
                <span className="font-semibold text-[var(--text-primary)]">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        )}

        {showConsolidatedLink && (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-2.5 space-y-1.5 text-[11px]">
            <p className="text-[var(--text-secondary)]">
              Para <strong>Google Calendar o Apple Calendar</strong> (incluye tus reservas de I-bita y bloqueos externos como vista unificada de lectura):
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyExportUrl("all")}
                className="btn-secondary-3d inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold"
              >
                {copiedMode === "all" ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
                    <span>✓ Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    <span>Copiar link consolidado (.ics)</span>
                  </>
                )}
              </button>
              <a
                href={exportAllPath}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] underline text-[var(--brand-primary)]"
              >
                {exportAllPath}
              </a>
            </div>
          </div>
        )}
      </div>

      {syncState.type === "error" && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-lg bg-red-100 text-red-900 p-2.5 text-[11px] font-bold"
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
          className="flex items-start gap-1.5 badge-consorcio-friendly rounded-lg p-2.5 text-[11px] font-bold"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{syncState.message}</span>
        </div>
      )}

      <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
        Sincronización automática en I-bita cada <strong>20 min</strong> (Supabase) · Booking revisa ~2 hs · Airbnb ~3 hs · Google 12–24 hs.
      </p>
    </div>
  );
}
