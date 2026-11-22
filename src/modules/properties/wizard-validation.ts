import type { MidTermPolicy } from "./mid-term-policy";
import type { PropertyCurrency } from "./validators";

export type WizardFieldKey =
  | "addressLine"
  | "unitIdentifier"
  | "title"
  | "slug"
  | "description"
  | "maxAdults"
  | "wifiSpeedMbps"
  | "nightlyRate"
  | "monthlyDiscountPct"
  | "midTermInterviewChannels"
  | "images"
  | "accessCodePlain";

export interface WizardFieldIssue {
  fieldId: string;
  fieldKey: WizardFieldKey;
  fieldLabel: string;
  problem: string;
  action: string;
  /**
   * Indica que la persona ya ingresó un dato fuera de rango o mal formado, por lo que
   * conviene mostrar el error de forma inmediata sin esperar a que presione "Siguiente".
   */
  isOutOfRangeOrMalformed?: boolean;
}

export interface PropertyWizardValidationValues {
  addressLine: string;
  unitIdentifier: string;
  title: string;
  slug: string;
  description: string;
  maxAdults: number;
  wifiSpeedInput: string;
  baseCurrency: PropertyCurrency;
  nightlyRateInput: string;
  monthlyDiscountInput: string;
  midTermPolicy: MidTermPolicy;
  imagesCount: number;
  accessCodePlain: string;
  isEditing: boolean;
}

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOTAL_WIZARD_STEPS = 6;

function parseFiniteNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Valida los campos de un paso puntual del asistente de publicación/edición
 * alineado 1:1 con `CreatePropertyBaseSchema` y `UpdatePropertySchema`.
 */
