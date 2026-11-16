# Epic 2: Core B2B2C — Gestión de Propiedades, Sincronización iCal Anti-SSRF y Micrositio de Reserva Directa

* **ID de Épica:** `EPIC-2`
* **Requerimientos Cubiertos:** `FR-4`, `FR-5`, `FR-6`, `FR-7`, `NFR-6`, `NFR-8`, `AD-3`, `AD-4`, `AD-5`, `AD-6`, `UX-DR2`, `UX-DR3`
* **Dependencias de Arquitectura:** [02-data-model-and-rls.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/02-data-model-and-rls.md), [03-api-contracts-and-security.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/03-api-contracts-and-security.md), [04-ui-airbnb-design-system.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/04-ui-airbnb-design-system.md)

## Objetivo
Permitir a los anfitriones publicar sus Unidades Funcionales con PIN cifrado en `AES-256-GCM`, sincronizar calendarios de Airbnb/Booking mediante `node-ical` e `ical-generator` con escudo Anti-SSRF, y compartir su propio link de reserva directa (`/p/[slug]`) con galería Bento estilo Airbnb y calculadora exacta `decimal.js`.

---

### Story 2.1: Alta de Unidades Funcionales con Fotos Optimizadas y Cifrado `AES-256-GCM` del PIN de Acceso

**As a** Anfitrión verificado,
**I want** crear y editar mis Unidades Funcionales especificando corredor geográfico, capacidad máxima, tarifas en ARS/USD, descuento mensual y código de cerradura electrónica,
**So that** mi propiedad quede lista para recibir reservas manteniendo el código de acceso cifrado en reposo.

**Acceptance Criteria:**
- **Given** un Anfitrión autenticado en el panel de creación de propiedad (`FR-4`, `AD-5`)
- **When** envía los datos de la Unidad Funcional incluyendo el PIN/instrucciones de ingreso
- **Then** el módulo `src/lib/crypto/aes-gcm.ts` cifra el PIN en el servidor con `AES-256-GCM` usando `ACCESS_CODE_ENCRYPTION_KEY` antes de hacer el `INSERT` en `public.properties` (`access_code_ciphertext`, `access_code_iv`, `access_code_auth_tag`)
- **And** las fotografías se almacenan y sirven con dimensiones explícitas (`CLS = 0`).

---

### Story 2.2: Sincronización Bidireccional de Calendarios iCal (`node-ical` + `ical-generator`) con Escudo Anti-SSRF

**As a** Anfitrión que publica en Airbnb y Booking,
**I want** importar mis calendarios `.ics` externos y exportar el calendario `.ics` de I-bita,
**So that** las fechas reservadas se bloqueen automáticamente en ambas direcciones sin riesgo de sobreventa ni vulnerabilidades SSRF.

**Acceptance Criteria:**
- **Given** una URL de calendario `.ics` ingresada por un Anfitrión (`FR-5`, `AD-4`)
- **When** se invoca el sincronizador de iCal o se consulta `GET /api/ical/[propertyId].ics`
- **Then** `src/modules/ical/ssrf-guard.ts` valida el host con `ipaddr.js` bloqueando inmediatamente rangos privados (`127.0.0.1`, `localhost`, `10.0.0.0/8`, `169.254.169.254`) antes de usar `node-ical`
- **And** `GET /api/ical/[propertyId].ics` usa `ical-generator` devolviendo `Content-Type: text/calendar; charset=utf-8` con zona horaria `America/Argentina/Buenos_Aires`.

---

### Story 2.3: Micrositio de Reserva Directa B2B2C (`/p/[slug]`) y Calculadora Tarifaria Exacta (`decimal.js`)

**As a** Huésped o Cliente Recurrente de un Anfitrión,
**I want** ingresar al link directo de la propiedad (`/p/[slug]`) con diseño de galería Bento y Sticky Booking Widget estilo Airbnb, seleccionar mis fechas y ver el desglose exacto en ARS (cuotas) o USDT,
**So that** pueda iniciar una reserva de Estadía Corta o Media Estadía ahorrando las comisiones internacionales de Airbnb.

**Acceptance Criteria:**
- **Given** una propiedad publicada en `/p/[slug]` (`FR-6`, `FR-7`, `UX-DR3`)
- **When** el usuario selecciona fechas de Estadía Corta (`1–29 noches`) o Media Estadía (`30–180 noches`)
- **Then** el motor `src/lib/math/money.ts` calcula todos los importes usando `decimal.js` (cero `float` nativo), reduciendo automáticamente la comisión de plataforma al `5%–7%` cuando `noches >= 30` y mostrando el comparador de ahorro frente a OTAs extranjeras
- **And** al confirmar la solicitud inicial, crea el registro en `public.bookings` en estado `PENDING_PAYMENT` y los slots de `public.guest_verifications` para la cantidad de adultos declarados.

---

## 🧪 Verification Gate (Requisito de Cierre en Terminal — Épica 2)
* **Script:** `npx tsx scripts/gates/gate-epic-2-ical-ssrf.ts`
* **Criterio de Éxito:**
  1. Pasa `http://127.0.0.1:5432` y `http://169.254.169.254` al validador iCal comprobando que lanza `SSRF_BLOCKED_ERROR`.
  2. Realiza petición al generador `.ics` verificando respuesta `HTTP 200`, `Content-Type: text/calendar; charset=utf-8` y cuerpo RFC 5545 válido (`BEGIN:VCALENDAR`).
