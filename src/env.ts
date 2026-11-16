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
    MP_ACCESS_TOKEN: z
      .string()
      .regex(/^(APP_USR|TEST)-/, "Must start with APP_USR- or TEST-"),
    MP_WEBHOOK_SECRET: z.string().min(32, "Must be at least 32 characters"),
    EVM_RPC_URL: z.string().url(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
    NEXT_PUBLIC_APP_URL: z.string().url(),
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
    MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN,
    MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET,
    EVM_RPC_URL: process.env.EVM_RPC_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_MP_PUBLIC_KEY: process.env.NEXT_PUBLIC_MP_PUBLIC_KEY,
    NEXT_PUBLIC_USDT_CONTRACT_ADDRESS:
      process.env.NEXT_PUBLIC_USDT_CONTRACT_ADDRESS,
    NEXT_PUBLIC_IBITA_TREASURY_WALLET:
      process.env.NEXT_PUBLIC_IBITA_TREASURY_WALLET,
  },
  emptyStringAsUndefined: true,
});
