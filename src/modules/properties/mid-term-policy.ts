import { z } from "zod";

export const MID_TERM_APPROVAL_MODES = [
  "INSTANT",
  "HOST_APPROVAL_INTERVIEW",
] as const;

export type MidTermApprovalMode = (typeof MID_TERM_APPROVAL_MODES)[number];

export const INTERVIEW_CHANNELS = [
  "PLATFORM_CHAT",
  "PLATFORM_VOICE",
  "PLATFORM_VIDEO",
] as const;

export type InterviewChannel = (typeof INTERVIEW_CHANNELS)[number];

export const INTERVIEW_CHANNEL_LABELS: Record<InterviewChannel, string> = {
  PLATFORM_CHAT: "Chat interno en I-bita",
  PLATFORM_VOICE: "Entrevista por audio en I-bita",
  PLATFORM_VIDEO: "Videollamada dentro de I-bita",
};

const LEGACY_CHANNEL_MAP: Record<string, InterviewChannel> = {
  PHONE: "PLATFORM_VOICE",
  WHATSAPP_CALL: "PLATFORM_CHAT",
  VIDEO_CALL: "PLATFORM_VIDEO",
};

export const REQUIREMENT_CATEGORIES = [
  "FINANCIAL",
  "FOREIGNERS",
  "DOCUMENTATION",
  "CUSTOM",
] as const;

export type RequirementCategory = (typeof REQUIREMENT_CATEGORIES)[number];

export const REQUIREMENT_CATEGORY_LABELS: Record<RequirementCategory, string> = {
  FINANCIAL: "Pagos y garantía",
  FOREIGNERS: "Huéspedes extranjeros",
  DOCUMENTATION: "Documentación",
  CUSTOM: "Personalizado",
};

export const RESPONSE_TIME_OPTIONS = [12, 24, 48, 72] as const;
export type ResponseTimeHours = (typeof RESPONSE_TIME_OPTIONS)[number];

export const MidTermApprovalModeSchema = z.enum(MID_TERM_APPROVAL_MODES);
export const InterviewChannelSchema = z.preprocess((raw) => {
  if (typeof raw === "string" && raw in LEGACY_CHANNEL_MAP) {
    return LEGACY_CHANNEL_MAP[raw];
  }
  return raw;
}, z.enum(INTERVIEW_CHANNELS));
export const RequirementCategorySchema = z.enum(REQUIREMENT_CATEGORIES);

export const MidTermRequirementSchema = z.object({
  id: z.string().min(1).max(64),
  key: z.string().min(1).max(64),
  label: z
    .string()
    .trim()
    .min(2, "El nombre del requisito debe tener al menos 2 caracteres")
    .max(120, "El nombre del requisito no puede superar los 120 caracteres"),
  detail: z
    .string()
    .trim()
    .max(320, "El detalle del requisito no puede superar los 320 caracteres"),
  enabled: z.boolean(),
  required: z.boolean(),
  category: RequirementCategorySchema,
  isCustom: z.boolean().default(false),
});

export type MidTermRequirement = z.infer<typeof MidTermRequirementSchema>;

export const MidTermPolicySchema = z
  .object({
    approvalMode: MidTermApprovalModeSchema,
    interviewChannels: z.array(InterviewChannelSchema).max(3),
    responseTimeHours: z
      .union([z.literal(12), z.literal(24), z.literal(48), z.literal(72)])
      .default(24),
    interviewInstructions: z
      .string()
      .trim()
      .max(500, "Las aclaraciones de entrevista no pueden superar 500 caracteres")
      .default(""),
    screeningQuestions: z
      .array(
        z
          .string()
          .trim()
          .min(3, "Cada pregunta debe tener al menos 3 caracteres")
          .max(200, "Cada pregunta no puede superar los 200 caracteres")
      )
      .max(8, "Podés configurar hasta 8 preguntas previas")
      .default([]),
    requirements: z
      .array(MidTermRequirementSchema)
      .max(15, "Podés configurar hasta 15 requisitos"),
  })
  .superRefine((policy, ctx) => {
    if (
      policy.approvalMode === "HOST_APPROVAL_INTERVIEW" &&
      policy.interviewChannels.length < 1
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interviewChannels"],
        message:
          "Elegí al menos una modalidad de entrevista dentro de I-bita.",
      });
    }
  });

