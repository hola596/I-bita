import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
    DATABASE_URL: z.string().url(),
    ACCESS_CODE_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/, "Must be 64 hex chars (32 bytes)"),
    GEMINI_API_KEY: z.string().min(15),
    PORTERIA_JWS_SECRET: z.string().min(32),
    WHATSAPP_API_TOKEN: z.string().min(20),
    WHATSAPP_PHONE_NUMBER_ID: z.string().min(5),
    RESEND_API_KEY: z.string().startsWith("re_"),
    ADMIN_NOTIFICATION_EMAIL: z.string().email().optional(),
    RESEND_FROM_EMAIL: z.string().min(3).optional(),
    ADMIN_WHATSAPP_ALERT_PHONE: z.string().min(8).optional(),
    MP_ACCESS_TOKEN: z
      .string()
      .regex(/^(APP_USR|TEST)-/, "Must start with APP_USR- or TEST-"),
    MP_WEBHOOK_SECRET: z.string().min(32, "Must be at least 32 characters"),
    EVM_RPC_URL: z.string().url(),
    BIOMETRIC_SERVICE_URL: z.string().url().optional(),
    BIOMETRIC_API_KEY: z.string().min(16).optional(),
    KYC_MIN_SIMILARITY_THRESHOLD: z.coerce.number().min(0.1).max(0.95).default(0.363),
    KYC_MANUAL_REVIEW_SIMILARITY_THRESHOLD: z.coerce.number().min(0.1).max(0.95).default(0.3),
    KYC_MIN_LIVENESS_THRESHOLD: z.coerce.number().min(0.1).max(0.99).default(0.85),
    KYC_EVIDENCE_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(48),
    CRON_SECRET: z.string().min(16).optional(),
    MP_MARKETPLACE_SPLIT_ENABLED: z
      .enum(["true", "false"])
      .optional()
      .default("false"),
    VAPID_PRIVATE_KEY: z.string().min(20).optional(),
    VAPID_SUBJECT: z
      .string()
      .refine(
        (v) => v.startsWith("mailto:") || v.startsWith("https://"),
        "VAPID_SUBJECT must start with mailto: or https://"
      )
      .optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    NEXT_PUBLIC_SUPPORT_WHATSAPP: z.string().min(8).optional(),
    NEXT_PUBLIC_ENABLE_KYC_MOCK: z.enum(["true", "false"]).optional(),
    NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS: z
      .enum(["true", "false"])
      .optional()
      .default("false"),
    NEXT_PUBLIC_DATA_FISCAL_URL: z.string().url().optional(),
    NEXT_PUBLIC_DATA_FISCAL_QR_IMG: z.string().url().optional(),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(20).optional(),
    NEXT_PUBLIC_MP_PUBLIC_KEY: z
      .string()
      .regex(/^(APP_USR|TEST)-/, "Must start with APP_USR- or TEST-"),
    NEXT_PUBLIC_USDT_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    NEXT_PUBLIC_IBITA_TREASURY_WALLET: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  },
  runtimeEnv: {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    ACCESS_CODE_ENCRYPTION_KEY: process.env.ACCESS_CODE_ENCRYPTION_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    PORTERIA_JWS_SECRET: process.env.PORTERIA_JWS_SECRET,
    WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    ADMIN_NOTIFICATION_EMAIL: process.env.ADMIN_NOTIFICATION_EMAIL,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    ADMIN_WHATSAPP_ALERT_PHONE: process.env.ADMIN_WHATSAPP_ALERT_PHONE,
    MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN,
    MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET,
    MP_MARKETPLACE_SPLIT_ENABLED: process.env.MP_MARKETPLACE_SPLIT_ENABLED,
    EVM_RPC_URL: process.env.EVM_RPC_URL,
    BIOMETRIC_SERVICE_URL: process.env.BIOMETRIC_SERVICE_URL,
    BIOMETRIC_API_KEY: process.env.BIOMETRIC_API_KEY,
    KYC_MIN_SIMILARITY_THRESHOLD: process.env.KYC_MIN_SIMILARITY_THRESHOLD,
    KYC_MANUAL_REVIEW_SIMILARITY_THRESHOLD:
      process.env.KYC_MANUAL_REVIEW_SIMILARITY_THRESHOLD,
    KYC_MIN_LIVENESS_THRESHOLD: process.env.KYC_MIN_LIVENESS_THRESHOLD,
    KYC_EVIDENCE_TTL_HOURS: process.env.KYC_EVIDENCE_TTL_HOURS,
    CRON_SECRET: process.env.CRON_SECRET,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPPORT_WHATSAPP: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP,
    NEXT_PUBLIC_ENABLE_KYC_MOCK: process.env.NEXT_PUBLIC_ENABLE_KYC_MOCK,
    NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS:
      process.env.NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS,
    NEXT_PUBLIC_DATA_FISCAL_URL: process.env.NEXT_PUBLIC_DATA_FISCAL_URL,
    NEXT_PUBLIC_DATA_FISCAL_QR_IMG: process.env.NEXT_PUBLIC_DATA_FISCAL_QR_IMG,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_MP_PUBLIC_KEY: process.env.NEXT_PUBLIC_MP_PUBLIC_KEY,
    NEXT_PUBLIC_USDT_CONTRACT_ADDRESS:
      process.env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS,
    NEXT_PUBLIC_IBITA_TREASURY_WALLET:
      process.env.NEXT_PUBLIC_IBITA_TREASURY_WALLET,
  },
  emptyStringAsUndefined: true,
});
