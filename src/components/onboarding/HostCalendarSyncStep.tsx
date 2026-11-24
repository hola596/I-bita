"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarSync,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  ICAL_PLATFORM_GUIDES,
  PRIMARY_ONBOARDING_ICAL_SOURCES,
  diagnoseIcalUrlClient,
  normalizeExternalIcalUrlInput,
  type ClientIcalUrlDiagnosis,
  type HostCalendarFeedPreference,
  type HostCalendarSyncPreferences,
  type IcalPlatformSource,
} from "@/lib/ical/platform-guides";
import { testExternalIcalUrlAction } from "@/modules/ical/actions";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";

interface HostCalendarSyncStepProps {
  value: HostCalendarSyncPreferences;
  onChange: (next: HostCalendarSyncPreferences) => void;
}

export function hasBlockingIcalUrlErrors(
  prefs: HostCalendarSyncPreferences
): boolean {
  if (prefs.mode !== "external_sync") return false;
  return prefs.feeds.some((feed) => {
    const trimmed = feed.feedUrl.trim();
    if (!trimmed) return false;
    return diagnoseIcalUrlClient(trimmed, feed.sourceName).status === "error";
  });
}

export function HostCalendarSyncStep({
  value,
  onChange,
}: HostCalendarSyncStepProps) {
  const [urlDrafts, setUrlDrafts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of value.feeds) {
      init[f.sourceName] = f.feedUrl;
    }
    return init;
  });

  const [blurredSources, setBlurredSources] = useState<Record<string, boolean>>(
    {}
  );
  const [testingSources, setTestingSources] = useState<Record<string, boolean>>(
    {}
  );
  const [liveTestResults, setLiveTestResults] = useState<
    Record<
      string,
      { type: "success" | "error"; message: string; testedAt?: string }
    >
  >({});

  function selectMode(mode: "ibita_only" | "external_sync") {
    if (mode === "ibita_only") {
      onChange({
        mode: "ibita_only",
        selectedSources: [],
        feeds: [],
        updatedAt: new Date().toISOString(),
      });
      return;
    }

    const nextSelected =
      value.selectedSources.length > 0
        ? value.selectedSources
        : (["Airbnb"] as IcalPlatformSource[]);
    onChange({
      ...value,
      mode: "external_sync",
      selectedSources: nextSelected,
      updatedAt: new Date().toISOString(),
    });
  }

  function toggleSource(source: IcalPlatformSource) {
    const exists = value.selectedSources.includes(source);
    const nextSelected = exists
      ? value.selectedSources.filter((s) => s !== source)
      : [...value.selectedSources, source];

    const nextFeeds = exists
      ? value.feeds.filter((f) => f.sourceName !== source)
      : value.feeds;

    onChange({
      ...value,
      mode: "external_sync",
      selectedSources: nextSelected,
      feeds: nextFeeds,
      updatedAt: new Date().toISOString(),
    });
  }

  function upsertFeedDraft(
    source: IcalPlatformSource,
    rawUrl: string,
    extra?: Partial<HostCalendarFeedPreference>
  ) {
    setUrlDrafts((prev) => ({ ...prev, [source]: rawUrl }));
    const { normalizedUrl } = normalizeExternalIcalUrlInput(rawUrl);

    // Al editar, limpiar errores previos de prueba/blur hasta que salga del campo (Baymard)
    setBlurredSources((prev) => ({ ...prev, [source]: false }));
    setLiveTestResults((prev) => {
      if (!prev[source]) return prev;
      const copy = { ...prev };
      delete copy[source];
      return copy;
    });

    const filtered = value.feeds.filter((f) => f.sourceName !== source);
    const prevFeed = value.feeds.find((f) => f.sourceName === source);

    const nextFeeds =
      normalizedUrl.length > 0
        ? [
            ...filtered,
            {
              sourceName: source,
              feedUrl: normalizedUrl,
              validatedAt: extra?.validatedAt ?? null,
              detectedEventsCount: extra?.detectedEventsCount ?? null,
              nextBlockedRange: extra?.nextBlockedRange ?? null,
              ...(prevFeed && !extra ? {} : {}),
            },
          ]
        : filtered;

    onChange({
      ...value,
      mode: "external_sync",
      feeds: nextFeeds,
      updatedAt: new Date().toISOString(),
    });
  }

  function handleBlur(source: IcalPlatformSource) {
    const currentRaw = urlDrafts[source] ?? "";
    const { normalizedUrl, convertedWebcal } =
      normalizeExternalIcalUrlInput(currentRaw);

    if (convertedWebcal && normalizedUrl !== currentRaw) {
      setUrlDrafts((prev) => ({ ...prev, [source]: normalizedUrl }));
    }

    setBlurredSources((prev) => ({ ...prev, [source]: true }));

    const filtered = value.feeds.filter((f) => f.sourceName !== source);
    const existing = value.feeds.find((f) => f.sourceName === source);
    const nextFeeds =
      normalizedUrl.length > 0
        ? [
            ...filtered,
            {
              sourceName: source,
              feedUrl: normalizedUrl,
              validatedAt: existing?.validatedAt ?? null,
              detectedEventsCount: existing?.detectedEventsCount ?? null,
              nextBlockedRange: existing?.nextBlockedRange ?? null,
            },
          ]
        : filtered;

    onChange({
      ...value,
      mode: "external_sync",
      feeds: nextFeeds,
      updatedAt: new Date().toISOString(),
    });
  }

  async function handleTestConnection(source: IcalPlatformSource) {
    const currentRaw = (urlDrafts[source] ?? "").trim();
    setBlurredSources((prev) => ({ ...prev, [source]: true }));

    const diagnosis = diagnoseIcalUrlClient(currentRaw, source);
    if (diagnosis.status === "empty" || diagnosis.status === "error") {
      setLiveTestResults((prev) => ({
        ...prev,
        [source]: {
          type: "error",
          message:
            diagnosis.message ||
            "Pegá primero un enlace .ics válido antes de probar.",
        },
      }));
      return;
    }

    setTestingSources((prev) => ({ ...prev, [source]: true }));
    try {
      const res = await testExternalIcalUrlAction({
        feedUrl: diagnosis.normalizedUrl,
        sourceName: source,
      });

      if (!res.ok) {
        setLiveTestResults((prev) => ({
          ...prev,
          [source]: {
            type: "error",
            message: res.error.message,
          },
        }));
        return;
      }

      const filtered = value.feeds.filter((f) => f.sourceName !== source);
      onChange({
        ...value,
        mode: "external_sync",
        feeds: [
          ...filtered,
          {
            sourceName: source,
            feedUrl: res.data.normalizedUrl,
            validatedAt: res.data.testedAt,
            detectedEventsCount: res.data.upcomingBlocksCount,
            nextBlockedRange: res.data.nextBlockedRange,
          },
        ],
        updatedAt: new Date().toISOString(),
      });
      setUrlDrafts((prev) => ({ ...prev, [source]: res.data.normalizedUrl }));
      setLiveTestResults((prev) => ({
        ...prev,
        [source]: {
          type: "success",
          message: res.data.message,
          testedAt: res.data.testedAt,
        },
      }));
    } finally {
      setTestingSources((prev) => ({ ...prev, [source]: false }));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-[11px] font-extrabold text-[var(--text-secondary)]">
          <CalendarSync className="h-3.5 w-3.5 text-[var(--brand-primary)]" aria-hidden="true" />
          Paso opcional · Sincronización iCal (.ics)
        </span>
        <span className="text-[11px] font-semibold text-[var(--text-secondary)]">
          Podés configurarlo ahora o después en tu panel
        </span>
      </div>

      {/* Selección inicial binaria: cero fricción vs sincronización */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => selectMode("ibita_only")}
          aria-pressed={value.mode === "ibita_only"}
          className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer space-y-1.5 ${
            value.mode === "ibita_only"
              ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] ring-2 ring-[var(--brand-primary)]/20"
              : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)]/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-[var(--brand-primary)]">
              Sin configuración externa
            </span>
            {value.mode === "ibita_only" && (
              <CheckCircle2
                className="h-4 w-4 text-[var(--brand-primary)] shrink-0"
                aria-hidden="true"
              />
            )}
          </div>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            Solo usaré el calendario de I-bita por ahora
          </p>
          <p className="text-xs text-[var(--text-secondary)] leading-snug">
            Ideal si tu unidad no está publicada en otro portal o preferís conectar calendarios al crear el anuncio.
          </p>
        </button>

        <button
          type="button"
          onClick={() => selectMode("external_sync")}
          aria-pressed={value.mode === "external_sync"}
          className={`rounded-2xl border-2 p-4 text-left transition-all cursor-pointer space-y-1.5 ${
            value.mode === "external_sync"
              ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] ring-2 ring-[var(--brand-primary)]/20"
              : "border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:bg-[var(--bg-secondary)]/60"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
              Evitar doble reserva
            </span>
            {value.mode === "external_sync" && (
              <CheckCircle2
                className="h-4 w-4 text-[var(--brand-primary)] shrink-0"
                aria-hidden="true"
              />
            )}
          </div>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">
            También publico en Airbnb, Booking, Google u otra app
          </p>
          <p className="text-xs text-[var(--text-secondary)] leading-snug">
            Elegí qué plataformas usás, te guiamos en 3 pasos y probamos el enlace en vivo.
          </p>
        </button>
      </div>

      {value.mode === "external_sync" && (
        <div className="space-y-4 animate-ibita-fade-up">
          {/* Selector progresivo de plataformas */}
          <div className="space-y-2">
            <p className="text-xs font-extrabold text-[var(--text-primary)]">
              1. ¿Dónde ya tenés cargado tu calendario? (podés marcar varias)
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRIMARY_ONBOARDING_ICAL_SOURCES.map((source) => {
                const selected = value.selectedSources.includes(source);
                const guide = ICAL_PLATFORM_GUIDES[source];
                const savedFeed = value.feeds.find(
                  (f) => f.sourceName === source
                );
                return (
                  <button
                    key={source}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleSource(source)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer space-y-1 ${
                      selected
                        ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] font-extrabold"
                        : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-primary)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-extrabold text-[var(--text-primary)] truncate">
                        {guide.label}
                      </span>
                      {savedFeed?.validatedAt && (
                        <CheckCircle2
                          className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <span className="block text-[10px] font-semibold text-[var(--text-secondary)] leading-tight">
                      {guide.syncFrequencyLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tarjeta contextual por cada plataforma seleccionada */}
          {value.selectedSources.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-extrabold text-[var(--text-primary)]">
                2. Pegá y probá tu enlace .ics (opcional en este paso)
              </p>

              {value.selectedSources.map((source) => {
                const guide = ICAL_PLATFORM_GUIDES[source];
                const draftUrl = urlDrafts[source] ?? "";
                const savedFeed = value.feeds.find(
                  (f) => f.sourceName === source
                );
                const isBlurred = Boolean(blurredSources[source]);
                const diagnosis: ClientIcalUrlDiagnosis = isBlurred
                  ? diagnoseIcalUrlClient(draftUrl, source)
                  : {
                      status: "empty",
                      normalizedUrl: draftUrl,
                      convertedWebcal: false,
                      message: "",
                    };
                const isTesting = Boolean(testingSources[source]);
                const liveResult = liveTestResults[source];

                return (
                  <div
                    key={source}
                    className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/70 p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-extrabold text-[var(--text-primary)]">
                          {guide.label}
                        </h3>
                        <p className="text-[11px] text-[var(--text-secondary)]">
                          {guide.shortTagline}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {guide.syncFrequencyLabel}
                      </span>
                    </div>

                    {guide.platformWarning && (
                      <div
                        role="note"
                        className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-950 dark:text-amber-200 leading-snug"
                      >
                        <AlertTriangle
                          className="h-4 w-4 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{guide.platformWarning}</span>
                      </div>
                    )}

                    <ProgressiveDisclosure
                      icon="compass"
                      title={`¿Dónde encuentro mi enlace .ics en ${guide.label}?`}
                      subtitle="Ver paso a paso oficial (3 pasos)"
                    >
                      <ol className="list-decimal list-inside space-y-1.5 text-xs text-[var(--text-secondary)]">
                        {guide.importSteps.map((step, idx) => (
                          <li key={idx} className="leading-relaxed">
                            <span className="text-[var(--text-primary)] font-semibold">
                              {step}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </ProgressiveDisclosure>

                    <div className="space-y-1.5">
                      <label
                        htmlFor={`onboarding-ical-url-${source}`}
                        className="block text-xs font-extrabold text-[var(--text-primary)]"
                      >
                        Enlace de exportación .ics de {guide.label}{" "}
                        <span className="font-normal text-[var(--text-secondary)]">
                          (opcional)
                        </span>
                      </label>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          id={`onboarding-ical-url-${source}`}
                          type="url"
                          value={draftUrl}
                          onChange={(e) =>
                            upsertFeedDraft(source, e.target.value)
                          }
                          onBlur={() => handleBlur(source)}
                          placeholder={guide.urlPlaceholder}
                          className={`min-h-[46px] flex-1 rounded-xl border bg-[var(--bg-primary)] px-3.5 text-xs font-mono focus:outline-none ${
                            isBlurred && diagnosis.status === "error"
                              ? "border-red-600 focus:border-red-600"
                              : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                          }`}
                        />

                        <button
                          type="button"
                          disabled={isTesting || !draftUrl.trim()}
                          onClick={() => handleTestConnection(source)}
                          className="btn-secondary-3d inline-flex min-h-[46px] shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
                        >
                          {isTesting ? (
                            <>
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                              <span>Probando...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles
                                className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                                aria-hidden="true"
                              />
                              <span>Probar enlace ahora</span>
                            </>
                          )}
                        </button>
                      </div>

                      {isBlurred && diagnosis.status === "error" && (
                        <div
                          role="alert"
                          className="flex items-start gap-2 rounded-xl border border-red-600/35 bg-red-50 dark:bg-red-950/35 p-2.5 text-xs text-red-950 dark:text-red-200"
                        >
                          <AlertCircle
                            className="h-4 w-4 shrink-0 mt-0.5 text-red-700 dark:text-red-300"
                            aria-hidden="true"
                          />
                          <div className="space-y-0.5 leading-snug">
                            <p className="font-extrabold">{diagnosis.message}</p>
                            {diagnosis.actionHint && (
                              <p className="font-semibold">
                                <span className="underline">Qué hacer:</span>{" "}
                                {diagnosis.actionHint}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                      {isBlurred &&
                        diagnosis.status === "valid" &&
                        !liveResult && (
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            ✓ {diagnosis.message}
                          </p>
                        )}

                      {liveResult && (
                        <div
                          role={liveResult.type === "error" ? "alert" : "status"}
                          className={`flex items-start gap-2 rounded-xl p-2.5 text-xs font-bold ${
                            liveResult.type === "success"
                              ? "badge-consorcio-friendly"
                              : "border border-red-600/35 bg-red-50 text-red-950 dark:bg-red-950/35 dark:text-red-200"
                          }`}
                        >
                          {liveResult.type === "success" ? (
                            <CheckCircle2
                              className="h-4 w-4 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertCircle
                              className="h-4 w-4 shrink-0 mt-0.5"
                              aria-hidden="true"
                            />
                          )}
                          <span>{liveResult.message}</span>
                        </div>
                      )}

                      {!liveResult && savedFeed?.validatedAt && (
                        <p className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            Enlace verificado anteriormente (
                            {savedFeed.detectedEventsCount ?? 0} bloqueos futuros).
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-3.5 text-xs text-[var(--text-secondary)] leading-relaxed">
            <Info
              className="h-4 w-4 shrink-0 mt-0.5 text-[var(--brand-primary)]"
              aria-hidden="true"
            />
            <span>
              <strong className="text-[var(--text-primary)]">
                Cómo sigue cuando te aprobemos:
              </strong>{" "}
              al crear tu primera propiedad en I-bita, heredaremos estos enlaces automáticamente y te entregaremos{" "}
              <strong>tu enlace de exportación I-bita (.ics)</strong> para pegarlo de vuelta en Airbnb o Booking. I-bita revisa cambios externos automáticamente{" "}
              <strong>cada 20 minutos</strong>.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
