import { z } from "zod";

export const CONVERSATION_KINDS = [
  "SUPPORT_INQUIRY",
  "HOST_APPROVAL",
  "BOOKING_INTERVIEW",
  "BOOKING_STAY",
] as const;

export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const SENDER_ROLES = ["GUEST", "HOST", "ADMIN", "SYSTEM"] as const;
export type SenderRole = (typeof SENDER_ROLES)[number];

export const MESSAGE_TYPES = [
  "TEXT",
  "INTERVIEW_PROPOSAL",
  "SYSTEM_NOTICE",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const CONVERSATION_KIND_LABELS: Record<ConversationKind, string> = {
  SUPPORT_INQUIRY: "Soporte I-bita",
  HOST_APPROVAL: "Aprobación anfitrión",
  BOOKING_INTERVIEW: "Entrevista estadía",
  BOOKING_STAY: "Reserva e ingreso",
};

export const SendConversationMessageSchema = z.object({
  conversationId: z.string().uuid("Identificador de conversación inválido"),
  body: z
    .string()
    .trim()
    .min(1, "Escribí un mensaje antes de enviar.")
    .max(2500, "El mensaje no puede superar los 2500 caracteres.")
    .regex(/^[^<>]*$/, "El mensaje contiene caracteres HTML no permitidos."),
  messageType: z
    .enum(["TEXT", "INTERVIEW_PROPOSAL"])
    .optional()
    .default("TEXT"),
});

export type SendConversationMessageInput = z.input<
  typeof SendConversationMessageSchema
>;

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  subject: string;
  status: "OPEN" | "CLOSED";
  guestOrRequesterId: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  hostId: string | null;
  hostName: string | null;
  propertyId: string | null;
  propertyTitle: string | null;
  bookingId: string | null;
  bookingStatus: string | null;
  contactInquiryId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  createdAt: string;
}

export interface ConversationMessageRecord {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderRole: SenderRole;
  senderName: string;
  body: string;
  messageType: MessageType;
  createdAt: string;
}
