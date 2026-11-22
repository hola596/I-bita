# Fricciones Empíricas de Hospedaje y Arquitectura Anti-Errores (I-bita)

Documento vivo de investigación aplicada de producto para **I-bita Argentina**. Centraliza los patrones reales de conflicto, pérdida económica y ruptura de confianza reportados en datasets abiertos internacionales y comunidades operativas locales/globales, y los traduce en decisiones concretas de UX, reglas de negocio y modelo de datos.

---

## 1. Fuentes Empíricas de Referencia y Contexto Local (Buenos Aires / Argentina)

### Fuentes Analizadas
| Fuente | Alcance y Naturaleza | Señales Clave que Aporta |
| :--- | :--- | :--- |
| **Inside Airbnb (Buenos Aires + Global)** | `listings.csv.gz`, `reviews.csv.gz`, `calendar.csv.gz` | Concentración geográfica, proporción de departamentos enteros, multi-anfitriones comerciales, tiempos de respuesta, políticas de cancelación y cumplimiento registral (ENTUR/TAD). |
| **Booking.com Reviews (~1.6M + complemento 2025)** | `ml-dataset-reviews` & `Booking-Hotel-Reviews-Dataset` | Reseñas explícitamente separadas en `review_positive` vs. `review_negative` cruzadas con `guest_score`, `guest_type` (Solo, Pareja, Grupo, Familia), `room_nights` y `accommodation_type`. |
| **TripAdvisor Hotel Reviews (Argilla + ~878k CMU)** | Minería de texto por aspectos (Limpieza, Ruido, Check-in, Servicio, Valor) | Impacto directo de calidad de sueño, fallas de mantenimiento y expectativas mal alineadas sobre el puntaje final. |
| **Kaggle Airbnb Listings & Reviews (+250k props / 5M reseñas)** | Atributos históricos y conversión | Prima de confianza/precio asociada a tasa y velocidad de respuesta, volumen de reseñas y claridad de condiciones. |
| **Reddit `r/airbnb_hosts`** | Operaciones reales del lado dueño/administrador | Disputas por daños y depósitos/AirCover, huéspedes no autorizados y fiestas, estafas, lag de iCal / doble reserva y riesgo legal de estadías de +30 días. |
| **Reddit `r/AirBnB`** | Reclamos reales del huésped | Anuncios engañosos vs. realidad, fallas de acceso/check-in, cargos sorpresa + listas abusivas de tareas de check-out, ruidos y peleas por reembolsos. |
| **Reddit `r/TalesFromTheFrontDesk` + Pushshift** | Incidentes diarios en recepción/portería | Conflictos por llegadas fuera de horario, desacuerdos con reglas de edificio/alojamiento y escalamiento silencioso directo a reseñas de 1★ cuando no hubo canal rápido de resolución. |

### Particularidades Empíricas del Mercado Argentino (Buenos Aires)
- **Alta concentración en propiedad horizontal:** Cerca del **49%–50%** de las propiedades enteras en CABA se concentran en **Palermo** y **Recoleta**, y ~**90%** corresponden a departamentos completos en edificios residenciales regidos por consorcios (*Reglamento de Copropiedad*) y con *encargados/porteros*.
- **Profesionalización vs. informalidad:** Fuerte presencia de anfitriones con múltiples unidades junto a dueños particulares; al mismo tiempo, persiste una brecha alta entre oferta publicada y cumplimiento de registro municipal (ENTUR / TAD CABA).
- **Políticas de cancelación polarizadas en CABA:** Aproximadamente ~30% flexibles, ~30% moderadas y ~33–40% estrictas/firmes, generando tensiones frecuentes cuando cambian condiciones macroeconómicas o vuelos.
- **Fricciones locales específicas:** Exigencias inesperadas de ajustes o depósitos **en efectivo al llegar** ante volatilidad cambiaria, conflictos con el **consorcio/portería**, **cortes de luz** de red eléctrica (Edesur/Edenor) que dejan sin ascensor, agua ni aire acondicionado al edificio, e internet domiciliario con caídas o routers alejados del escritorio en edificios antiguos.

