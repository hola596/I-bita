# 01. Stack Tecnológico, Paradigma y Contrato de Entorno (`AD-1`, `AD-2`)

## 1. Paradigma: Clean Modular Monolith (Low-Footprint Cloud-Native)
* **Regla `AD-1` (Restricción Hardware Local Core i5):** Prohibido levantar contenedores Docker pesados locales. Toda la persistencia corre en **Supabase Cloud (`trknmgnzjhrhtwloiaga`)**, la IA multimodal en **Gemini 2.5 Flash API** y la validación Web3 en **Polygon RPC HTTPS (`https://polygon-bor-rpc.publicnode.com`)**.
* **Regla `AD-2` (Fail-Fast Environment):** Todo acceso a variables de entorno se realiza exclusivamente a través de `src/env.ts` validado con `@t3-oss/env-nextjs` y `zod`.

## 2. Paquetes Open-Source Obligatorios por Dominio
* **Core & UI:** `next@^15.2.0`, `react@^19.0.0`, `tailwindcss@^4.0.0`, `lucide-react`.
* **Entorno & Validación:** `@t3-oss/env-nextjs`, `zod`.
* **Supabase & DB:** `@supabase/supabase-js`, `@supabase/ssr`, `pg`.
* **Sincronización iCal & Anti-SSRF:** `node-ical`, `ical-generator`, `ipaddr.js`, `ssrf-req-filter`.
* **Biometría DNI & Portería:** `@zxing/library`, `@zxing/browser`, `@google/generative-ai`, `jose`, `qrcode`.
* **Pagos, Web3, Matemática & Contratos PDF:** `mercadopago`, `viem`, `decimal.js`, `pdf-lib`.
