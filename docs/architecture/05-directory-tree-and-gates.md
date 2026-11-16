# 05. Árbol de Directorios y Especificación de Verification Gates

## 1. Estructura de Módulos (`src/`)
* `src/env.ts` — Esquema `@t3-oss/env-nextjs` + `zod`.
* `src/lib/supabase/{client,server,admin}.ts` — Clientes Supabase tipados.
* `src/lib/crypto/aes-gcm.ts` — Cifrado `AES-256-GCM` de códigos de acceso.
* `src/lib/crypto/porteria-jws.ts` — Tokens JWS/JWT con `jose` + `qrcode`.
* `src/lib/math/money.ts` — Calculadora financiera con `decimal.js`.
* `src/modules/{auth,properties,ical,consortium,payments,contracts,marketplace}` — Lógica de negocio y Server Actions.

## 2. Los 5 Scripts de Verification Gate (`scripts/gates/`)
1. `scripts/gates/gate-epic-1-btree-gist.ts` — Verifica el constraint `btree_gist` en Supabase Cloud provocando y capturando `SQLSTATE 23P01`.
2. `scripts/gates/gate-epic-2-ical-ssrf.ts` — Verifica el bloqueo SSRF (`127.0.0.1` / `169.254.169.254`) y la exportación RFC 5545 con `ical-generator`.
3. `scripts/gates/gate-epic-3-zero-trust-kyc.ts` — Verifica que `accessCode` sea `null` antes de completar todos los adultos y valida la firma JWS del Pase de Portería con `jose`.
4. `scripts/gates/gate-epic-4-webhook-pdf-ledger.ts` — Verifica el rechazo `401` ante firma HMAC inválida, el hash `SHA-256` de 64 caracteres del contrato PDF (`pdf-lib`) y la inmutabilidad de `ledger_entries`.
5. `scripts/gates/gate-epic-5-zero-simulation.ts` — Ejecuta la auditoría `grep` garantizando cero mocks/simulaciones y verifica el build de producción.
