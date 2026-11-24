import type {
  CompressedKycImage,
  ImageQualityMetrics,
  ImageQualityResult,
  KycImageKind,
} from "./types";

export const MAX_KYC_COMPRESSED_BYTES = 300 * 1024; // 300 KB máx en cliente
export const MAX_KYC_SERVER_BYTES = 500 * 1024; // 500 KB máx en backend

const QUALITY_THRESHOLDS: Record<
  KycImageKind,
  { minBlurVariance: number; maxGlareRatio: number; minBrightness: number }
> = {
  "dni-front": {
    minBlurVariance: 42,
    maxGlareRatio: 0.12,
    minBrightness: 32,
  },
  selfie: {
    minBlurVariance: 24,
    maxGlareRatio: 0.18,
    minBrightness: 28,
  },
};

/**
 * Calcula varianza del operador Laplaciano (desenfoque), porcentaje de píxeles saturados > 250 (reflejo)
 * y luminancia media sobre un buffer RGBA en memoria.
 */
export function computeImageQualityFromRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  kind: KycImageKind
): ImageQualityResult {
  const thresholds = QUALITY_THRESHOLDS[kind];

  if (width < 24 || height < 24 || rgba.length < width * height * 4) {
    return {
      ok: false,
      reason: "La imagen es demasiado pequeña para analizar su nitidez.",
      metrics: {
        blurVariance: 0,
        glareRatio: 0,
        meanBrightness: 0,
        width,
        height,
      },
    };
  }

  // Analizar ROI central (70% ancho x 70% alto) para evitar bordes/fondos irrelevantes
  const startX = Math.floor(width * 0.15);
  const endX = Math.ceil(width * 0.85);
  const startY = Math.floor(height * 0.15);
  const endY = Math.ceil(height * 0.85);
  const roiW = Math.max(8, endX - startX);
  const roiH = Math.max(8, endY - startY);

  const gray = new Float32Array(roiW * roiH);
  let glarePixels = 0;
  let brightnessSum = 0;

  for (let y = 0; y < roiH; y += 1) {
    const srcY = startY + y;
    for (let x = 0; x < roiW; x += 1) {
      const srcX = startX + x;
      const offset = (srcY * width + srcX) * 4;
      const r = rgba[offset] ?? 0;
      const g = rgba[offset + 1] ?? 0;
      const b = rgba[offset + 2] ?? 0;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[y * roiW + x] = lum;
      brightnessSum += lum;

      if (r > 250 && g > 250 && b > 250) {
        glarePixels += 1;
      }
    }
  }

  const totalRoiPixels = roiW * roiH;
  const meanBrightness = brightnessSum / totalRoiPixels;
  const glareRatio = glarePixels / totalRoiPixels;

  // Varianza del operador Laplaciano 3x3: [0, 1, 0; 1, -4, 1; 0, 1, 0]
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;

  for (let y = 1; y < roiH - 1; y += 1) {
    const rowOffset = y * roiW;
    for (let x = 1; x < roiW - 1; x += 1) {
      const idx = rowOffset + x;
      const lap =
        gray[idx - roiW]! +
        gray[idx - 1]! -
        4 * gray[idx]! +
        gray[idx + 1]! +
        gray[idx + roiW]!;
      lapSum += lap;
      lapSqSum += lap * lap;
      lapCount += 1;
    }
  }

  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const blurVariance =
    lapCount > 0 ? Math.max(0, lapSqSum / lapCount - lapMean * lapMean) : 0;

  const metrics: ImageQualityMetrics = {
    blurVariance: Number(blurVariance.toFixed(2)),
    glareRatio: Number(glareRatio.toFixed(4)),
    meanBrightness: Number(meanBrightness.toFixed(1)),
    width,
    height,
  };

  if (glareRatio > thresholds.maxGlareRatio) {
    return {
      ok: false,
      reason:
        kind === "dni-front"
          ? "Mucha luz o reflejo en el DNI. Incliná levemente el documento o alejate de la luz directa."
          : "Mucha luz o reflejo directo en el rostro. Buscá iluminación pareja sin contraluz.",
      metrics,
    };
  }

  if (meanBrightness < thresholds.minBrightness) {
    return {
      ok: false,
      reason:
        kind === "dni-front"
          ? "La foto del DNI está muy oscura. Buscá un lugar más iluminado sin usar flash directo."
          : "Hay poca luz sobre tu rostro. Buscá un espacio mejor iluminado.",
      metrics,
    };
  }

  if (blurVariance < thresholds.minBlurVariance) {
    return {
      ok: false,
      reason:
        kind === "dni-front"
          ? "La foto del DNI salió borrosa. Apoyá el documento sobre una superficie firme y enfocá bien antes de capturar."
          : "La imagen salió movida o borrosa. Quedate quieto un segundo frente a la cámara.",
      metrics,
    };
  }

  return { ok: true, metrics };
}

/**
 * Analiza la calidad de imagen (desenfoque + reflejos) directamente sobre un `<canvas>`.
 */
