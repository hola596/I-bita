"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  FileCheck2,
  Loader2,
  RefreshCw,
  ScanBarcode,
  Sparkles,
  XCircle,
} from "lucide-react";
import { parseArgentineDniPdf417 } from "@/lib/kyc/pdf417Parser";
import type { ParsedArgentineDni } from "@/lib/kyc/types";
import { ProgressiveDisclosure } from "@/components/ui/ProgressiveDisclosure";

interface DniBarcodeScannerProps {
  value: ParsedArgentineDni | null;
  rawPayload: string;
  onDecoded: (parsed: ParsedArgentineDni | null, rawPayload: string) => void;
  enableMock?: boolean;
  defaultMockIndex?: number;
  onNotify?: (message: string, tone: "info" | "success" | "celebration") => void;
}

const PRESET_RENAPER_ADULT_PAYLOADS: ReadonlyArray<{
  label: string;
  payload: string;
}> = [
  {
    label: "Persona #1 de ejemplo (Titular)",
    payload:
      "00548291034@GONZALEZ@VALENTINA SOFIA@F@38941205@A@14/06/1995@22/09/2022@207",
  },
  {
    label: "Persona #2 de ejemplo (Acompañante)",
    payload:
      "00619482731@FERNANDEZ@LUCAS MATIAS@M@36418920@B@08/11/1992@15/03/2021@209",
  },
  {
    label: "Persona #3 de ejemplo (Acompañante)",
    payload:
      "00738192045@RODRIGUEZ@CAMILA BELEN@F@40129384@A@25/02/1997@10/01/2023@274",
  },
];

async function openRearCameraStream(preferSimple = false): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Cámara no disponible en este navegador.");
  }
  const attempts: MediaStreamConstraints[] = preferSimple
    ? [
        { video: { facingMode: "environment" }, audio: false },
        { video: true, audio: false },
      ]
    : [
        {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        { video: { facingMode: "environment" }, audio: false },
        { video: true, audio: false },
      ];

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("No pudimos acceder a la cámara trasera.");
}

/**
 * Escáner PDF417 en tiempo real usando `zxing-wasm` (Apache 2.0) con guía visual de encuadre,
 * fallback de carga de imagen y validación automática de DNI argentino (+18 años).
 */
