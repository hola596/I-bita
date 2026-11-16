# Guía de Contribución a I-bita 🇦🇷

¡Gracias por tu interés en colaborar con **I-bita**! Este documento resume los lineamientos y estándares de desarrollo para mantener la máxima calidad, seguridad y consistencia en el repositorio.

---

## 📋 Principios de Desarrollo

1. **Seguridad Zero-Trust & `server-only`:**
   * Cualquier módulo que interactúe con claves privadas, tokens, SDKs de pago o bases de datos debe importar `import "server-only"`.
   * En archivos con `"use server"`, **únicamente** exportar funciones asíncronas (`async function`). Las constantes, interfaces y esquemas Zod deben ubicarse en archivos de tipos separados (e.g. `types.ts` o `validators.ts`).
2. **Precisión Financiera Inquebrantable:**
   * Todo cálculo tarifario, comisión, descuento y micro-canon debe utilizar **`decimal.js`**. Está terminantemente prohibido realizar operaciones aritméticas con flotantes nativos en montos de dinero.
3. **Validación Fail-Fast:**
   * Toda variable de entorno debe estar tipada y validada en `src/env.ts` utilizando `@t3-oss/env-nextjs` y `zod`.
4. **Cero Mocks o Simulaciones en Producción:**
   * Las integraciones con Mercado Pago, Polygon (Viem), Gemini y PDF-Lib deben interactuar con contratos reales y protocolos oficiales.

---

## 🛠️ Flujo de Trabajo (Git Workflow)

1. **Crear una rama para tu feature o corrección:**
   ```bash
   git checkout -b feature/nombre-de-la-funcionalidad
   # o
   git checkout -b fix/descripcion-del-bug
   ```
2. **Realizar cambios y asegurar que no haya regresiones:**
   Antes de commitear, ejecutá la suite de verificación obligatoria:
   ```bash
   npm run typecheck
   npm run verify:4.1
   npm run verify:4.2
   npm run verify:4.3
   ```
3. **Commits Convencionales:**
   Utilizá mensajes claros siguiendo la convención de [Conventional Commits](https://www.conventionalcommits.org/):
   * `feat(módulo): descripción de la nueva funcionalidad`
   * `fix(módulo): descripción de la corrección`
   * `docs(readme): actualización de documentación`
   * `refactor(módulo): reestructuración sin alterar comportamiento`
4. **Abrir un Pull Request:**
   * Describí claramente el problema resuelto y adjuntá evidencia de las pruebas locales superadas.
   * La Integración Continua (GitHub Actions) debe pasar en verde al 100%.

---

## 🛡️ Reporte de Vulnerabilidades de Seguridad

Si descubrís una vulnerabilidad de seguridad, por favor **no abras un issue público**. Contactá directamente al equipo a través de los canales privados o mediante un [Security Advisory de GitHub](https://github.com/hola596/I-bita/security/advisories).