export function analyzeCanvasImageQuality(
  canvas: HTMLCanvasElement,
  kind: KycImageKind
): ImageQualityResult {
  const analysisMaxSide = 480;
  const scale = Math.min(1, analysisMaxSide / Math.max(canvas.width, canvas.height));
  const w = Math.max(32, Math.round(canvas.width * scale));
  const h = Math.max(32, Math.round(canvas.height * scale));

  const workCanvas = document.createElement("canvas");
  workCanvas.width = w;
  workCanvas.height = h;
  const ctx = workCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return {
      ok: false,
      reason: "No se pudo inicializar el analizador de imagen en este navegador.",
      metrics: { blurVariance: 0, glareRatio: 0, meanBrightness: 0, width: w, height: h },
    };
  }

  ctx.drawImage(canvas, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return computeImageQualityFromRgba(imageData.data, w, h, kind);
}

async function drawSourceToCanvas(
  source: File | Blob | HTMLCanvasElement | HTMLVideoElement,
  maxDimension: number
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("El navegador no soporta procesamiento de imagen en canvas.");
  }

  if (source instanceof HTMLCanvasElement) {
    const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  if (source instanceof HTMLVideoElement) {
    const vw = source.videoWidth || 960;
    const vh = source.videoHeight || 720;
    const scale = Math.min(1, maxDimension / Math.max(vw, vh));
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  const objectUrl = URL.createObjectURL(source);
  try {
    const img = new window.Image();
    img.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () =>
        reject(new Error("No pudimos abrir la imagen seleccionada. Probá con otro archivo."));
    });
    const natW = img.naturalWidth || img.width || maxDimension;
    const natH = img.naturalHeight || img.height || maxDimension;
    const scale = Math.min(1, maxDimension / Math.max(natW, natH));
    canvas.width = Math.max(1, Math.round(natW * scale));
    canvas.height = Math.max(1, Math.round(natH * scale));
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlobAsync(
  canvas: HTMLCanvasElement,
  mimeType: "image/jpeg" | "image/webp",
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo comprimir la imagen capturada."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Redimensiona, evalúa IQA (blur + reflejos) y comprime la captura en `<canvas>`
 * garantizando un peso final `<= 300 KB`.
 */
export async function compressAndValidateKycImage(
  source: File | Blob | HTMLCanvasElement | HTMLVideoElement,
  kind: KycImageKind,
  options?: {
    preferredMimeType?: "image/jpeg" | "image/webp";
    maxBytes?: number;
    skipQualityCheck?: boolean;
  }
): Promise<CompressedKycImage> {
  const maxBytes = options?.maxBytes ?? MAX_KYC_COMPRESSED_BYTES;
  const mimeType = options?.preferredMimeType ?? "image/jpeg";
  const maxDim = kind === "dni-front" ? 1280 : 960;

  let workingCanvas = await drawSourceToCanvas(source, maxDim);

  const quality: ImageQualityResult = options?.skipQualityCheck
    ? {
        ok: true,
        metrics: {
          blurVariance: 100,
          glareRatio: 0,
          meanBrightness: 128,
          width: workingCanvas.width,
          height: workingCanvas.height,
        },
      }
    : analyzeCanvasImageQuality(workingCanvas, kind);

  if (!quality.ok) {
    throw new Error(quality.reason || "La calidad de imagen no es suficiente.");
  }

  const qualitySteps = [0.86, 0.78, 0.7, 0.62, 0.54, 0.45];
  let bestBlob: Blob | null = null;

  for (let pass = 0; pass < 3; pass += 1) {
    for (const q of qualitySteps) {
      const candidate = await canvasToBlobAsync(workingCanvas, mimeType, q);
      bestBlob = candidate;
      if (candidate.size <= maxBytes) {
        const ext = mimeType === "image/webp" ? "webp" : "jpg";
        const file = new File([candidate], `${kind}-${Date.now()}.${ext}`, {
          type: mimeType,
        });
        return {
          blob: candidate,
          file,
          previewUrl: URL.createObjectURL(candidate),
          mimeType,
          sizeBytes: candidate.size,
          width: workingCanvas.width,
          height: workingCanvas.height,
          quality,
        };
      }
    }

    // Si aún supera 300 KB, reducir resolución un 15% y reintentar
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(320, Math.round(workingCanvas.width * 0.85));
    scaled.height = Math.max(240, Math.round(workingCanvas.height * 0.85));
    const sCtx = scaled.getContext("2d");
    if (sCtx) {
      sCtx.drawImage(workingCanvas, 0, 0, scaled.width, scaled.height);
      workingCanvas = scaled;
    }
  }

  if (!bestBlob || bestBlob.size > MAX_KYC_SERVER_BYTES) {
    throw new Error(
      "No pudimos comprimir la imagen por debajo de 300 KB manteniendo nitidez. Probá con otra captura."
    );
  }

  const ext = mimeType === "image/webp" ? "webp" : "jpg";
  const file = new File([bestBlob], `${kind}-${Date.now()}.${ext}`, {
    type: mimeType,
  });

  return {
    blob: bestBlob,
    file,
    previewUrl: URL.createObjectURL(bestBlob),
    mimeType,
    sizeBytes: bestBlob.size,
    width: workingCanvas.width,
    height: workingCanvas.height,
    quality,
  };
}
