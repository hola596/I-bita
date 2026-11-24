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
  AlertCircle,
  Trash2,
  Pencil,
  MapPin,
  Minus,
  LayoutGrid,
  Calendar,
} from "lucide-react";
import { getArgentinaTodayYmd } from "@/lib/calendar/availability";
import { PropertyAvailabilityCalendar } from "@/components/booking/PropertyAvailabilityCalendar";
import { HostBookingConfirmationsPanel } from "./HostBookingConfirmationsPanel";
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
import {
  validateAllPropertyWizardSteps,
  validatePropertyWizardStep,
  type PropertyWizardValidationValues,
  type WizardFieldIssue,
  type WizardFieldKey,
} from "@/modules/properties/wizard-validation";
import type {
  OccupiedDateRange,
  SafePropertyRecord,
} from "@/modules/properties/queries";
import {
  cloneDefaultMidTermPolicy,
  normalizeMidTermPolicy,
  type MidTermPolicy,
} from "@/modules/properties/mid-term-policy";
import type { HostConsortiumConfigRecord } from "@/modules/consortium/actions";
import type {
  HostBookingConfirmationItem,
  HostMidTermApplicationItem,
} from "@/modules/bookings/host-approval-actions";
import type { HostEarningsSummary } from "@/lib/math/host-earnings";
import {
  listPropertyIcalFeedsAction,
  syncExternalIcalAction,
  type IcalFeedRecord,
} from "@/modules/ical/actions";
import type { HostCalendarSyncPreferences } from "@/lib/ical/platform-guides";
import { HostEarningsPanel } from "@/components/host/HostEarningsPanel";
import { PropertyIcalSyncPanel } from "./PropertyIcalSyncPanel";
import { ConsortiumConfigPanel } from "./ConsortiumConfigPanel";
import { MidTermPolicyEditor } from "./MidTermPolicyEditor";
import { HostMidTermApplicationsPanel } from "./HostMidTermApplicationsPanel";
import { ProgressiveFlowShell } from "@/components/ui/ProgressiveFlowShell";
import { AchievementBanner } from "@/components/ui/AchievementBanner";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import {
  ARGENTINE_JURISDICTIONS,
  JURISDICTION_LABELS,
  defaultJurisdictionForCorridor,
  isCryptoPaymentsEnabled,
  requiresRpattRegistration,
  type ArgentineJurisdiction,
} from "@/lib/compliance/feature-flags";

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

const WIZARD_STEP_META: ReadonlyArray<{
  shortLabel: string;
  createTitle: string;
  editTitle: string;
  subtitle: string;
  imageUrl: string;
  imageAlt: string;
  badge: string;
}> = [
  {
    shortLabel: "Dirección y zona",
    createTitle: "Configurá tu anuncio en I-bita",
    editTitle: "Editá la ubicación de tu anuncio",
    subtitle:
      "Crear un anuncio excelente es muy sencillo. Comencemos con tu dirección.",
    imageUrl:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp",
    imageAlt: "Departamento luminoso listo para recibir huéspedes",
    badge: "Paso 1 · Dirección y edificio",
  },
  {
    shortLabel: "Presentación y capacidad",
    createTitle: "Contanos cómo es tu alojamiento",
    editTitle: "Actualizá la presentación y capacidad",
    subtitle:
      "Elegí un título claro, describí el espacio y definí cuántos adultos entran.",
    imageUrl:
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1200&q=80&fm=webp",
    imageAlt: "Dormitorio equipado para estadías cómodas",
    badge: "Paso 2 · Tu anuncio",
  },
  {
    shortLabel: "Tarifa y cuotas",
    createTitle: "Ahora definí tu precio por noche",
    editTitle: "Ajustá tu precio y descuento mensual",
    subtitle:
      "Mostrá un valor claro y ofrecé un descuento para estadías de 1 a 6 meses.",
    imageUrl:
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80&fm=webp",
    imageAlt: "Ambiente moderno para alquiler temporario o mensual",
    badge: "Paso 3 · Precios en Pesos y USDT",
  },
  {
    shortLabel: "Estadías de 1 a 6 meses",
    createTitle: "Reglas para estadías de 1 a 6 meses",
    editTitle: "Editá tus reglas de estadía larga",
    subtitle:
      "Elegí si confirmás al instante o con entrevista previa y personalizá los requisitos.",
    imageUrl:
      "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1200&q=80&fm=webp",
    imageAlt: "Cocina integrada pensada para estadías prolongadas",
    badge: "Paso 4 · Aprobación y requisitos",
  },
  {
    shortLabel: "Fotos del espacio",
    createTitle: "Sumá fotos luminosas de tu espacio",
    editTitle: "Actualizá las fotos de tu espacio",
    subtitle:
      "Necesitás al menos 1 foto (hasta 10). Las optimizamos automáticamente.",
    imageUrl:
      "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=80&fm=webp",
    imageAlt: "Interior cuidado con detalles de confort",
    badge: "Paso 5 · Galería rápida",
  },
  {
    shortLabel: "Clave de entrada",
    createTitle: "Último paso: tu clave protegida de entrada",
    editTitle: "Revisá tu clave y guardá los cambios",
    subtitle:
      "Se encripta antes de guardarse y solo se entrega a huéspedes con pago e identidad validados.",
    imageUrl:
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp",
    imageAlt: "Ingreso cuidado para el edificio y tus huéspedes",
    badge: "Paso 6 · Publicación protegida",
  },
];

interface PropertyDashboardClientProps {
  initialHostProperties: SafePropertyRecord[];
  initialPublicProperties: SafePropertyRecord[];
  initialConsortiumConfigs?: Record<string, HostConsortiumConfigRecord>;
  initialMidTermApplications?: HostMidTermApplicationItem[];
  initialBookingConfirmations?: HostBookingConfirmationItem[];
  occupiedRangesByProperty?: Record<string, OccupiedDateRange[]>;
  todayYmd?: string;
  initialHostEarnings?: HostEarningsSummary;
  payoutSplitArsPct?: number;
  initialCalendarSyncPreferences?: HostCalendarSyncPreferences;
  initialIcalFeedsByProperty?: Record<string, IcalFeedRecord[]>;
  authenticatedEmail: string | null;
}

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

const INVALID_INPUT_CLASS =
  "border-red-600 focus:border-red-600 bg-red-50/40 dark:bg-red-950/20";

function FieldErrorHint({
  issue,
  id,
}: {
  issue?: WizardFieldIssue;
  id: string;
}) {
  if (!issue) return null;
  return (
    <div
      id={id}
      role="alert"
      className="mt-1.5 flex items-start gap-2 rounded-xl border border-red-600/35 bg-red-50 px-3 py-2 text-xs text-red-950 dark:bg-red-950/35 dark:text-red-200"
    >
      <AlertCircle
        className="h-4 w-4 shrink-0 mt-0.5 text-red-700 dark:text-red-300"
        aria-hidden="true"
      />
      <div className="space-y-0.5 leading-snug">
        <p className="font-extrabold">{issue.problem}</p>
        <p className="font-semibold">
          <span className="underline">Qué hacer:</span> {issue.action}
        </p>
      </div>
    </div>
  );
}

