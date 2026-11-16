# Epic 5: Marketplace Público B2C Estilo Airbnb Argentina, Posicionamiento SEO/GEO y Panel del Anfitrión

* **ID de Épica:** `EPIC-5`
* **Requerimientos Cubiertos:** `FR-17`, `FR-18`, `NFR-1`, `NFR-10`, `UX-DR1`, `UX-DR2`
* **Dependencias de Arquitectura:** [04-ui-airbnb-design-system.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/04-ui-airbnb-design-system.md), [05-directory-tree-and-gates.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/05-directory-tree-and-gates.md)

## Objetivo
Consolidar el inventario en un Marketplace público inspirado visualmente en `airbnb.com.ar`, optimizado para motores de búsqueda e IA generativa (`Schema.org / JSON-LD`), acompañado del panel de control y reportes regulatorios del Anfitrión.

---

### Story 5.1: Home y Buscador del Marketplace B2C Inspirado en Airbnb Argentina (Switch Por Día vs. Media Estadía)

**As a** Turista Nacional, Estudiante, Profesional Corporativo o Nómada Digital,
**I want** explorar propiedades en el Marketplace de I-bita con una experiencia visual de primer nivel inspirada en Airbnb Argentina, pudiendo alternar con un clic entre *"Escapadas (Por Día en ARS y Cuotas)"* y *"Media Estadía (1 a 6 Meses con Comisión 5%–7%)"* y filtrar por corredor e insignias (*Consorcio Friendly*, *Acepta Cuotas*, *Acepta USDT*, *Wi-Fi Verificado*),
**So that** encuentre y reserve el alojamiento ideal con precios transparentes y sin fricciones cambiarias.

**Acceptance Criteria:**
- **Given** las propiedades publicadas en `public.properties` en Supabase Cloud (`FR-17`, `UX-DR1`, `UX-DR2`)
- **When** el usuario navega por la Home (`/`), filtra por corredor (*CABA, Costa Atlántica, Córdoba, Vaca Muerta*), fechas o insignias, o cambia el modo de estadía
- **Then** la consulta filtra en tiempo real en PostgreSQL excluyendo unidades con reservas activas en ese rango de fechas y muestra las tarjetas con doble moneda (ARS/USDT) y badges verificados.

---

### Story 5.2: SEO Técnico, Marcado Estructurado `Schema.org / JSON-LD` (GEO/AEO), `sitemap.xml` y `robots.txt`

**As a** Motor de Búsqueda (Google) o Motor de Respuesta Generativa de IA (ChatGPT, Perplexity, Gemini),
**I want** leer datos estructurados `JSON-LD` (`LodgingBusiness`, `Accommodation`, `Offer`, `FAQPage`), etiquetas Open Graph dinámicas y un `sitemap.xml` actualizado en cada corredor y propiedad de I-bita,
**So that** indexe y recomiende las propiedades de I-bita ante búsquedas de alquileres temporarios y de media estadía en Argentina.

**Acceptance Criteria:**
- **Given** cualquier página pública del Marketplace o Micrositio B2B2C (`/p/[slug]`, `FR-17`, `NFR-10`)
- **When** se inspecciona el HTML renderizado en servidor (SSR/ISR) y las rutas `/sitemap.xml` y `/robots.txt`
- **Then** incluye el bloque `<script type="application/ld+json">` válido con precios en ARS/USD, ubicación y preguntas frecuentes estructuradas para AEO/GEO.

---

### Story 5.3: Dashboard Integral del Anfitrión, Exportador Regulatorio CSV/PDF (RPATT/ARCA) y Auditoría Final Zero-Simulation

**As a** Anfitrión / Property Manager,
**I want** gestionar todas mis propiedades, reservas, estado de pre-check-ins biométricos, contratos firmados, asientos del Ledger y descargar en un clic el reporte CSV/PDF para presentar ante registros turísticos (RPATT) o contables (ARCA),
**So that** tenga control operativo y financiero total de mi cartera desde un único panel.

**Acceptance Criteria:**
- **Given** un Anfitrión autenticado en `/dashboard` (`FR-18`)
- **When** consulta sus métricas, administra el Escrow o exporta el reporte de un período
- **Then** el sistema genera el archivo CSV/PDF con los datos reales de reservas, huéspedes verificados biométricamente, montos brutos, comisiones, Micro-Canon Consorcial y neto liquidado.

---

## 🧪 Verification Gate (Requisito de Cierre en Terminal — Épica 5 y Gate Global)
* **Script:** `npx tsx scripts/gates/gate-epic-5-zero-simulation.ts`
* **Criterio de Éxito:**
  1. Escaneo completo de código fuente garantizando cero coincidencias de `mock`, `simulate`, `dummy`, `fake`, `todo`, `fixme`, `setTimeout`.
  2. Compilación de producción `npm run build` exitosa sin errores de TypeScript.