export function validatePropertyWizardStep(
  step: number,
  values: PropertyWizardValidationValues
): WizardFieldIssue[] {
  const issues: WizardFieldIssue[] = [];

  if (step === 0) {
    const addr = values.addressLine.trim();
    if (addr.length === 0) {
      issues.push({
        fieldId: "prop-address",
        fieldKey: "addressLine",
        fieldLabel: "Dirección de la propiedad",
        problem: "Falta ingresar la dirección de la propiedad.",
        action:
          "Escribí la calle y altura (mínimo 5 caracteres, ej: Thames 1845, Palermo) antes de continuar.",
        isOutOfRangeOrMalformed: false,
      });
    } else if (addr.length < 5) {
      issues.push({
        fieldId: "prop-address",
        fieldKey: "addressLine",
        fieldLabel: "Dirección de la propiedad",
        problem: `Ingresaste solo ${addr.length} ${addr.length === 1 ? "carácter" : "caracteres"} en la dirección (mínimo 5).`,
        action:
          "Completá la dirección con calle y altura para alcanzar al menos 5 caracteres antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    } else if (addr.length > 200) {
      issues.push({
        fieldId: "prop-address",
        fieldKey: "addressLine",
        fieldLabel: "Dirección de la propiedad",
        problem: `La dirección tiene ${addr.length} caracteres y supera el máximo permitido de 200.`,
        action: "Acortá la dirección a 200 caracteres o menos antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    const unit = values.unitIdentifier.trim();
    if (unit.length === 0) {
      issues.push({
        fieldId: "prop-unit",
        fieldKey: "unitIdentifier",
        fieldLabel: "Piso / Departamento / Unidad",
        problem: "Falta indicar el piso, departamento o unidad funcional.",
        action:
          "Completá el identificador de unidad (ej: Piso 4 Depto B / UF 12) antes de continuar.",
        isOutOfRangeOrMalformed: false,
      });
    } else if (unit.length > 40) {
      issues.push({
        fieldId: "prop-unit",
        fieldKey: "unitIdentifier",
        fieldLabel: "Piso / Departamento / Unidad",
        problem: `El identificador tiene ${unit.length} caracteres y supera el máximo de 40.`,
        action:
          "Reducí el identificador de unidad a 40 caracteres o menos antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    return issues;
  }

  if (step === 1) {
    const title = values.title.trim();
    if (title.length === 0) {
      issues.push({
        fieldId: "prop-title",
        fieldKey: "title",
        fieldLabel: "Título del alojamiento",
        problem: "Falta escribir el título de tu alojamiento.",
        action:
          "Escribí un título claro de al menos 5 caracteres (ej: Studio Luminoso Palermo Soho) antes de continuar.",
        isOutOfRangeOrMalformed: false,
      });
    } else if (title.length < 5) {
      issues.push({
        fieldId: "prop-title",
        fieldKey: "title",
        fieldLabel: "Título del alojamiento",
        problem: `El título tiene solo ${title.length} ${title.length === 1 ? "carácter" : "caracteres"} (el mínimo es 5).`,
        action:
          "Sumá más palabras para llegar al menos a 5 caracteres antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    } else if (title.length > 140) {
      issues.push({
        fieldId: "prop-title",
        fieldKey: "title",
        fieldLabel: "Título del alojamiento",
        problem: `El título tiene ${title.length} caracteres y supera el máximo de 140.`,
        action: "Acortá el título a 140 caracteres o menos antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    const slug = values.slug.trim();
    const slugHasContext = title.length >= 5 || slug.length > 0;
    if (slug.length < 3) {
      issues.push({
        fieldId: "prop-slug",
        fieldKey: "slug",
        fieldLabel: "Enlace directo (slug)",
        problem:
          slug.length === 0
            ? "Falta generar un enlace directo válido para la publicación."
            : `El enlace directo "/p/${slug}" tiene solo ${slug.length} caracteres (mínimo 3).`,
        action:
          "Escribí un enlace con al menos 3 caracteres usando minúsculas, números o guiones (ej: loft-palermo-4b).",
        isOutOfRangeOrMalformed: slugHasContext,
      });
    } else if (slug.length > 120) {
      issues.push({
        fieldId: "prop-slug",
        fieldKey: "slug",
        fieldLabel: "Enlace directo (slug)",
        problem: `El enlace directo tiene ${slug.length} caracteres y supera el máximo de 120.`,
        action: "Acortá el enlace a 120 caracteres o menos antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    } else if (!SLUG_REGEX.test(slug)) {
      issues.push({
        fieldId: "prop-slug",
        fieldKey: "slug",
        fieldLabel: "Enlace directo (slug)",
        problem: "El enlace directo contiene caracteres o espacios no permitidos.",
        action:
          "Usá solo minúsculas, números y guiones medios (ej: loft-palermo-4b) antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    const desc = values.description.trim();
    if (desc.length === 0) {
      issues.push({
        fieldId: "prop-description",
        fieldKey: "description",
        fieldLabel: "Descripción del espacio",
        problem: "Falta escribir la descripción del alojamiento.",
        action:
          "Contales a los huéspedes qué tiene el espacio y cómo es la convivencia (mínimo 20 caracteres) antes de continuar.",
        isOutOfRangeOrMalformed: false,
      });
    } else if (desc.length < 20) {
      const missing = 20 - desc.length;
      issues.push({
        fieldId: "prop-description",
        fieldKey: "description",
        fieldLabel: "Descripción del espacio",
        problem: `La descripción tiene ${desc.length} de 20 caracteres mínimos requeridos.`,
        action: `Escribí al menos ${missing} ${missing === 1 ? "carácter más" : "caracteres más"} detallando la unidad antes de continuar.`,
        isOutOfRangeOrMalformed: true,
      });
    } else if (desc.length > 4000) {
      issues.push({
        fieldId: "prop-description",
        fieldKey: "description",
        fieldLabel: "Descripción del espacio",
        problem: `La descripción tiene ${desc.length} caracteres y supera el máximo de 4000.`,
        action:
          "Reducí el texto de la descripción a 4000 caracteres o menos antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    if (
      !Number.isInteger(values.maxAdults) ||
      values.maxAdults < 1 ||
      values.maxAdults > 20
    ) {
      issues.push({
        fieldId: "prop-max-adults",
        fieldKey: "maxAdults",
        fieldLabel: "Adultos máximos",
        problem: `La capacidad ingresada (${values.maxAdults}) está fuera del rango permitido (1 a 20 adultos).`,
        action:
          "Usá los botones + / - para elegir entre 1 y 20 adultos antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    const rawWifi = values.wifiSpeedInput.trim();
    const wifiNum = parseFiniteNumber(rawWifi);
    if (rawWifi.length === 0) {
      issues.push({
        fieldId: "prop-wifi",
        fieldKey: "wifiSpeedMbps",
        fieldLabel: "Velocidad de Wi-Fi (Mbps)",
        problem: "Falta indicar la velocidad de Wi-Fi estimada.",
        action:
          "Ingresá un número entero entre 1 y 10000 Mbps (ej: 300) antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    } else if (
      wifiNum === null ||
      !Number.isInteger(wifiNum) ||
      wifiNum < 1 ||
      wifiNum > 10000
    ) {
      issues.push({
        fieldId: "prop-wifi",
        fieldKey: "wifiSpeedMbps",
        fieldLabel: "Velocidad de Wi-Fi (Mbps)",
        problem: `Ingresaste "${rawWifi}" en Wi-Fi, pero debe ser un número entero entre 1 y 10000 Mbps.`,
        action:
          "Corregí el valor de Wi-Fi a un entero entre 1 y 10000 Mbps (ej: 300) antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    return issues;
  }

  if (step === 2) {
    const rawRate = values.nightlyRateInput.trim();
    const rateNum = parseFiniteNumber(rawRate);
    if (rawRate.length === 0) {
      issues.push({
        fieldId: "prop-rate",
        fieldKey: "nightlyRate",
        fieldLabel: `Tarifa por noche (${values.baseCurrency})`,
        problem: `Falta ingresar la tarifa por noche en ${values.baseCurrency}.`,
        action: `Escribí un precio mayor a 0 en ${values.baseCurrency} antes de continuar.`,
        isOutOfRangeOrMalformed: true,
      });
    } else if (rateNum === null || rateNum <= 0) {
      issues.push({
        fieldId: "prop-rate",
        fieldKey: "nightlyRate",
        fieldLabel: `Tarifa por noche (${values.baseCurrency})`,
        problem: `Ingresaste "${rawRate}", pero la tarifa por noche debe ser mayor a 0.`,
        action: `Ingresá un valor numérico mayor a 0 en ${values.baseCurrency} antes de continuar.`,
        isOutOfRangeOrMalformed: true,
      });
    } else if (rateNum > 50_000_000) {
      issues.push({
        fieldId: "prop-rate",
        fieldKey: "nightlyRate",
        fieldLabel: `Tarifa por noche (${values.baseCurrency})`,
        problem: `Ingresaste ${rawRate} y supera el límite máximo permitido (50.000.000).`,
        action:
          "Ingresá una tarifa por noche menor o igual a 50.000.000 antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    const rawDiscount = values.monthlyDiscountInput.trim();
    const discountNum = parseFiniteNumber(rawDiscount);
    if (rawDiscount.length === 0 || discountNum === null) {
      issues.push({
        fieldId: "prop-discount",
        fieldKey: "monthlyDiscountPct",
        fieldLabel: "Descuento estadía larga (15–50%)",
        problem:
          "Falta definir el descuento para estadías largas (1 a 6 meses).",
        action:
          "Ingresá un porcentaje entre 15% y 50% (por ejemplo, 20%) antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    } else if (discountNum < 15) {
      issues.push({
        fieldId: "prop-discount",
        fieldKey: "monthlyDiscountPct",
        fieldLabel: "Descuento estadía larga (15–50%)",
        problem: `Ingresaste ${rawDiscount}% de descuento, que está por debajo del mínimo permitido (15%).`,
        action:
          "Subilo a un valor entre 15% y 50% (por ejemplo, 20%) antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    } else if (discountNum > 50) {
      issues.push({
        fieldId: "prop-discount",
        fieldKey: "monthlyDiscountPct",
        fieldLabel: "Descuento estadía larga (15–50%)",
        problem: `Ingresaste ${rawDiscount}% de descuento, que supera el máximo permitido (50%).`,
        action:
          "Bajalo a un valor entre 15% y 50% (por ejemplo, 25%) antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    return issues;
  }

  if (step === 3) {
    if (
      values.midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW" &&
      values.midTermPolicy.interviewChannels.length < 1
    ) {
      issues.push({
        fieldId: "prop-midterm-channels",
        fieldKey: "midTermInterviewChannels",
        fieldLabel: "Canales de entrevista",
        problem:
          "Elegiste entrevista previa para estadías de 1 a 6 meses, pero no marcaste ningún canal de contacto.",
        action:
          "Seleccioná al menos 1 canal (chat interno de I-bita, videollamada o WhatsApp) antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    return issues;
  }

  if (step === 4) {
    if (values.imagesCount < 1) {
      issues.push({
        fieldId: "photo-file-input",
        fieldKey: "images",
        fieldLabel: "Fotos del espacio",
        problem: "Todavía no agregaste ninguna fotografía de la propiedad.",
        action:
          "Subí al menos 1 foto propia o sumá una foto de muestra antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    } else if (values.imagesCount > 10) {
      issues.push({
        fieldId: "photo-file-input",
        fieldKey: "images",
        fieldLabel: "Fotos del espacio",
        problem: `Cargaste ${values.imagesCount} fotos y el máximo permitido es 10.`,
        action:
          "Eliminá fotos excedentes hasta dejar 10 o menos antes de continuar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    return issues;
  }

  if (step === 5) {
    const pin = values.accessCodePlain.trim();
    if (!values.isEditing) {
      if (pin.length === 0) {
        issues.push({
          fieldId: "prop-pin",
          fieldKey: "accessCodePlain",
          fieldLabel: "Clave o instrucciones de entrada",
          problem: "Falta escribir la clave o instrucciones de entrada.",
          action:
            "Ingresá el PIN o instrucción de acceso (mínimo 4 caracteres) antes de publicar la propiedad.",
          isOutOfRangeOrMalformed: false,
        });
      } else if (pin.length < 4) {
        issues.push({
          fieldId: "prop-pin",
          fieldKey: "accessCodePlain",
          fieldLabel: "Clave o instrucciones de entrada",
          problem: `Ingresaste solo ${pin.length} ${pin.length === 1 ? "carácter" : "caracteres"} en la clave de entrada (mínimo 4).`,
          action:
            "Agregá al menos 4 caracteres antes de publicar la propiedad.",
          isOutOfRangeOrMalformed: true,
        });
      } else if (pin.length > 240) {
        issues.push({
          fieldId: "prop-pin",
          fieldKey: "accessCodePlain",
          fieldLabel: "Clave o instrucciones de entrada",
          problem: `Las instrucciones tienen ${pin.length} caracteres y superan el máximo de 240.`,
          action:
            "Acortá las instrucciones a 240 caracteres o menos antes de publicar.",
          isOutOfRangeOrMalformed: true,
        });
      }
    } else if (pin.length > 0 && pin.length < 4) {
      issues.push({
        fieldId: "prop-pin",
        fieldKey: "accessCodePlain",
        fieldLabel: "Nueva clave de entrada",
        problem: `Ingresaste solo ${pin.length} ${pin.length === 1 ? "carácter" : "caracteres"} en la nueva clave (mínimo 4).`,
        action:
          "Escribí al menos 4 caracteres o dejá el campo vacío para conservar la clave actual.",
        isOutOfRangeOrMalformed: true,
      });
    } else if (pin.length > 240) {
      issues.push({
        fieldId: "prop-pin",
        fieldKey: "accessCodePlain",
        fieldLabel: "Nueva clave de entrada",
        problem: `Las instrucciones tienen ${pin.length} caracteres y superan el máximo de 240.`,
        action: "Acortalas a 240 caracteres o menos antes de guardar.",
        isOutOfRangeOrMalformed: true,
      });
    }

    return issues;
  }

  return issues;
}

export function validateAllPropertyWizardSteps(
  values: PropertyWizardValidationValues
): {
  firstInvalidStep: number | null;
  issuesByStep: Record<number, WizardFieldIssue[]>;
} {
  const issuesByStep: Record<number, WizardFieldIssue[]> = {};
  let firstInvalidStep: number | null = null;

  for (let step = 0; step < TOTAL_WIZARD_STEPS; step++) {
    const stepIssues = validatePropertyWizardStep(step, values);
    issuesByStep[step] = stepIssues;
    if (stepIssues.length > 0 && firstInvalidStep === null) {
      firstInvalidStep = step;
    }
  }

  return { firstInvalidStep, issuesByStep };
}
