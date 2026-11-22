import { z } from "zod";
import { MidTermGuestApplicationSchema } from "@/modules/properties/mid-term-policy";

export const BOOKING_PAYMENT_CURRENCIES = ["ARS", "USDT"] as const;
export type BookingPaymentCurrency = (typeof BOOKING_PAYMENT_CURRENCIES)[number];

const YMD_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Calcula la cantidad exacta de noches calendario entre dos fechas `YYYY-MM-DD`
 * en UTC (inmune a cambios de huso horario local).
 */
export function calculateNightsBetweenDates(
  checkIn: string,
  checkOut: string
): number {
  if (!YMD_DATE_REGEX.test(checkIn) || !YMD_DATE_REGEX.test(checkOut)) {
    return 0;
  }
  const [inY = 0, inM = 1, inD = 1] = checkIn.split("-").map(Number);
  const [outY = 0, outM = 1, outD = 1] = checkOut.split("-").map(Number);

  const utcIn = Date.UTC(inY, inM - 1, inD);
  const utcOut = Date.UTC(outY, outM - 1, outD);
  return Math.round((utcOut - utcIn) / 86_400_000);
}

export const CreateBookingRequestSchema = z
  .object({
    propertyId: z.string().uuid("ID de Unidad Funcional inválido"),
    checkIn: z
      .string()
      .trim()
      .regex(
        YMD_DATE_REGEX,
        "La fecha de check-in debe tener el formato YYYY-MM-DD"
      ),
    checkOut: z
      .string()
      .trim()
      .regex(
        YMD_DATE_REGEX,
        "La fecha de check-out debe tener el formato YYYY-MM-DD"
      ),
    declaredAdultsCount: z.coerce
      .number()
      .int("La cantidad de adultos declarados debe ser un número entero")
      .min(1, "Debe declararse al menos 1 adulto titular para la reserva")
      .max(20, "La cantidad máxima permitida es de 20 adultos"),
    paymentCurrency: z.enum(BOOKING_PAYMENT_CURRENCIES, {
      errorMap: () => ({
        message: "Moneda de pago inválida. Valores admitidos: ARS o USDT",
      }),
    }),
    installments: z.coerce
      .number()
      .int()
      .refine(
        (v) => v === 1 || v === 3 || v === 6,
        "Plan de financiación inválido. Solo se admiten 1, 3 o 6 cuotas en ARS."
      )
      .optional()
      .default(1),
    vehiclePlate: z
      .string()
      .trim()
      .max(20, "La patente del vehículo no puede superar los 20 caracteres")
      .optional()
      .nullable(),
    midTermApplication: MidTermGuestApplicationSchema.optional().nullable(),
    acknowledgedMidTermRequirements: z.boolean().optional(),
    guestId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    const nights = calculateNightsBetweenDates(data.checkIn, data.checkOut);
    if (nights < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkOut"],
        message:
          "La fecha de check-out debe ser posterior a la fecha de check-in (mínimo 1 noche).",
      });
      return;
    }
    if (nights > 180) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkOut"],
        message:
          "Las reservas temporarias y de Media Estadía tienen un plazo máximo legal de 180 noches (6 meses — Art. 1199 CCyC).",
      });
    }
  });

export type CreateBookingRequestInput = z.input<
  typeof CreateBookingRequestSchema
>;
export type CreateBookingRequestPayload = z.output<
  typeof CreateBookingRequestSchema
>;
