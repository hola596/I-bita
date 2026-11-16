"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ShieldCheck,
  Lock,
  Upload,
  Plus,
  ExternalLink,
  Wifi,
  Users,
  Building2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  createPropertyAction,
  updatePropertyAction,
  uploadPropertyPhotoAction,
} from "@/modules/properties/actions";
import {
  CORRIDOR_LABELS,
  PROPERTY_CORRIDORS,
  PROPERTY_CURRENCIES,
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  slugifyPropertyTitle,
  type PropertyCorridor,
  type PropertyCurrency,
  type PropertyImageItem,
} from "@/modules/properties/validators";
import type { SafePropertyRecord } from "@/modules/properties/queries";
import { PropertyIcalSyncPanel } from "./PropertyIcalSyncPanel";

const DEFAULT_COVER_PHOTO: PropertyImageItem = {
  url: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp",
  alt: "Living comedor luminoso con ventanal y piso de madera",
  width: 1200,
  height: 900,
  mimeType: "image/webp",
  sizeBytes: 218400,
};

const CURATED_OPTIMIZED_PHOTOS: readonly [PropertyImageItem, ...PropertyImageItem[]] = [
  DEFAULT_COVER_PHOTO,
  {
    url: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80&fm=webp",
    alt: "Dormitorio principal equipado para estadía ejecutiva",
    width: 1200,
    height: 900,
    mimeType: "image/webp",
    sizeBytes: 194200,
  },
  {
    url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80&fm=webp",
    alt: "Espacio de trabajo con Wi-Fi de alta velocidad y balcón",
    width: 1200,
    height: 900,
    mimeType: "image/webp",
    sizeBytes: 231000,
  },
];

interface PropertyDashboardClientProps {
  initialHostProperties: SafePropertyRecord[];
  initialPublicProperties: SafePropertyRecord[];
  authenticatedEmail: string | null;
}

/**
 * Optimiza en el navegador cualquier imagen válida a formato WebP (1200x900, relación 4:3)
 * para garantizar CLS = 0 y bajo peso antes de subirla a Supabase Storage.
 */
async function optimizeImageFileToWebp(file: File): Promise<File> {
  if (typeof window === "undefined") return file;

  return new Promise((resolve) => {
    const img = new window.Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const targetWidth = 1200;
      const targetHeight = 900;
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      // Recorte centrado aspect-ratio 4:3 para evitar deformación y garantizar CLS = 0
      const srcRatio = img.width / img.height;
      const dstRatio = targetWidth / targetHeight;
      let sx = 0;
      let sy = 0;
      let sWidth = img.width;
      let sHeight = img.height;

      if (srcRatio > dstRatio) {
        sWidth = img.height * dstRatio;
        sx = (img.width - sWidth) / 2;
      } else {
        sHeight = img.width / dstRatio;
        sy = (img.height - sHeight) / 2;
      }

      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, "");
          const optimizedFile = new File([blob], `${baseName}.webp`, {
            type: "image/webp",
          });
          resolve(optimizedFile);
        },
        "image/webp",
        0.84
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}

