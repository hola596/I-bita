# Epic 3: Módulo "Consorcio Friendly" — Pre-Check-in Biométrico Zero-Trust y Pase Digital de Portería

* **ID de Épica:** `EPIC-3`
* **Requerimientos Cubiertos:** `FR-8`, `FR-9`, `FR-10`, `FR-11`, `NFR-4`, `NFR-8`, `AD-5`, `UX-DR4`
* **Dependencias de Arquitectura:** [02-data-model-and-rls.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/02-data-model-and-rls.md), [03-api-contracts-and-security.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/03-api-contracts-and-security.md)

## Objetivo
Eliminar el conflicto vecinal en edificios de propiedad horizontal mediante validación biométrica obligatoria de todos los adultos declarados (lectura PDF417 del DNI argentino con `@zxing` + Gemini 2.5 Flash API), bloqueo criptográfico del PIN de ingreso y envío automático del Pase Digital con QR (`jose` + `qrcode`) a la portería.

---

### Story 3.1: Configuración del Perfil "Consorcio Friendly" y Regla de Micro-Canon (1%–2%)

**As a** Anfitrión de un departamento en edificio de propiedad horizontal,
**I want** configurar el WhatsApp de la portería, el email de la administración, el CUIT del consorcio y activar opcionalmente el Micro-Canon Consorcial (`1%`, `1.5%` o `2%`),
**So that** mi anuncio obtenga la insignia *"Propiedad Consorcio Friendly"* y el edificio reciba pases verificados y participación económica en cada reserva.

**Acceptance Criteria:**
- **Given** una Unidad Funcional perteneciente al Anfitrión (`FR-8`)
- **When** guarda la configuración en `public.consortium_configs`
- **Then** la propiedad exhibe el sello verificado *"Consorcio Friendly"* en su micrositio y en el Marketplace, y el porcentaje de Micro-Canon queda vinculado para el cálculo de Split con `decimal.js`.

---

### Story 3.2: Flujo Móvil de Pre-Check-in con Escáner PDF417 DNI (`@zxing`) y Auditoría Multimodal Gemini 2.5 Flash

**As a** Huésped Titular o Acompañante Declarado adulto,
**I want** abrir mi enlace de Pre-Check-in desde el celular, escanear el código de barras PDF417 del dorso de mi DNI argentino (o MRZ de Pasaporte), subir el frente del documento y tomarme una selfie,
**So that** mi identidad quede verificada biométricamente antes de llegar al edificio.

**Acceptance Criteria:**
- **Given** un adulto con un `invite_token` válido en `/checkin/[bookingId]` (`FR-9`, `UX-DR4`)
- **When** acepta el consentimiento biométrico (Ley 25.326), escanea el PDF417 con `@zxing/browser` / `@zxing/library` y envía el frente del documento + selfie
- **Then** las imágenes se guardan en el bucket privado de Supabase Storage y el backend invoca **Gemini 2.5 Flash API** (`@google/generative-ai` + esquema estructurado `zod`) para verificar coincidencia facial y documental
- **And** si el resultado es aprobatorio, actualiza `guest_verifications.status = 'VERIFIED'`, incrementa `bookings.verified_adults_count` y, cuando `verified_adults_count == declared_adults_count`, transiciona `bookings.status = 'ALL_ADULTS_VERIFIED'`.

---

### Story 3.3: Compuerta Criptográfica Zero-Trust Consorcial y Emisión del Pase Digital de Portería (`jose` + `qrcode`)

**As a** Encargado de Seguridad / Portería del Edificio y Huésped Verificado,
**I want** que el código de cerradura se desbloquee únicamente cuando el 100% de los adultos declarados estén verificados y que la portería reciba al instante el Pase Digital con QR firmado criptográficamente,
**So that** nadie no identificado pueda ingresar al edificio y el guardia valide la credencial en un segundo desde `/verify/[token]`.

**Acceptance Criteria:**
- **Given** una reserva en curso (`FR-10`, `FR-11`, `AD-5`)
- **When** se consulta `getBookingAccessDetailsAction(bookingId)` mientras `verified_adults_count < declared_adults_count`
- **Then** la respuesta devuelve estrictamente `accessCode: null` a nivel de red HTTP
- **And** cuando `status === 'ALL_ADULTS_VERIFIED'`, el servidor desencripta `access_code_ciphertext` (`AES-256-GCM`), firma el Pase Digital JWS/JWT con `jose` (`PORTERIA_JWS_SECRET`), genera el QR con `qrcode`, lo envía por WhatsApp Cloud API y Resend Email, y expone la vista verificadora `/verify/[token]`.

---

## 🧪 Verification Gate (Requisito de Cierre en Terminal — Épica 3)
* **Script:** `npx tsx scripts/gates/gate-epic-3-zero-trust-kyc.ts`
* **Criterio de Éxito:**
  1. Consulta una reserva con `1/2` adultos verificados comprobando que `accessCode` es `null`.
  2. Completa la verificación del segundo adulto (`2/2`), desencripta el PIN con `AES-256-GCM`, genera el token JWS del Pase de Portería con `jose` y valida su firma criptográfica.
