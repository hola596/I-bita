import { z } from "zod";

export const StayPurposeSchema = z
  .string()
  .trim()
  .min(3, "La finalidad debe tener al menos 3 caracteres.")
  .max(60, "La finalidad no puede superar 60 caracteres.")
  .default("TURISMO");

export const AgreementKindSchema = z.enum([
  "MID_TERM_ART1199",
  "SHORT_STAY_SIMPLE",
]);

export type AgreementKind = z.infer<typeof AgreementKindSchema>;

export const CONTRACT_STORAGE_BUCKET = "contracts" as const;

export interface ContractRecord {
  id: string;
  bookingId: string;
  agreementKind: AgreementKind;
  stayPurpose: string;
  pdfStoragePath: string;
  pdfSha256Hash: string;
  guestSignedAt: string | null;
  guestSignerIp: string | null;
  hostSignedAt: string | null;
  createdAt: string;
  isFullySigned: boolean;
}
