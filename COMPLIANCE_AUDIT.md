# Auditoría de Cumplimiento Legal, Seguridad y Licencias — I-bita (Argentina)

**Fecha de auditoría:** 24 de noviembre de 2026  
**Alcance:** Aplicación Next.js (`src/`), Esquema PostgreSQL/Supabase (`supabase/migrations/`), Microservicio Biométrico (`biometric-service/`) y dependencias open-source (`package.json`, `node_modules/`).

---

## 1. Auditoría de Licencias Open-Source

Inspección ejecutada sobre los **180 paquetes** instalados en `node_modules/` y las librerías/modelos de `biometric-service/`.

### Resumen por tipo de licencia (`node_modules`)
| Licencia | Cantidad | Clasificación SaaS comercial |
| :--- | :---: | :--- |
| `MIT` | 147 | ✅ Permisiva |
| `ISC` | 12 | ✅ Permisiva |
| `Apache-2.0` | 7 | ✅ Permisiva |
| `BSD-3-Clause` / `BSD-2-Clause` | 3 | ✅ Permisiva |
| `0BSD` / `BlueOak-1.0.0` / `CC-BY-4.0` / `(MIT AND Zlib)` / `(MIT OR CC0-1.0)` / `(Unlicense OR Apache-2.0)` | 6 | ✅ Permisiva / Atribución |
| `MPL-2.0` | 2 | 🟡 Copyleft débil por archivo (build-time) |
| `Apache-2.0 AND LGPL-3.0-or-later` / `AND MIT` | 2 | 🟡 Dual / Copyleft débil |
| `UNKNOWN` (`mercadopago@2.13.0`) | 1 | 🟡 Campo `license` omitido en `package.json` |
| **`AGPLv3` / `GPLv2` / `GPLv3` (Copyleft fuerte)** | **0** | 🔴 **ROJO — Ninguna detectada** |

### Detalle de paquetes observados (🟡 Revisión preventiva — 0 en 🔴 ROJO)
- **🔴 Dependencias Copyleft Fuerte (AGPL / GPLv2 / GPLv3):** **0 detectadas.** No se hallaron librerías ni modelos incompatibles con SaaS comercial cerrado.
- **🟡 `lightningcss@1.33.0` y `lightningcss-win32-x64-msvc@1.33.0` (`MPL-2.0`):** compilador CSS utilizado en build-time por Tailwind CSS v4. Al no modificar ni redistribuir código fuente derivado de `lightningcss`, es compatible con uso comercial.
- **🟡 `@img/sharp-wasm32@0.35.5` y `@img/sharp-win32-x64@0.35.5` (`Apache-2.0 AND LGPL-3.0-or-later [AND MIT]`):** binarios de soporte de `next/image`. La licencia ofrece disyunción permisiva (`Apache-2.0` / `MIT`) para los wrappers de `sharp`.
- **🟡 `mercadopago@2.13.0` (`UNKNOWN` en `package.json`):** el SDK oficial Node.js de Mercado Pago omite la clave `"license"` en su `package.json` publicado en npm (en su repositorio oficial figura bajo licencia `MIT`).
- **✅ Stack Biométrico (`biometric-service/`):** FastAPI (`MIT`), Uvicorn (`BSD-3-Clause`), OpenCV Headless (`Apache-2.0`), ONNX Runtime (`MIT`), NumPy (`BSD-3-Clause`), Pydantic (`MIT`); modelos ONNX `YuNet` (`MIT`), `SFace` (`Apache-2.0`) y `MiniFASNetV2`/`V1SE` (`Apache-2.0`). Sin modelos restringidos para uso no comercial.

---

## 2. Escaneo de Seguridad y Variables Públicas (`NEXT_PUBLIC_*`)

Escaneo estático ejecutado sobre `src/`, `biometric-service/` y `supabase/`:

