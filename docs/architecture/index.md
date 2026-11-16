# Índice de Arquitectura Fragmentada (Sharded Architecture) — I-bita

Este directorio fragmenta el plano maestro ([docs/architecture.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture.md)) en módulos focalizados para que los agentes de desarrollo carguen únicamente el contexto arquitectónico que necesita cada historia.

## 📐 Módulos de Arquitectura (`docs/architecture/`)

1. [01-stack-and-env.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/01-stack-and-env.md) — Paradigma Clean Modular Monolith, restricción Low-Footprint (Core i5), matriz de paquetes open-source y contrato Fail-Fast (`src/env.ts` con `@t3-oss/env-nextjs`).
2. [02-data-model-and-rls.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/02-data-model-and-rls.md) — Esquema PostgreSQL completo en Supabase Cloud (`trknmgnzjhrhtwloiaga`), extensión `btree_gist` anti-solapamiento (`SQLSTATE 23P01`), trigger `trg_ledger_immutable` y políticas RLS.
3. [03-api-contracts-and-security.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/03-api-contracts-and-security.md) — Endpoints HTTP (`/api/ical`, `/api/webhooks/payments`), Server Actions por dominio, cifrado `AES-256-GCM`, escudo Anti-SSRF (`ipaddr.js`), biometría PDF417 + Gemini 2.5 Flash y JWS (`jose`).
4. [04-ui-airbnb-design-system.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/04-ui-airbnb-design-system.md) — Especificación del Sistema de Diseño UI/UX inspirado en **Airbnb Argentina (`airbnb.com.ar`)**, tokens de color/tipografía, Search Pill, Bento Gallery, Sticky Booking Card y accesibilidad WCAG 2.1 AAA.
5. [05-directory-tree-and-gates.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/05-directory-tree-and-gates.md) — Árbol exacto de archivos del proyecto, catálogo de errores tipados (`AppError`) y especificación de los 5 Verification Gates en consola.
