---
status: final
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - docs/project-brief.md
  - docs/prd.md
  - docs/architecture.md
  - _bmad-output/planning-artifacts/architecture/architecture-I-bita-2026-11-16/ARCHITECTURE-SPINE.md
---

# I-bita - Epic Breakdown

## Overview

Este documento contiene el desglose completo de Épicas e Historias de Usuario para **I-bita**, descomponiendo los requerimientos funcionales (`FR-1` a `FR-18`), no funcionales (`NFR-1` a `NFR-10`), invariantes arquitectónicos (`AD-1` a `AD-6`), política `Zero-Simulation` y requerimientos de diseño UI/UX inspirados en la experiencia visual de **Airbnb Argentina (`airbnb.com.ar`)** adaptada a los tres diferenciales locales (Motor Bi-Monetario ARS/USDT, Módulo Consorcio Friendly y Contratos de Media Estadía CCyC).

## Requirements Inventory

### Functional Requirements

- **FR-1:** Registro y Autenticación Segura Multi-Rol (`GUEST`, `HOST`, `CONSORTIUM_ADMIN`, `SUPERADMIN`) sobre Supabase Auth con Row-Level Security (RLS).
- **FR-2:** Onboarding Fiscal y Bancario/Web3 del Anfitrión (KYB/KYC con validación de CBU/CVU de 22 dígitos y checksum EIP-55 de Wallet USDT con `viem`).
- **FR-3:** Módulo Legal Automático (Política de Privacidad Ley 25.326 + consentimiento biométrico, Términos CCyC, Banner de Cookies) y Módulo de Contacto Seguro con `zod`.
- **FR-4:** Creación y Gestión de Unidades Funcionales con fotos optimizadas `WebP/AVIF` y cifrado inmediato `AES-256-GCM` del código de cerradura.
- **FR-5:** Sincronización Bidireccional de Calendarios vía iCal (`node-ical` + `ical-generator`) con escudo Anti-SSRF (`ipaddr.js` / `ssrf-req-filter`).
- **FR-6:** Generador de Link / Micrositio de Reserva Directa B2B2C (`i-bita.ar/p/[slug]`) con comparador de ahorro frente a OTAs extranjeras.
- **FR-7:** Motor Tarifario Dual (Estadía Corta 1–29 noches vs. Media Estadía 30–180 noches con comisión decreciente `5%–7%`) calculado con `decimal.js`.
- **FR-8:** Configuración del Perfil de Consorcio por Propiedad (WhatsApp de portería, email de administración, CUIT y Micro-Canon Consorcial `0%`, `1%`, `1.5%`, `2%`).
- **FR-9:** Flujo de Pre-Check-in Biométrico Multi-Huésped con lectura de código **PDF417** del DNI argentino (`@zxing/library`) + validación multimodal con **Gemini 2.5 Flash API** (`@google/generative-ai` + `zod`).
- **FR-10:** Bloqueo Criptográfico de Acceso por Regla "Zero-Trust Consorcial" (`access_code` devuelve `null` en red hasta que `verified_adults_count == declared_adults_count` / `ALL_ADULTS_VERIFIED`).
- **FR-11:** Emisión y Verificación Criptográfica del Pase Digital de Portería firmado con `jose` (JWS/JWT) + QR (`qrcode`) enviado por WhatsApp Cloud API y Resend Email, verificable en `/verify/[token]`.
- **FR-12:** Checkout Local en Pesos Argentinos (ARS) y 1, 3 y 6 cuotas con SDK oficial `mercadopago` y validación HMAC-SHA256 en Webhook.
- **FR-13:** Checkout Cripto (USDT/USDC en Polygon) con verificación on-chain en servidor mediante `viem` (`getTransactionReceipt`).
- **FR-14:** Libro Mayor Inmutable (`ledger_entries` append-only con `idempotency_key`) y Split de Liquidación T+24h post Check-in hacia Anfitrión y Consorcio.
- **FR-15:** Generación en Servidor (`pdf-lib`) y Sellado `SHA-256` del Contrato de Locación Temporaria (Art. 1199 CCyC) para estadías de 30 a 180 noches.
- **FR-16:** Gestión de Pagos Mensualizados y Depósito en Garantía en Custodia (Escrow) para Media Estadía.
- **FR-17:** Buscador Público B2C con switch *"Escapadas (Por Día)"* vs. *"Media Estadía (Por Mes)"*, filtros por insignias y datos estructurados `Schema.org / JSON-LD`.
- **FR-18:** Panel de Control del Anfitrión y exportación de reportes regulatorios en CSV/PDF (RPATT CABA / ARCA).

