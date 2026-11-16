---
title: "Addendum Técnico, Regulatorio y de Dominio: I-bita"
status: complete
created: 2026-11-15
updated: 2026-11-15
author: Alan
agent: Mary (Business Analyst)
---

# Addendum: Contexto Regulatorio, Financiero y Arquitectónico de I-bita

Este documento complementa el **Product Brief de I-bita**, preservando las consideraciones técnicas, legales y operativas específicas del mercado argentino que deberán ser consumidas por los agentes **John (Product Manager)** en la creación del PRD y **Winston (System Architect)** en el diseño de arquitectura.

---

## 1. Consideraciones Regulatorias y Financieras (Pilar A)

* **Encuadre PSP / PSAV (BCRA y CNV):**
  * Para evitar que I-bita deba tramitar licencias bancarias o de ALyC/PSAV propias antes de validar el MVP, la plataforma operará en la **Fase 1** mediante **integración con partners regulados** (Split de pagos nativo de Mercado Pago / MODO / PSPs locales para ARS, y pasarelas cripto con licencia PSAV en CNV para el procesamiento de USDT/USDC y custodia de Escrow).
  * I-bita nunca toca fondos fuera de cuentas recaudadoras de terceros autorizados; actúa como orquestador tecnológico de instrucciones de split bajo mandato de cobro/administración.
* **Transparencia de Costos Financieros (Cuotas):**
  * El motor de checkout debe mostrar en tiempo real dos modalidades configurables por el anfitrión:
    1. *Cuotas absorbidas por el anfitrión* (etiqueta "3/6 Cuotas Sin Interés" como gancho comercial de conversión).
    2. *Cuotas con costo financiero transparente a cargo del huésped* (mostrando CFT y valor exacto de cada cuota en ARS).

---

## 2. Consideraciones Legales e Inmobiliarias (Pilares B y C)

* **Validez del Contrato de Media Estadía (Código Civil y Comercial):**
  * Bajo la normativa vigente en Argentina (post-DNU 70/2023 y Art. 1198/1199 del CCyC), existe plena libertad de contratación en plazo y moneda pactada entre las partes.
  * El generador de contratos de I-bita incluirá cláusulas específicas de **locación con fines determinados (turismo, estudio, tratamiento médico, comisión laboral)**, inventario fotográfico adjunto en el check-in y pacto de vía ejecutiva/arbitraje rápido.
* **Privacidad y Protección de Datos Personales (Ley 25.326):**
  * La captura biométrica y documental (DNI/Pasaporte) requiere consentimiento expreso durante el pre-check-in.
  * El **Pase Digital de Portería** enviado a la seguridad/administración del edificio solo expone los datos estrictamente necesarios para el control de acceso (Nombre y Apellido, N° de Documento, Foto de rostro verificada, Unidad funcional, Fechas de ingreso/egreso y Patente del vehículo), sin revelar montos de la operación ni medios de pago.
* **Instrumentación Contable del Micro-Canon Consorcial (1%–2%):**
  * El aporte se instrumenta como una transferencia automática identificada con el `CUIT del Consorcio` y la `Unidad Funcional` en el concepto bancario, enviando el comprobante por email a la Administración para que lo compute como pago a cuenta de expensas o aporte extraordinario al Fondo de Reserva del edificio, según acuerde el propietario con su consorcio.

---

## 3. Hoja de Ruta Evolutiva (Parking Lot para Fase 2 y Fase 3)

| Fase | Funcionalidades Reservadas | Valor Estratégico |
| :--- | :--- | :--- |
| **Fase 2 (Meses 4–8)** | • Integración con APIs de cerraduras electrónicas (TTLock, Yale, Nuki) para generación de PIN temporal tras biometría.<br>• Integración con sensores de decibeles sin micrófono (ej. Minut) para alerta temprana "Cero Fiestas".<br>• Conversión automatizada ARS -> USD MEP / USDT vía API con ALyC/PSAV partner.<br>• Integración de pagos vía **PIX** para turistas brasileños. | Automatización física total del edificio y expansión de medios de pago regionales. |
| **Fase 3 (Meses 9–18)** | • Adelanto de liquidaciones para anfitriones (Revenue-Based Financing sobre reservas confirmadas).<br>• Seguro de caución y daños contra la propiedad embebido por noche/mes vía API InsurTech.<br>• Conexión automática con registros turísticos provinciales/municipales (ej. RPATT CABA). | Consolidación del foso defensivo (Moat) Fintech + InsurTech. |
