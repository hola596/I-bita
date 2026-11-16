# 03. Contratos de API, Server Actions y Seguridad Criptográfica (`AD-4`, `AD-5`, `AD-6`)

## 1. Sobre de Respuesta Determinista
```typescript
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

## 2. Route Handlers (`src/app/api/*`)
* **`GET /api/ical/[propertyId].ics`:** Genera feed RFC 5545 usando `ical-generator` con zona `America/Argentina/Buenos_Aires` y `Content-Type: text/calendar; charset=utf-8`.
* **`POST /api/webhooks/payments`:**
  * **Validación Mercado Pago (ARS):** Verifica `x-signature` con `crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET)`. Si falla o falta, devuelve `401 Unauthorized`.
  * **Validación Web3 (USDT Polygon):** Verifica en servidor el `txHash` con `viem.getTransactionReceipt` comprobando transferencia al contrato `NEXT_PUBLIC_USDT_CONTRACT_ADDRESS` hacia `NEXT_PUBLIC_IBITA_TREASURY_WALLET`.
  * **Efecto Contable:** Único punto autorizado para insertar asientos en `public.ledger_entries` usando `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Contratos Criptográficos Zero-Trust (`AD-5`)
* **Cifrado del PIN de Cerradura (`src/lib/crypto/aes-gcm.ts`):** `AES-256-GCM` con `ACCESS_CODE_ENCRYPTION_KEY` (32 bytes), IV aleatorio de 12 bytes y Auth Tag de 16 bytes.
* **Compuerta de Revelación:** `getBookingAccessDetailsAction(bookingId)` devuelve `accessCode: null` a nivel de red HTTP mientras `bookings.status !== 'ALL_ADULTS_VERIFIED'`.
* **Pase Digital de Portería (`src/lib/crypto/porteria-jws.ts`):** Firmado con `jose` (`SignJWT` / `jwtVerify` con algoritmo `HS256` y `PORTERIA_JWS_SECRET`) y renderizado en QR con `qrcode`.