export function PropertyDashboardClient({
  initialHostProperties,
  initialPublicProperties,
  initialConsortiumConfigs = {},
  initialMidTermApplications = [],
  initialBookingConfirmations = [],
  occupiedRangesByProperty = {},
  todayYmd = getArgentinaTodayYmd(),
  initialHostEarnings,
  payoutSplitArsPct = 100,
  initialCalendarSyncPreferences,
  initialIcalFeedsByProperty = {},
  authenticatedEmail,
}: PropertyDashboardClientProps) {
  const { notify } = usePreferences();
  const [icalFeedsByProperty, setIcalFeedsByProperty] = useState<
    Record<string, IcalFeedRecord[]>
  >(initialIcalFeedsByProperty);
  const [expandedCalendarPropIds, setExpandedCalendarPropIds] = useState<
    Record<string, boolean>
  >({});

  const [hostProperties, setHostProperties] = useState<SafePropertyRecord[]>(
    initialHostProperties
  );
  const [publicProperties, setPublicProperties] = useState<SafePropertyRecord[]>(
    initialPublicProperties
  );
  const [consortiumConfigs, setConsortiumConfigs] = useState<
    Record<string, HostConsortiumConfigRecord>
  >(initialConsortiumConfigs);

  const [activeView, setActiveView] = useState<"wizard" | "manage">(
    initialHostProperties.length > 0 ? "manage" : "wizard"
  );
  const [wizardStep, setWizardStep] = useState<number>(0);
  const [wizardDirection, setWizardDirection] = useState<"forward" | "backward">(
    "forward"
  );
  const [showSlugEditor, setShowSlugEditor] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const cryptoEnabled = isCryptoPaymentsEnabled();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [corridor, setCorridor] = useState<PropertyCorridor>("CABA");
  const [jurisdiccion, setJurisdiccion] =
    useState<ArgentineJurisdiction>("CABA");
  const [numeroRegistroTuristico, setNumeroRegistroTuristico] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [unitIdentifier, setUnitIdentifier] = useState("");
  const [maxAdults, setMaxAdults] = useState<number>(2);
  const [baseCurrency, setBaseCurrency] = useState<PropertyCurrency>("ARS");
  const [nightlyRateInput, setNightlyRateInput] = useState<string>("65000");
  const [monthlyDiscountInput, setMonthlyDiscountInput] =
    useState<string>("20");
  const [wifiSpeedInput, setWifiSpeedInput] = useState<string>("300");
  const [absorbInstallmentsCost, setAbsorbInstallmentsCost] = useState(true);
  const [acceptsUsdt, setAcceptsUsdt] = useState(cryptoEnabled);
  const [accessCodePlain, setAccessCodePlain] = useState("");
  const [midTermPolicy, setMidTermPolicy] = useState<MidTermPolicy>(() =>
    cloneDefaultMidTermPolicy()
  );
  const [images, setImages] = useState<PropertyImageItem[]>([
    CURATED_OPTIMIZED_PHOTOS[0],
  ]);

  const [touchedFields, setTouchedFields] = useState<
    Partial<Record<WizardFieldKey, boolean>>
  >({});
  const [attemptedSteps, setAttemptedSteps] = useState<Record<number, boolean>>(
    {}
  );

  const [photoAltInput, setPhotoAltInput] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState<{
    type: "idle" | "error" | "success";
    message?: string;
  }>({ type: "idle" });

  const [formStatus, setFormStatus] = useState<{
    type: "idle" | "loading" | "success" | "error";
    message?: string;
    savedSlug?: string;
  }>({ type: "idle" });

  function markTouched(key: WizardFieldKey) {
    setTouchedFields((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }

  function focusWizardField(fieldId: string) {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (typeof (el as HTMLElement).focus === "function") {
        (el as HTMLElement).focus({ preventScroll: true });
      }
    });
  }

  function handleTitleChange(val: string) {
    setTitle(val);
    markTouched("title");
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
    setJurisdiccion(
      prop.jurisdiccion ?? defaultJurisdictionForCorridor(prop.corridor)
    );
    setNumeroRegistroTuristico(prop.numero_registro_turistico ?? "");
    setAddressLine(prop.address_line);
    setUnitIdentifier(prop.unit_identifier);
    setMaxAdults(prop.max_adults);
    setBaseCurrency(prop.base_currency);
    setNightlyRateInput(String(prop.nightly_rate));
    setMonthlyDiscountInput(String(prop.monthly_discount_pct));
    setWifiSpeedInput(String(prop.wifi_speed_mbps ?? 300));
    setAbsorbInstallmentsCost(prop.absorb_installments_cost);
    setAcceptsUsdt(prop.accepts_usdt);
    setAccessCodePlain("");
    setMidTermPolicy(normalizeMidTermPolicy(prop.mid_term_policy));
    setImages(prop.images.length > 0 ? prop.images : [CURATED_OPTIMIZED_PHOTOS[0]]);
    setTouchedFields({});
    setAttemptedSteps({});
    setFormStatus({ type: "idle" });
    setWizardDirection("forward");
    setWizardStep(0);
    setActiveView("wizard");
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setSlugManuallyEdited(false);
    setDescription("");
    setCorridor("CABA");
    setJurisdiccion("CABA");
    setNumeroRegistroTuristico("");
    setAddressLine("");
    setUnitIdentifier("");
    setMaxAdults(2);
    setBaseCurrency("ARS");
    setNightlyRateInput("65000");
    setMonthlyDiscountInput("20");
    setWifiSpeedInput("300");
    setAbsorbInstallmentsCost(true);
    setAcceptsUsdt(cryptoEnabled);
    setAccessCodePlain("");
    setMidTermPolicy(cloneDefaultMidTermPolicy());
    setImages([CURATED_OPTIMIZED_PHOTOS[0]]);
    setTouchedFields({});
    setAttemptedSteps({});
    setShowSlugEditor(false);
  }

  const wizardValidationValues: PropertyWizardValidationValues = {
    addressLine,
    unitIdentifier,
    jurisdiccion,
    numeroRegistroTuristico,
    title,
    slug,
    description,
    maxAdults,
    wifiSpeedInput,
    baseCurrency,
    nightlyRateInput,
    monthlyDiscountInput,
    midTermPolicy,
    imagesCount: images.length,
    accessCodePlain,
    isEditing: Boolean(editingId),
  };

  const currentStepIssues = validatePropertyWizardStep(
    wizardStep,
    wizardValidationValues
  );
  const isCurrentStepValid = currentStepIssues.length === 0;
  const visibleStepIssues = currentStepIssues.filter(
    (issue) =>
      Boolean(attemptedSteps[wizardStep]) ||
      Boolean(touchedFields[issue.fieldKey]) ||
      Boolean(issue.isOutOfRangeOrMalformed)
  );
  const getVisibleIssue = (key: WizardFieldKey): WizardFieldIssue | undefined =>
    visibleStepIssues.find((issue) => issue.fieldKey === key);

  function handleWizardNext() {
    if (wizardStep >= WIZARD_STEP_META.length - 1) return;
    if (currentStepIssues.length > 0) {
      setAttemptedSteps((prev) => ({ ...prev, [wizardStep]: true }));
      const first = currentStepIssues[0]!;
      if (currentStepIssues.some((issue) => issue.fieldKey === "slug")) {
        setShowSlugEditor(true);
      }
      notify(`Revisá ${first.fieldLabel}: ${first.action}`, "info", "shield");
      focusWizardField(first.fieldId);
      return;
    }
    setFormStatus({ type: "idle" });
    setWizardDirection("forward");
    setWizardStep((s) => Math.min(s + 1, WIZARD_STEP_META.length - 1));
  }

  function handleWizardBack() {
    if (wizardStep <= 0) return;
    setFormStatus({ type: "idle" });
    setWizardDirection("backward");
    setWizardStep((s) => Math.max(0, s - 1));
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setPhotoFeedback({ type: "idle" });

    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(
        rawFile.type as (typeof ALLOWED_IMAGE_MIME_TYPES)[number]
      )
    ) {
      setPhotoFeedback({
        type: "error",
        message: `Formato "${rawFile.type || "desconocido"}" no admitido. Usá WebP, AVIF, JPEG o PNG.`,
      });
      e.target.value = "";
      return;
    }

    if (rawFile.size > MAX_IMAGE_SIZE_BYTES) {
      setPhotoFeedback({
        type: "error",
        message: `El archivo pesa ${(rawFile.size / (1024 * 1024)).toFixed(2)} MB y supera el máximo de 5 MB.`,
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
          : `${title || "Propiedad I-bita"} — Fotografía optimizada`
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
          message: `Foto optimizada (${res.data.width}x${res.data.height}px, ${(res.data.sizeBytes / 1024).toFixed(0)} KB) agregada a la galería.`,
        });
      }
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (wizardStep < WIZARD_STEP_META.length - 1) {
      handleWizardNext();
      return;
    }

    const allCheck = validateAllPropertyWizardSteps(wizardValidationValues);
    if (allCheck.firstInvalidStep !== null) {
      const targetStep = allCheck.firstInvalidStep;
      const stepIssues = allCheck.issuesByStep[targetStep] ?? [];
      setAttemptedSteps((prev) => ({ ...prev, [targetStep]: true }));
      if (stepIssues.some((issue) => issue.fieldKey === "slug")) {
        setShowSlugEditor(true);
      }
      if (targetStep !== wizardStep) {
        setWizardDirection(targetStep < wizardStep ? "backward" : "forward");
        setWizardStep(targetStep);
      }
      const first = stepIssues[0];
      if (first) {
        notify(`Revisá ${first.fieldLabel}: ${first.action}`, "info", "shield");
        focusWizardField(first.fieldId);
      }
      return;
    }

    const parsedNightlyRate = Number(nightlyRateInput);
    const parsedMonthlyDiscount = Number(monthlyDiscountInput);
    const parsedWifiSpeed = Number(wifiSpeedInput);

    setFormStatus({ type: "loading" });

    if (editingId) {
      const res = await updatePropertyAction({
        id: editingId,
        title,
        slug,
        description,
        corridor,
        jurisdiccion,
        numero_registro_turistico: numeroRegistroTuristico.trim() || null,
        address_line: addressLine,
        unit_identifier: unitIdentifier,
        max_adults: Number(maxAdults),
        base_currency: baseCurrency,
        nightly_rate: parsedNightlyRate,
        monthly_discount_pct: parsedMonthlyDiscount,
        wifi_speed_mbps: parsedWifiSpeed,
        absorb_installments_cost: absorbInstallmentsCost,
        accepts_usdt: cryptoEnabled ? acceptsUsdt : false,
        midTermPolicy,
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
        message: `¡Actualizamos "${res.data.title}"! Sus condiciones de estadía larga y su clave resguardada ya están vigentes.`,
        savedSlug: res.data.slug,
      });
      notify("¡Propiedad actualizada con éxito!", "celebration", "trophy");
      resetForm();
      setWizardStep(0);
      return;
    }

    const res = await createPropertyAction({
      title,
      slug,
      description,
      corridor,
      jurisdiccion,
      numero_registro_turistico: numeroRegistroTuristico.trim() || null,
      address_line: addressLine,
      unit_identifier: unitIdentifier,
      max_adults: Number(maxAdults),
      base_currency: baseCurrency,
      nightly_rate: parsedNightlyRate,
      monthly_discount_pct: parsedMonthlyDiscount,
      wifi_speed_mbps: parsedWifiSpeed,
      absorb_installments_cost: absorbInstallmentsCost,
      accepts_usdt: cryptoEnabled ? acceptsUsdt : false,
      midTermPolicy,
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

    const preloadedFeeds =
      initialCalendarSyncPreferences?.mode === "external_sync"
        ? initialCalendarSyncPreferences.feeds.filter(
            (f) => f.feedUrl && f.feedUrl.trim().length >= 8
          )
        : [];

    let inheritedSyncSuffix = "";
    if (preloadedFeeds.length > 0) {
      let okCount = 0;
      for (const feedPref of preloadedFeeds) {
        try {
          const syncRes = await syncExternalIcalAction({
            propertyId: res.data.id,
            feedUrl: feedPref.feedUrl,
            sourceName: feedPref.sourceName,
          });
          if (syncRes.ok) {
            okCount += 1;
          }
        } catch {
          // Continuar con el resto si un feed falla puntualmente
        }
      }
      const listRes = await listPropertyIcalFeedsAction(res.data.id);
      if (listRes.ok) {
        setIcalFeedsByProperty((prev) => ({
          ...prev,
          [res.data.id]: listRes.data,
        }));
      }
      inheritedSyncSuffix =
        okCount > 0
          ? ` Sincronizamos automáticamente ${okCount} calendario(s) de tu registro. En "Mis propiedades" tenés tu enlace I-bita (.ics) para completar el Paso 2 bidireccional.`
          : "";
    }

    setFormStatus({
      type: "success",
      message: `¡Publicaste "${res.data.title}"! Ya podés compartir el enlace directo /p/${res.data.slug}.${inheritedSyncSuffix}`,
      savedSlug: res.data.slug,
    });
    notify(
      preloadedFeeds.length > 0
        ? "¡Publicaste tu unidad y heredamos tus calendarios externos!"
        : "¡Tu anuncio ya está publicado en I-bita!",
      "celebration",
      "trophy"
    );
    resetForm();
    setWizardStep(0);
  }

  const displayedProperties =
    hostProperties.length > 0 ? hostProperties : publicProperties;
  const activeMeta = WIZARD_STEP_META[wizardStep] ?? WIZARD_STEP_META[0]!;
  const enabledReqCount = midTermPolicy.requirements.filter(
    (r) => r.enabled
  ).length;

  const addressIssue = getVisibleIssue("addressLine");
  const unitIssue = getVisibleIssue("unitIdentifier");
  const rpattIssue = getVisibleIssue("numeroRegistroTuristico");
  const titleIssue = getVisibleIssue("title");
  const slugIssue = getVisibleIssue("slug");
  const descriptionIssue = getVisibleIssue("description");
  const maxAdultsIssue = getVisibleIssue("maxAdults");
  const wifiIssue = getVisibleIssue("wifiSpeedMbps");
  const rateIssue = getVisibleIssue("nightlyRate");
  const discountIssue = getVisibleIssue("monthlyDiscountPct");
  const channelsIssue = getVisibleIssue("midTermInterviewChannels");
  const imagesIssue = getVisibleIssue("images");
  const pinIssue = getVisibleIssue("accessCodePlain");

  const wizardFooterAlert =
    visibleStepIssues.length > 0 ? (
      <div
        role="alert"
        aria-live="polite"
        className="rounded-2xl border border-red-600/40 bg-red-50 p-4 text-xs text-red-950 dark:bg-red-950/35 dark:text-red-200 space-y-2"
      >
        <div className="flex items-center gap-2 font-extrabold">
          <AlertCircle
            className="h-4 w-4 shrink-0 text-red-700 dark:text-red-300"
            aria-hidden="true"
          />
          <span>
            Antes de continuar, corregí{" "}
            {visibleStepIssues.length === 1
              ? "este dato"
              : `estos ${visibleStepIssues.length} datos`}
            :
          </span>
        </div>
        <ul className="space-y-1.5 pl-1">
          {visibleStepIssues.map((issue) => (
            <li key={issue.fieldKey} className="leading-snug">
              <button
                type="button"
                onClick={() => {
                  if (issue.fieldKey === "slug") {
                    setShowSlugEditor(true);
                  }
                  focusWizardField(issue.fieldId);
                }}
                className="font-extrabold underline hover:text-[var(--brand-primary)] cursor-pointer text-left"
              >
                {issue.fieldLabel}:
              </button>{" "}
              <span className="font-semibold">{issue.problem}</span>{" "}
              <span>{issue.action}</span>
            </li>
          ))}
        </ul>
      </div>
    ) : undefined;

  return (
    <div className="space-y-8">
      {/* Barra superior de modo: Asistente paso a paso vs Gestión de propiedades y solicitudes */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Cambiar entre publicar y administrar propiedades"
          className="inline-flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs font-extrabold"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeView === "manage"}
            onClick={() => setActiveView("manage")}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 transition-colors cursor-pointer ${
              activeView === "manage"
                ? "bg-[var(--bg-primary)] text-[var(--brand-primary)] shadow-xs border border-[var(--border-subtle)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Mis propiedades y entrevistas ({displayedProperties.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeView === "wizard"}
            onClick={() => {
              setFormStatus({ type: "idle" });
              setActiveView("wizard");
            }}
            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 transition-colors cursor-pointer ${
              activeView === "wizard"
                ? "bg-[var(--brand-primary)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{editingId ? "Editando anuncio" : "Publicar nueva propiedad"}</span>
          </button>
        </div>

        {editingId && activeView === "wizard" && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setWizardStep(0);
              setActiveView("manage");
            }}
            className="btn-secondary-3d rounded-xl px-3.5 py-2 text-xs font-extrabold"
          >
            Cancelar edición
          </button>
        )}
      </div>

      {formStatus.type === "success" && (
        <AchievementBanner
          icon="trophy"
          tone="emerald"
          title="¡Listo! Anuncio guardado"
          description={formStatus.message ?? "Tu publicación quedó vigente."}
          action={
            formStatus.savedSlug
              ? {
                  label: "Ver mi anuncio publicado",
                  href: `/p/${formStatus.savedSlug}`,
                }
              : undefined
          }
        />
      )}

      {activeView === "wizard" ? (
        <div className="surface-card overflow-hidden">
          {!authenticatedEmail && (
            <div
              role="status"
              className="mx-6 mt-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs space-y-1"
            >
              <p className="font-bold">
                Modo vista previa — Iniciá sesión como anfitrión aprobado para guardar
              </p>
              <p className="text-[var(--text-secondary)]">
                Ingresá en{" "}
                <a href="/login" className="underline font-bold text-[var(--brand-primary)]">
                  /login
                </a>{" "}
                o completá tu{" "}
                <a
                  href="/onboarding/anfitrion"
                  className="underline font-bold text-[var(--brand-primary)]"
                >
                  registro de anfitrión
                </a>
                .
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <ProgressiveFlowShell
              eyebrow={`Paso ${wizardStep + 1} de ${WIZARD_STEP_META.length} · ${activeMeta.shortLabel}`}
              title={editingId ? activeMeta.editTitle : activeMeta.createTitle}
              subtitle={activeMeta.subtitle}
              currentStep={wizardStep}
              totalSteps={WIZARD_STEP_META.length}
              direction={wizardDirection}
              mediaImageUrl={
                wizardStep === 4 && images[0]?.url
                  ? images[0].url
                  : activeMeta.imageUrl
              }
              mediaImageAlt={activeMeta.imageAlt}
              mediaBadge={activeMeta.badge}
              mediaCaption={
                addressLine.trim()
                  ? `${addressLine}${unitIdentifier.trim() ? ` · ${unitIdentifier}` : ""}`
                  : undefined
              }
              canGoBack={wizardStep > 0}
              onBack={handleWizardBack}
              canGoNext={isCurrentStepValid}
              allowInvalidNextClick
              footerAlertSlot={wizardFooterAlert}
              onNext={
                wizardStep < WIZARD_STEP_META.length - 1
                  ? handleWizardNext
                  : undefined
              }
              nextLabel="Siguiente"
              submitButtonLabel={
                wizardStep === WIZARD_STEP_META.length - 1
                  ? editingId
                    ? "Guardar cambios de la propiedad"
                    : "Publicar propiedad"
                  : undefined
              }
              isSubmitting={formStatus.type === "loading"}
              submittingLabel="Guardando tu propiedad de forma segura..."
            >
              {/* PASO 0: DIRECCIÓN Y ZONA (ESTILO AIRBNB) */}
              {wizardStep === 0 && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label
                        htmlFor="prop-address"
                        className="text-xs font-extrabold"
                      >
                        Dirección física (calle y altura) *
                      </label>
                      <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                        {addressLine.trim().length}/5 mín.
                      </span>
                    </div>
                    <div className="relative">
                      <MapPin
                        className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--brand-primary)]"
                        aria-hidden="true"
                      />
                      <input
                        id="prop-address"
                        name="addressLine"
                        type="text"
                        required
                        minLength={5}
                        maxLength={200}
                        value={addressLine}
                        onChange={(e) => {
                          setAddressLine(e.target.value);
                          markTouched("addressLine");
                        }}
                        onBlur={() => markTouched("addressLine")}
                        aria-invalid={Boolean(addressIssue)}
                        aria-describedby={
                          addressIssue ? "prop-address-error" : undefined
                        }
                        placeholder="Ingresá tu dirección (ej: Thames 1845, Palermo)"
                        className={`min-h-[54px] w-full rounded-full border-2 bg-[var(--bg-primary)] pl-12 pr-5 py-3 text-sm sm:text-base font-semibold focus:outline-none ${
                          addressIssue
                            ? INVALID_INPUT_CLASS
                            : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                        }`}
                      />
                    </div>
                    <FieldErrorHint
                      issue={addressIssue}
                      id="prop-address-error"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prop-unit"
                      className="block text-xs font-extrabold mb-1.5"
                    >
                      Piso / Departamento / Unidad *
                    </label>
                    <input
                      id="prop-unit"
                      name="unitIdentifier"
                      type="text"
                      required
                      maxLength={40}
                      value={unitIdentifier}
                      onChange={(e) => {
                        setUnitIdentifier(e.target.value);
                        markTouched("unitIdentifier");
                      }}
                      onBlur={() => markTouched("unitIdentifier")}
                      aria-invalid={Boolean(unitIssue)}
                      aria-describedby={unitIssue ? "prop-unit-error" : undefined}
                      placeholder="Ej: Piso 4 Depto B"
                      className={`min-h-[48px] w-full rounded-2xl border bg-[var(--bg-primary)] px-4 text-sm font-semibold focus:outline-none ${
                        unitIssue
                          ? `border-2 ${INVALID_INPUT_CLASS}`
                          : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                      }`}
                    />
                    <FieldErrorHint issue={unitIssue} id="prop-unit-error" />
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-extrabold">
                      Zona o corredor *
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {PROPERTY_CORRIDORS.map((c) => {
                        const selected = corridor === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => {
                              setCorridor(c);
                              setJurisdiccion(defaultJurisdictionForCorridor(c));
                            }}
                            aria-pressed={selected}
                            className={`rounded-2xl border-2 px-3.5 py-2.5 text-left text-xs font-extrabold transition-colors cursor-pointer ${
                              selected
                                ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                                : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                            }`}
                          >
                            {CORRIDOR_LABELS[c]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label
                        htmlFor="prop-jurisdiccion"
                        className="block text-xs font-extrabold mb-1.5"
                      >
                        Jurisdicción legal *
                      </label>
                      <select
                        id="prop-jurisdiccion"
                        name="jurisdiccion"
                        value={jurisdiccion}
                        onChange={(e) => {
                          setJurisdiccion(
                            e.target.value as ArgentineJurisdiction
                          );
                          markTouched("numeroRegistroTuristico");
                        }}
                        className="min-h-[48px] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3.5 text-xs font-semibold focus:border-[var(--brand-primary)] focus:outline-none"
                      >
                        {ARGENTINE_JURISDICTIONS.map((jur) => (
                          <option key={jur} value={jur}>
                            {JURISDICTION_LABELS[jur]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="prop-rpatt"
                        className="block text-xs font-extrabold mb-1.5"
                      >
                        {requiresRpattRegistration(jurisdiccion)
                          ? "Número de inscripción RPATT - Ley 6255 *"
                          : "Registro turístico local (opcional)"}
                      </label>
                      <input
                        id="prop-rpatt"
                        name="numeroRegistroTuristico"
                        type="text"
                        required={requiresRpattRegistration(jurisdiccion)}
                        maxLength={80}
                        value={numeroRegistroTuristico}
                        onChange={(e) => {
                          setNumeroRegistroTuristico(e.target.value);
                          markTouched("numeroRegistroTuristico");
                        }}
                        onBlur={() => markTouched("numeroRegistroTuristico")}
                        aria-invalid={Boolean(rpattIssue)}
                        aria-describedby={
                          rpattIssue ? "prop-rpatt-error" : undefined
                        }
                        placeholder={
                          requiresRpattRegistration(jurisdiccion)
                            ? "Ej: RL-2026-12345678-GCABA"
                            : "Código municipal si aplica"
                        }
                        className={`min-h-[48px] w-full rounded-2xl border bg-[var(--bg-primary)] px-3.5 text-xs sm:text-sm font-mono font-semibold focus:outline-none ${
                          rpattIssue
                            ? `border-2 ${INVALID_INPUT_CLASS}`
                            : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                        }`}
                      />
                      <FieldErrorHint
                        issue={rpattIssue}
                        id="prop-rpatt-error"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 1: PRESENTACIÓN Y CAPACIDAD */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label
                        htmlFor="prop-title"
                        className="text-xs font-extrabold"
                      >
                        Título de tu alojamiento *
                      </label>
                      <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                        {title.trim().length}/5 mín.
                      </span>
                    </div>
                    <input
                      id="prop-title"
                      name="title"
                      type="text"
                      required
                      minLength={5}
                      maxLength={140}
                      value={title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      onBlur={() => markTouched("title")}
                      aria-invalid={Boolean(titleIssue)}
                      aria-describedby={
                        titleIssue ? "prop-title-error" : undefined
                      }
                      placeholder="Ej: Studio Luminoso Palermo Soho"
                      className={`min-h-[50px] w-full rounded-2xl border-2 bg-[var(--bg-primary)] px-4 text-sm font-semibold focus:outline-none ${
                        titleIssue
                          ? INVALID_INPUT_CLASS
                          : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                      }`}
                    />
                    <FieldErrorHint issue={titleIssue} id="prop-title-error" />
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={() => setShowSlugEditor((p) => !p)}
                      className="text-xs font-bold text-[var(--brand-primary)] underline cursor-pointer"
                    >
                      {showSlugEditor || Boolean(slugIssue)
                        ? "Ocultar enlace personalizado"
                        : `Enlace directo: /p/${slug || "tu-anuncio"} (personalizar)`}
                    </button>
                    {(showSlugEditor || Boolean(slugIssue)) && (
                      <div className="mt-2">
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
                            markTouched("slug");
                            setSlug(slugifyPropertyTitle(e.target.value));
                          }}
                          onBlur={() => markTouched("slug")}
                          aria-invalid={Boolean(slugIssue)}
                          aria-describedby={
                            slugIssue ? "prop-slug-error" : undefined
                          }
                          placeholder="studio-luminoso-palermo-soho"
                          className={`min-h-[44px] w-full rounded-xl border bg-[var(--bg-primary)] px-3.5 text-xs font-mono focus:outline-none ${
                            slugIssue
                              ? `border-2 ${INVALID_INPUT_CLASS}`
                              : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                          }`}
                        />
                        <FieldErrorHint issue={slugIssue} id="prop-slug-error" />
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label
                        htmlFor="prop-description"
                        className="text-xs font-extrabold"
                      >
                        Contanos qué tiene y cómo es la convivencia (mín. 20 letras) *
                      </label>
                      <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                        {description.trim().length}/20 mín.
                      </span>
                    </div>
                    <textarea
                      id="prop-description"
                      name="description"
                      required
                      minLength={20}
                      maxLength={4000}
                      rows={3}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        markTouched("description");
                      }}
                      onBlur={() => markTouched("description")}
                      aria-invalid={Boolean(descriptionIssue)}
                      aria-describedby={
                        descriptionIssue ? "prop-description-error" : undefined
                      }
                      placeholder="Departamento equipado para estadías cortas y largas (1 a 6 meses). Edificio tranquilo y Wi-Fi de alta velocidad."
                      className={`w-full rounded-2xl border bg-[var(--bg-primary)] p-3.5 text-sm focus:outline-none ${
                        descriptionIssue
                          ? `border-2 ${INVALID_INPUT_CLASS}`
                          : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                      }`}
                    />
                    <FieldErrorHint
                      issue={descriptionIssue}
                      id="prop-description-error"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div
                        id="prop-max-adults"
                        tabIndex={-1}
                        className={`rounded-2xl border bg-[var(--bg-secondary)] p-3.5 flex items-center justify-between gap-2 ${
                          maxAdultsIssue
                            ? `border-2 ${INVALID_INPUT_CLASS}`
                            : "border-[var(--border-subtle)]"
                        }`}
                      >
                        <span className="text-xs font-extrabold">
                          Adultos máx.
                        </span>
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMaxAdults((n) => Math.max(1, n - 1));
                              markTouched("maxAdults");
                            }}
                            aria-label="Restar un adulto"
                            className="h-8 w-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] inline-flex items-center justify-center font-extrabold cursor-pointer"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <span className="w-6 text-center text-sm font-black">
                            {maxAdults}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setMaxAdults((n) => Math.min(20, n + 1));
                              markTouched("maxAdults");
                            }}
                            aria-label="Sumar un adulto"
                            className="h-8 w-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-primary)] inline-flex items-center justify-center font-extrabold cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <FieldErrorHint
                        issue={maxAdultsIssue}
                        id="prop-max-adults-error"
                      />
                    </div>

                    <div>
                      <div
                        className={`rounded-2xl border bg-[var(--bg-secondary)] p-3.5 flex items-center justify-between gap-2 ${
                          wifiIssue
                            ? `border-2 ${INVALID_INPUT_CLASS}`
                            : "border-[var(--border-subtle)]"
                        }`}
                      >
                        <label
                          htmlFor="prop-wifi"
                          className="text-xs font-extrabold"
                        >
                          Wi-Fi (Mbps)
                        </label>
                        <input
                          id="prop-wifi"
                          name="wifiSpeedMbps"
                          type="number"
                          min={1}
                          max={10000}
                          value={wifiSpeedInput}
                          onChange={(e) => {
                            setWifiSpeedInput(e.target.value);
                            markTouched("wifiSpeedMbps");
                          }}
                          onBlur={() => markTouched("wifiSpeedMbps")}
                          aria-invalid={Boolean(wifiIssue)}
                          aria-describedby={
                            wifiIssue ? "prop-wifi-error" : undefined
                          }
                          className={`w-24 rounded-xl border bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm font-bold text-right focus:outline-none ${
                            wifiIssue
                              ? "border-red-600 focus:border-red-600"
                              : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                          }`}
                        />
                      </div>
                      <FieldErrorHint issue={wifiIssue} id="prop-wifi-error" />
                    </div>
                  </div>
                </div>
              )}

              {/* PASO 2: TARIFA, MONEDA Y DESCUENTO MENSUAL */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <span className="block text-xs font-extrabold">
                      Moneda base de publicación
                    </span>
                    <div className="grid grid-cols-3 gap-2">
                      {PROPERTY_CURRENCIES.filter(
                        (curr) => cryptoEnabled || curr !== "USDT"
                      ).map((curr) => (
                        <button
                          key={curr}
                          type="button"
                          onClick={() => setBaseCurrency(curr)}
                          aria-pressed={baseCurrency === curr}
                          className={`min-h-[44px] rounded-2xl border-2 text-xs font-extrabold cursor-pointer transition-colors ${
                            baseCurrency === curr
                              ? "border-[var(--brand-primary)] bg-[var(--surface-tint)] text-[var(--brand-primary)]"
                              : "border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
                          }`}
                        >
                          {curr}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="prop-rate"
                        className="block text-xs font-extrabold mb-1"
                      >
                        Tarifa por noche ({baseCurrency}) *
                      </label>
                      <input
                        id="prop-rate"
                        name="nightlyRate"
                        type="number"
                        min={1}
                        step="0.01"
                        required
                        value={nightlyRateInput}
                        onChange={(e) => {
                          setNightlyRateInput(e.target.value);
                          markTouched("nightlyRate");
                        }}
                        onBlur={() => markTouched("nightlyRate")}
                        aria-invalid={Boolean(rateIssue)}
                        aria-describedby={
                          rateIssue ? "prop-rate-error" : undefined
                        }
                        className={`min-h-[52px] w-full rounded-2xl border-2 bg-[var(--bg-primary)] px-4 text-lg font-black focus:outline-none ${
                          rateIssue
                            ? INVALID_INPUT_CLASS
                            : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                        }`}
                      />
                      <FieldErrorHint issue={rateIssue} id="prop-rate-error" />
                    </div>

                    <div>
                      <label
                        htmlFor="prop-discount"
                        className="block text-xs font-extrabold mb-1"
                      >
                        Descuento estadía larga (15–50%) *
                      </label>
                      <input
                        id="prop-discount"
                        name="monthlyDiscountPct"
                        type="number"
                        min={15}
                        max={50}
                        required
                        value={monthlyDiscountInput}
                        onChange={(e) => {
                          setMonthlyDiscountInput(e.target.value);
                          markTouched("monthlyDiscountPct");
                        }}
                        onBlur={() => markTouched("monthlyDiscountPct")}
                        aria-invalid={Boolean(discountIssue)}
                        aria-describedby={
                          discountIssue ? "prop-discount-error" : undefined
                        }
                        className={`min-h-[52px] w-full rounded-2xl border-2 bg-[var(--bg-primary)] px-4 text-lg font-black focus:outline-none ${
                          discountIssue
                            ? INVALID_INPUT_CLASS
                            : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                        }`}
                      />
                      <FieldErrorHint
                        issue={discountIssue}
                        id="prop-discount-error"
                      />
                      {discountIssue && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                            Ajuste rápido:
                          </span>
                          {[
                            { val: "15", label: "Usar 15% (mínimo)" },
                            { val: "20", label: "Usar 20% (recomendado)" },
                            { val: "50", label: "Usar 50% (máximo)" },
                          ].map((chip) => (
                            <button
                              key={chip.val}
                              type="button"
                              onClick={() => {
                                setMonthlyDiscountInput(chip.val);
                                markTouched("monthlyDiscountPct");
                              }}
                              className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--text-primary)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] cursor-pointer transition-colors"
                            >
                              {chip.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 text-xs font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={absorbInstallmentsCost}
                        onChange={(e) =>
                          setAbsorbInstallmentsCost(e.target.checked)
                        }
                        className="h-4 w-4 accent-[var(--brand-primary)]"
                      />
                      <span>Ofrecer 3 y 6 cuotas en Pesos</span>
                    </label>

                    {cryptoEnabled ? (
                      <label className="flex items-center gap-2.5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-3.5 text-xs font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={acceptsUsdt}
                          onChange={(e) => setAcceptsUsdt(e.target.checked)}
                          className="h-4 w-4 accent-[var(--brand-primary)]"
                        />
                        <span>Aceptar USDT (Polygon)</span>
                      </label>
                    ) : (
                      <div className="flex items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3.5 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)]">
                        Cobros activos solo en ARS (USDT pausado por adecuación CNV PSAV).
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* PASO 3: ESTADÍAS LARGAS (1 A 6 MESES) */}
              {wizardStep === 3 && (
                <div
                  id="prop-midterm-channels"
                  tabIndex={-1}
                  className="space-y-3"
                >
                  <MidTermPolicyEditor
                    value={midTermPolicy}
                    onChange={(next) => {
                      setMidTermPolicy(next);
                      markTouched("midTermInterviewChannels");
                    }}
                  />
                  <FieldErrorHint
                    issue={channelsIssue}
                    id="prop-midterm-channels-error"
                  />
                </div>
              )}

              {/* PASO 4: FOTOGRAFÍAS DEL ESPACIO */}
              {wizardStep === 4 && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                      className="btn-secondary-3d inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Agregar foto de muestra</span>
                    </button>

                    <label
                      htmlFor="photo-file-input"
                      className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-[var(--brand-primary)] bg-[var(--bg-primary)] px-4 py-2 text-xs font-extrabold text-[var(--brand-primary)] hover:bg-[var(--bg-secondary)] cursor-pointer"
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      <span>
                        {uploadingPhoto ? "Subiendo..." : "Subir foto propia"}
                      </span>
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

                  <div>
                    <label
                      htmlFor="photo-alt"
                      className="block text-xs font-bold mb-1"
                    >
                      Descripción breve de la foto (opcional)
                    </label>
                    <input
                      id="photo-alt"
                      type="text"
                      value={photoAltInput}
                      onChange={(e) => setPhotoAltInput(e.target.value)}
                      placeholder="Ej: Living luminoso con balcón en Palermo"
                      className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-2 text-xs"
                    />
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

                  <FieldErrorHint
                    issue={imagesIssue}
                    id="photo-file-input-error"
                  />

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
                        {images.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setImages((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            aria-label={`Eliminar fotografía ${idx + 1}`}
                            className="absolute top-2 right-2 rounded-full bg-black/75 p-1.5 text-white hover:bg-red-700 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PASO 5: CLAVE RESGUARDADA Y PUBLICACIÓN */}
              {wizardStep === 5 && (
                <div className="space-y-4">
                  <div
                    className={`rounded-2xl border-2 p-4 space-y-2.5 ${
                      pinIssue
                        ? INVALID_INPUT_CLASS
                        : "border-emerald-600/40 bg-[var(--badge-consorcio-bg)]/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label
                        htmlFor="prop-pin"
                        className="flex items-center gap-2 text-sm font-extrabold"
                      >
                        <Lock
                          className="h-4 w-4 text-emerald-700 dark:text-emerald-400"
                          aria-hidden="true"
                        />
                        Clave o instrucciones de entrada{" "}
                        {editingId ? "(Opcional al editar)" : "*"}
                      </label>
                      <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                        Resguardada y encriptada
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
                      onChange={(e) => {
                        setAccessCodePlain(e.target.value);
                        markTouched("accessCodePlain");
                      }}
                      onBlur={() => markTouched("accessCodePlain")}
                      aria-invalid={Boolean(pinIssue)}
                      aria-describedby={pinIssue ? "prop-pin-error" : undefined}
                      placeholder={
                        editingId
                          ? "Dejá en blanco para conservar la clave actual o escribí una nueva..."
                          : "Ej: PIN Cerradura #8492* — Llave en portería"
                      }
                      className={`min-h-[48px] w-full rounded-xl border bg-[var(--bg-primary)] px-3.5 text-sm font-mono focus:outline-none ${
                        pinIssue
                          ? "border-red-600 focus:border-red-600"
                          : "border-[var(--border-subtle)] focus:border-[var(--brand-primary)]"
                      }`}
                    />
                    <FieldErrorHint issue={pinIssue} id="prop-pin-error" />
                  </div>

                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-4 space-y-1.5 text-xs">
                    <p className="font-extrabold text-[var(--text-primary)]">
                      Resumen rápido de tu publicación:
                    </p>
                    <p>
                      <strong>{title}</strong> · {addressLine} ({unitIdentifier})
                    </p>
                    <p className="text-[var(--text-secondary)]">
                      Tarifa:{" "}
                      <strong>
                        {nightlyRateInput || "0"} {baseCurrency}/noche
                      </strong>{" "}
                      (-{monthlyDiscountInput || "0"}% mensual) · Estadías 1–6
                      meses:{" "}
                      <strong>
                        {midTermPolicy.approvalMode === "HOST_APPROVAL_INTERVIEW"
                          ? "Con entrevista previa"
                          : "Confirmación automática"}
                      </strong>{" "}
                      ({enabledReqCount} requisitos)
                    </p>
                  </div>

                  {formStatus.type === "error" && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl bg-red-100 text-red-900 px-4 py-3 text-xs font-bold"
                    >
                      <AlertCircle
                        className="h-4 w-4 shrink-0 mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{formStatus.message}</span>
                    </div>
                  )}
                </div>
              )}
            </ProgressiveFlowShell>
          </form>
        </div>
      ) : (
        <div className="space-y-8">
          {initialHostEarnings && (
            <HostEarningsPanel
              earnings={initialHostEarnings}
              payoutSplitArsPct={payoutSplitArsPct}
              variant="dashboard"
            />
          )}

          <HostBookingConfirmationsPanel
            initialItems={initialBookingConfirmations}
          />

          <HostMidTermApplicationsPanel
            initialApplications={initialMidTermApplications}
          />

          <section
            aria-labelledby="list-properties-heading"
            className="space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2
                  id="list-properties-heading"
                  className="text-xl font-extrabold"
                >
                  Tus propiedades activas ({displayedProperties.length})
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Tu clave de entrada siempre permanece protegida y privada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setWizardStep(0);
                  setActiveView("wizard");
                }}
                className="btn-primary-3d inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Publicar nueva propiedad</span>
              </button>
            </div>

            {displayedProperties.length === 0 ? (
              <div className="surface-card p-8 text-center space-y-3">
                <Building2 className="h-8 w-8 mx-auto text-[var(--text-secondary)]" />
                <p className="text-sm font-bold">
                  Todavía no publicaste propiedades
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  Usá el asistente paso a paso para publicar tu primer
                  departamento.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setWizardStep(0);
                    setActiveView("wizard");
                  }}
                  className="btn-primary-3d inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-5 text-xs font-extrabold"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Crear mi primera publicación</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {displayedProperties.map((prop) => {
                  const cover = prop.images[0] ?? CURATED_OPTIMIZED_PHOTOS[0];
                  const policy = normalizeMidTermPolicy(prop.mid_term_policy);
                  const activeReqCount = policy.requirements.filter(
                    (r) => r.enabled
                  ).length;
                  return (
                    <article
                      key={prop.id}
                      className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xs transition-shadow hover:shadow-md"
                    >
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
                            <ShieldCheck
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            {prop.consortium_config?.active
                              ? `Edificio amigable · ${Number(
                                  prop.consortium_config.micro_canon_pct
                                ).toFixed(2)}%`
                              : "Clave resguardada"}
                          </span>
                          <span className="rounded-full bg-black/75 text-white px-2.5 py-1 text-[11px] font-bold">
                            {prop.corridor}
                          </span>
                          {prop.estado_regulatorio === "suspendido_autoridad" && (
                            <span className="rounded-full bg-red-700 text-white px-2.5 py-1 text-[11px] font-extrabold">
                              Suspendido por autoridad
                            </span>
                          )}
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
                              <span className="font-semibold">
                                {prop.unit_identifier}
                              </span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base font-extrabold">
                              {prop.base_currency}{" "}
                              {prop.nightly_rate.toLocaleString("es-AR")}
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
                              <Wifi
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              {prop.wifi_speed_mbps} Mbps
                            </span>
                          )}
                          {prop.accepts_usdt && (
                            <span className="rounded-full bg-[var(--badge-usdt-bg)] text-[var(--badge-usdt-text)] px-2 py-0.5 text-[10px] font-bold">
                              USDT Polygon
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                              policy.approvalMode === "HOST_APPROVAL_INTERVIEW"
                                ? "bg-amber-500/15 text-amber-900 dark:text-amber-300 border border-amber-500/40"
                                : "badge-consorcio-friendly"
                            }`}
                          >
                            {policy.approvalMode === "HOST_APPROVAL_INTERVIEW"
                              ? `Estadía larga: Entrevista previa · ${activeReqCount} req.`
                              : `Estadía larga: Automática · ${activeReqCount} req.`}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <a
                            href={`/p/${prop.slug}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--brand-primary)] hover:underline"
                          >
                            <span>/p/{prop.slug}</span>
                            <ExternalLink
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
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

                        <ConsortiumConfigPanel
                          propertyId={prop.id}
                          propertySlug={prop.slug}
                          propertyTitle={prop.title}
                          addressLine={prop.address_line}
                          baseCurrency={prop.base_currency}
                          nightlyRate={prop.nightly_rate}
                          monthlyDiscountPct={prop.monthly_discount_pct}
                          absorbInstallmentsCost={prop.absorb_installments_cost}
                          initialHostConfig={consortiumConfigs[prop.id] ?? null}
                          publicConsortiumConfig={prop.consortium_config ?? null}
                          onSaved={(savedConfig) => {
                            setConsortiumConfigs((prev) => ({
                              ...prev,
                              [prop.id]: savedConfig,
                            }));
                            const updatedPublicConfig = savedConfig.active
                              ? {
                                  id: savedConfig.id,
                                  property_id: savedConfig.property_id,
                                  consortium_name: savedConfig.consortium_name,
                                  micro_canon_pct: savedConfig.micro_canon_pct,
                                  active: savedConfig.active,
                                }
                              : null;
                            setHostProperties((prev) =>
                              prev.map((p) =>
                                p.id === prop.id
                                  ? { ...p, consortium_config: updatedPublicConfig }
                                  : p
                              )
                            );
                            setPublicProperties((prev) =>
                              prev.map((p) =>
                                p.id === prop.id
                                  ? { ...p, consortium_config: updatedPublicConfig }
                                  : p
                              )
                            );
                          }}
                        />

                        <PropertyIcalSyncPanel
                          propertyId={prop.id}
                          propertyTitle={prop.title}
                          initialFeeds={icalFeedsByProperty[prop.id] ?? []}
                          preferredSources={
                            initialCalendarSyncPreferences?.selectedSources ??
                            []
                          }
                          onFeedsChanged={(nextFeeds) =>
                            setIcalFeedsByProperty((prev) => ({
                              ...prev,
                              [prop.id]: nextFeeds,
                            }))
                          }
                        />

                        <div className="border-t border-[var(--border-subtle)] pt-3 space-y-3">
                          <button
                            type="button"
                            aria-expanded={Boolean(
                              expandedCalendarPropIds[prop.id]
                            )}
                            onClick={() =>
                              setExpandedCalendarPropIds((prev) => ({
                                ...prev,
                                [prop.id]: !prev[prop.id],
                              }))
                            }
                            className="btn-secondary-3d inline-flex w-full min-h-[40px] items-center justify-between gap-2 rounded-xl px-3.5 text-xs font-extrabold"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Calendar
                                className="h-3.5 w-3.5 text-[var(--brand-primary)]"
                                aria-hidden="true"
                              />
                              <span>
                                {expandedCalendarPropIds[prop.id]
                                  ? "Ocultar calendario visual de disponibilidad"
                                  : "Calendario visual de disponibilidad"}
                              </span>
                            </span>
                            <span className="rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px]">
                              {(occupiedRangesByProperty[prop.id] ?? []).length}{" "}
                              {(occupiedRangesByProperty[prop.id] ?? [])
                                .length === 1
                                ? "reserva/bloqueo"
                                : "reservas/bloqueos"}
                            </span>
                          </button>

                          {expandedCalendarPropIds[prop.id] && (
                            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]/65 p-3">
                              <PropertyAvailabilityCalendar
                                occupiedRanges={
                                  occupiedRangesByProperty[prop.id] ?? []
                                }
                                todayYmd={todayYmd}
                                variant="compact"
                                readOnly
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