export type MidTermPolicy = z.infer<typeof MidTermPolicySchema>;

export const MidTermGuestApplicationSchema = z.object({
  guestPhone: z
    .string()
    .trim()
    .max(32, "El teléfono no puede superar los 32 caracteres")
    .optional()
    .default(""),
  preferredInterviewChannel: InterviewChannelSchema,
  availabilityNote: z
    .string()
    .trim()
    .max(240, "El horario preferido no puede superar los 240 caracteres")
    .default(""),
  isForeigner: z.boolean().default(false),
  guestIntro: z
    .string()
    .trim()
    .min(
      10,
      "Contanos brevemente sobre vos y el motivo de tu estadía (mínimo 10 caracteres)"
    )
    .max(600, "Tu presentación no puede superar los 600 caracteres"),
  questionAnswers: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(200),
        answer: z
          .string()
          .trim()
          .min(1, "Completá tu respuesta a las preguntas del anfitrión")
          .max(400),
      })
    )
    .max(8)
    .default([]),
  acknowledgedRequirements: z.boolean(),
  acknowledgedRequirementLabels: z
    .array(z.string().max(160))
    .max(15)
    .default([]),
});

export type MidTermGuestApplication = z.infer<
  typeof MidTermGuestApplicationSchema
>;

export const DEFAULT_MID_TERM_REQUIREMENTS: ReadonlyArray<MidTermRequirement> = [
  {
    id: "req-rent-advance",
    key: "rent_advance",
    label: "Adelanto del alquiler",
    detail: "1 mes adelantado al confirmar la estadía",
    enabled: true,
    required: true,
    category: "FINANCIAL",
    isCustom: false,
  },
  {
    id: "req-security-deposit",
    key: "security_deposit",
    label: "Depósito en garantía",
    detail: "Equivalente a 1 mes de alquiler, reintegrable al check-out",
    enabled: true,
    required: true,
    category: "FINANCIAL",
    isCustom: false,
  },
  {
    id: "req-admin-fees",
    key: "admin_fees",
    label: "Honorarios o gastos administrativos",
    detail: "Especificá el porcentaje o monto fijo si corresponde",
    enabled: false,
    required: false,
    category: "FINANCIAL",
    isCustom: false,
  },
  {
    id: "req-foreigner-credit-card",
    key: "foreigner_credit_card",
    label: "Extranjeros: tarjeta de crédito o respaldo equivalente",
    detail:
      "Pasaporte vigente + tarjeta de crédito internacional o respaldo bancario equivalente",
    enabled: true,
    required: true,
    category: "FOREIGNERS",
    isCustom: false,
  },
  {
    id: "req-income-proof",
    key: "income_proof",
    label: "Demostración de ingresos",
    detail:
      "Últimos 3 recibos de sueldo, constancia de monotributo o contrato laboral remoto",
    enabled: true,
    required: true,
    category: "DOCUMENTATION",
    isCustom: false,
  },
  {
    id: "req-emergency-contact",
    key: "emergency_contact",
    label: "Documentación de contacto de emergencia",
    detail: "Nombre completo, vínculo y teléfono de un contacto de respaldo",
    enabled: true,
    required: true,
    category: "DOCUMENTATION",
    isCustom: false,
  },
];

export const EXTRA_REQUIREMENT_PRESETS: ReadonlyArray<
  Omit<MidTermRequirement, "id">
> = [
  {
    key: "guarantee_insurance",
    label: "Seguro de caución o garantía",
    detail: "Póliza de seguro de caución o recibo de garante en Argentina",
    enabled: true,
    required: true,
    category: "FINANCIAL",
    isCustom: true,
  },
  {
    key: "study_certificate",
    label: "Certificado de estudios o inscripción universitaria",
    detail: "Constancia de cursada o intercambio académico vigente",
    enabled: true,
    required: false,
    category: "DOCUMENTATION",
    isCustom: true,
  },
  {
    key: "previous_references",
    label: "Referencias de estadías anteriores",
    detail: "Reseñas verificadas o contacto de anfitriones previos",
    enabled: true,
    required: false,
    category: "DOCUMENTATION",
    isCustom: true,
  },
];

