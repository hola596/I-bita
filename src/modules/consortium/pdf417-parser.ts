import {
  PDF417Reader,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  GlobalHistogramBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
import { BrowserPDF417Reader } from "@zxing/browser";
import { AppError } from "@/lib/errors/app-error";

export interface ParsedArgentineDniPdf417 {
  tramiteNumber: string;
  lastName: string;
  firstName: string;
  fullName: string;
  gender: "M" | "F" | "X";
  documentNumber: string;
  ejemplar: string;
  birthDate: string; // YYYY-MM-DD
  issueDate: string; // YYYY-MM-DD
  ageYears: number;
  isAdult: boolean;
  rawPayload: string;
}

/**
 * Configura los hints de decodificación de `@zxing/library` para priorizar
 * el estándar PDF417 utilizado en el dorso del DNI tarjeta argentino (RENAPER).
 */
export function createZxingPdf417Hints(): Map<DecodeHintType, unknown> {
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return hints;
}

/**
 * Convierte una fecha RENAPER (`DD/MM/YYYY`, `DD-MM-YYYY` o `YYYY-MM-DD`) a formato ISO `YYYY-MM-DD`.
 */
export function parseRenaperDateToIso(rawDate: string): string {
  const cleaned = rawDate.trim();
  let year: number;
  let month: number;
  let day: number;

  const dmyMatch = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(cleaned);
  if (dmyMatch) {
    day = Number(dmyMatch[1]);
    month = Number(dmyMatch[2]);
    year = Number(dmyMatch[3]);
  } else {
    const ymdMatch = /^(\d{4})[/-](\d{2})[/-](\d{2})$/.exec(cleaned);
    if (!ymdMatch) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Fecha inválida en trama PDF417 del DNI: "${rawDate}". Se esperaba formato DD/MM/YYYY.`,
        422
      );
    }
    year = Number(ymdMatch[1]);
    month = Number(ymdMatch[2]);
    day = Number(ymdMatch[3]);
  }

  if (
    year < 1900 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Fecha fuera de rango en trama PDF417 del DNI: "${rawDate}".`,
      422
    );
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Fecha calendario inexistente en trama PDF417 del DNI: "${rawDate}".`,
      422
    );
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

/**
 * Calcula la edad cumplida en años a partir de `birthDateIso` (`YYYY-MM-DD`).
 */
export function calculateAgeYears(
  birthDateIso: string,
  referenceDate: Date = new Date()
): number {
  const [bYear = 1970, bMonth = 1, bDay = 1] = birthDateIso
    .split("-")
    .map(Number);

  const refYear = referenceDate.getUTCFullYear();
  const refMonth = referenceDate.getUTCMonth() + 1;
  const refDay = referenceDate.getUTCDate();

  let age = refYear - bYear;
  if (refMonth < bMonth || (refMonth === bMonth && refDay < bDay)) {
    age -= 1;
  }
  return age;
}

/**
 * Parsea y valida de forma determinista la trama oficial PDF417 del DNI tarjeta argentino
 * emitida por RENAPER (8/9 campos separados por `@`:
 * `tramite@apellido@nombre@sexo@dni@ejemplar@fecha_nacimiento@fecha_emision[@cuil]`).
 * También soporta el formato RENAPER de primera generación con `@` inicial.
 *
 * Rechaza tramas corruptas o documentos pertenecientes a menores de 18 años
 * cuando `requireAdult` es `true` (por defecto `true` para cumplir AC-1).
 */
export function parseArgentineDniPdf417(
  rawPayload: string,
  options?: { requireAdult?: boolean; referenceDate?: Date }
): ParsedArgentineDniPdf417 {
  const requireAdult = options?.requireAdult ?? true;
  const trimmed = (rawPayload ?? "").trim();

  if (!trimmed || !trimmed.includes("@")) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La trama PDF417 escaneada está vacía o no corresponde al estándar RENAPER del DNI argentino (campos separados por '@').",
      422
    );
  }

  const parts = trimmed.split("@").map((part) => part.trim());

  let tramiteNumber = "";
  let lastName = "";
  let firstName = "";
  let genderRaw = "";
  let documentNumberRaw = "";
  let ejemplar = "";
  let birthDateRaw = "";
  let issueDateRaw = "";

  // Formato estándar RENAPER actual (8 o 9+ campos):
  // 0: tramite | 1: apellido | 2: nombre | 3: sexo | 4: dni | 5: ejemplar | 6: fecha_nacimiento | 7: fecha_emision
  if (parts[0] && /^\d{6,15}$/.test(parts[0]) && parts.length >= 8) {
    tramiteNumber = parts[0] ?? "";
    lastName = parts[1] ?? "";
    firstName = parts[2] ?? "";
    genderRaw = parts[3] ?? "";
    documentNumberRaw = parts[4] ?? "";
    ejemplar = parts[5] ?? "A";
    birthDateRaw = parts[6] ?? "";
    issueDateRaw = parts[7] ?? "";
  } else if (parts[0] === "" && parts.length >= 10) {
    // Formato RENAPER primera generación (comienza con `@`):
    // 1: dni | 2: ejemplar | 4: apellido | 5: nombre | 7: fecha_nacimiento | 8: sexo | 9: fecha_emision | 10: tramite
    documentNumberRaw = parts[1] ?? "";
    ejemplar = parts[2] ?? "A";
    lastName = parts[4] ?? "";
    firstName = parts[5] ?? "";
    birthDateRaw = parts[7] ?? "";
    genderRaw = parts[8] ?? "";
    issueDateRaw = parts[9] ?? "";
    tramiteNumber = parts[10] || "00000000000";
  } else {
    throw new AppError(
      "VALIDATION_ERROR",
      "Trama PDF417 corrupta o incompleta: no se encontraron los 8 campos obligatorios del DNI argentino (RENAPER).",
      422
    );
  }

  const cleanDni = documentNumberRaw.replace(/\D/g, "");
  if (!/^\d{7,8}$/.test(cleanDni)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Número de DNI inválido en código PDF417 ("${documentNumberRaw}"). Debe contener 7 u 8 dígitos numéricos.`,
      422
    );
  }

  if (!/^\d{6,15}$/.test(tramiteNumber.replace(/\D/g, ""))) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Número de trámite RENAPER inválido en la trama PDF417.",
      422
    );
  }

  const cleanLastName = lastName.replace(/\s+/g, " ").trim().toUpperCase();
  const cleanFirstName = firstName.replace(/\s+/g, " ").trim().toUpperCase();
  if (cleanLastName.length < 2 || cleanFirstName.length < 2) {
    throw new AppError(
      "VALIDATION_ERROR",
      "La trama PDF417 no contiene apellido y nombre válidos del titular.",
      422
    );
  }

  const normalizedGender = genderRaw.toUpperCase();
  if (
    normalizedGender !== "M" &&
    normalizedGender !== "F" &&
    normalizedGender !== "X"
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Sexo documental inválido en trama PDF417 ("${genderRaw}"). Valores admitidos por RENAPER: M, F o X.`,
      422
    );
  }

  const birthDate = parseRenaperDateToIso(birthDateRaw);
  const issueDate = parseRenaperDateToIso(issueDateRaw);
  const ageYears = calculateAgeYears(birthDate, options?.referenceDate);
  const isAdult = ageYears >= 18;

  if (requireAdult && !isAdult) {
    throw new AppError(
      "VALIDATION_ERROR",
      `El DNI escaneado pertenece a un menor de edad (${ageYears} años, fecha de nacimiento ${birthDate}). Los cupos de adultos declarados requieren ser mayores de 18 años.`,
      422,
      { documentNumber: cleanDni, birthDate, ageYears }
    );
  }

  return {
    tramiteNumber: tramiteNumber.replace(/\D/g, ""),
    lastName: cleanLastName,
    firstName: cleanFirstName,
    fullName: `${cleanFirstName} ${cleanLastName}`,
    gender: normalizedGender,
    documentNumber: cleanDni,
    ejemplar: (ejemplar || "A").toUpperCase().slice(0, 4),
    birthDate,
    issueDate,
    ageYears,
    isAdult,
    rawPayload: trimmed,
  };
}

/**
 * Decodifica un código de barras PDF417 desde una matriz de píxeles RGBA o escala de grises
 * utilizando `PDF417Reader`, `RGBLuminanceSource`, `BinaryBitmap` y `HybridBinarizer` de `@zxing/library`.
 */
export function decodePdf417FromRgbaBufferWithZxing(
  pixelBuffer: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number
): string {
  if (width <= 0 || height <= 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Dimensiones de imagen inválidas para decodificar PDF417 con @zxing/library.",
      422
    );
  }

  const totalPixels = width * height;
  let luminances: Uint8ClampedArray;

  if (pixelBuffer.length === totalPixels * 4) {
    luminances = new Uint8ClampedArray(totalPixels);
    for (let i = 0; i < totalPixels; i += 1) {
      const offset = i * 4;
      const r = pixelBuffer[offset] ?? 0;
      const g = pixelBuffer[offset + 1] ?? 0;
      const b = pixelBuffer[offset + 2] ?? 0;
      luminances[i] = ((r + (g << 1) + b) >> 2) & 0xff;
    }
  } else if (pixelBuffer.length === totalPixels) {
    luminances =
      pixelBuffer instanceof Uint8ClampedArray
        ? pixelBuffer
        : new Uint8ClampedArray(pixelBuffer);
  } else {
    throw new AppError(
      "VALIDATION_ERROR",
      `El buffer de píxeles (${pixelBuffer.length} bytes) no coincide con las dimensiones ${width}x${height}.`,
      422
    );
  }

  const source = new RGBLuminanceSource(luminances, width, height);
  const hints = createZxingPdf417Hints();
  const reader = new PDF417Reader();

  try {
    const hybridBitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = reader.decode(hybridBitmap, hints);
    return result.getText();
  } catch {
    try {
      const histogramBitmap = new BinaryBitmap(
        new GlobalHistogramBinarizer(source)
      );
      const fallbackResult = reader.decode(histogramBitmap, hints);
      return fallbackResult.getText();
    } catch {
      throw new AppError(
        "VALIDATION_ERROR",
        "No se detectó un código de barras PDF417 legible en la imagen proporcionada. Asegurate de enfocar el dorso del DNI argentino con buena iluminación.",
        422
      );
    }
  }
}

/**
 * Decodifica en el navegador un elemento `HTMLImageElement` o `HTMLCanvasElement`
 * usando `BrowserPDF417Reader` (`@zxing/browser`) y `@zxing/library`, y parsea la trama RENAPER.
 */
export async function decodeDniPdf417FromBrowserImage(
  imageElement: HTMLImageElement
): Promise<ParsedArgentineDniPdf417> {
  const browserReader = new BrowserPDF417Reader();

  try {
    const result = await browserReader.decodeFromImageElement(imageElement);
    return parseArgentineDniPdf417(result.getText());
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      const width = imageElement.naturalWidth || imageElement.width || 1200;
      const height = imageElement.naturalHeight || imageElement.height || 800;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(imageElement, 0, 0, width, height);
        const imageData = ctx.getImageData(0, 0, width, height);
        const rawText = decodePdf417FromRgbaBufferWithZxing(
          imageData.data,
          width,
          height
        );
        return parseArgentineDniPdf417(rawText);
      }
    }

    throw new AppError(
      "VALIDATION_ERROR",
      "No se pudo decodificar el código PDF417 del dorso del DNI con @zxing/browser. Intentá nuevamente con mayor nitidez o ingresá la lectura del dorso.",
      422
    );
  }
}