- **Secretos hardcodeados (JWT, claves PEM, llaves privadas de wallet EVM, API keys de Resend/Gemini/Mercado Pago, connection strings PostgreSQL):** **0 hallazgos (`SECURITY_FINDINGS: []`).**
- **Auditoría de variables `NEXT_PUBLIC_*` declaradas en [`src/env.ts`](src/env.ts):**
  - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`: claves públicas de cliente diseñadas para navegador (protegidas por RLS en las 14 tablas).
  - `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPPORT_WHATSAPP`: URL canónica y teléfono de soporte público.
  - `NEXT_PUBLIC_ENABLE_KYC_MOCK`: flag QA (`"false"` en producción).
  - `NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS`: feature flag PSAV (`"false"` por defecto).
  - `NEXT_PUBLIC_DATA_FISCAL_URL`, `NEXT_PUBLIC_DATA_FISCAL_QR_IMG`: enlace y QR público del Formulario 960/D de ARCA.
  - `NEXT_PUBLIC_MP_PUBLIC_KEY`: clave pública de checkout Mercado Pago.
  - `NEXT_PUBLIC_USDT_CONTRACT_ADDRESS`, `NEXT_PUBLIC_IBITA_TREASURY_WALLET`: direcciones públicas en blockchain Polygon (no existen claves privadas en el repositorio ni en variables de entorno; el flujo que usa `TREASURY_WALLET` queda bloqueado por `NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS=false`).
- **Resultado:** ninguna credencial privilegiada (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ACCESS_CODE_ENCRYPTION_KEY`, `PORTERIA_JWS_SECRET`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `BIOMETRIC_API_KEY`, `CRON_SECRET`) está expuesta al bundle de cliente.

---

## 3. Hallazgos Regulatorios y Mitigaciones Técnicas Implementadas

### 3.1 Blocker Regulatorio #1 — PSP BCRA (Pagos en ARS / Mercado Pago)
- **Diagnóstico (`src/modules/payments/mercadopago.ts`):** en su configuración base, `createArsPreference` utiliza un único `MP_ACCESS_TOKEN` de plataforma centralizada, lo que hace que el 100% del alquiler ingrese a la cuenta de I-bita antes de liquidarse al anfitrión (riesgo de encuadre como PSP ante BCRA y retenciones SIRCREB/impositivas sobre fondos de terceros).
- **Acción implementada:**
  - Documentado explícitamente como **`BLOCKER REGULATORIO (PSP BCRA)`** en `src/modules/payments/mercadopago.ts`.
  - Refactorizado `ArsPreferenceInput` y `createArsPreference` para soportar **Mercado Pago Marketplace Split** (`sellerAccessToken` del anfitrión conectado por OAuth + `marketplace_fee` con el fee tecnológico cuando `MP_MARKETPLACE_SPLIT_ENABLED="true"`).
  - Agregadas columnas `mp_seller_user_id` y `mp_marketplace_connected_at` en `public.profiles`.
  - Aclaración explícita en checkout (`ArsCheckoutCard.tsx` y `StickyBookingWidget.tsx`) indicando que las cuotas están sujetas a condiciones del procesador de pagos.

### 3.2 Blocker Regulatorio #2 — PSAV CNV (Pagos en USDT / Polygon)
- **Diagnóstico (`src/modules/payments/usdt-onchain.ts`, `actions.ts`, `webhook.ts`):** el flujo de USDT verifica transferencias hacia `NEXT_PUBLIC_IBITA_TREASURY_WALLET` (custodia centralizada/escrow de activos virtuales), alcanzable por la Ley 27.739, Resoluciones Generales CNV 994, 1058, 1172 y UIF Res. 49/2024 para PSAV.
- **Acción implementada:**
  - Documentado como **`BLOCKER REGULATORIO (PSAV CNV)`**.
  - Implementado el feature flag `NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS` en **`false` por defecto** (`src/env.ts`, `.env.example`, `src/lib/compliance/feature-flags.ts`).
  - Bloqueado en servidor (`createBookingRequestAction`, `verifyAndSettleUsdtPaymentAction`, `handlePaymentsWebhook`), en la UI pública (`AppHeader`, `PreferencesProvider`, `HomeExperienceClient`, `StickyBookingWidget`, `HostOnboardingWizard`, `PropertyDashboardClient`) y en `/checkout/[bookingId]` hasta migrar a pago P2P billetera-a-billetera estrictamente no custodial o completar inscripción como PSAV.

---

## 4. Checklist de Cumplimiento: Implementado vs. Acción Manual del Fundador

### ✅ Implementado en Código y Base de Datos
- [x] **Módulo 1 — Defensa del Consumidor (Ley 24.240 / Disp. 954/2025):**
  - Enlaces visibles en el primer acceso del footer sin login: **"Botón de Arrepentimiento"** (`/legal/arrepentimiento`) y **"Botón de Baja"** (`/legal/baja`).
  - Persistencia en `public.consumer_requests` con código de gestión inmediato (`ARR-...` / `BAJ-...`), notificación vía Resend con compromiso de confirmación en 24 hs y aviso de excepciones legales (art. 1116 CCCN).
  - Revisión de claims publicitarios (arts. 8 y 40 Ley 24.240) con tooltips objetivos (`ComplianceInfoTooltip`) para Wi-Fi, cuotas y portería, y etiqueta **"Propiedad de demostración · Imágenes ilustrativas"** en unidades con imágenes de `images.unsplash.com` o datos demo.
