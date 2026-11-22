"use client";

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

export interface ProgressiveFlowShellProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  currentStep: number;
  totalSteps: number;
  direction?: "forward" | "backward";
  mediaImageUrl?: string;
  mediaImageAlt?: string;
  mediaBadge?: string;
  mediaCaption?: string;
  rightSlot?: ReactNode;
  topBarSlot?: ReactNode;
  canGoBack?: boolean;
  onBack?: () => void;
  backLabel?: string;
  canGoNext?: boolean;
  onNext?: () => void;
  nextLabel?: string;
  allowInvalidNextClick?: boolean;
  footerAlertSlot?: ReactNode;
  submitButtonLabel?: string;
  isSubmitting?: boolean;
  submittingLabel?: string;
  hideFooter?: boolean;
  compact?: boolean;
  children: ReactNode;
}

const DEFAULT_EDITORIAL_IMAGE =
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp";

/**
 * Contenedor reutilizable de Información Progresiva estilo Airbnb:
 * una decisión clara por pantalla a la izquierda, contexto visual sereno a la derecha
 * y barra segmentada de progreso + navegación inferior sin saturación cognitiva.
 */
export function ProgressiveFlowShell({
  eyebrow,
  title,
  subtitle,
  currentStep,
  totalSteps,
  direction = "forward",
  mediaImageUrl = DEFAULT_EDITORIAL_IMAGE,
  mediaImageAlt = "Departamento luminoso y cuidado en Argentina",
  mediaBadge,
  mediaCaption,
  rightSlot,
  topBarSlot,
  canGoBack = currentStep > 0,
  onBack,
  backLabel = "Atrás",
  canGoNext = true,
  onNext,
  nextLabel = "Siguiente",
  allowInvalidNextClick = false,
  footerAlertSlot,
  submitButtonLabel,
  isSubmitting = false,
  submittingLabel = "Guardando...",
  hideFooter = false,
  compact = false,
  children,
}: ProgressiveFlowShellProps) {
  const safeTotalSteps = Math.max(1, totalSteps);
  const safeCurrentStep = Math.min(Math.max(0, currentStep), safeTotalSteps - 1);
  const animClass =
    direction === "backward"
      ? "animate-ibita-slide-prev"
      : "animate-ibita-slide-next";
  const effectiveNextLabel = submitButtonLabel ?? nextLabel;

  return (
    <div
      className={
        compact
          ? "mx-auto max-w-6xl px-4 py-4 sm:py-6 sm:px-6 lg:px-8 space-y-4"
          : "mx-auto max-w-6xl px-4 py-6 sm:py-10 sm:px-6 lg:px-8 space-y-6"
      }
    >
      {topBarSlot && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {topBarSlot}
        </div>
      )}

      <div
        className={
          compact
            ? "grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start lg:items-center min-h-0 lg:min-h-[360px]"
            : "grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center min-h-[440px]"
        }
      >
        {/* Columna Izquierda: una pregunta o tarea enfocada por pantalla */}
        <div
          key={`step-${safeCurrentStep}`}
          className={`${compact ? "lg:col-span-6 space-y-4" : "lg:col-span-6 space-y-6"} ${animClass}`}
        >
          <div className="space-y-3">
            {eyebrow && (
              <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1 text-xs font-extrabold text-[var(--brand-primary)]">
                {eyebrow}
              </span>
            )}
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.12] text-[var(--text-primary)]">
              {title}
            </h1>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              {subtitle}
            </p>
          </div>

          <div className="space-y-4">{children}</div>
        </div>

        {/* Columna Derecha: contexto visual editorial y/o vista previa en vivo */}
        <div className="lg:col-span-6 space-y-4">
          {mediaImageUrl && (
            <div className="relative overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaImageUrl}
                alt={mediaImageAlt}
                width={1200}
                height={900}
                className={
                  compact
                    ? "aspect-[16/10] lg:aspect-[4/3] max-h-[380px] w-full object-cover"
                    : "aspect-[16/10] lg:aspect-[5/4] w-full object-cover"
                }
              />
              {mediaBadge && (
                <span className="badge-consorcio-friendly absolute top-4 left-4 inline-flex items-center rounded-full px-3.5 py-1 text-xs font-extrabold shadow-xs">
                  {mediaBadge}
                </span>
              )}
              {mediaCaption && (
                <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/25 bg-black/65 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-md">
                  {mediaCaption}
                </div>
              )}
            </div>
          )}

          {rightSlot}
        </div>
      </div>

      {/* Barra segmentada inferior y navegación limpia */}
      {!hideFooter && (
        <div className="border-t border-[var(--border-subtle)] pt-5 space-y-4">
          {footerAlertSlot}

          <div
            role="progressbar"
            aria-label="Avance paso a paso"
            aria-valuemin={1}
            aria-valuemax={safeTotalSteps}
            aria-valuenow={safeCurrentStep + 1}
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${safeTotalSteps}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: safeTotalSteps }).map((_, idx) => {
              const completed = idx < safeCurrentStep;
              const current = idx === safeCurrentStep;
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

          <div className="flex items-center justify-between gap-3">
            {canGoBack && onBack ? (
              <button
                type="button"
                onClick={onBack}
                disabled={isSubmitting}
                className="btn-secondary-3d inline-flex min-h-[46px] items-center gap-2 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                <span>{backLabel}</span>
              </button>
            ) : (
              <span aria-hidden="true" />
            )}

            <button
              type={onNext ? "button" : "submit"}
              onClick={onNext}
              disabled={isSubmitting || (!allowInvalidNextClick && !canGoNext)}
              aria-disabled={!canGoNext || isSubmitting}
              className={`btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-6 text-sm font-extrabold disabled:opacity-45 ${
                allowInvalidNextClick && !canGoNext && !isSubmitting
                  ? "opacity-80"
                  : ""
              }`.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>{submittingLabel}</span>
                </>
              ) : (
                <>
                  <span>{effectiveNextLabel}</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
