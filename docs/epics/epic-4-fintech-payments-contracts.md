# Epic 4: Motor Financiero Bi-Monetario, Contratos de Media Estadía (CCyC) y Libro Mayor Inmutable

* **ID de Épica:** `EPIC-4`
* **Requerimientos Cubiertos:** `FR-12`, `FR-13`, `FR-14`, `FR-15`, `FR-16`, `NFR-6`, `NFR-7`, `AD-6`
* **Dependencias de Arquitectura:** [02-data-model-and-rls.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/02-data-model-and-rls.md), [03-api-contracts-and-security.md](file:///c:/Users/ALAN/.gemini/antigravity/scratch/I-bita/docs/architecture/03-api-contracts-and-security.md)

## Objetivo
Habilitar cobros reales en ARS (Mercado Pago SDK + Webhook HMAC-SHA256) y USDT en Polygon (`viem` `getTransactionReceipt`), contratos temporarios en PDF (`pdf-lib`) sellados con `SHA-256` y contabilidad inmutable de partida doble en `ledger_entries` con Split de Liquidación T+24h.

---

### Story 4.1: Checkout en ARS con SDK Oficial de Mercado Pago y Webhook con Validación Criptográfica HMAC-SHA256

**As a** Huésped Argentino,
**I want** pagar mi reserva en Pesos Argentinos (con QR, MODO, saldo en cuenta o en 3 y 6 cuotas) a través de Mercado Pago,
**So that** pueda financiar mi estadía en moneda local sin pagar impuestos ni percepciones al dólar tarjeta.

**Acceptance Criteria:**
- **Given** una reserva en estado `PENDING_PAYMENT` (`FR-12`, `AD-6`)
- **When** se genera la preferencia con el SDK oficial `mercadopago` y Mercado Pago invoca `POST /api/webhooks/payments`
- **Then** el endpoint valida obligatoriamente el header `x-signature` con `crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET)` devolviendo `401 Unauthorized` ante cualquier firma inválida o ausente
- **And** solo tras validar la firma y consultar el estado aprobado en Mercado Pago, registra los asientos en `public.ledger_entries` y cambia el estado de la reserva a `PAID_PENDING_KYC`.

---

### Story 4.2: Checkout y Custodia Escrow en USDT (Polygon) con Verificación On-Chain vía `viem`

**As a** Nómada Digital, Turista Extranjero o Inquilino de Media Estadía,
**I want** abonar mi estadía o constituir mi Depósito en Garantía en USDT sobre la red Polygon,
**So that** pueda pagar directamente con stablecoins sin intermediación bancaria tradicional.

**Acceptance Criteria:**
- **Given** un pago o depósito en USDT enviado a `NEXT_PUBLIC_IBITA_TREASURY_WALLET` (`FR-13`, `AD-6`)
- **When** se notifica el `txHash` al backend
- **Then** el servidor utiliza `viem` (`createPublicClient` conectado a `EVM_RPC_URL` y `getTransactionReceipt`) para verificar en la blockchain que la transacción fue exitosa (`status === 'success'`), que emitió el evento `Transfer` del contrato oficial `NEXT_PUBLIC_USDT_CONTRACT_ADDRESS` hacia la bóveda de I-bita por el monto exacto calculado con `decimal.js`
- **And** inserta el asiento inmutable en `public.ledger_entries` con `idempotency_key = txHash`.

---

### Story 4.3: Generación en Servidor y Sellado `SHA-256` del Contrato de Locación Temporaria (Art. 1199 CCyC)

**As a** Anfitrión e Inquilino de Media Estadía (30 a 180 noches),
**I want** que el sistema redacte automáticamente el Contrato de Locación Temporaria válido bajo el Código Civil y Comercial Argentino en formato PDF y lo selle criptográficamente con `SHA-256` al firmarlo electrónicamente,
**So that** ambas partes contemos con respaldo jurídico inmediato y garantía en custodia (Escrow) contra la inflación.

**Acceptance Criteria:**
- **Given** una reserva de Media Estadía (`nights_count >= 30`, `FR-15`, `FR-16`)
- **When** se ejecuta `generateAndSignContractAction(bookingId)`
- **Then** el servidor construye el binario PDF real usando `pdf-lib` con las cláusulas del Art. 1199 CCyC, datos de las partes, finalidad de la estadía, monto mensual y garantía en Escrow
- **And** calcula `crypto.createHash('sha256').update(pdfBuffer).digest('hex')`, sube el PDF a Supabase Storage y persiste el hash de 64 caracteres en `public.contracts`.

---

### Story 4.4: Motor de Libro Mayor Inmutable (`ledger_entries`) y Split de Liquidación T+24h (Anfitrión + Micro-Canon Consorcial)

**As a** Anfitrión y Administración del Consorcio,
**I want** que 24 horas después del Check-in verificado se ejecute automáticamente el Split de Liquidación descontando la comisión de I-bita, transfiriendo el Micro-Canon (`1%–2%`) al Consorcio y liquidando el neto según la preferencia del Anfitrión (ARS CBU/CVU o USDT Wallet),
**So that** todos los actores cobren de forma transparente, auditable y sin errores de redondeo.

**Acceptance Criteria:**
- **Given** una reserva con pago confirmado y check-in biométrico realizado (`FR-14`, `NFR-7`, `AD-6`)
- **When** se ejecuta el motor de liquidación de Split con `decimal.js`
- **Then** se registran en `public.ledger_entries` los asientos de partida doble (`PLATFORM_FEE_REVENUE`, `CONSORTIUM_CANON_PAYABLE`, `HOST_NET_PAYABLE` / `HOST_NET_SETTLED`) protegidos contra `UPDATE`/`DELETE` por el trigger `trg_ledger_immutable`.

---

## 🧪 Verification Gate (Requisito de Cierre en Terminal — Épica 4)
* **Script:** `npx tsx scripts/gates/gate-epic-4-webhook-pdf-ledger.ts`
* **Criterio de Éxito:**
  1. Comprueba que un webhook sin firma HMAC válida es rechazado con `401 Unauthorized`.
  2. Genera un contrato PDF real con `pdf-lib` e imprime su hash `SHA-256` de 64 caracteres hexadecimales.
  3. Verifica la inserción en `ledger_entries` y que cualquier intento de `UPDATE` o `DELETE` es bloqueado por el trigger de PostgreSQL (`SQLSTATE 42501`).