- [x] **Módulo 2 — Alquiler Temporario, Consorcios y Encuadre Tecnológico:**
  - Campos `jurisdiccion`, `numero_registro_turistico` (RPATT - Ley 6255 obligatorio en CABA) y `estado_regulatorio` (`activo` | `suspendido_autoridad`) con política RLS pública que oculta unidades suspendidas y acción administrativa `setPropertyRegulatoryStatusAction`.
  - Exhibición pública del RPATT en `/p/[slug]` y carga obligatoria en onboarding/publicación para CABA.
  - Checkbox obligatorio no pre-marcado de **Declaración Jurada Digital** (reglamento de copropiedad, portería y seguro de RC) persistido con `ddjj_consorcio_accepted_at`, `ddjj_consorcio_ip` y `ddjj_consorcio_version`.
  - Copy y UX actualizados en portada, fichas, checkout y contratos aclarando encuadre exclusivo como plataforma tecnológica (no inmobiliaria).
- [x] **Módulo 3 — Pagos ARS y USDT:** feature flag PSAV (`NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS=false` por defecto) y soporte de Marketplace Split (`marketplace_fee` + `MP_MARKETPLACE_SPLIT_ENABLED`).
- [x] **Módulo 4 — Evidencia Probatoria Inmutable (`public.contract_audit_logs`):** tabla append-only protegida por trigger `prevent_contract_audit_mutation()` registrando `contract_id`, `document_sha256_hash`, `signer_user_id`, `signer_role`, `email`, `signed_at_utc`, `ip_address`, `user_agent`, `otp_verified_at` y `otp_channel`.
- [x] **Módulo 5 — Protección de Datos y Legales (`/legal/privacidad`, `/legal/terminos`):** placeholders de Razón Social/CUIT/Domicilio, **Transferencia Internacional de Datos (art. 12 Ley 25.326)**, derechos ARCO, cláusula obligatoria de la **AAIP**, y advertencia en código de borrador técnico sujeto a firma letrada.
- [x] **Módulo 6 — Data Fiscal ARCA (Formulario 960/D):** componente `<DataFiscalBadge />` en footer conectado a `NEXT_PUBLIC_DATA_FISCAL_URL` y `NEXT_PUBLIC_DATA_FISCAL_QR_IMG` + ajuste de `img-src` CSP en `next.config.ts`.

### 📋 Requiere Acción Administrativa / Legal Manual del Fundador
1. **Revisión letrada final:** hacer revisar y aprobar los textos de `/legal/privacidad`, `/legal/terminos` y la DDJJ digital por un abogado matriculado en Argentina y completar `[RAZÓN SOCIAL]`, `[CUIT]` y `[DOMICILIO LEGAL]`.
2. **Registro Nacional de Bases de Datos (AAIP):** inscribir la base de datos ante la AAIP según Ley 25.326 y designar responsable de privacidad.
3. **ARCA Data Fiscal (Form. 960/D):** generar el enlace y QR oficial en Mi AFIP/ARCA y cargar `NEXT_PUBLIC_DATA_FISCAL_URL` y `NEXT_PUBLIC_DATA_FISCAL_QR_IMG` en Vercel Production.
4. **Mercado Pago Marketplace OAuth (BCRA PSP):** crear la aplicación Marketplace en Mercado Pago Developers, implementar el flujo de conexión OAuth para anfitriones (guardando token cifrado por seller) y activar `MP_MARKETPLACE_SPLIT_ENABLED="true"` para eliminar la recaudación centralizada de alquileres de terceros.
5. **Decisión sobre USDT (CNV PSAV):** mantener `NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS="false"` hasta implementar pagos P2P directos wallet-a-wallet del anfitrión sin custodia de I-bita o tramitar inscripción PSAV ante CNV.
6. **Envío de OTP por Email en firma electrónica:** conectar el flujo de emisión/validación de código OTP de 6 dígitos por email en `/contratos/[bookingId]` para poblar `otp_verified_at` y `otp_channel = 'EMAIL_OTP'` en `contract_audit_logs`.