### NonFunctional Requirements

- **NFR-1:** Core Web Vitals extremos (`LCP < 1.8s`, `INP < 150ms`, `CLS < 0.02`).
- **NFR-2:** Arquitectura Cloud-Native liviana en Next.js + Supabase Cloud + Vercel (**prohibido levantar contenedores Docker pesados locales** por restricción de hardware Core i5).
- **NFR-3:** Validación Fail-Fast de variables de entorno (`@t3-oss/env-nextjs` + `zod`) y sanitización de inputs/webhooks/URLs iCal.
- **NFR-4:** Protección de PII/Biometría en buckets privados con `signed URLs <= 60s` y códigos de acceso cifrados con `AES-256-GCM`.
- **NFR-5:** Cabeceras HTTP de seguridad OWASP (`CSP`, `HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).
- **NFR-6:** Prevención física de doble reserva en PostgreSQL mediante extensión `btree_gist` (`EXCLUDE USING gist` -> `SQLSTATE 23P01`).
- **NFR-7:** Inmutabilidad contable en `ledger_entries` (trigger `trg_ledger_immutable` y RLS que bloquean `UPDATE` y `DELETE`).
- **NFR-8:** Experiencia Mobile-First / PWA sin requerir descarga de app en tiendas para Pre-Check-in y Portería.
- **NFR-9:** Accesibilidad **WCAG 2.1 AA/AAA**, navegación por teclado, etiquetas ARIA y soporte **Dark/Light Mode**.
- **NFR-10:** SEO Técnico, GEO y AEO (`sitemap.xml`, `robots.txt`, Open Graph dinámico y `JSON-LD`).

### Additional Requirements

- **AD-1 (Low-Footprint Cloud-Native):** Ejecución sobre Supabase Cloud (`trknmgnzjhrhtwloiaga`), Gemini 2.5 Flash API y Polygon RPC público sin Docker local.
- **AD-2 (Fail-Fast Env Contract):** Todo acceso a variables de entorno centralizado en `src/env.ts` con `@t3-oss/env-nextjs` + `zod`.
- **AD-3 (Anti-Double-Booking Physical Constraint):** Constraint `btree_gist` en `public.bookings` verificado por `gate-epic-1-btree-gist.ts`.
- **AD-4 (SSRF Shield):** Validación previa de IP con `ipaddr.js` / `ssrf-req-filter` antes de `node-ical` verificada por `gate-epic-2-ical-ssrf.ts`.
- **AD-5 (Cryptographic Zero-Trust Gate):** Cifrado `AES-256-GCM` y revelación exclusiva tras `ALL_ADULTS_VERIFIED` verificada por `gate-epic-3-zero-trust-kyc.ts`.
- **AD-6 (Webhook/RPC-Only Financial Mutation):** Validación HMAC-SHA256 / `viem` recibo on-chain, `decimal.js` y `pdf-lib` + `SHA-256` verificados por `gate-epic-4-webhook-pdf-ledger.ts`.

### UX Design Requirements

- **UX-DR1 (Sistema Visual Inspirado en Airbnb Argentina + Identidad I-bita):** Header sticky con píldora de búsqueda interactiva (*Destino · Modo Estadía Corta/Media · Huéspedes*), barra horizontal de categorías/corredores con íconos (*CABA, Costa Atlántica, Córdoba, Vaca Muerta, Consorcio Friendly, Acepta Cuotas, Acepta USDT*) y soporte fluido Light/Dark Mode con contraste WCAG 2.1 AAA.
- **UX-DR2 (Property Cards de Alta Conversión estilo Airbnb):** Cards con carrusel/aspect-ratio fijo (`CLS = 0`), badge superior *"Consorcio Friendly"* / *"3 y 6 Cuotas"*, y doble visualización de tarifa (*Precio final en ARS sin percepciones* + *Equivalente en USDT*).
- **UX-DR3 (Ficha de Propiedad y Micrositio B2B2C con Bento Grid & Sticky Booking Widget):** Galería estilo Bento de 5 fotos en desktop y swipeable en móvil, junto a una tarjeta lateral flotante (*Sticky Booking Card*) que calcula en vivo el ahorro vs. Airbnb, las cuotas en ARS, la reducción de comisión al `5%–7%` para `>= 30 noches` y el Depósito en Escrow.
- **UX-DR4 (Experiencia Mobile-First de Pre-Check-in Biométrico y Pase QR de Portería):** Interfaz guiada paso a paso para móvil con lector en vivo de código PDF417 del DNI argentino, captura de selfie con marco guía, barra de progreso de acompañantes verificados (`2/2 Verificados`) y tarjeta de Pase Digital de Portería estilo *Apple/Google Wallet* con código QR de alto contraste.

### FR Coverage Map

- **FR-1:** Epic 1 (Story 1.2) - Autenticación multi-rol con Supabase Auth y RLS.
- **FR-2:** Epic 1 (Story 1.2) - Onboarding fiscal/bancario/Web3 del Anfitrión (CBU 22 dígitos + `viem` checksum).
- **FR-3:** Epic 1 (Story 1.3) - Módulo Legal Automático (Ley 25.326, CCyC, Cookies) y Contacto Seguro (`zod`).
- **FR-4:** Epic 2 (Story 2.1) - Alta de Unidades Funcionales con fotos `WebP/AVIF` y PIN cifrado `AES-256-GCM`.
- **FR-5:** Epic 2 (Story 2.2) - Sincronización bidireccional iCal (`node-ical` + `ical-generator`) y escudo Anti-SSRF (`ipaddr.js`).
- **FR-6:** Epic 2 (Story 2.3) - Micrositio de Reserva Directa B2B2C (`/p/[slug]`) inspirado en ficha Airbnb.
- **FR-7:** Epic 2 (Story 2.3) - Calculadora tarifaria dual con `decimal.js` (Estadía Corta vs. Media Estadía 5%–7%).
- **FR-8:** Epic 3 (Story 3.1) - Configuración Consorcio Friendly y Micro-Canon (`1%–2%`).
- **FR-9:** Epic 3 (Story 3.2) - Escáner PDF417 DNI (`@zxing`) + validación multimodal con Gemini 2.5 Flash API.
- **FR-10:** Epic 3 (Story 3.3) - Compuerta criptográfica Zero-Trust Consorcial (`AES-256-GCM` desencriptado solo en `ALL_ADULTS_VERIFIED`).
- **FR-11:** Epic 3 (Story 3.3) - Emisión de Pase Digital de Portería (`jose` JWS + `qrcode`), despacho WhatsApp/Email y vista `/verify/[token]`.
- **FR-12:** Epic 4 (Story 4.1) - Checkout ARS y cuotas con SDK `mercadopago` y webhook HMAC-SHA256.
- **FR-13:** Epic 4 (Story 4.2) - Checkout USDT en Polygon verificado on-chain con `viem`.
- **FR-14:** Epic 4 (Story 4.4) - Libro mayor inmutable `ledger_entries` y Split de Liquidación T+24h.
- **FR-15:** Epic 4 (Story 4.3) - Generación de Contrato Temporario CCyC Art. 1199 en PDF (`pdf-lib`) sellado con `SHA-256`.
- **FR-16:** Epic 4 (Story 4.3) - Plan de pagos mensualizado y custodia de Depósito en Escrow.
- **FR-17:** Epic 5 (Story 5.1, Story 5.2) - Marketplace Público B2C estilo Airbnb Argentina, switch Por Día/Por Mes y SEO/GEO `JSON-LD`.
- **FR-18:** Epic 5 (Story 5.3) - Dashboard del Anfitrión y exportación de reportes regulatorios CSV/PDF (RPATT/ARCA).

## Epic List

### Epic 1: Fundación Cloud-Native, Esquema Anti-Solapamiento, Autenticación Multi-Rol y Módulo Legal
Establecer la base productiva de I-bita en Next.js + Supabase Cloud + Vercel con validación Fail-Fast (`@t3-oss/env-nextjs`), modelo de datos relacional protegido con RLS y `btree_gist`, onboarding de Anfitriones y páginas legales/contacto con diseño inspirado en Airbnb Argentina.
**FRs covered:** FR-1, FR-2, FR-3 (más NFR-1..6, NFR-9, AD-1..3, UX-DR1).

### Epic 2: Core B2B2C — Gestión de Propiedades, Sincronización iCal Anti-SSRF y Micrositio de Reserva Directa
Permitir a los anfitriones publicar sus Unidades Funcionales con PIN cifrado en `AES-256-GCM`, sincronizar calendarios de Airbnb/Booking mediante `node-ical` e `ical-generator` con escudo Anti-SSRF, y compartir su propio link de reserva directa (`/p/[slug]`) con calculadora exacta `decimal.js`.
**FRs covered:** FR-4, FR-5, FR-6, FR-7 (más AD-4, UX-DR2, UX-DR3).

### Epic 3: Módulo "Consorcio Friendly" — Pre-Check-in Biométrico Zero-Trust y Pase Digital de Portería
Destrabar edificios de propiedad horizontal mediante configuración consorcial, escaneo PDF417 del DNI argentino (`@zxing`), auditoría multimodal con Gemini 2.5 Flash API, bloqueo criptográfico del PIN de acceso hasta verificar al 100% de los adultos y envío automático del Pase Digital con QR (`jose` + `qrcode`) a la portería.
**FRs covered:** FR-8, FR-9, FR-10, FR-11 (más AD-5, NFR-4, NFR-8, UX-DR4).

### Epic 4: Motor Financiero Bi-Monetario, Contratos de Media Estadía (CCyC) y Libro Mayor Inmutable
Procesar cobros reales en ARS (Mercado Pago SDK + Webhook HMAC-SHA256) y USDT en Polygon (`viem` `getTransactionReceipt`), emitir contratos temporarios en PDF (`pdf-lib`) sellados con `SHA-256` para estadías de 30 a 180 noches, y registrar cada movimiento en el libro mayor append-only `ledger_entries` con Split de Liquidación hacia Anfitrión y Consorcio.
**FRs covered:** FR-12, FR-13, FR-14, FR-15, FR-16 (más AD-6, NFR-7).

### Epic 5: Marketplace Público B2C Estilo Airbnb Argentina, Posicionamiento SEO/GEO y Panel del Anfitrión
Lanzar el buscador público B2C con barra de corredores, switch *"Por Día"* vs. *"Por Mes (Media Estadía)"*, marcado `Schema.org / JSON-LD`, panel integral del Anfitrión con exportación regulatoria RPATT/ARCA y auditoría final Zero-Simulation.
**FRs covered:** FR-17, FR-18 (más NFR-1, NFR-10, UX-DR1, UX-DR2).

---

## Epic 1: Fundación Cloud-Native, Esquema Anti-Solapamiento, Autenticación Multi-Rol y Módulo Legal

Establecer el cimiento "production-ready" de I-bita en Next.js (App Router) + Supabase Cloud + Vercel con validación Fail-Fast de entorno, esquema PostgreSQL completo con `btree_gist` y RLS, sistema de diseño inspirado en Airbnb Argentina, autenticación multi-rol y módulos legales/contacto.

### Story 1.1: Inicialización de Next.js, Validación Fail-Fast (`@t3-oss/env-nextjs`) y Migración SQL `btree_gist` en Supabase Cloud

As a Arquitecto / Desarrollador de I-bita,
I want inicializar el proyecto Next.js con validación estricta de variables de entorno en `src/env.ts`, cabeceras OWASP y aplicar la migración DDL en Supabase Cloud (`trknmgnzjhrhtwloiaga`) con la extensión `btree_gist`,
So that el sistema falle inmediatamente si falta una credencial y el motor PostgreSQL impida físicamente cualquier doble reserva o alteración contable.

**Acceptance Criteria:**

**Given** las credenciales reales configuradas en `.env.local`
**When** se inicializa la aplicación o se importa `src/env.ts`
**Then** `@t3-oss/env-nextjs` y `zod` validan todas las claves sin permitir fallbacks silenciosos (`|| "mock"`)
**And** la migración `supabase/migrations/0001_initial_schema_and_rls.sql` se ejecuta en Supabase Cloud creando las tablas con RLS activo, el trigger `trg_ledger_immutable` y el constraint `no_overlapping_active_bookings`.

### Story 1.2: Autenticación Multi-Rol con Supabase SSR y Onboarding Fiscal/Web3 del Anfitrión

As a Propietario o Administrador de Alojamientos,
I want registrarme e iniciar sesión en I-bita y configurar mi CUIT/CUIL, mi CBU/CVU de 22 dígitos en ARS y mi dirección de Wallet USDT en Polygon,
So that pueda operar como Anfitrión verificado y recibir mis liquidaciones automáticas en pesos o stablecoins.

**Acceptance Criteria:**

**Given** un usuario autenticado mediante `@supabase/ssr`
**When** completa el formulario de Onboarding de Anfitrión (`FR-1`, `FR-2`)
**Then** el servidor valida con `zod` el formato de CUIT/CUIL, los 22 dígitos numéricos del CBU/CVU y el checksum EIP-55 de la billetera mediante `viem` (`isAddress`)
**And** persiste los datos en `public.profiles` actualizando su rol a `HOST`.

### Story 1.3: Layout Inspirado en Airbnb Argentina, Módulo Legal Automático y Contacto Seguro

As a Visitante, Huésped o Anfitrión,
I want navegar por una interfaz limpia estilo Airbnb Argentina (con soporte Dark/Light Mode y WCAG 2.1 AAA), consultar la Política de Privacidad (Ley 25.326), Términos CCyC, configurar el Banner de Cookies y enviar consultas por el formulario de Contacto Seguro,
So that tenga plena transparencia legal sobre mis datos biométricos y un canal de soporte confiable.

**Acceptance Criteria:**

**Given** un usuario en cualquier ruta pública de I-bita (`FR-3`, `UX-DR1`)
**When** accede a `/legal/privacidad`, `/legal/terminos`, interactúa con el banner de cookies o envía el formulario en `/contacto`
**Then** las páginas se renderizan con semántica HTML5 impecable y el formulario valida los campos con `zod` insertando el registro real en `public.contact_inquiries` en Supabase Cloud
**And** el script `scripts/gates/gate-epic-1-btree-gist.ts` comprueba en terminal que insertar dos reservas superpuestas en `public.bookings` arroja el error real de PostgreSQL `23P01 (exclusion_violation)`.

---

## Epic 2: Core B2B2C — Gestión de Propiedades, Sincronización iCal Anti-SSRF y Micrositio de Reserva Directa

Permitir a los anfitriones actuales de Airbnb cargar sus propiedades en minutos, sincronizar sus calendarios bidireccionalmente sin riesgo de SSRF y obtener su página de reserva directa (`/p/[slug]`) con calculadora bi-monetaria exacta.

### Story 2.1: Alta de Unidades Funcionales con Fotos Optimizadas y Cifrado `AES-256-GCM` del PIN de Acceso

As a Anfitrión verificado,
I want crear y editar mis Unidades Funcionales especificando corredor geográfico, capacidad máxima, tarifas en ARS/USD, descuento mensual y código de cerradura electrónica,
So that mi propiedad quede lista para recibir reservas manteniendo el código de acceso cifrado en reposo.

**Acceptance Criteria:**

**Given** un Anfitrión autenticado en el panel de creación de propiedad (`FR-4`, `AD-5`)
**When** envía los datos de la Unidad Funcional incluyendo el PIN/instrucciones de ingreso
**Then** el módulo `src/lib/crypto/aes-gcm.ts` cifra el PIN en el servidor con `AES-256-GCM` usando `ACCESS_CODE_ENCRYPTION_KEY` antes de hacer el `INSERT` en `public.properties` (`access_code_ciphertext`, `access_code_iv`, `access_code_auth_tag`)
**And** las fotografías se almacenan y sirven con dimensiones explícitas (`CLS = 0`).

### Story 2.2: Sincronización Bidireccional de Calendarios iCal (`node-ical` + `ical-generator`) con Escudo Anti-SSRF

As a Anfitrión que publica en Airbnb y Booking,
I want importar mis calendarios `.ics` externos y exportar el calendario `.ics` de I-bita,
So that las fechas reservadas se bloqueen automáticamente en ambas direcciones sin riesgo de sobreventa ni vulnerabilidades SSRF.

**Acceptance Criteria:**

**Given** una URL de calendario `.ics` ingresada por un Anfitrión (`FR-5`, `AD-4`)
**When** se invoca el sincronizador de iCal o se consulta `GET /api/ical/[propertyId].ics`
**Then** `src/modules/ical/ssrf-guard.ts` valida el host con `ipaddr.js` bloqueando inmediatamente rangos privados (`127.0.0.1`, `localhost`, `10.0.0.0/8`, `169.254.169.254`) antes de usar `node-ical`
**And** `GET /api/ical/[propertyId].ics` usa `ical-generator` devolviendo `Content-Type: text/calendar; charset=utf-8` con zona horaria `America/Argentina/Buenos_Aires`, verificado en consola por `scripts/gates/gate-epic-2-ical-ssrf.ts`.

### Story 2.3: Micrositio de Reserva Directa B2B2C (`/p/[slug]`) y Calculadora Tarifaria Exacta (`decimal.js`)

As a Huésped o Cliente Recurrente de un Anfitrión,
I want ingresar al link directo de la propiedad (`/p/[slug]`) con diseño de galería Bento y Sticky Booking Widget estilo Airbnb, seleccionar mis fechas y ver el desglose exacto en ARS (cuotas) o USDT,
So that pueda iniciar una reserva de Estadía Corta o Media Estadía ahorrando las comisiones internacionales de Airbnb.

**Acceptance Criteria:**

**Given** una propiedad publicada en `/p/[slug]` (`FR-6`, `FR-7`, `UX-DR3`)
**When** el usuario selecciona fechas de Estadía Corta (`1–29 noches`) o Media Estadía (`30–180 noches`)
**Then** el motor `src/lib/math/money.ts` calcula todos los importes usando `decimal.js` (cero `float` nativo), reduciendo automáticamente la comisión de plataforma al `5%–7%` cuando `noches >= 30` y mostrando el comparador de ahorro frente a OTAs extranjeras
**And** al confirmar la solicitud inicial, crea el registro en `public.bookings` en estado `PENDING_PAYMENT` y los slots de `public.guest_verifications` para la cantidad de adultos declarados.

---

## Epic 3: Módulo "Consorcio Friendly" — Pre-Check-in Biométrico Zero-Trust y Pase Digital de Portería

Eliminar el conflicto vecinal en edificios de propiedad horizontal mediante validación biométrica obligatoria de todos los adultos declarados, bloqueo criptográfico del PIN de ingreso y envío automático del Pase Digital con QR a la portería.

### Story 3.1: Configuración del Perfil "Consorcio Friendly" y Regla de Micro-Canon (1%–2%)

As a Anfitrión de un departamento en edificio de propiedad horizontal,
I want configurar el WhatsApp de la portería, el email de la administración, el CUIT del consorcio y activar opcionalmente el Micro-Canon Consorcial (`1%`, `1.5%` o `2%`),
So that mi anuncio obtenga la insignia *"Propiedad Consorcio Friendly"* y el edificio reciba pases verificados y participación económica en cada reserva.

**Acceptance Criteria:**

**Given** una Unidad Funcional perteneciente al Anfitrión (`FR-8`)
**When** guarda la configuración en `public.consortium_configs`
**Then** la propiedad exhibe el sello verificado *"Consorcio Friendly"* en su micrositio y en el Marketplace, y el porcentaje de Micro-Canon queda vinculado para el cálculo de Split con `decimal.js`.

### Story 3.2: Flujo Móvil de Pre-Check-in con Escáner PDF417 DNI (`@zxing`) y Auditoría Multimodal Gemini 2.5 Flash

As a Huésped Titular o Acompañante Declarado adulto,
I want abrir mi enlace de Pre-Check-in desde el celular, escanear el código de barras PDF417 del dorso de mi DNI argentino (o MRZ de Pasaporte), subir el frente del documento y tomarme una selfie,
So that mi identidad quede verificada biométricamente antes de llegar al edificio.

**Acceptance Criteria:**

**Given** un adulto con un `invite_token` válido en `/checkin/[bookingId]` (`FR-9`, `UX-DR4`)
**When** acepta el consentimiento biométrico (Ley 25.326), escanea el PDF417 con `@zxing/browser` / `@zxing/library` y envía el frente del documento + selfie
**Then** las imágenes se guardan en el bucket privado de Supabase Storage y el backend invoca **Gemini 2.5 Flash API** (`@google/generative-ai` + esquema estructurado `zod`) para verificar coincidencia facial y documental
**And** si el resultado es aprobatorio, actualiza `guest_verifications.status = 'VERIFIED'`, incrementa `bookings.verified_adults_count` y, cuando `verified_adults_count == declared_adults_count`, transiciona `bookings.status = 'ALL_ADULTS_VERIFIED'`.

### Story 3.3: Compuerta Criptográfica Zero-Trust Consorcial y Emisión del Pase Digital de Portería (`jose` + `qrcode`)

As a Encargado de Seguridad / Portería del Edificio y Huésped Verificado,
I want que el código de cerradura se desbloquee únicamente cuando el 100% de los adultos declarados estén verificados y que la portería reciba al instante el Pase Digital con QR firmado criptográficamente,
So that nadie no identificado pueda ingresar al edificio y el guardia valide la credencial en un segundo desde `/verify/[token]`.

**Acceptance Criteria:**

**Given** una reserva en curso (`FR-10`, `FR-11`, `AD-5`)
**When** se consulta `getBookingAccessDetailsAction(bookingId)` mientras `verified_adults_count < declared_adults_count`
**Then** la respuesta devuelve estrictamente `accessCode: null` a nivel de red HTTP
**And** cuando `status === 'ALL_ADULTS_VERIFIED'`, el servidor desencripta `access_code_ciphertext` (`AES-256-GCM`), firma el Pase Digital JWS/JWT con `jose` (`PORTERIA_JWS_SECRET`), genera el QR con `qrcode`, lo envía por WhatsApp Cloud API y Resend Email, y expone la vista verificadora `/verify/[token]`, todo comprobado en terminal por `scripts/gates/gate-epic-3-zero-trust-kyc.ts`.

---

## Epic 4: Motor Financiero Bi-Monetario, Contratos de Media Estadía (CCyC) y Libro Mayor Inmutable

Habilitar cobros reales en ARS (Mercado Pago) y USDT en Polygon (`viem`), contratos temporarios en PDF sellados con `SHA-256` y contabilidad inmutable de partida doble con Split de Liquidación.

### Story 4.1: Checkout en ARS con SDK Oficial de Mercado Pago y Webhook con Validación Criptográfica HMAC-SHA256

As a Huésped Argentino,
I want pagar mi reserva en Pesos Argentinos (con QR, MODO, saldo en cuenta o en 3 y 6 cuotas) a través de Mercado Pago,
So that pueda financiar mi estadía en moneda local sin pagar impuestos ni percepciones al dólar tarjeta.

**Acceptance Criteria:**

**Given** una reserva en estado `PENDING_PAYMENT` (`FR-12`, `AD-6`)
**When** se genera la preferencia con el SDK oficial `mercadopago` y Mercado Pago invoca `POST /api/webhooks/payments`
**Then** el endpoint valida obligatoriamente el header `x-signature` con `crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET)` devolviendo `401 Unauthorized` ante cualquier firma inválida o ausente
**And** solo tras validar la firma y consultar el estado aprobado en Mercado Pago, registra los asientos en `public.ledger_entries` y cambia el estado de la reserva a `PAID_PENDING_KYC`.

### Story 4.2: Checkout y Custodia Escrow en USDT (Polygon) con Verificación On-Chain vía `viem`

As a Nómada Digital, Turista Extranjero o Inquilino de Media Estadía,
I want abonar mi estadía o constituir mi Depósito en Garantía en USDT sobre la red Polygon,
So that pueda pagar directamente con stablecoins sin intermediación bancaria tradicional.

**Acceptance Criteria:**

**Given** un pago o depósito en USDT enviado a `NEXT_PUBLIC_IBITA_TREASURY_WALLET` (`FR-13`, `AD-6`)
**When** se notifica el `txHash` al backend
**Then** el servidor utiliza `viem` (`createPublicClient` conectado a `EVM_RPC_URL` y `getTransactionReceipt`) para verificar en la blockchain que la transacción fue exitosa (`status === 'success'`), que emitió el evento `Transfer` del contrato oficial `NEXT_PUBLIC_USDT_CONTRACT_ADDRESS` hacia la bóveda de I-bita por el monto exacto calculado con `decimal.js`
**And** inserta el asiento inmutable en `public.ledger_entries` con `idempotency_key = txHash`.

### Story 4.3: Generación en Servidor y Sellado `SHA-256` del Contrato de Locación Temporaria (Art. 1199 CCyC)

As a Anfitrión e Inquilino de Media Estadía (30 a 180 noches),
I want que el sistema redacte automáticamente el Contrato de Locación Temporaria válido bajo el Código Civil y Comercial Argentino en formato PDF y lo selle criptográficamente con `SHA-256` al firmarlo electrónicamente,
So that ambas partes contemos con respaldo jurídico inmediato y garantía en custodia (Escrow) contra la inflación.

**Acceptance Criteria:**

**Given** una reserva de Media Estadía (`nights_count >= 30`, `FR-15`, `FR-16`)
**When** se ejecuta `generateAndSignContractAction(bookingId)`
**Then** el servidor construye el binario PDF real usando `pdf-lib` con las cláusulas del Art. 1199 CCyC, datos de las partes, finalidad de la estadía, monto mensual y garantía en Escrow
**And** calcula `crypto.createHash('sha256').update(pdfBuffer).digest('hex')`, sube el PDF a Supabase Storage y persiste el hash de 64 caracteres en `public.contracts`.

### Story 4.4: Motor de Libro Mayor Inmutable (`ledger_entries`) y Split de Liquidación T+24h (Anfitrión + Micro-Canon Consorcial)

As a Anfitrión y Administración del Consorcio,
I want que 24 horas después del Check-in verificado se ejecute automáticamente el Split de Liquidación descontando la comisión de I-bita, transfiriendo el Micro-Canon (`1%–2%`) al Consorcio y liquidando el neto según la preferencia del Anfitrión (ARS CBU/CVU o USDT Wallet),
So that todos los actores cobren de forma transparente, auditable y sin errores de redondeo.

**Acceptance Criteria:**

**Given** una reserva con pago confirmado y check-in biométrico realizado (`FR-14`, `NFR-7`, `AD-6`)
**When** se ejecuta el motor de liquidación de Split con `decimal.js`
**Then** se registran en `public.ledger_entries` los asientos de partida doble (`PLATFORM_FEE_REVENUE`, `CONSORTIUM_CANON_PAYABLE`, `HOST_NET_PAYABLE` / `HOST_NET_SETTLED`) protegidos contra `UPDATE`/`DELETE` por el trigger `trg_ledger_immutable`
**And** el script `scripts/gates/gate-epic-4-webhook-pdf-ledger.ts` verifica en consola el rechazo `401` ante un webhook sin HMAC válido, la generación del PDF con su hash `SHA-256` de 64 caracteres y la inserción e inmutabilidad en `ledger_entries`.

---

## Epic 5: Marketplace Público B2C Estilo Airbnb Argentina, Posicionamiento SEO/GEO y Panel del Anfitrión

Consolidar el inventario en un Marketplace público inspirado visualmente en `airbnb.com.ar`, optimizado para motores de búsqueda e IA generativa, acompañado del panel de control y reportes regulatorios del Anfitrión.

### Story 5.1: Home y Buscador del Marketplace B2C Inspirado en Airbnb Argentina (Switch Por Día vs. Media Estadía)

As a Turista Nacional, Estudiante, Profesional Corporativo o Nómada Digital,
I want explorar propiedades en el Marketplace de I-bita con una experiencia visual de primer nivel inspirada en Airbnb Argentina, pudiendo alternar con un clic entre *"Escapadas (Por Día en ARS y Cuotas)"* y *"Media Estadía (1 a 6 Meses con Comisión 5%–7%)"* y filtrar por corredor e insignias (*Consorcio Friendly*, *Acepta Cuotas*, *Acepta USDT*, *Wi-Fi Verificado*),
So that encuentre y reserve el alojamiento ideal con precios transparentes y sin fricciones cambiarias.

**Acceptance Criteria:**

**Given** las propiedades publicadas en `public.properties` en Supabase Cloud (`FR-17`, `UX-DR1`, `UX-DR2`)
**When** el usuario navega por la Home (`/`), filtra por corredor (*CABA, Costa Atlántica, Córdoba, Vaca Muerta*), fechas o insignias, o cambia el modo de estadía
**Then** la consulta filtra en tiempo real en PostgreSQL excluyendo unidades con reservas activas en ese rango de fechas y muestra las tarjetas con doble moneda (ARS/USDT) y badges verificados.

### Story 5.2: SEO Técnico, Marcado Estructurado `Schema.org / JSON-LD` (GEO/AEO), `sitemap.xml` y `robots.txt`

As a Motor de Búsqueda (Google) o Motor de Respuesta Generativa de IA (ChatGPT, Perplexity, Gemini),
I want leer datos estructurados `JSON-LD` (`LodgingBusiness`, `Accommodation`, `Offer`, `FAQPage`), etiquetas Open Graph dinámicas y un `sitemap.xml` actualizado en cada corredor y propiedad de I-bita,
So that indexe y recomiende las propiedades de I-bita ante búsquedas de alquileres temporarios y de media estadía en Argentina.

**Acceptance Criteria:**

**Given** cualquier página pública del Marketplace o Micrositio B2B2C (`/p/[slug]`, `FR-17`, `NFR-10`)
**When** se inspecciona el HTML renderizado en servidor (SSR/ISR) y las rutas `/sitemap.xml` y `/robots.txt`
**Then** incluye el bloque `<script type="application/ld+json">` válido con precios en ARS/USD, ubicación y preguntas frecuentes estructuradas para AEO/GEO.

### Story 5.3: Dashboard Integral del Anfitrión, Exportador Regulatorio CSV/PDF (RPATT/ARCA) y Auditoría Final Zero-Simulation

As a Anfitrión / Property Manager,
I want gestionar todas mis propiedades, reservas, estado de pre-check-ins biométricos, contratos firmados, asientos del Ledger y descargar en un clic el reporte CSV/PDF para presentar ante registros turísticos (RPATT) o contables (ARCA),
So that tenga control operativo y financiero total de mi cartera desde un único panel.

**Acceptance Criteria:**

**Given** un Anfitrión autenticado en `/dashboard` (`FR-18`)
**When** consulta sus métricas, administra el Escrow o exporta el reporte de un período
**Then** el sistema genera el archivo CSV/PDF con los datos reales de reservas, huéspedes verificados biométricamente, montos brutos, comisiones, Micro-Canon Consorcial y neto liquidado
**And** el script `scripts/gates/gate-epic-5-zero-simulation.ts` ejecuta la auditoría global `grep -rniE "mock|simulate|dummy|fake|todo|fixme|setTimeout" src/` confirmando **cero coincidencias** y un build de producción limpio.