---

## 2. Bloque 1 — Fricciones del Huésped (Antes, Durante y Después)

| ID | Fricción Real Observada | Momento | Señal en Fuentes / Datasets |
| :--- | :--- | :--- | :--- |
| **H-01** | **Anuncio engañoso vs. realidad** (tamaño real, fotos con gran angular, escaleras sin ascensor, escritorio/aire faltantes o obra lindera oculta). | Antes / Check-in | `r/AirBnB`, Kaggle (*listing inaccuracy*). Principal causal de cancelación unilateral al llegar. |
| **H-02** | **Cargos ocultos y listas abusivas de tareas de salida** (tarifa de limpieza alta sumada a exigencia de sacar sábanas, lavar vajilla, sacar basura a horarios raros). | Pre-pago / Check-out | `r/AirBnB`, Booking `review_negative`. Deteriora severamente el sub-puntaje de "Valor". |
| **H-03** | **Sorpresas cambiarias, pedidos de efectivo al llegar y estafas phishing** (anfitriones o terceros suplantados pidiendo transferencias o efectivo extra fuera de plataforma antes del ingreso). | Pre-check-in / Llegada | Inside Airbnb BA, `r/airbnb_hosts`, `r/AirBnB`. |
| **H-04** | **Fallas de check-in, cerraduras y portería hostil** (códigos vencidos/erróneos, demoras de vuelo sin Plan B, encargado del edificio que niega acceso o pide documentación desconocida). | Llegada (Check-in) | TripAdvisor, Booking (`waited`, `reception closed`), `r/TalesFromTheFrontDesk`, Buenos Aires *portero*. |
| **H-05** | **Fallas de limpieza e higiene (#1 destructor de puntaje)** (pelos en baño, polvo, humedad/moho, ropa de cama manchada u olores por rotación apurada sin buffer). | Check-in (primeras 2h) | Booking `review_negative`, TripAdvisor, `r/AirBnB`. |
| **H-06** | **Ruido urbano, paredes finas, fiestas o boliches** (bares en Palermo, tráfico nocturno, obras en departamentos linderos o vecinos del consorcio). | Durante (descanso) | TripAdvisor (`noise`, `thin walls`, `earplugs`), Booking `review_negative`, `r/AirBnB`. |
| **H-07** | **Wi-Fi inestable o inexistente para trabajo remoto** (microcortes, baja velocidad de subida o señal nula en el dormitorio/coworking en edificios antiguos). | Durante (estadías medias) | Booking (viajeros solos/corporativos), `review_negative` BA, TripAdvisor. |
| **H-08** | **Fallas de hardware y cortes de luz/servicios sin soporte rápido** (corte de Edesur/Edenor sin agua/ascensor, aire acondicionado roto, termotanque apagado o falta de respuesta del anfitrión en horario nocturno). | Durante | TripAdvisor (*hardware*), BA *cortes de luz*, `r/AirBnB`. |
| **H-09** | **Cancelaciones unilaterales o políticas opacas ante fuerza mayor** (anfitrión que cancela cerca de la fecha por suba de demanda/inflación o huésped sin regla clara ante corte de luz prolongado). | Pre-llegada / Durante | Inside Airbnb BA, `r/AirBnB`. |
| **H-10** | **Reclamos injustos de daños / retención arbitraria de depósito** (cobros por desgaste normal preexistente sin evidencia previa de cómo estaba la unidad). | Post-check-out | `r/AirBnB`, disputas de depósito/AirCover. |

---

## 3. Bloque 2 — Fricciones del Anfitrión (Riesgo Económico, Legal y Operativo)

| ID | Fricción Real Observada | Impacto Principal | Señal en Fuentes / Datasets |
| :--- | :--- | :--- | :--- |
| **A-01** | **Multas, cartas documento y bloqueo del consorcio / portero** por ingresos desordenados, falta de aviso a administración o incumplimiento del reglamento interno. | Cláusura de operación / multas | Contexto CABA (*consorcio* / *portero*), propiedades horizontales. |
| **A-02** | **Huéspedes no autorizados y fiestas encubiertas** (reserva para 2 personas pero ingresan 8–12 invitados generando daños, ruidos y denuncias vecinales). | Daños materiales + sanción consorcial | `r/airbnb_hosts` (*unauthorized guests*, *hidden parties*). |
| **A-03** | **Riesgo de retención / "squatter" y falta de pago en estadías de 1 a 6 meses** (huéspedes que vencido el primer mes dejan de abonar o se niegan a desocupar al cierre). | Pérdida de lucro cesante + juicio desalojo | `r/airbnb_hosts` (*mid-term tenancy/holdover*), necesidad de filtro y contratos Art. 1199 sólidos. |
| **A-04** | **Desincronización de iCal y doble reserva (Overbooking)** por demoras de polling entre Airbnb/Booking/directo, generando penalidades y realojamientos caros. | Pérdida económica directa + reputación | `r/airbnb_hosts` (*iCal lag / double booking*). |
| **A-05** | **Reclamos de daño rechazados por falta de prueba "antes vs. después"** ("palabra contra palabra" sin fotos fechadas del estado previo al ingreso). | Pérdida financiera sin cobertura | `r/airbnb_hosts` (*AirCover denied without timestamped photos*). |
| **A-06** | **Estafas de "limpieza fabricada" para pedir reembolso parcial/total** (huésped que busca polvo oculto o ignora un arreglo inmediato solo para exigir devolución al final). | Pérdida de ingresos / fraude | `r/airbnb_hosts`, `r/TalesFromTheFrontDesk`. |
| **A-07** | **Extorsión con reseña negativa (1★) por represalia** al cobrar un daño real o hacer cumplir reglas del edificio/horarios de check-out. | Daño algorítmico permanente | `r/airbnb_hosts` (*retaliatory 1-star extortion*). |
| **A-08** | **Penalizaciones injustas por cortes externos de luz o fuerza mayor** (la plataforma devuelve el 100% al huésped y multa al anfitrión por fallas de red eléctrica pública). | Pérdida económica fuera de control | `r/airbnb_hosts`, BA *cortes de luz*. |
| **A-09** | **Desgaste operativo y caída por respuestas tardías** (coordinar horario de llegada, validar documentos por WhatsApp sueltos y repetir reglas manualmente). | Burnout + pérdida de conversión | Inside Airbnb, Kaggle (*host_response_time*). |
| **A-10** | **Exposición regulatoria / falta de trazabilidad fiscal y registral** (operar sin CUIT validado ni constancia de registro turístico local cuando el municipio fiscaliza). | Multas municipales / suspensión | Inside Airbnb BA (ENTUR/TAD). |

---

## 4. Cobertura Actual de I-bita vs. Hoja de Ruta Anti-Errores

### Qué ya resuelve hoy I-bita desde su arquitectura base
- **Previene doble reserva física (`A-04` parcial):** restricción PostgreSQL `EXCLUDE USING gist` (`no_overlapping_active_bookings`) sobre rangos `[check_in, check_out)` + sincronización iCal SSRF-safe (`ical_feeds`).
- **Previene cargos sorpresa e inestabilidad cambiaria (`H-02`, `H-03` parcial):** cálculo autoritativo servidor con `decimal.js`, desglose transparente en Pesos (hasta 6 cuotas) o USDT Polygon sin dólar tarjeta ni pedidos en efectivo informal.
- **Previene huéspedes fantasma, check-in inseguro y conflicto con portería (`H-04`, `A-01`, `A-02`):** verificación biométrica/DNI (`guest_verifications`) de **100% de los adultos declarados**, Pase Digital QR para Portería (`porteria_passes`) con micro-canon consorcial (`1%–2%`) y liberación de clave de cerradura cifrada (`AES-256-GCM`) solo tras pago + KYC completo.
- **Mitiga riesgo legal en estadías de 1 a 6 meses (`A-03`, `A-09` parcial):** contrato temporario Art. 1199 CCyC en PDF con hash SHA-256 (`contracts`), capa previa de aprobación de anfitriones (`host_approval_status`), entrevista previa por teléfono/WhatsApp/videollamada y requisitos personalizables (`mid_term_policy` + `PENDING_HOST_APPROVAL`), todo con UX de Información Progresiva de baja fricción cognitiva.

### Funcionalidades Prioritarias Sugeridas para Disminuir Errores y Disputas

#### Prioridad P0 — Críticas para evitar pérdidas económicas y fallas graves en producción
1. **Acta Digital de Estado con Fotos Fechadas (Check-in / Check-out + Doble Conformidad)**
   - **Fricciones que resuelve:** `H-05`, `H-10`, `A-05`, `A-06`.
   - **Cómo funciona y qué error previene:** Antes del check-in, el anfitrión (o limpieza) carga 4–6 fotos rápidas de la unidad lista (`property_handover_reports`); al ingresar, el huésped dispone de **2 horas** para confirmar *"Recibí el depto impecable"* o adjuntar foto de un faltante/limpieza antes de desempacar. Al salir, se sacan fotos de entrega en 1 minuto. Elimina el "palabra contra palabra" para liberar o retener el `escrow_deposit_usdt`/garantía e impide reclamos fabricados a último momento.
2. **Políticas de Cancelación Estructuradas + Protocolo de Contingencia Local (Cortes de Luz / Agua)**
   - **Fricciones que resuelve:** `H-08`, `H-09`, `A-08`.
   - **Cómo funciona y qué error previene:** Agregar campo `cancellation_policy` (`FLEXIBLE`, `MODERATE`, `FIRM`) por propiedad con regla matemática auditable en el servidor antes del pago, más una regla explícita para **contingencias de red pública en Argentina** (ej. corte eléctrico Edesur/Edenor > 6h documentado: prorrateo justo o reubicación compartida sin multa automática al anfitrión ni pérdida total al huésped).
3. **Monitor de Salud iCal + Buffer de Limpieza Automático entre Reservas**
   - **Fricciones que resuelve:** `A-04`, `H-05`.
   - **Cómo funciona y qué error previene:** Alertar al anfitrión en `/dashboard/propiedades` y por WhatsApp/email si un feed `ical_feeds` lleva >2h con error o sin refresco, junto con una opción `turnaround_buffer_hours` / bloqueo automático de noches puente configurables cuando el departamento requiere limpieza profunda tras estadías largas.
4. **Protocolo de Check-in Resiliente (Horario Estimado, Plan B Offline y Sello Anti-Phishing)**
   - **Fricciones que resuelve:** `H-03`, `H-04`.
   - **Cómo funciona y qué error previene:** Capturar hora estimada de llegada del huésped, exigir un **Plan B de acceso** cifrado junto al PIN principal (ej. caja de llaves secundaria o teléfono de respaldo si falla la cerradura inteligente/batería) y mostrar un aviso visible antifraude (*"I-bita jamás te pedirá transferencias por fuera de tu reserva ni efectivo al llegar"*).

#### Prioridad P1 — Alto impacto en satisfacción, retención y prevención de conflictos
5. **Ficha Técnica "Sin Sorpresas" + Límite de Tareas de Check-out**
   - **Fricciones que resuelve:** `H-01`, `H-02`, `H-06`, `H-07`, `A-01`.
   - **Cómo funciona y qué error previene:** Campos estructurados y honestos en `/dashboard/propiedades` visibles como badges claros en `/p/[slug]`: *Piso y ascensor/escalera*, *Velocidad real + estabilidad Wi-Fi + escritorio*, *Perfil sonoro de la cuadra (tranquila vs. zona nocturna)*, *Uso permitido o restricción consorcial de SUM/pileta*, y compromiso explícito de check-out simple (sin listas abusivas de limpieza para evitar rechazo del huésped).
6. **Canal Temprano de Incidentes en Estadía ("Primeras 24h" con SLA de Respuesta)**
   - **Fricciones que resuelve:** `H-05`, `H-08`, `A-06`, incidentes de `r/TalesFromTheFrontDesk`.
   - **Cómo funciona y qué error previene:** Botón visible dentro de `/checkin/[bookingId]` y `/perfil` (**"Reportar un inconveniente ahora"**) que abre ticket con timestamp, foto obligatoria y temporizador SLA (ej. 2h urgencias / 12h menores) para el anfitrión. Permite resolver problemas reales (router, aire, limpieza puntual) en tiempo real y funciona como requisito de evidencia para cualquier pedido de reembolso, frenando estafas y reseñas sorpresa de 1★.
7. **Reseñas Doble Ciego (Blind Reviews) con Sub-puntajes + Filtro Anti-Extorsión**
   - **Fricciones que resuelve:** `A-07`, `H-10`, confianza/conversión (Kaggle).
   - **Cómo funciona y qué error previene:** Ambas partes califican por separado (Limpieza, Wi-Fi, Coincidencia con el anuncio, Comunicación, Respeto al edificio) dentro de una ventana de 14 días; ninguna parte ve la reseña de la otra hasta que ambos envían o vence el plazo. Si existe una disputa abierta de depósito, se marca para auditoría antes de publicar, bloqueando extorsiones de 1★ por represalia.
8. **Ciclo de Vida de Estadías Largas (Alertas 15 / 7 / 2 días + Anexo de Extensión ≤ 180 noches)**
   - **Fricciones que resuelve:** `A-03`.
   - **Cómo funciona y qué error previene:** Automatizar recordatorios previos al check-out para estadías de 30–180 noches, permitir extensión digital verificando automáticamente el tope legal de 180 noches (`btree_gist` + Art. 1199 CCyC) e integrar el acta de entrega de llaves para prevenir permanencias irregulares (*holdover*).

#### Prioridad P2 — Ventaja competitiva y eficiencia operativa
9. **Métricas Verificadas de Respuesta del Anfitrión + Campo Opcional ENTUR / TAD CABA**
   - **Fricciones que resuelve:** `A-09`, `A-10`, conversión comprobada en Kaggle / Inside Airbnb.
   - **Cómo funciona y qué error previene:** Calcular automáticamente en BD la tasa y mediana real de respuesta del anfitrión en solicitudes de estadía larga e incidentes, e incluir un campo opcional para número de registro turístico municipal (ENTUR/TAD) visible en `/p/[slug]` como sello de cumplimiento formal.
10. **Bandeja Unificada de Consultas y Disputas (`/admin/soporte`)**
    - **Fricciones que resuelve:** `A-09`, brecha operativa detectada en `public.contact_inquiries`.
    - **Cómo funciona y qué error previene:** Panel interno autenticado (mismo patrón seguro `pg.Client` de `/admin/aprobaciones`) para gestionar consultas entrantes de `/contacto` e incidentes de estadía con estado (`OPEN`, `IN_PROGRESS`, `RESOLVED`) y acceso rápido por WhatsApp o email `@i-bita.com`.

---

## 5. Protocolo de Actualización Continua con Muestras Locales

Cuando se descargue cualquier muestra local (por ejemplo, `listings.csv.gz` y `reviews.csv.gz` de Buenos Aires desde Inside Airbnb, o exportes de Booking/TripAdvisor/Reddit), ejecutá el muestreador ligero sin cargar archivos masivos en memoria:

```bash
python scripts/analyze_hospitality_sample.py \
  --source inside_airbnb \
  --input data/ba_reviews.csv.gz \
  --listings data/ba_listings.csv.gz \
  --sample-size 750 \
  --output docs/samples/ba_friction_sample.json \
  --markdown-out docs/samples/ba_friction_summary.md
```

Usá el resumen generado para recalibrar frecuencias reales y priorizar el próximo sprint del roadmap en este archivo.