export function DniBarcodeScanner({
  value,
  rawPayload,
  onDecoded,
  enableMock = false,
  defaultMockIndex = 0,
  onNotify,
}: DniBarcodeScannerProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStalled, setCameraStalled] = useState(false);
  const [cameraSessionTick, setCameraSessionTick] = useState(0);
  const [initializingWasm, setInitializingWasm] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const decodingRef = useRef(false);
  const retryCountRef = useRef(0);
  const openTokenRef = useRef(0);
  const readerFnRef = useRef<
    typeof import("zxing-wasm/reader")["readBarcodes"] | null
  >(null);

  function stopStreamTracksOnly() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    decodingRef.current = false;
  }

  function stopCamera() {
    openTokenRef.current += 1;
    stopStreamTracksOnly();
    setCameraActive(false);
    setCameraReady(false);
    setCameraStalled(false);
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function applyDecodedRawText(text: string): boolean {
    const parsedResult = parseArgentineDniPdf417(text, { requireAdult: true });
    if (!parsedResult.ok) {
      setScanError(parsedResult.error);
      onDecoded(null, text);
      return false;
    }

    setScanError(null);
    onDecoded(parsedResult.data, parsedResult.data.rawPayload);
    setStatusMessage(
      `¡DNI leído con éxito! Identificamos a ${parsedResult.data.fullName} (DNI ${parsedResult.data.documentNumberFormatted}).`
    );
    onNotify?.("¡Código del DNI leído con éxito!", "success");
    return true;
  }

  async function startCameraScanner(isAutoRetry = false) {
    const token = ++openTokenRef.current;
    stopStreamTracksOnly();
    setScanError(null);
    setCameraReady(false);
    setCameraStalled(false);
    setInitializingWasm(true);
    if (!isAutoRetry) {
      retryCountRef.current = 0;
    }
    setStatusMessage(
      isAutoRetry
        ? "Reintentando abrir la cámara trasera..."
        : "Abriendo la cámara trasera y preparando lector PDF417..."
    );

    // Cargar zxing-wasm en paralelo sin bloquear el montaje inmediato del <video>
    void import("zxing-wasm/reader")
      .then(async ({ prepareZXingModule, readBarcodes }) => {
        await prepareZXingModule({ fireImmediately: true });
        readerFnRef.current = readBarcodes;
        if (token === openTokenRef.current && streamRef.current) {
          setInitializingWasm(false);
          setStatusMessage(
            "Encuadrá el código de barras del DNI dentro del recuadro hasta que se lea automáticamente."
          );
        }
      })
      .catch(() => {
        if (token === openTokenRef.current) {
          setInitializingWasm(false);
        }
      });

    try {
      const stream = await openRearCameraStream(isAutoRetry);
      if (token !== openTokenRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      streamRef.current = stream;
      setCameraActive(true);
      setCameraSessionTick((t) => t + 1);
      if (readerFnRef.current) {
        setInitializingWasm(false);
        setStatusMessage(
          "Encuadrá el código de barras del DNI dentro del recuadro hasta que se lea automáticamente."
        );
      }
    } catch {
      if (token !== openTokenRef.current) return;
      stopCamera();
      setInitializingWasm(false);
      setStatusMessage(
        "No pudimos acceder a la cámara en este dispositivo. Podés subir una foto nítida del código de barras del DNI."
      );
    }
  }

  useEffect(() => {
    if (!cameraActive || !streamRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;

    const markReady = () => {
      if (cancelled) return;
      if (
        video.videoWidth > 0 ||
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        setCameraReady(true);
        setCameraStalled(false);
      }
    };

    const handleLoadedMetadata = () => {
      void video.play().catch(() => undefined);
      markReady();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("loadeddata", markReady);
    video.addEventListener("playing", markReady);

    video.srcObject = streamRef.current;
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      void video.play().catch(() => undefined);
      markReady();
    } else {
      void video.play().catch(() => undefined);
    }

    let lastScanAt = 0;
    let tick = 0;

    const scanFrame = async (ts: number) => {
      if (cancelled || !streamRef.current || !videoRef.current) return;

      const vid = videoRef.current;
      const readBarcodes = readerFnRef.current;

      if (vid.videoWidth > 0) {
        setCameraReady(true);
        setCameraStalled(false);
      }

      if (
        readBarcodes &&
        vid.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
        vid.videoWidth > 0 &&
        !decodingRef.current &&
        ts - lastScanAt >= 220
      ) {
        lastScanAt = ts;
        tick += 1;
        decodingRef.current = true;

        try {
          const canvas =
            canvasRef.current ?? document.createElement("canvas");
          canvasRef.current = canvas;

          const vw = vid.videoWidth;
          const vh = vid.videoHeight;

          // Alternar recorte central amplio (donde suele encuadrarse el PDF417) y frame completo
          const useFull = tick % 3 === 0;
          const sx = useFull ? 0 : Math.floor(vw * 0.08);
          const sy = useFull ? 0 : Math.floor(vh * 0.22);
          const sw = useFull ? vw : Math.floor(vw * 0.84);
          const sh = useFull ? vh : Math.floor(vh * 0.56);

          canvas.width = sw;
          canvas.height = sh;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });

          if (ctx) {
            ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, sw, sh);
            const imgData = ctx.getImageData(0, 0, sw, sh);
            const results = await readBarcodes(imgData, {
              formats: ["PDF417"],
              tryHarder: true,
              tryRotate: true,
              tryInvert: true,
              maxNumberOfSymbols: 1,
            });

            const hit = results.find((r) => r.text?.includes("@"));
            if (hit?.text && !cancelled) {
              applyDecodedRawText(hit.text);
              stopCamera();
              return;
            }
          }
        } catch {
          // Ignorar frames individuales sin lectura clara
        } finally {
          decodingRef.current = false;
        }
      }

      if (!cancelled && streamRef.current) {
        rafRef.current = requestAnimationFrame(scanFrame);
      }
    };

    rafRef.current = requestAnimationFrame(scanFrame);

    const watchdogId = window.setTimeout(() => {
      if (cancelled || !streamRef.current || !videoRef.current) return;
      const vid = videoRef.current;
      if (
        vid.videoWidth === 0 ||
        vid.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        if (retryCountRef.current === 0) {
          retryCountRef.current = 1;
          void startCameraScanner(true);
        } else {
          setCameraStalled(true);
          setStatusMessage(
            "La cámara abrió sin imagen. Tocá 'Reintentar cámara' o usá 'Subir foto del código'."
          );
        }
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdogId);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraActive, cameraSessionTick]);

  async function handleBarcodeFileUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCamera();
    setScanError(null);
    setInitializingWasm(true);
    setStatusMessage("Analizando el código de barras PDF417 en tu imagen...");

    try {
      const { prepareZXingModule, readBarcodes } = await import(
        "zxing-wasm/reader"
      );
      await prepareZXingModule({ fireImmediately: true });

      const results = await readBarcodes(file, {
        formats: ["PDF417"],
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        maxNumberOfSymbols: 2,
      });

      const validHit = results.find((r) => r.text?.trim().includes("@"));
      if (!validHit?.text) {
        setScanError(
          "No detectamos un código de barras PDF417 legible en esa foto. Asegurate de enfocar bien el frente/dorso del DNI sin reflejos."
        );
        setStatusMessage(null);
        return;
      }

      applyDecodedRawText(validHit.text);
    } catch (err) {
      setScanError(
        err instanceof Error
          ? err.message
          : "No pudimos leer esa imagen. Intentá con mejor iluminación y enfoque."
      );
      setStatusMessage(null);
    } finally {
      setInitializingWasm(false);
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!cameraActive ? (
          <button
            type="button"
            disabled={initializingWasm}
            onClick={() => void startCameraScanner()}
            className="btn-primary-3d inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-extrabold disabled:opacity-50"
          >
            {initializingWasm ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Camera className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {initializingWasm
                ? "Abriendo cámara..."
                : "Escanear DNI con cámara"}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setStatusMessage("Cámara detenida.");
            }}
            className="inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl bg-red-600 text-white px-4 py-3 text-xs sm:text-sm font-extrabold hover:bg-red-700 cursor-pointer"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            <span>Cerrar cámara</span>
          </button>
        )}

        <label className="btn-secondary-3d inline-flex min-h-[50px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs sm:text-sm font-extrabold cursor-pointer">
          <ScanBarcode
            className="h-4 w-4 text-[var(--brand-primary)]"
            aria-hidden="true"
          />
          <span>Subir foto del código</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            capture="environment"
            onChange={handleBarcodeFileUpload}
            className="sr-only"
          />
        </label>
      </div>

      {cameraActive && (
        <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--brand-primary)] bg-black aspect-[4/3] sm:aspect-video">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            autoPlay
            muted
            playsInline
          />

          {/* Guía de encuadre rectangular PDF417 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4"
          >
            <div className="relative w-[86%] max-w-md h-[46%] rounded-xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              <span className="absolute -top-0.5 -left-0.5 h-5 w-5 border-t-4 border-l-4 border-white rounded-tl-lg" />
              <span className="absolute -top-0.5 -right-0.5 h-5 w-5 border-t-4 border-r-4 border-white rounded-tr-lg" />
              <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 border-b-4 border-l-4 border-white rounded-bl-lg" />
              <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 border-b-4 border-r-4 border-white rounded-br-lg" />
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400/80 animate-pulse" />
            </div>
            <span className="mt-3 rounded-full bg-black/75 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-xs">
              Alineá el código PDF417 dentro del recuadro
            </span>
          </div>

          {!cameraReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/80 p-4 text-center text-white">
              {cameraStalled ? (
                <>
                  <p className="text-xs font-extrabold max-w-xs">
                    La cámara se quedó en negro. Tocá reintentar o usá &quot;Subir foto del código&quot;.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      retryCountRef.current = 0;
                      void startCameraScanner(true);
                    }}
                    className="btn-primary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Reintentar cámara</span>
                  </button>
                </>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                  <span className="text-xs font-bold">Iniciando vista previa de cámara...</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {statusMessage && (
        <p
          role="status"
          className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] px-4 py-2.5 text-xs font-bold text-[var(--text-primary)]"
        >
          {statusMessage}
        </p>
      )}

      {scanError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-2xl bg-red-100 text-red-900 p-4 text-xs font-bold"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{scanError}</span>
        </div>
      )}

      {value ? (
        <div className="rounded-2xl border border-emerald-600/40 bg-[var(--badge-consorcio-bg)]/50 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--badge-consorcio-text)]">
              <FileCheck2 className="h-4 w-4" aria-hidden="true" />
              Datos del DNI validados (Mayor de 18 años)
            </span>
            <span className="font-mono text-xs font-extrabold text-[var(--badge-consorcio-text)]">
              DNI {value.documentNumberFormatted}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div className="rounded-xl bg-[var(--bg-primary)] p-3">
              <span className="block text-[10px] text-[var(--text-secondary)]">
                Nombre completo
              </span>
              <span className="font-extrabold">{value.fullName}</span>
            </div>
            <div className="rounded-xl bg-[var(--bg-primary)] p-3">
              <span className="block text-[10px] text-[var(--text-secondary)]">
                Edad verificada
              </span>
              <span className="font-extrabold">
                {value.ageYears} años ({value.birthDate})
              </span>
            </div>
            <div className="rounded-xl bg-[var(--bg-primary)] p-3">
              <span className="block text-[10px] text-[var(--text-secondary)]">
                N.º de trámite
              </span>
              <span className="font-mono font-extrabold">
                {value.tramiteNumber}
              </span>
            </div>
          </div>
        </div>
      ) : (
        !scanError && (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 text-xs font-medium text-[var(--text-secondary)]">
            Escaneá el código de barras PDF417 de tu DNI argentino o subí una
            foto nítida para verificar tu mayoría de edad automáticamente.
          </div>
        )
      )}

      {/* Modo de pruebas estrictamente habilitado bajo NEXT_PUBLIC_ENABLE_KYC_MOCK === "true" */}
      {enableMock && (
        <ProgressiveDisclosure
          icon="sparkle"
          title="Modo QA · Cargar trama PDF417 de prueba"
          subtitle="Visible solo cuando NEXT_PUBLIC_ENABLE_KYC_MOCK=true en entorno de pruebas."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PRESET_RENAPER_ADULT_PAYLOADS.map((preset, idx) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    applyDecodedRawText(preset.payload);
                    onNotify?.(`Cargamos los datos de prueba #${idx + 1}.`, "info");
                  }}
                  className={`rounded-xl px-3 py-2 text-xs font-extrabold cursor-pointer ${
                    idx === defaultMockIndex
                      ? "btn-primary-3d"
                      : "btn-secondary-3d"
                  }`}
                >
                  <Sparkles className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  {preset.label}
                </button>
              ))}
            </div>

            <div>
              <label
                htmlFor="pdf417-qa-input"
                className="block text-xs font-bold text-[var(--text-secondary)] mb-1"
              >
                Cadena PDF417 cruda (solo pruebas):
              </label>
              <textarea
                id="pdf417-qa-input"
                rows={2}
                value={rawPayload}
                onChange={(e) => {
                  const val = e.target.value;
                  const parsed = parseArgentineDniPdf417(val, {
                    requireAdult: true,
                  });
                  if (parsed.ok) {
                    setScanError(null);
                    onDecoded(parsed.data, val);
                  } else {
                    setScanError(parsed.error);
                    onDecoded(null, val);
                  }
                }}
                placeholder="00548291034@GONZALEZ@VALENTINA SOFIA@F@38941205@A@14/06/1995@22/09/2022@207"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2 text-xs font-mono"
              />
            </div>
          </div>
        </ProgressiveDisclosure>
      )}
    </div>
  );
}