export function PropertyDashboardClient({
  initialHostProperties,
  initialPublicProperties,
  authenticatedEmail,
}: PropertyDashboardClientProps) {
  const [hostProperties, setHostProperties] = useState<SafePropertyRecord[]>(
    initialHostProperties
  );
  const [publicProperties, setPublicProperties] = useState<SafePropertyRecord[]>(
    initialPublicProperties
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [corridor, setCorridor] = useState<PropertyCorridor>("CABA");
  const [addressLine, setAddressLine] = useState("");
  const [unitIdentifier, setUnitIdentifier] = useState("");
  const [maxAdults, setMaxAdults] = useState<number>(2);
  const [baseCurrency, setBaseCurrency] = useState<PropertyCurrency>("USD");
  const [nightlyRate, setNightlyRate] = useState<number>(65);
  const [monthlyDiscountPct, setMonthlyDiscountPct] = useState<number>(20);
  const [wifiSpeedMbps, setWifiSpeedMbps] = useState<number>(300);
  const [absorbInstallmentsCost, setAbsorbInstallmentsCost] = useState(true);
  const [acceptsUsdt, setAcceptsUsdt] = useState(true);
  const [accessCodePlain, setAccessCodePlain] = useState("");
  const [images, setImages] = useState<PropertyImageItem[]>([
    CURATED_OPTIMIZED_PHOTOS[0],
  ]);

  const [photoAltInput, setPhotoAltInput] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<{
    type: "idle" | "error" | "success";
    message?: string;
  }>({ type: "idle" });

  const [formStatus, setFormStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
  }>({ type: "idle" });

  function handleTitleChange(val: string) {
    setTitle(val);
    if (!slugManuallyEdited && !editingId) {
      setSlug(slugifyPropertyTitle(val));
    }
  }

  function handleEditSelect(prop: SafePropertyRecord) {
    setEditingId(prop.id);
    setTitle(prop.title);
    setSlug(prop.slug);
    setSlugManuallyEdited(true);
    setDescription(prop.description);
    setCorridor(prop.corridor);
    setAddressLine(prop.address_line);
    setUnitIdentifier(prop.unit_identifier);
    setMaxAdults(prop.max_adults);
    setBaseCurrency(prop.base_currency);
    setNightlyRate(prop.nightly_rate);
    setMonthlyDiscountPct(prop.monthly_discount_pct);
    setWifiSpeedMbps(prop.wifi_speed_mbps ?? 300);
    setAbsorbInstallmentsCost(prop.absorb_installments_cost);
    setAcceptsUsdt(prop.accepts_usdt);
    setAccessCodePlain("");
    setImages(prop.images.length > 0 ? prop.images : [CURATED_OPTIMIZED_PHOTOS[0]]);
    setFormStatus({ type: "idle" });
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setSlugManuallyEdited(false);
    setDescription("");
    setCorridor("CABA");
    setAddressLine("");
    setUnitIdentifier("");
    setMaxAdults(2);
    setBaseCurrency("USD");
    setNightlyRate(65);
    setMonthlyDiscountPct(20);
    setWifiSpeedMbps(300);
    setAbsorbInstallmentsCost(true);
    setAcceptsUsdt(true);
    setAccessCodePlain("");
    setImages([CURATED_OPTIMIZED_PHOTOS[0]]);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setPhotoFeedback({ type: "idle" });

    // Validación estricta en cliente de formato MIME y peso máximo (5 MB)
    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        rawFile.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]
      )
    ) {
      setPhotoFeedback({
        type: "error",
        message: `Formato "${rawFile.type || "desconocido"}" rechazado. Solo se admiten imágenes WebP, AVIF, JPEG o PNG.`,
      });
      e.target.value = "";
      return;
    }

    if (rawFile.size > MAX_IMAGE_SIZE_BYTES) {
      setPhotoFeedback({
        type: "error",
        message: `El archivo pesa ${(rawFile.size / (1024 * 1024)).toFixed(2)} MB y supera el máximo permitido de 5 MB.`,
      });
      e.target.value = "";
      return;
    }

    setUploadingPhoto(true);
    try {
      const optimizedFile = await optimizeImageFileToWebp(rawFile);
      const fd = new FormData();
      fd.set("file", optimizedFile);
      fd.set(
        "alt",
        photoAltInput.trim().length >= 3
          ? photoAltInput.trim()
          : `${title || "Unidad Funcional"} — Fotografía optimizada`
      );
      fd.set("width", "1200");
      fd.set("height", "900");

      const res = await uploadPropertyPhotoAction(fd);
      if (!res.ok) {
        setPhotoFeedback({
          type: "error",
          message: res.error.message,
        });
      } else {
        setImages((prev) => [...prev, res.data]);
        setPhotoAltInput("");
        setPhotoFeedback({
          type: "success",
          message: `Fotografía optimizada en WebP (${res.data.width}x${res.data.height}px, ${(res.data.sizeBytes / 1024).toFixed(0)} KB, CLS = 0) subida a Supabase Storage.`,
        });
      }
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormStatus({ type: "loading" });

    if (editingId) {
      const res = await updatePropertyAction({
        id: editingId,
        title,
        slug,
        description,
        corridor,
        address_line: addressLine,
        unit_identifier: unitIdentifier,
        max_adults: Number(maxAdults),
        base_currency: baseCurrency,
        nightly_rate: Number(nightlyRate),
        monthly_discount_pct: Number(monthlyDiscountPct),
        wifi_speed_mbps: Number(wifiSpeedMbps),
        absorb_installments_cost: absorbInstallmentsCost,
        accepts_usdt: acceptsUsdt,
        images,
        ...(accessCodePlain.trim().length >= 4
          ? { accessCodePlain: accessCodePlain.trim() }
          : {}),
      });

      if (!res.ok) {
        setFormStatus({ type: "error", message: res.error.message });
        return;
      }

      setHostProperties((prev) =>
        prev.map((item) => (item.id === res.data.id ? res.data : item))
      );
      setPublicProperties((prev) =>
        prev.map((item) => (item.id === res.data.id ? res.data : item))
      );
      setFormStatus({
        type: "success",
        message: `Unidad Funcional "${res.data.title}" actualizada. PIN protegido con AES-256-GCM (AAD=${res.data.id}).`,
      });
      resetForm();
      return;
    }

    const res = await createPropertyAction({
      title,
      slug,
      description,
      corridor,
      address_line: addressLine,
      unit_identifier: unitIdentifier,
      max_adults: Number(maxAdults),
      base_currency: baseCurrency,
      nightly_rate: Number(nightlyRate),
      monthly_discount_pct: Number(monthlyDiscountPct),
      wifi_speed_mbps: Number(wifiSpeedMbps),
      absorb_installments_cost: absorbInstallmentsCost,
      accepts_usdt: acceptsUsdt,
      images,
      accessCodePlain,
      is_published: true,
    });

    if (!res.ok) {
      setFormStatus({ type: "error", message: res.error.message });
      return;
    }

    setHostProperties((prev) => [res.data, ...prev]);
    setPublicProperties((prev) => [res.data, ...prev]);
    setFormStatus({
      type: "success",
      message: `¡Unidad Funcional "${res.data.title}" creada en Supabase Cloud! Código de cerradura cifrado en servidor con AES-256-GCM (IV 12B + AuthTag 16B + AAD propertyId=${res.data.id}). Link directo: /p/${res.data.slug}`,
    });
    resetForm();
  }

  const displayedProperties =
    hostProperties.length > 0 ? hostProperties : publicProperties;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Columna Izquierda: Formulario de Alta / Edición de Unidad Funcional */}
      <section
        aria-labelledby="form-property-heading"
        className="lg:col-span-7 rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 sm:p-8 shadow-xs space-y-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-4">
          <div>
            <span className="badge-consorcio-friendly inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Zero-Trust Consorcial · AES-256-GCM Server-Only
            </span>
            <h2 id="form-property-heading" className="text-2xl font-extrabold pt-2">
              {editingId
                ? "Editar Unidad Funcional"
                : "Dar de Alta Nueva Unidad Funcional"}
            </h2>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg-secondary)] cursor-pointer"
            >
              Cancelar edición
            </button>
          )}
        </div>

        {!authenticatedEmail && (
          <div
            role="status"
            className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs space-y-1.5"
          >
            <p className="font-bold">
              Modo Vista Previa — Sesión de Anfitrión requerida para guardar en Supabase RLS
            </p>
            <p className="text-[var(--text-secondary)]">
              Para insertar con tu propio <code>auth.uid() = host_id</code>, primero{" "}
              <a href="/login" className="underline font-bold text-[var(--brand-primary)]">
                iniciá sesión en /login
              </a>{" "}
              y completá tu{" "}
              <a
                href="/onboarding/anfitrion"
                className="underline font-bold text-[var(--brand-primary)]"
              >
                Onboarding Fiscal/Web3
              </a>
              .
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prop-title" className="block text-sm font-bold mb-1">
                Título de la Unidad Funcional *
              </label>
              <input
                id="prop-title"
                name="title"
                type="text"
                required
                minLength={5}
                maxLength={140}
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Ej: Studio Luminoso Palermo Soho"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="prop-slug" className="block text-sm font-bold mb-1">
                Slug de Reserva Directa (<code>/p/[slug]</code>) *
              </label>
              <input
                id="prop-slug"
                name="slug"
                type="text"
                required
                minLength={3}
                maxLength={120}
                value={slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setSlug(slugifyPropertyTitle(e.target.value));
                }}
                placeholder="studio-luminoso-palermo-soho"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="prop-corridor" className="block text-sm font-bold mb-1">
                Corredor Geográfico *
              </label>
              <select
                id="prop-corridor"
                name="corridor"
                value={corridor}
                onChange={(e) => setCorridor(e.target.value as PropertyCorridor)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
              >
                {PROPERTY_CORRIDORS.map((c) => (
                  <option key={c} value={c}>
                    {CORRIDOR_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prop-address" className="block text-sm font-bold mb-1">
                Dirección del Edificio *
              </label>
              <input
                id="prop-address"
                name="addressLine"
                type="text"
                required
                minLength={5}
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Thames 1845, Palermo"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="prop-unit" className="block text-sm font-bold mb-1">
                Piso / Unidad Funcional *
              </label>
              <input
                id="prop-unit"
                name="unitIdentifier"
                type="text"
                required
                value={unitIdentifier}
                onChange={(e) => setUnitIdentifier(e.target.value)}
                placeholder="Piso 4 Depto B (UF 14)"
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="prop-description" className="block text-sm font-bold mb-1">
              Descripción Completa y Reglas de Convivencia Consorcial *
            </label>
            <textarea
              id="prop-description"
              name="description"
              required
              minLength={20}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Departamento equipado para estadías cortas y media estadía (1 a 6 meses). Edificio Consorcio Friendly con seguridad 24h y Wi-Fi fibra simétrica."
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="prop-adults" className="block text-xs font-bold mb-1">
                Capacidad Máx. Adultos *
              </label>
              <input
                id="prop-adults"
                name="maxAdults"
                type="number"
                min={1}
                max={20}
                required
                value={maxAdults}
                onChange={(e) => setMaxAdults(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="prop-currency" className="block text-xs font-bold mb-1">
                Moneda Base *
              </label>
              <select
                id="prop-currency"
                name="baseCurrency"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value as PropertyCurrency)}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
              >
                {PROPERTY_CURRENCIES.map((curr) => (
                  <option key={curr} value={curr}>
                    {curr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prop-rate" className="block text-xs font-bold mb-1">
                Tarifa por Noche *
              </label>
              <input
                id="prop-rate"
                name="nightlyRate"
                type="number"
                min={1}
                step="0.01"
                required
                value={nightlyRate}
                onChange={(e) => setNightlyRate(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label htmlFor="prop-discount" className="block text-xs font-bold mb-1">
                Dto. Media Estadía (15–50%) *
              </label>
              <input
                id="prop-discount"
                name="monthlyDiscountPct"
                type="number"
                min={15}
                max={50}
                required
                value={monthlyDiscountPct}
                onChange={(e) => setMonthlyDiscountPct(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4">
            <div>
              <label htmlFor="prop-wifi" className="block text-xs font-bold mb-1">
                Wi-Fi Verificado (Mbps)
              </label>
              <input
                id="prop-wifi"
                name="wifiSpeedMbps"
                type="number"
                min={1}
                max={10000}
                value={wifiSpeedMbps}
                onChange={(e) => setWifiSpeedMbps(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm"
              />
            </div>

            <label className="flex items-center gap-2.5 text-xs font-bold cursor-pointer pt-3 sm:pt-0">
              <input
                type="checkbox"
                checked={absorbInstallmentsCost}
                onChange={(e) => setAbsorbInstallmentsCost(e.target.checked)}
                className="h-4 w-4 accent-[var(--brand-primary)]"
              />
              <span>Ofrecer 3 y 6 Cuotas ARS</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={acceptsUsdt}
                onChange={(e) => setAcceptsUsdt(e.target.checked)}
                className="h-4 w-4 accent-[var(--brand-primary)]"
              />
              <span>Aceptar USDT (Polygon)</span>
            </label>
          </div>

          {/* Sección Crítica: PIN de Cerradura Cifrado con AES-256-GCM + AAD */}
          <div className="rounded-2xl border-2 border-emerald-600/40 bg-[var(--badge-consorcio-bg)]/40 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="prop-pin" className="flex items-center gap-2 text-sm font-extrabold">
                <Lock className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
                PIN / Instrucciones de Cerradura Electrónica {editingId ? "(Opcional al editar)" : "*"}
              </label>
              <span className="text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-300">
                AES-256-GCM · 12B IV · 16B Tag · AAD=propertyId
              </span>
            </div>
            <input
              id="prop-pin"
              name="accessCodePlain"
              type="password"
              required={!editingId}
              minLength={4}
              maxLength={240}
              value={accessCodePlain}
              onChange={(e) => setAccessCodePlain(e.target.value)}
              placeholder={
                editingId
                  ? "Dejar en blanco para conservar el PIN cifrado actual o ingresar uno nuevo..."
                  : "Ej: PIN Cerradura Yale #8492* — Caja de seguridad lobby código 1940"
              }
              className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm font-mono"
            />
            <p className="text-xs text-[var(--text-secondary)]">
              Se cifra exclusivamente en el servidor (<code>server-only</code>) antes del <code>INSERT</code>. Jamás se almacena en texto plano ni se expone hasta que el 100% de los adultos declarados alcancen <code>ALL_ADULTS_VERIFIED</code>.
            </p>
          </div>

          {/* Sección de Carga y Optimización de Fotografías (CLS = 0) */}
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold">
                  Fotografías Optimizadas de la Unidad (<code>CLS = 0</code> · Máx. 5 MB)
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Formatos aceptados: <code>WebP</code>, <code>AVIF</code>, <code>JPEG</code>, <code>PNG</code>. Dimensionamiento fijo <code>1200x900</code> (4:3).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const nextPreset =
                    CURATED_OPTIMIZED_PHOTOS[
                      images.length % CURATED_OPTIMIZED_PHOTOS.length
                    ] ?? DEFAULT_COVER_PHOTO;
                  if (images.length < 10) {
                    setImages((prev) => [...prev, nextPreset]);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg-elevated)] cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Agregar Foto Curada (1200x900 WebP)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label htmlFor="photo-alt" className="block text-xs font-bold mb-1">
                  Texto Alternativo (Accesibilidad WCAG AAA)
                </label>
                <input
                  id="photo-alt"
                  type="text"
                  value={photoAltInput}
                  onChange={(e) => setPhotoAltInput(e.target.value)}
                  placeholder="Ej: Balcón terraza con vista abierta en Palermo"
                  className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label
                  htmlFor="photo-file-input"
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--brand-primary)] bg-[var(--bg-primary)] px-4 py-2 text-xs font-bold text-[var(--brand-primary)] hover:bg-[var(--bg-elevated)] cursor-pointer"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {uploadingPhoto
                    ? "Optimizando a WebP 1200x900..."
                    : "Subir y Optimizar Imagen (WebP/AVIF/JPG/PNG <= 5MB)"}
                </label>
                <input
                  id="photo-file-input"
                  type="file"
                  accept="image/webp,image/avif,image/jpeg,image/png"
                  onChange={handleFileUpload}
                  disabled={uploadingPhoto}
                  className="sr-only"
                />
              </div>
            </div>

            {photoFeedback.type !== "idle" && (
              <p
                role={photoFeedback.type === "error" ? "alert" : "status"}
                className={`rounded-xl px-3 py-2 text-xs font-bold ${
                  photoFeedback.type === "error"
                    ? "bg-red-100 text-red-900"
                    : "badge-consorcio-friendly"
                }`}
              >
                {photoFeedback.message}
              </p>
            )}

            {/* Galería de previsualización con dimensiones explícitas (CLS = 0) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {images.map((img, idx) => (
                <div
                  key={`${img.url}-${idx}`}
                  className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)]"
                >
                  <Image
                    src={img.url}
                    alt={img.alt}
                    width={img.width}
                    height={img.height}
                    unoptimized={img.url.startsWith("data:")}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-[10px] text-white flex items-center justify-between">
                    <span className="truncate">
                      {img.width}x{img.height} · {img.mimeType.replace("image/", "").toUpperCase()}
                    </span>
                    {images.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setImages((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label={`Eliminar fotografía ${idx + 1}`}
                        className="text-red-300 hover:text-red-100 ml-1 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {formStatus.type === "error" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl bg-red-100 text-red-900 px-4 py-3 text-xs font-bold"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{formStatus.message}</span>
            </div>
          )}

          {formStatus.type === "success" && (
            <div
              role="status"
              className="flex items-start gap-2 badge-consorcio-friendly rounded-xl px-4 py-3 text-xs font-bold"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{formStatus.message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={formStatus.type === "loading"}
            className="w-full rounded-xl bg-[var(--brand-primary)] px-5 py-3.5 text-sm font-extrabold text-white hover:bg-[var(--brand-primary-hover)] disabled:opacity-50 cursor-pointer"
          >
            {formStatus.type === "loading"
              ? "Cifrando PIN con AES-256-GCM y guardando en Supabase Cloud..."
              : editingId
              ? "Guardar Cambios en Unidad Funcional"
              : "Publicar Unidad Funcional con PIN Cifrado AES-256-GCM"}
          </button>
        </form>
      </section>

      {/* Columna Derecha: Listado de Unidades Funcionales con CLS = 0 y Exclusión del PIN */}
      <section
        aria-labelledby="list-properties-heading"
        className="lg:col-span-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 id="list-properties-heading" className="text-xl font-extrabold">
              Unidades Funcionales Activas ({displayedProperties.length})
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Consultadas con <code>PUBLIC_PROPERTY_COLUMNS</code> (sin exponer{" "}
              <code>access_code_*</code>).
            </p>
          </div>
        </div>

        {displayedProperties.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-6 text-center space-y-2">
            <Building2 className="h-8 w-8 mx-auto text-[var(--text-secondary)]" />
            <p className="text-sm font-bold">
              Aún no hay Unidades Funcionales registradas
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Completá el formulario a la izquierda para dar de alta tu primera propiedad con código de cerradura cifrado en <code>AES-256-GCM</code>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedProperties.map((prop) => {
              const cover = prop.images[0] ?? CURATED_OPTIMIZED_PHOTOS[0];
              return (
                <article
                  key={prop.id}
                  className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xs transition-shadow hover:shadow-md"
                >
                  {/* Contenedor de relación de aspecto 4:3 fija para garantizar CLS = 0 */}
                  <div className="relative aspect-[4/3] w-full bg-[var(--bg-secondary)]">
                    <Image
                      src={cover.url}
                      alt={cover.alt}
                      width={cover.width}
                      height={cover.height}
                      unoptimized={cover.url.startsWith("data:")}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span className="badge-consorcio-friendly inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-xs">
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        PIN Cifrado AES-256-GCM
                      </span>
                      <span className="rounded-full bg-black/75 text-white px-2.5 py-1 text-[11px] font-bold">
                        {prop.corridor}
                      </span>
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-extrabold leading-snug">
                          {prop.title}
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {prop.address_line} ·{" "}
                          <span className="font-semibold">{prop.unit_identifier}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-extrabold">
                          {prop.base_currency} {prop.nightly_rate.toLocaleString("es-AR")}
                          <span className="text-xs font-normal text-[var(--text-secondary)]">
                            {" "}
                            / noche
                          </span>
                        </p>
                        <span className="inline-block rounded-full bg-[var(--badge-ars-bg)] text-[var(--badge-ars-text)] px-2 py-0.5 text-[10px] font-bold">
                          Media Estadía: -{prop.monthly_discount_pct}% mensual
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)] pt-3">
                      <span className="inline-flex items-center gap-1 font-semibold">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        Hasta {prop.max_adults} adultos
                      </span>
                      {prop.wifi_speed_mbps && (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                          {prop.wifi_speed_mbps} Mbps
                        </span>
                      )}
                      {prop.accepts_usdt && (
                        <span className="rounded-full bg-[var(--badge-usdt-bg)] text-[var(--badge-usdt-text)] px-2 py-0.5 text-[10px] font-bold">
                          USDT Polygon
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <a
                        href={`/p/${prop.slug}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand-primary)] hover:underline"
                      >
                        <span>/p/{prop.slug}</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>

                      <button
                        type="button"
                        onClick={() => handleEditSelect(prop)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-bold hover:bg-[var(--bg-secondary)] cursor-pointer"
                      >
                        <Pencil className="h-3 w-3" aria-hidden="true" />
                        Editar
                      </button>
                    </div>

                    <PropertyIcalSyncPanel
                      propertyId={prop.id}
                      propertyTitle={prop.title}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
