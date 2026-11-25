"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FaceLandmarker,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smile,
  XCircle,
} from "lucide-react";
import { compressAndValidateKycImage } from "@/lib/kyc/imageQuality";
import type {
  CompressedKycImage,
  LivenessCaptureMetadata,
  LivenessChallengeRecord,
  LivenessChallengeType,
} from "@/lib/kyc/types";

export interface LiveSelfieCaptureResult {
  image: CompressedKycImage;
  liveness: LivenessCaptureMetadata;
}

interface LiveSelfieCaptureProps {
  value: LiveSelfieCaptureResult | null;
  onCaptured: (result: LiveSelfieCaptureResult | null) => void;
  onNotify?: (message: string, tone: "info" | "success") => void;
}

type CaptureStage =
  | "IDLE"
  | "LOADING_MODEL"
  | "CENTERING"
  | "CHALLENGE_1"
  | "CHALLENGE_2"
  | "AUTO_CAPTURING"
  | "DONE";

interface ChallengeSpec {
  type: LivenessChallengeType;
  instruction: string;
}

const YAW_CHALLENGES: readonly ChallengeSpec[] = [
  {
    type: "TURN_LEFT",
    instruction: "Girá suavemente la cabeza hacia tu izquierda",
  },
  {
    type: "TURN_RIGHT",
    instruction: "Girá suavemente la cabeza hacia tu derecha",
  },
];

const EXPRESSION_CHALLENGES: readonly ChallengeSpec[] = [
  {
    type: "BLINK",
    instruction: "Parpadeá ambos ojos de forma natural",
  },
  {
    type: "SMILE",
    instruction: "Sonreí mostrando una expresión natural",
  },
];

function pickRandomChallenges(): [ChallengeSpec, ChallengeSpec] {
  const yawIdx = Math.floor(Math.random() * YAW_CHALLENGES.length);
  const expIdx = Math.floor(Math.random() * EXPRESSION_CHALLENGES.length);
  return [
    YAW_CHALLENGES[yawIdx] ?? YAW_CHALLENGES[0]!,
    EXPRESSION_CHALLENGES[expIdx] ?? EXPRESSION_CHALLENGES[0]!,
  ];
}

function extractHeadYawDeg(matrixData: ArrayLike<number>): number {
  if (!matrixData || matrixData.length < 16) return 0;
  // MediaPipe FaceLandmarker Matrix (4x4): detectar layout column-major vs row-major por posición de tz
  const isColumnMajor = Math.abs(Number(matrixData[14] ?? 0)) > 1;
  const r02 = isColumnMajor
    ? Number(matrixData[8] ?? 0)
    : Number(matrixData[2] ?? 0);
  const r22 = Number(matrixData[10] ?? 1);
  return (Math.atan2(r02, r22) * 180) / Math.PI;
}

function getBlendshapeScore(
  categories: ReadonlyArray<{ categoryName: string; score: number }>,
  name: string
): number {
  return categories.find((c) => c.categoryName === name)?.score ?? 0;
}

async function openFrontCameraStream(preferSimple = false): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Cámara frontal no disponible en este navegador.");
  }
  const attempts: MediaStreamConstraints[] = preferSimple
    ? [
        { video: { facingMode: "user" }, audio: false },
        { video: true, audio: false },
      ]
    : [
        {
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
          audio: false,
        },
        { video: { facingMode: "user" }, audio: false },
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
    : new Error("No pudimos acceder a la cámara frontal.");
}

/**
 * Captura en vivo de Selfie mediante cámara únicamente (sin subida de archivos)
 * con Liveness Activo usando `@mediapipe/tasks-vision` (`FaceLandmarker`, Apache 2.0):
 * 2 retos aleatorios secuenciales (giro de cabeza 3D + parpadeo/sonrisa) y captura automática
 * al detectar un único rostro centrado y frontal, seguida de validación IQA y compresión <= 300 KB.
 */
