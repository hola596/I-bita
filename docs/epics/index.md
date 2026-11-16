# Índice de Épicas e Historias Fragmentadas (Sharded Epics) — I-bita

Este directorio contiene la fragmentación (*sharding*) del **PRD (v1.1.0)** y el **Desglose de Épicas e Historias** de **I-bita**, diseñada para que cada agente de desarrollo (`Amelia / bmad-agent-dev`) cargue en su ventana de contexto únicamente la épica exacta que está implementando, evitando alucinaciones y sobrecarga de tokens.

## 🗺️ Mapa de Archivos de Épicas (`docs/epics/`)

1. [epic-1-foundation-auth-legal.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/epics/epic-1-foundation-auth-legal.md)
   * **Alcance:** Next.js 15+, `@t3-oss/env-nextjs`, Migración SQL Supabase Cloud con `btree_gist` y RLS, Auth Multi-Rol, Onboarding CBU/Wallet (`viem`), UI inspirada en Airbnb Argentina y Módulo Legal/Contacto.
   * **Historias:** `Story 1.1`, `Story 1.2`, `Story 1.3` + **Verification Gate 1 (`23P01 exclusion_violation`)**.
2. [epic-2-b2b2c-properties-ical.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/epics/epic-2-b2b2c-properties-ical.md)
   * **Alcance:** ABM de Unidades Funcionales con PIN cifrado `AES-256-GCM`, Sincronización bidireccional iCal (`node-ical` + `ical-generator`) con Escudo Anti-SSRF (`ipaddr.js`), Micrositio Directo `/p/[slug]` y Calculadora `decimal.js`.
   * **Historias:** `Story 2.1`, `Story 2.2`, `Story 2.3` + **Verification Gate 2 (Bloqueo SSRF + RFC 5545)**.
3. [epic-3-consorcio-friendly-kyc.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/epics/epic-3-consorcio-friendly-kyc.md)
   * **Alcance:** Configuración del Consorcio y Micro-Canon (`1%–2%`), Escáner PDF417 del DNI Argentino (`@zxing`), Auditoría Multimodal con Gemini 2.5 Flash API, Compuerta Zero-Trust Consorcial y Pase Digital de Portería (`jose` + `qrcode`).
   * **Historias:** `Story 3.1`, `Story 3.2`, `Story 3.3` + **Verification Gate 3 (`accessCode: null` + firma JWS)**.
4. [epic-4-fintech-payments-contracts.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/epics/epic-4-fintech-payments-contracts.md)
   * **Alcance:** Checkout ARS con SDK `mercadopago` y Webhook HMAC-SHA256, Checkout/Escrow USDT en Polygon con `viem`, Contratos Temporarios CCyC Art. 1199 en PDF (`pdf-lib`) sellados con `SHA-256`, y Libro Mayor Inmutable `ledger_entries` + Split T+24h.
   * **Historias:** `Story 4.1`, `Story 4.2`, `Story 4.3`, `Story 4.4` + **Verification Gate 4 (Rechazo `401` HMAC + Hash `SHA-256` + Ledger)**.
5. [epic-5-b2c-marketplace-seo-dashboard.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/epics/epic-5-b2c-marketplace-seo-dashboard.md)
   * **Alcance:** Buscador Público B2C inspirado en `airbnb.com.ar` (Switch Por Día vs. Media Estadía 1–6 meses), SEO/GEO `Schema.org / JSON-LD`, Dashboard del Anfitrión, Exportador RPATT/ARCA y Auditoría Global Zero-Simulation.
   * **Historias:** `Story 5.1`, `Story 5.2`, `Story 5.3` + **Verification Gate 5 (`grep` Zero-Simulation + Build)**.
