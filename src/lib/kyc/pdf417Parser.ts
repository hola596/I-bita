import type {
  DniGender,
  ParsedArgentineDni,
  Pdf417ParseResult,
} from "./types";

/**
 * Formatea un DNI de 7 u 8 dígitos con puntos (`38.941.205`).
 */
export function formatArgentineDni(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Enmascara un DNI para mostrarlo de forma segura en UI (`•••.•••.205`).
 */
export function maskArgentineDni(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return "•••.•••";
  return `•••.•••.${digits.slice(-3)}`;
}

/**
 * Convierte una fecha RENAPER (`DD/MM/YYYY`, `DD-MM-YYYY` o `YYYY-MM-DD`) a ISO `YYYY-MM-DD`.
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
      throw new Error(
        `Fecha inválida en el código del DNI ("${rawDate}"). Se esperaba DD/MM/AAAA.`
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
    throw new Error(`Fecha fuera de rango en el DNI ("${rawDate}").`);
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new Error(`Fecha inexistente en el código del DNI ("${rawDate}").`);
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
 * Parsea de forma estricta la cadena PDF417 del DNI tarjeta argentino (RENAPER).
 * Soporta formato estándar actual (`tramite@apellido@nombre@sexo@dni@ejemplar@nacimiento@emision[@cuil]`)
 * y el formato histórico de 1.ª generación con `@` inicial.
 */
export function parseArgentineDniPdf417Strict(
  rawPayload: string,
  options?: { requireAdult?: boolean; referenceDate?: Date }
): ParsedArgentineDni {
  const requireAdult = options?.requireAdult ?? true;
  const trimmed = (rawPayload ?? "").trim();

  if (!trimmed || !trimmed.includes("@")) {
    throw new Error(
      "El código leído no corresponde a un DNI tarjeta argentino (formato RENAPER separado por '@')."
    );
  }

  const parts = trimmed.split("@").map((part) => part.trim());

  let tramiteRaw = "";
  let lastNameRaw = "";
  let firstNameRaw = "";
  let genderRaw = "";
  let documentNumberRaw = "";
  let ejemplarRaw = "";
  let birthDateRaw = "";
  let issueDateRaw = "";

  if (parts[0] && /^\d{6,15}$/.test(parts[0]) && parts.length >= 8) {
    tramiteRaw = parts[0] ?? "";
    lastNameRaw = parts[1] ?? "";
    firstNameRaw = parts[2] ?? "";
    genderRaw = parts[3] ?? "";
    documentNumberRaw = parts[4] ?? "";
    ejemplarRaw = parts[5] ?? "A";
    birthDateRaw = parts[6] ?? "";
    issueDateRaw = parts[7] ?? "";
  } else if (parts[0] === "" && parts.length >= 10) {
    documentNumberRaw = parts[1] ?? "";
    ejemplarRaw = parts[2] ?? "A";
    lastNameRaw = parts[4] ?? "";
    firstNameRaw = parts[5] ?? "";
    birthDateRaw = parts[7] ?? "";
    genderRaw = parts[8] ?? "";
    issueDateRaw = parts[9] ?? "";
    tramiteRaw = parts[10] || "00000000000";
  } else {
    throw new Error(
      "No pudimos leer todos los campos del código del DNI. Volvé a enfocar con buena luz."
    );
  }

  const cleanDni = documentNumberRaw.replace(/\D/g, "");
  if (!/^\d{7,8}$/.test(cleanDni)) {
    throw new Error(
      `El número de DNI leído ("${documentNumberRaw}") no es válido. Debe tener 7 u 8 dígitos.`
    );
  }

  const cleanTramite = tramiteRaw.replace(/\D/g, "");
  if (!/^\d{6,15}$/.test(cleanTramite)) {
    throw new Error(
      "El número de trámite leído en el DNI no es válido. Volvé a escanear."
    );
  }

  const lastName = lastNameRaw.replace(/\s+/g, " ").trim().toUpperCase();
  const firstName = firstNameRaw.replace(/\s+/g, " ").trim().toUpperCase();
  if (lastName.length < 2 || firstName.length < 2) {
    throw new Error(
      "El código del DNI no contiene apellido y nombre legibles."
    );
  }

  const normalizedGender = genderRaw.toUpperCase();
  if (
    normalizedGender !== "M" &&
    normalizedGender !== "F" &&
    normalizedGender !== "X"
  ) {
    throw new Error(
      `Sexo documental inválido en el DNI ("${genderRaw}").`
    );
  }

  const birthDate = parseRenaperDateToIso(birthDateRaw);
  const issueDate = parseRenaperDateToIso(issueDateRaw);
  const ageYears = calculateAgeYears(birthDate, options?.referenceDate);
  const isAdult = ageYears >= 18;

  if (requireAdult && !isAdult) {
    throw new Error(
      `El DNI pertenece a un menor de edad (${ageYears} años). Solo adultos mayores de 18 años pueden completar esta verificación.`
    );
  }

  return {
    tramiteNumber: cleanTramite,
    lastName,
    firstName,
    fullName: `${firstName} ${lastName}`,
    gender: normalizedGender as DniGender,
    documentNumber: cleanDni,
    documentNumberFormatted: formatArgentineDni(cleanDni),
    ejemplar: (ejemplarRaw || "A").toUpperCase().slice(0, 4),
    birthDate,
    issueDate,
    ageYears,
    isAdult,
    rawPayload: trimmed,
  };
}

/**
 * Variante segura que retorna `{ ok: true, data }` o `{ ok: false, error }`.
 */
export function parseArgentineDniPdf417(
  rawPayload: string,
  options?: { requireAdult?: boolean; referenceDate?: Date }
): Pdf417ParseResult {
  try {
    const data = parseArgentineDniPdf417Strict(rawPayload, options);
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "No pudimos validar el código de barras del DNI argentino.",
    };
  }
}