export const SUGGESTED_SCREENING_QUESTIONS: readonly string[] = [
  "¿Cuál es el motivo de tu estadía en la ciudad?",
  "¿Trabajás de forma remota o estudiás?",
  "¿Quiénes se van a alojar en el departamento?",
  "¿Viajás con mascotas o recibirías visitas frecuentes?",
];

export const DEFAULT_MID_TERM_POLICY: MidTermPolicy = {
  approvalMode: "INSTANT",
  interviewChannels: ["PLATFORM_CHAT", "PLATFORM_VIDEO"],
  responseTimeHours: 24,
  interviewInstructions: "",
  screeningQuestions: [],
  requirements: DEFAULT_MID_TERM_REQUIREMENTS.map((r) => ({ ...r })),
};

export function cloneDefaultMidTermPolicy(): MidTermPolicy {
  return {
    approvalMode: DEFAULT_MID_TERM_POLICY.approvalMode,
    interviewChannels: [...DEFAULT_MID_TERM_POLICY.interviewChannels],
    responseTimeHours: DEFAULT_MID_TERM_POLICY.responseTimeHours,
    interviewInstructions: DEFAULT_MID_TERM_POLICY.interviewInstructions,
    screeningQuestions: [...DEFAULT_MID_TERM_POLICY.screeningQuestions],
    requirements: DEFAULT_MID_TERM_REQUIREMENTS.map((r) => ({ ...r })),
  };
}

/**
 * Normaliza un JSON crudo de `properties.mid_term_policy` (`{}` o `null` en registros existentes)
 * hacia una estructura `MidTermPolicy` completa y tipada.
 */
export function normalizeMidTermPolicy(raw: unknown): MidTermPolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return cloneDefaultMidTermPolicy();
  }

  const obj = raw as Record<string, unknown>;
  if (Object.keys(obj).length === 0) {
    return cloneDefaultMidTermPolicy();
  }

  const parsedMode = MidTermApprovalModeSchema.safeParse(obj.approvalMode);
  const approvalMode: MidTermApprovalMode = parsedMode.success
    ? parsedMode.data
    : "INSTANT";

  const rawChannels = Array.isArray(obj.interviewChannels)
    ? obj.interviewChannels
        .map((c) => InterviewChannelSchema.safeParse(c))
        .filter((r) => r.success)
        .map((r) => r.data)
    : [];

  const uniqueChannels = Array.from(new Set(rawChannels)).slice(0, 3);
  const interviewChannels: InterviewChannel[] =
    uniqueChannels.length > 0
      ? uniqueChannels
      : ["PLATFORM_CHAT", "PLATFORM_VIDEO"];

  const rtRaw = Number(obj.responseTimeHours);
  const responseTimeHours: ResponseTimeHours =
    rtRaw === 12 || rtRaw === 24 || rtRaw === 48 || rtRaw === 72 ? rtRaw : 24;

  const interviewInstructions =
    typeof obj.interviewInstructions === "string"
      ? obj.interviewInstructions.trim().slice(0, 500)
      : "";

  const screeningQuestions = Array.isArray(obj.screeningQuestions)
    ? obj.screeningQuestions
        .filter((q): q is string => typeof q === "string" && q.trim().length >= 3)
        .map((q) => q.trim().slice(0, 200))
        .slice(0, 8)
    : [];

  let requirements: MidTermRequirement[] = [];
  if (Array.isArray(obj.requirements) && obj.requirements.length > 0) {
    for (const item of obj.requirements) {
      const parsedReq = MidTermRequirementSchema.safeParse(item);
      if (parsedReq.success) {
        requirements.push(parsedReq.data);
      }
    }
  }
  if (requirements.length === 0) {
    requirements = DEFAULT_MID_TERM_REQUIREMENTS.map((r) => ({ ...r }));
  } else {
    requirements = requirements.slice(0, 15);
  }

  return {
    approvalMode,
    interviewChannels,
    responseTimeHours,
    interviewInstructions,
    screeningQuestions,
    requirements,
  };
}
