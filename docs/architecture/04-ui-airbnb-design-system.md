# 04. Sistema de Diseño UI/UX Inspirado en Airbnb Argentina (`airbnb.com.ar`)

Este documento especifica la arquitectura visual y de experiencia de usuario de **I-bita**, combinando la familiaridad y conversión de **Airbnb Argentina (`https://www.airbnb.com.ar/`)** con la identidad propia de nuestros tres pilares locales.

## 1. Paleta Cromática, Tipografía y Modos (WCAG 2.1 AAA)
* **Color Primario de Marca (I-bita Coral / Terracota Argentino):** `#FF385C` / `#E00B41` (acento de acción principal, píldora de búsqueda y botones de reserva, con ratio de contraste verificado en texto e íconos).
* **Acento de Confianza Local y Finanzas (Celeste / Esmeralda Verificado):**
  * **Sello Consorcio Friendly & Biometría:** `#008A05` / `#0F766E` (Esmeralda de seguridad verificada).
  * **Badge Financiación ARS (Mercado Pago / MODO / Cuotas):** `#009EE3` / `#0284C7` (Azul Fintech Argentino).
  * **Badge Web3 (USDT / Escrow):** `#26A17B` (Tether Emerald).
* **Superficies (Light & Dark Mode Nativo):**
  * *Light Mode:* Fondo principal `#FFFFFF`, fondo secundario `#F7F7F7`, bordes sutiles `#DDDDDD`, texto principal `#222222`, texto secundario `#595959` (contraste AAA).
  * *Dark Mode:* Fondo principal `#0F1115`, tarjetas `#181B22`, bordes `#2A2E39`, texto principal `#F8FAFC`, texto secundario `#94A3B8`.

## 2. Componentes Estructurales Inspirados en `airbnb.com.ar`

1. **Header Sticky con "Search Pill" Multi-Modo (`src/components/layout/Header.tsx`):**
   * Logotipo **I-bita** a la izquierda + Píldora central interactiva con tres segmentos: **`Corredor / Destino`** | **`Por Día vs. Media Estadía (1–6 meses)`** | **`Huéspedes`** + botón circular de búsqueda `#FF385C`.
   * A la derecha: enlace *"Publicá tu propiedad / Sincronizá Airbnb"*, selector de moneda (`ARS $` / `USDT ₮`), toggle Dark/Light Mode y menú de perfil.
2. **Barra Horizontal de Corredores y Filtros Rápidos (`CategoryBar`):**
   * Íconos minimalistas debajo del header para filtrar en 1 clic: *Todo Argentina*, *CABA (Palermo/Recoleta)*, *Costa Atlántica*, *Sierras de Córdoba*, *Vaca Muerta / Corporativo*, *Sello Consorcio Friendly*, *3 y 6 Cuotas ARS*, *Acepta USDT*, *Wi-Fi Verificado (+100 Mbps)*.
3. **Property Card Estilo Airbnb con Transparencia Local (`PropertyCard`):**
   * Imagen con proporción `4:3` / `1:1` fija (`CLS = 0`), bordes redondeados `rounded-2xl`, badge flotante superior izquierdo (*"Consorcio Friendly · Pase QR"*), título de ubicación, calificación y precio claro:
     * En modo **Por Día:** `$ 65.000 ARS / noche` · *Hasta 6 cuotas con MP/MODO (Cero Impuesto PAIS/Percepciones)*.
     * En modo **Media Estadía:** `$ 1.150.000 ARS / mes` (o `980 USDT`) · *Comisión reducida 6% + Contrato CCyC Digital*.
4. **Ficha de Propiedad / Micrositio B2B2C (`/p/[slug]`) con Galería Bento y Sticky Booking Card:**
   * **Bento Photo Grid:** Cuadrícula de 5 fotos en desktop (1 principal a la izquierda + 4 secundarias a la derecha) con bordes redondeados.
   * **Columna Izquierda (Información):** Datos del Anfitrión, insignias destacadas (*Pre-Check-in Biométrico RENAPER*, *Pase Digital a Portería*, *Sincronizado con Airbnb*), descripción y reglas del consorcio.
   * **Columna Derecha (Sticky Booking Card):** Calculadora interactiva en tiempo real operada con `decimal.js` que permite elegir fechas, cantidad de adultos, moneda de pago (`ARS Cuotas/QR` vs. `USDT Polygon`) y muestra la caja de **"Ahorro Directo I-bita vs. Airbnb"** en pesos y dólares.
