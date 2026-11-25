"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Upload,
  XCircle,
} from "lucide-react";
import { compressAndValidateKycImage } from "@/lib/kyc/imageQuality";
import type { CompressedKycImage } from "@/lib/kyc/types";

interface DniFrontCaptureProps {
  value: CompressedKycImage | null;
  onChange: (image: CompressedKycImage | null) => void;
  onNotify?: (message: string, tone: "info" | "success") => void;
}

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
 * Captura del frente del DNI tarjeta mediante cámara con marco guía rectangular o subida de archivo,
 * con análisis automático de nitidez/reflejos (IQA) y compresión a <= 300 KB.
 */
export function DniFrontCapture({
  value,
  onChange,
  onNotify,
}: DniFrontCaptureProps) {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStalled, setCameraStalled] = useState(false);
  const [cameraSessionTick, setCameraSessionTick] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const retryCountRef = useRef(0);
  const openTokenRef = useRef(0);

  function stopStreamTracks() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  function stopCamera() {
    openTokenRef.current += 1;
    stopStreamTracks();
    setCameraActive(false);
    setCameraReady(false);
    setCameraStalled(false);
  }

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  async function startCamera(isAutoRetry = false) {
    const token = ++openTokenRef.current;
    stopStreamTracks();
    setErrorMsg(null);
    setCameraReady(false);
    setCameraStalled(false);
    if (!isAutoRetry) {
      retryCountRef.current = 0;
    }

    try {
      const stream = await openRearCameraStream(isAutoRetry);
      if (token !== openTokenRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      streamRef.current = stream;
      setCameraActive(true);
      setCameraSessionTick((t) => t + 1);
    } catch {
      if (token !== openTokenRef.current) return;
      stopCamera();
      setErrorMsg(
        "No pudimos abrir la cámara trasera en este dispositivo. Usá el botón de subir foto desde tu galería."
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
      if (video.videoWidth > 0 || video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
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

    const watchdogId = window.setTimeout(() => {
      if (cancelled || !streamRef.current || !videoRef.current) return;
      const vid = videoRef.current;
      if (vid.videoWidth === 0 || vid.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (retryCountRef.current === 0) {
          retryCountRef.current = 1;
          void startCamera(true);
        } else {
          setCameraStalled(true);
        }
      }
    }, 3000);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdogId);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
    };
  }, [cameraActive, cameraSessionTick]);

  async function handleCaptureFromCamera() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    setProcessing(true);
    setErrorMsg(null);
    try {
      const compressed = await compressAndValidateKycImage(video, "dni-front");
      onChange(compressed);
      stopCamera();
      onNotify?.(
        `Frente del DNI capturado y optimizado (${Math.round(
          compressed.sizeBytes / 1024
        )} KB).`,
        "success"
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "No pudimos validar la nitidez del DNI. Intentá nuevamente."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCamera();
    setProcessing(true);
    setErrorMsg(null);
    try {
      const compressed = await compressAndValidateKycImage(file, "dni-front");
      onChange(compressed);
      onNotify?.(
        `Frente del DNI validado (${Math.round(
          compressed.sizeBytes / 1024
        )} KB).`,
        "success"
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "La imagen del DNI no superó el control de nitidez o reflejos."
      );
      onChange(null);
    } finally {
      setProcessing(false);
      e.target.value = "";
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-extrabold text-[var(--text-primary)] block">
            A. Foto del frente de tu DNI
          </span>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Asegurate de que se vea nítida tu foto y sin reflejos de luz.
          </span>
        </div>

        {value && (
          <span className="badge-consorcio-friendly inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Lista · {Math.round(value.sizeBytes / 1024)} KB
          </span>
        )}
      </div>

      {!cameraActive && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={processing}
            onClick={() => void startCamera()}
            className="btn-primary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold disabled:opacity-50"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            <span>{value ? "Sacar otra con cámara" : "Sacar foto con cámara"}</span>
          </button>

          <label className="btn-secondary-3d inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold cursor-pointer">
            <Upload className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
            <span>Subir foto del frente</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              capture="environment"
              onChange={handleFileSelect}
              className="sr-only"
            />
          </label>
        </div>
      )}

      {cameraActive && (
        <div className="space-y-2.5">
          <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--brand-primary)] bg-black aspect-[4/3]">
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              autoPlay
              muted
              playsInline
            />
            {/* Marco rectangular proporcional ID-1 (DNI tarjeta) */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4"
            >
              <div className="w-[86%] max-w-sm aspect-[1.586/1] rounded-xl border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
              <span className="mt-2.5 rounded-full bg-black/75 px-3 py-1 text-[11px] font-bold text-white">
                Encuadrá el frente completo del DNI
              </span>
            </div>

            {!cameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/75 p-4 text-center text-white">
                {cameraStalled ? (
                  <>
                    <p className="text-xs font-extrabold max-w-xs">
                      La cámara abrió sin mostrar imagen. Tocá reintentar o subí la foto directamente.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        retryCountRef.current = 0;
                        void startCamera(true);
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
                    <span className="text-xs font-bold">Iniciando cámara trasera...</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={stopCamera}
              className="btn-secondary-3d inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              <span>Cancelar</span>
            </button>

            <button
              type="button"
              disabled={processing}
              onClick={handleCaptureFromCamera}
              className="btn-primary-3d inline-flex min-h-[46px] flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl px-5 text-xs font-extrabold disabled:opacity-50"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Verificando nitidez...</span>
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" aria-hidden="true" />
                  <span>Capturar frente del DNI</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {processing && !cameraActive && (
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Analizando nitidez, reflejos y comprimiendo (&lt; 300 KB)...</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-red-100 text-red-900 p-3 text-xs font-bold"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {value && !cameraActive && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] p-2.5">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.previewUrl}
              alt="Vista previa del frente del DNI capturado"
              className="h-14 w-22 shrink-0 rounded-lg object-cover border border-[var(--border-subtle)]"
            />
            <div className="min-w-0 text-[11px]">
              <p className="font-extrabold text-[var(--text-primary)] truncate">
                Frente del DNI verificado
              </p>
              <p className="text-[var(--text-secondary)]">
                {value.width}×{value.height}px ·{" "}
                {Math.round(value.sizeBytes / 1024)} KB · Nitidez OK
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onChange(null);
              void startCamera();
            }}
            className="btn-secondary-3d inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-extrabold"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            <span>Rehacer</span>
          </button>
        </div>
      )}
    </div>
  );
}
