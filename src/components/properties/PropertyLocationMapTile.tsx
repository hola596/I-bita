"use client";

import { useEffect, useState } from "react";
import { MapPin, Maximize2, X } from "lucide-react";
import type { PropertyLocationMapData } from "@/lib/maps/property-location";

interface PropertyLocationMapTileProps {
  propertyTitle: string;
  addressLine: string;
  corridorLabel: string;
  mapData: PropertyLocationMapData;
  className?: string;
}

/**
 * Quinto cuadro interactivo dentro de la galería Bento de `/p/[slug]`:
 * muestra la ubicación real en mapa con opción de ampliar sin salir de la plataforma.
 */
export function PropertyLocationMapTile({
  propertyTitle,
  addressLine,
  corridorLabel,
  mapData,
  className = "",
}: PropertyLocationMapTileProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!isExpanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExpanded]);

  return (
    <>
      <div
        id="mapa-ubicacion"
        className={`relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl md:rounded-none ${className}`.trim()}
      >
        <iframe
          src={mapData.embedUrl}
          title={`Mapa de ubicación de ${propertyTitle}`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="absolute inset-0 h-full w-full border-0"
        />

        <span className="pointer-events-none absolute top-2.5 left-2.5 inline-flex max-w-[calc(100%-1.25rem)] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/92 px-2.5 py-1 text-[11px] font-extrabold text-[var(--text-primary)] backdrop-blur-md shadow-xs">
          <MapPin
            className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]"
            aria-hidden="true"
          />
          <span className="truncate">Mapa · {mapData.zoneLabel}</span>
        </span>

        <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2">
          <span className="hidden sm:inline-flex max-w-[55%] truncate rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-xs">
            {mapData.displayAddress}
          </span>

          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            aria-label={`Ampliar mapa de ubicación de ${propertyTitle}`}
            className="pointer-events-auto ml-auto inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/95 px-3 py-1 text-[11px] font-extrabold text-[var(--text-primary)] shadow-md hover:bg-[var(--bg-elevated)] cursor-pointer transition-colors"
          >
            <Maximize2
              className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]"
              aria-hidden="true"
            />
            <span>Ampliar mapa</span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsExpanded(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="property-map-modal-title"
            className="w-full max-w-4xl overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-tint)] text-[var(--brand-primary)]">
                  <MapPin className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2
                    id="property-map-modal-title"
                    className="text-base font-extrabold text-[var(--text-primary)] truncate"
                  >
                    Ubicación del alojamiento
                  </h2>
                  <p className="text-xs font-medium text-[var(--text-secondary)] truncate">
                    {addressLine} · {corridorLabel}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="btn-secondary-3d inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-extrabold"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                <span>Cerrar</span>
              </button>
            </div>

            <iframe
              src={mapData.expandedEmbedUrl}
              title={`Mapa ampliado de ${propertyTitle}`}
              referrerPolicy="no-referrer-when-downgrade"
              className="h-[62vh] min-h-[340px] max-h-[600px] w-full border-0 bg-[var(--bg-secondary)]"
            />

            <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-5 py-3 text-xs font-medium text-[var(--text-secondary)]">
              Vista interactiva de la zona dentro de I-bita. El pase de ingreso y la clave de portería se habilitan al confirmar tu reserva.
            </div>
          </div>
        </div>
      )}
    </>
  );
}