export function LiveSelfieCapture({
  value,
  onCaptured,
  onNotify,
}: LiveSelfieCaptureProps) {
  const [stage, setStage] = useState<CaptureStage>(value ? "DONE" : "IDLE");
  const [challenges, setChallenges] = useState<[ChallengeSpec, ChallengeSpec]>(
    () => [YAW_CHALLENGES[0]!, EXPRESSION_CHALLENGES[0]!]
  );
  const [hintText, setHintText] = useState<string>(
    "Usaremos tu cámara frontal para verificar prueba de vida en 5 segundos."
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStalled, setCameraStalled] = useState(false);
  const [streamReadyTick, setStreamReadyTick] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<{ close: () => void; detectForVideo: Function } | null>(
    null
  );
  const runningRef = useRef(false);
  const sessionTokenRef = useRef(0);
  const retryCountRef = useRef(0);

  function cleanupCameraAndModel() {
    sessionTokenRef.current += 1;
    runningRef.current = false;
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
    if (landmarkerRef.current) {
      try {
        landmarkerRef.current.close();
      } catch {
        // Ignorar al liberar
      }
      landmarkerRef.current = null;
    }
    setCameraReady(false);
    setCameraStalled(false);
  }

  useEffect(() => {
    return () => {
      cleanupCameraAndModel();
    };
  }, []);

  async function startLiveSelfieFlow(isAutoRetry = false) {
    cleanupCameraAndModel();
    const token = sessionTokenRef.current;
    onCaptured(null);
    setErrorMsg(null);
    if (!isAutoRetry) {
      retryCountRef.current = 0;
    }

    const chosenChallenges = pickRandomChallenges();
    setChallenges(chosenChallenges);
    setStage("LOADING_MODEL");
    setHintText("Abriendo cámara frontal y preparando detector facial seguro...");

    try {
      const mpVisionPromise = import("@mediapipe/tasks-vision");
      const stream = await openFrontCameraStream(isAutoRetry);

      if (token !== sessionTokenRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }

      // Mostrar la vista previa apenas abre la cámara mientras MediaPipe termina de inicializar
      streamRef.current = stream;
      setStreamReadyTick((t) => t + 1);

      const mpVision = await mpVisionPromise;
      if (token !== sessionTokenRef.current) return;

      const filesetResolver = await mpVision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm"
      );
      if (token !== sessionTokenRef.current) return;

      let landmarker: FaceLandmarker;
      try {
        landmarker = await mpVision.FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numFaces: 2,
            minFaceDetectionConfidence: 0.55,
            minFacePresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          }
        );
      } catch {
        landmarker = await mpVision.FaceLandmarker.createFromOptions(
          filesetResolver,
          {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numFaces: 2,
            minFaceDetectionConfidence: 0.55,
            minFacePresenceConfidence: 0.55,
            minTrackingConfidence: 0.55,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          }
        );
      }

      if (token !== sessionTokenRef.current) {
        try {
          landmarker.close();
        } catch {
          // Ignorar
        }
        return;
      }

      landmarkerRef.current = landmarker as unknown as {
        close: () => void;
        detectForVideo: Function;
      };
      runningRef.current = true;
      setStage("CENTERING");
      setHintText("Ubicá tu rostro dentro del óvalo mirando de frente.");

      let currentPhase:
        | "CENTERING"
        | "CHALLENGE_1"
        | "CHALLENGE_2"
        | "AUTO_CAPTURING" = "CENTERING";
      let centeredFrames = 0;
      const neutralYawSamples: number[] = [];
      let baselineYawDeg = 0;
      let yawHeldFrames = 0;
      let peakYawAbs = 0;
      let blinkClosedSeen = false;
      let peakBlink = 0;
      let smileHeldFrames = 0;
      let peakSmile = 0;
      let frontalReadyFrames = 0;
      let lastFrameTime = -1;
      let capturingLock = false;
      const completedRecords: LivenessChallengeRecord[] = [];

      const tick = async () => {
        if (
          token !== sessionTokenRef.current ||
          !runningRef.current ||
          !videoRef.current ||
          !landmarkerRef.current
        ) {
          return;
        }

        const vid = videoRef.current;
        if (
          vid.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA &&
          vid.videoWidth > 0 &&
          vid.currentTime !== lastFrameTime &&
          !capturingLock
        ) {
          lastFrameTime = vid.currentTime;
          const nowMs = performance.now();

          let result: FaceLandmarkerResult | null = null;
          try {
            result = landmarker.detectForVideo(vid, nowMs);
          } catch {
            result = null;
          }

          if (result) {
            const faceCount = result.faceLandmarks?.length ?? 0;

            if (faceCount === 0) {
              centeredFrames = 0;
              frontalReadyFrames = 0;
              setHintText(
                "No vemos tu rostro. Acercate y ubicá tu cara dentro del óvalo."
              );
            } else if (faceCount > 1) {
              centeredFrames = 0;
              frontalReadyFrames = 0;
              setHintText(
                "Detectamos más de una persona. Quedate solo frente a la cámara."
              );
            } else {
              const landmarks = result.faceLandmarks[0]!;
              const noseTip = landmarks[1];
              const leftEdge = landmarks[234];
              const rightEdge = landmarks[454];

              const faceWidthRatio =
                leftEdge && rightEdge
                  ? Math.abs(rightEdge.x - leftEdge.x)
                  : 0.3;
              const isCentered =
                Boolean(noseTip) &&
                noseTip!.x >= 0.3 &&
                noseTip!.x <= 0.7 &&
                noseTip!.y >= 0.25 &&
                noseTip!.y <= 0.75 &&
                faceWidthRatio >= 0.16 &&
                faceWidthRatio <= 0.75;

              const matrixData =
                result.facialTransformationMatrixes?.[0]?.data;
              const rawYawDeg = matrixData
                ? extractHeadYawDeg(matrixData)
                : 0;
              const blendshapes =
                result.faceBlendshapes?.[0]?.categories ?? [];

              if (!isCentered) {
                centeredFrames = 0;
                frontalReadyFrames = 0;
                setHintText(
                  faceWidthRatio < 0.16
                    ? "Acercate un poco más a la cámara."
                    : faceWidthRatio > 0.75
                      ? "Alejate un poco para encuadrar todo tu rostro."
                      : "Centrá tu rostro dentro del óvalo."
                );
              } else if (currentPhase === "CENTERING") {
                centeredFrames += 1;
                neutralYawSamples.push(rawYawDeg);
                if (centeredFrames >= 8) {
                  baselineYawDeg =
                    neutralYawSamples.reduce((a, b) => a + b, 0) /
                    neutralYawSamples.length;
                  currentPhase = "CHALLENGE_1";
                  setStage("CHALLENGE_1");
                  setHintText(`Reto 1 de 2: ${chosenChallenges[0].instruction}`);
                }
              } else if (currentPhase === "CHALLENGE_1") {
                const deltaYaw = rawYawDeg - baselineYawDeg;
                peakYawAbs = Math.max(peakYawAbs, Math.abs(deltaYaw));

                const noseShiftX =
                  noseTip && leftEdge && rightEdge
                    ? noseTip.x - (leftEdge.x + rightEdge.x) / 2
                    : 0;
                const turnedLeft =
                  deltaYaw <= -12 || noseShiftX >= 0.045;
                const turnedRight =
                  deltaYaw >= 12 || noseShiftX <= -0.045;

                const challengeMet =
                  chosenChallenges[0].type === "TURN_LEFT"
                    ? turnedLeft
                    : turnedRight;

                if (challengeMet) {
                  yawHeldFrames += 1;
                  if (yawHeldFrames >= 3) {
                    completedRecords.push({
                      type: chosenChallenges[0].type,
                      label: chosenChallenges[0].instruction,
                      completedAt: new Date().toISOString(),
                      peakMetric: Number(peakYawAbs.toFixed(2)),
                    });
                    currentPhase = "CHALLENGE_2";
                    setStage("CHALLENGE_2");
                    setHintText(
                      `¡Bien! Reto 2 de 2: ${chosenChallenges[1].instruction}`
                    );
                  }
                } else {
                  yawHeldFrames = 0;
                }
              } else if (currentPhase === "CHALLENGE_2") {
                if (chosenChallenges[1].type === "BLINK") {
                  const blinkL = getBlendshapeScore(
                    blendshapes,
                    "eyeBlinkLeft"
                  );
                  const blinkR = getBlendshapeScore(
                    blendshapes,
                    "eyeBlinkRight"
                  );
                  const maxBlink = Math.max(blinkL, blinkR);
                  peakBlink = Math.max(peakBlink, maxBlink);

                  if (maxBlink >= 0.42) {
                    blinkClosedSeen = true;
                  } else if (blinkClosedSeen && maxBlink < 0.25) {
                    completedRecords.push({
                      type: "BLINK",
                      label: chosenChallenges[1].instruction,
                      completedAt: new Date().toISOString(),
                      peakMetric: Number(peakBlink.toFixed(3)),
                    });
                    currentPhase = "AUTO_CAPTURING";
                    setStage("AUTO_CAPTURING");
                    setHintText(
                      "¡Prueba de vida completada! Mirá al frente quieto un instante..."
                    );
                  }
                } else {
                  const smileL = getBlendshapeScore(
                    blendshapes,
                    "mouthSmileLeft"
                  );
                  const smileR = getBlendshapeScore(
                    blendshapes,
                    "mouthSmileRight"
                  );
                  const avgSmile = (smileL + smileR) / 2;
                  peakSmile = Math.max(peakSmile, avgSmile);

                  if (avgSmile >= 0.42) {
                    smileHeldFrames += 1;
                    if (smileHeldFrames >= 3) {
                      completedRecords.push({
                        type: "SMILE",
                        label: chosenChallenges[1].instruction,
                        completedAt: new Date().toISOString(),
                        peakMetric: Number(peakSmile.toFixed(3)),
                      });
                      currentPhase = "AUTO_CAPTURING";
                      setStage("AUTO_CAPTURING");
                      setHintText(
                        "¡Prueba de vida completada! Mirá al frente quieto un instante..."
                      );
                    }
                  } else {
                    smileHeldFrames = 0;
                  }
                }
              } else if (currentPhase === "AUTO_CAPTURING") {
                const deltaYaw = Math.abs(rawYawDeg - baselineYawDeg);
                const blinkL = getBlendshapeScore(
                  blendshapes,
                  "eyeBlinkLeft"
                );
                const blinkR = getBlendshapeScore(
                  blendshapes,
                  "eyeBlinkRight"
                );
                const eyesOpen = blinkL < 0.35 && blinkR < 0.35;

                if (deltaYaw <= 10 && eyesOpen) {
                  frontalReadyFrames += 1;
                  if (frontalReadyFrames >= 4) {
                    capturingLock = true;
                    try {
                      const compressed = await compressAndValidateKycImage(
                        vid,
                        "selfie"
                      );
                      const captureResult: LiveSelfieCaptureResult = {
                        image: compressed,
                        liveness: {
                          mode: "mediapipe-active-liveness",
                          challenges: completedRecords,
                          faceCountAtCapture: 1,
                          yawAtCaptureDeg: Number(deltaYaw.toFixed(2)),
                          capturedAt: new Date().toISOString(),
                        },
                      };
                      cleanupCameraAndModel();
                      setStage("DONE");
                      setErrorMsg(null);
                      onCaptured(captureResult);
                      onNotify?.(
                        `Selfie en vivo verificada (${Math.round(
                          compressed.sizeBytes / 1024
                        )} KB).`,
                        "success"
                      );
                      return;
                    } catch (err) {
                      frontalReadyFrames = 0;
                      capturingLock = false;
                      setErrorMsg(
                        err instanceof Error
                          ? err.message
                          : "La selfie salió movida o con reflejo. Quedate quieto frente a la cámara."
                      );
                    }
                  }
                } else {
                  frontalReadyFrames = 0;
                  setHintText(
                    "Mirá derecho a la cámara con los ojos abiertos para capturar..."
                  );
                }
              }
            }
          }
        }

        if (token === sessionTokenRef.current && runningRef.current) {
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
        }
      };

      rafRef.current = requestAnimationFrame(() => {
        void tick();
      });
    } catch {
      if (token !== sessionTokenRef.current) return;
      cleanupCameraAndModel();
      setStage("IDLE");
      setErrorMsg(
        "No pudimos acceder a la cámara frontal. Habilitá el permiso de cámara en tu navegador para continuar con la selfie en vivo."
      );
    }
  }

  const isRunningCamera =
    stage === "LOADING_MODEL" ||
    stage === "CENTERING" ||
    stage === "CHALLENGE_1" ||
    stage === "CHALLENGE_2" ||
    stage === "AUTO_CAPTURING";

  useEffect(() => {
    if (!isRunningCamera || !streamRef.current) return;
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
          void startLiveSelfieFlow(true);
        } else {
          setCameraStalled(true);
        }
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(watchdogId);
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("loadeddata", markReady);
      video.removeEventListener("playing", markReady);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunningCamera, streamReadyTick]);

  return (
    <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-extrabold text-[var(--text-primary)] block">
            B. Selfie en vivo (Prueba de vida activa)
          </span>
          <span className="text-[11px] text-[var(--text-secondary)]">
            Por seguridad solo se acepta captura en tiempo real frente a la cámara.
          </span>
        </div>

        {value && (
          <span className="badge-consorcio-friendly inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Lista · {Math.round(value.image.sizeBytes / 1024)} KB
          </span>
        )}
      </div>

      {stage === "IDLE" && (
        <button
          type="button"
          onClick={() => void startLiveSelfieFlow()}
          className="btn-primary-3d inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl px-4 text-xs sm:text-sm font-extrabold"
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          <span>Iniciar selfie guiada en vivo</span>
        </button>
      )}

      {isRunningCamera && (
        <div className="space-y-3">
          {/* Progreso de los 2 retos */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-extrabold">
            <div
              className={`rounded-xl border px-3 py-2 flex items-center gap-1.5 ${
                stage === "CHALLENGE_2" || stage === "AUTO_CAPTURING"
                  ? "border-emerald-600/40 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)]"
                  : stage === "CHALLENGE_1"
                    ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">1. Giro de cabeza</span>
            </div>

            <div
              className={`rounded-xl border px-3 py-2 flex items-center gap-1.5 ${
                stage === "AUTO_CAPTURING"
                  ? "border-emerald-600/40 bg-[var(--badge-consorcio-bg)] text-[var(--badge-consorcio-text)]"
                  : stage === "CHALLENGE_2"
                    ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                    : "border-[var(--border-subtle)] bg-[var(--bg-primary)] text-[var(--text-secondary)]"
              }`}
            >
              <Smile className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                2. {challenges[1].type === "BLINK" ? "Parpadeo" : "Sonrisa"}
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-600 bg-black aspect-[4/3]">
            <video
              ref={videoRef}
              className="h-full w-full object-cover -scale-x-100"
              autoPlay
              muted
              playsInline
            />

            {/* Óvalo guía de centrado */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-4"
            >
              <div
                className={`h-[68%] aspect-[3/4] rounded-full border-4 transition-colors shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] ${
                  stage === "AUTO_CAPTURING"
                    ? "border-emerald-400"
                    : stage === "CHALLENGE_1" || stage === "CHALLENGE_2"
                      ? "border-amber-300"
                      : "border-white/85"
                }`}
              />
            </div>

            {cameraStalled ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-black/80 p-4 text-center text-white">
                <p className="text-xs font-extrabold max-w-xs">
                  La cámara frontal abrió sin imagen. Tocá para reintentar sin perder tu avance.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    retryCountRef.current = 0;
                    void startLiveSelfieFlow(true);
                  }}
                  className="btn-primary-3d inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reintentar cámara frontal</span>
                </button>
              </div>
            ) : (
              stage === "LOADING_MODEL" && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-white text-xs font-extrabold">
                  <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
                  <span>
                    {cameraReady
                      ? "Cámara lista · Cargando detector facial..."
                      : "Abriendo cámara frontal segura..."}
                  </span>
                </div>
              )
            )}

            <div className="absolute inset-x-3 bottom-3 rounded-xl bg-black/80 px-3 py-2 text-center text-xs font-extrabold text-white backdrop-blur-xs">
              {hintText}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              cleanupCameraAndModel();
              setStage("IDLE");
            }}
            className="btn-secondary-3d inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
          >
            <XCircle className="h-4 w-4" aria-hidden="true" />
            <span>Cancelar selfie</span>
          </button>
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

      {value && stage === "DONE" && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-600/35 bg-[var(--bg-primary)] p-2.5">
          <div className="flex items-center gap-3 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value.image.previewUrl}
              alt="Vista previa de selfie en vivo verificada"
              className="h-14 w-14 shrink-0 rounded-full object-cover border-2 border-emerald-600"
            />
            <div className="min-w-0 text-[11px]">
              <p className="font-extrabold text-[var(--text-primary)] truncate">
                Selfie en vivo · 2 retos superados
              </p>
              <p className="text-[var(--text-secondary)]">
                {value.image.width}×{value.image.height}px ·{" "}
                {Math.round(value.image.sizeBytes / 1024)} KB · Captura automática
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void startLiveSelfieFlow()}
            className="btn-secondary-3d inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-extrabold"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            <span>Repetir</span>
          </button>
        </div>
      )}
    </div>
  );
}
