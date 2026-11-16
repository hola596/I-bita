# Epic 1: Fundación Cloud-Native, Esquema Anti-Solapamiento, Autenticación Multi-Rol y Módulo Legal

* **ID de Épica:** `EPIC-1`
* **Requerimientos Cubiertos:** `FR-1`, `FR-2`, `FR-3`, `NFR-1..6`, `NFR-9`, `AD-1`, `AD-2`, `AD-3`, `UX-DR1`
* **Dependencias de Arquitectura:** [01-stack-and-env.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/01-stack-and-env.md), [02-data-model-and-rls.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/02-data-model-and-rls.md), [04-ui-airbnb-design-system.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/04-ui-airbnb-design-system.md)

## Objetivo
Establecer la base productiva de I-bita en Next.js (App Router) + Supabase Cloud (`trknmgnzjhrhtwloiaga`) + Vercel con validación Fail-Fast (`@t3-oss/env-nextjs`), modelo de datos relacional protegido con RLS y `btree_gist`, onboarding de Anfitriones y páginas legales/contacto con diseño inspirado en Airbnb Argentina.

---

### Story 1.1: Inicialización de Next.js, Validación Fail-Fast (`@t3-oss/env-nextjs`) y Migración SQL `btree_gist` en Supabase Cloud

**As a** Arquitecto / Desarrollador de I-bita,
**I want** inicializar el proyecto Next.js con validación estricta de variables de entorno en `src/env.ts`, cabeceras OWASP y aplicar la migración DDL en Supabase Cloud (`trknmgnzjhrhtwloiaga`) con la extensión `btree_gist`,
**So that** el sistema falle inmediatamente si falta una credencial y el motor PostgreSQL impida físicamente cualquier doble reserva o alteración contable.

**Acceptance Criteria:**
- **Given** las credenciales reales configuradas en `.env.local`
- **When** se inicializa la aplicación o se importa `src/env.ts`
- **Then** `@t3-oss/env-nextjs` y `zod` validan todas las claves sin permitir fallbacks silenciosos (`|| "mock"`)
- **And** la migración `supabase/migrations/0001_initial_schema_and_rls.sql` se ejecuta en Supabase Cloud creando las tablas con RLS activo, el trigger `trg_ledger_immutable` y el constraint `no_overlapping_active_bookings`.

---

### Story 1.2: Autenticación Multi-Rol con Supabase SSR y Onboarding Fiscal/Web3 del Anfitrión

**As a** Propietario o Administrador de Alojamientos,
**I want** registrarme e iniciar sesión en I-bita y configurar mi CUIT/CUIL, mi CBU/CVU de 22 dígitos en ARS y mi dirección de Wallet USDT en Polygon,
**So that** pueda operar como Anfitrión verificado y recibir mis liquidaciones automáticas en pesos o stablecoins.

**Acceptance Criteria:**
- **Given** un usuario autenticado mediante `@supabase/ssr`
- **When** completa el formulario de Onboarding de Anfitrión (`FR-1`, `FR-2`)
- **Then** el servidor valida con `zod` el formato de CUIT/CUIL, los 22 dígitos numéricos del CBU/CVU y el checksum EIP-55 de la billetera mediante `viem` (`isAddress`)
- **And** persiste los datos en `public.profiles` actualizando su rol a `HOST`.

---

### Story 1.3: Layout Inspirado en Airbnb Argentina, Módulo Legal Automático y Contacto Seguro

**As a** Visitante, Huésped o Anfitrión,
**I want** navegar por una interfaz limpia estilo Airbnb Argentina (con soporte Dark/Light Mode y WCAG 2.1 AAA), consultar la Política de Privacidad (Ley 25.326), Términos CCyC, configurar el Banner de Cookies y enviar consultas por el formulario de Contacto Seguro,
**So that** tenga plena transparencia legal sobre mis datos biométricos y un canal de soporte confiable.

**Acceptance Criteria:**
- **Given** un usuario en cualquier ruta pública de I-bita (`FR-3`, `UX-DR1`)
- **When** accede a `/legal/privacidad`, `/legal/terminos`, interactúa con el banner de cookies o envía el formulario en `/contacto`
- **Then** las páginas se renderizan con semántica HTML5 impecable y el formulario valida los campos con `zod` insertando el registro real en `public.contact_inquiries` en Supabase Cloud.

---

## 🧪 Verification Gate (Requisito de Cierre en Terminal — Épica 1)
* **Script:** `npx tsx scripts/gates/gate-epic-1-btree-gist.ts`
* **Criterio de Éxito:** Inserta una reserva válida para una propiedad en Supabase Cloud y acto seguido intenta insertar una segunda reserva con fechas superpuestas para la misma propiedad, verificando que PostgreSQL rechaza la operación con `SQLSTATE 23P01 (exclusion_violation)`.
