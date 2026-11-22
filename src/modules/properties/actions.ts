"use server";

import "server-only";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptAccessCode } from "@/lib/crypto/aes-gcm";
import { AppError, type ActionResult } from "@/lib/errors/app-error";
import {
  CreatePropertySchema,
  UpdatePropertySchema,
  validatePhotoUpload,
  ALLOWED_IMAGE_MIME_TYPES,
  type AllowedImageMimeType,
  type CreatePropertyInput,
  type UpdatePropertyInput,
  type PropertyImageItem,
} from "./validators";
import { DEFAULT_MID_TERM_POLICY } from "./mid-term-policy";
import {
  PUBLIC_PROPERTY_COLUMNS,
  PUBLIC_CONSORTIUM_COLUMNS,
  sanitizePublicPropertyRow,
  sanitizePublicConsortiumConfig,
  type PublicConsortiumConfig,
  type SafePropertyRecord,
} from "./queries";

const STORAGE_BUCKET_NAME = "property-photos";

/**
 * Crea una nueva Unidad Funcional generando `propertyId = crypto.randomUUID()` en servidor,
 * cifrando inmediatamente el PIN de acceso con `AES-256-GCM` (`propertyId` como AAD)
 * e insertando en `public.properties` respetando RLS (`auth.uid() = host_id`).
 */
export async function createPropertyAction(
  rawInput: CreatePropertyInput
): Promise<ActionResult<SafePropertyRecord>> {
  const parsed = CreatePropertySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para el alta de Unidad Funcional",
        details: parsed.error.flatten(),
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message:
          "Debés iniciar sesión como Anfitrión para dar de alta una Unidad Funcional.",
      },
    };
  }

  // Garantizar que el perfil esté aprobado como Anfitrión antes del INSERT
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, role, host_approval_status")
    .eq("id", user.id)
    .maybeSingle();

  const isApprovedHost =
    existingProfile?.role === "SUPERADMIN" ||
    existingProfile?.host_approval_status === "APPROVED";

  if (!isApprovedHost) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message:
          "Tu perfil de anfitrión todavía necesita aprobación antes de publicar propiedades.",
      },
    };
  }

  // Generar UUID en el servidor y cifrar el PIN con AES-256-GCM vinculando propertyId como AAD
  const propertyId = crypto.randomUUID();
  let encryptedPin;
  try {
    encryptedPin = encryptAccessCode(parsed.data.accessCodePlain, propertyId);
  } catch (cryptoErr) {
    const appErr =
      cryptoErr instanceof AppError
        ? cryptoErr
        : new AppError(
            "CRYPTO_INTEGRITY_ERROR",
            "Fallo al cifrar el código de cerradura con AES-256-GCM",
            500
          );
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
      },
    };
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from("properties")
    .insert({
      id: propertyId,
      host_id: user.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description,
      corridor: parsed.data.corridor,
      address_line: parsed.data.address_line,
      unit_identifier: parsed.data.unit_identifier,
      max_adults: parsed.data.max_adults,
      base_currency: parsed.data.base_currency,
      nightly_rate: parsed.data.nightly_rate,
      monthly_discount_pct: parsed.data.monthly_discount_pct,
      absorb_installments_cost: parsed.data.absorb_installments_cost,
      accepts_usdt: parsed.data.accepts_usdt,
      wifi_speed_mbps: parsed.data.wifi_speed_mbps,
      images: parsed.data.images,
      access_code_ciphertext: encryptedPin.ciphertext,
      access_code_iv: encryptedPin.iv,
      access_code_auth_tag: encryptedPin.authTag,
      mid_term_policy: parsed.data.midTermPolicy ?? DEFAULT_MID_TERM_POLICY,
      is_published: parsed.data.is_published,
    })
    .select(PUBLIC_PROPERTY_COLUMNS)
    .single();

  if (insertError || !insertedRow) {
    const isDuplicateSlug =
      insertError?.code === "23505" ||
      insertError?.message?.toLowerCase().includes("slug");
    return {
      ok: false,
      error: {
        code: isDuplicateSlug ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
        message: isDuplicateSlug
          ? `El slug "${parsed.data.slug}" ya está en uso. Elegí otro identificador URL-safe.`
          : insertError?.message ?? "No se pudo guardar la Unidad Funcional",
      },
    };
  }

  revalidatePath("/dashboard/propiedades");
  revalidatePath(`/p/${parsed.data.slug}`);

  return {
    ok: true,
    data: sanitizePublicPropertyRow(
      insertedRow as unknown as Record<string, unknown>
    ),
  };
}

/**
 * Actualiza una Unidad Funcional perteneciente al Anfitrión autenticado.
 * Si se provee un nuevo `accessCodePlain`, vuelve a cifrarlo en servidor con `AES-256-GCM`
 * vinculando el `id` de la propiedad como AAD.
 */
export async function updatePropertyAction(
  rawInput: UpdatePropertyInput
): Promise<ActionResult<SafePropertyRecord>> {
  const parsed = UpdatePropertySchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message:
          parsed.error.issues[0]?.message ??
          "Datos inválidos para actualizar la Unidad Funcional",
        details: parsed.error.flatten(),
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Debés iniciar sesión como Anfitrión para editar la propiedad.",
      },
    };
  }

  const { id, accessCodePlain, midTermPolicy, ...restFields } = parsed.data;
  const updatePayload: Record<string, unknown> = {
    ...restFields,
    updated_at: new Date().toISOString(),
  };

  if (midTermPolicy !== undefined) {
    updatePayload.mid_term_policy = midTermPolicy;
  }

  if (accessCodePlain && accessCodePlain.trim().length >= 4) {
    const encryptedPin = encryptAccessCode(accessCodePlain.trim(), id);
    updatePayload.access_code_ciphertext = encryptedPin.ciphertext;
    updatePayload.access_code_iv = encryptedPin.iv;
    updatePayload.access_code_auth_tag = encryptedPin.authTag;
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("properties")
    .update(updatePayload)
    .eq("id", id)
    .eq("host_id", user.id)
    .select(PUBLIC_PROPERTY_COLUMNS)
    .single();

  if (updateError || !updatedRow) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          updateError?.message ??
          "No se pudo actualizar la Unidad Funcional o no tenés permisos sobre ella.",
      },
    };
  }

  revalidatePath("/dashboard/propiedades");
  revalidatePath(`/p/${updatedRow.slug}`);

  return {
    ok: true,
    data: sanitizePublicPropertyRow(
      updatedRow as unknown as Record<string, unknown>
    ),
  };
}

/**
 * Lista todas las Unidades Funcionales del Anfitrión autenticado excluyendo siempre
 * `access_code_ciphertext`, `access_code_iv` y `access_code_auth_tag`.
 */
export async function listHostPropertiesAction(): Promise<
  ActionResult<SafePropertyRecord[]>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Sesión no iniciada.",
      },
    };
  }

  const { data, error } = await supabase
    .from("properties")
    .select(PUBLIC_PROPERTY_COLUMNS)
    .eq("host_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: error.message,
      },
    };
  }

  const propertyIds = (data ?? []).map((row) => String(row.id));
  const consortiumByPropId = new Map<string, PublicConsortiumConfig>();

  if (propertyIds.length > 0) {
    const { data: consortiumRows } = await supabase
      .from("consortium_configs")
      .select(PUBLIC_CONSORTIUM_COLUMNS)
      .in("property_id", propertyIds)
      .eq("active", true);

    for (const cRow of consortiumRows ?? []) {
      const cleanConfig = sanitizePublicConsortiumConfig(
        cRow as unknown as Record<string, unknown>
      );
      if (cleanConfig) {
        consortiumByPropId.set(cleanConfig.property_id, cleanConfig);
      }
    }
  }

  const rows = (data ?? []).map((row) =>
    sanitizePublicPropertyRow(
      row as unknown as Record<string, unknown>,
      consortiumByPropId.get(String(row.id)) ?? null
    )
  );

  return {
    ok: true,
    data: rows,
  };
}

/**
 * Valida en el servidor el formato MIME (`image/webp`, `image/avif`, `image/jpeg`, `image/png`),
 * el tamaño máximo (`<= 5 MB`) y las dimensiones explícitas (`CLS = 0`), subiendo la fotografía
 * optimizada a Supabase Storage (`property-photos`).
 */
export async function uploadPropertyPhotoAction(
  formData: FormData
): Promise<ActionResult<PropertyImageItem>> {
  const fileEntry = formData.get("file");
  const altEntry = String(formData.get("alt") ?? "Fotografía de Unidad Funcional").trim();
  const widthEntry = Number(formData.get("width") ?? 1200);
  const heightEntry = Number(formData.get("height") ?? 900);

  if (!(fileEntry instanceof File)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "No se recibió un archivo de imagen válido.",
      },
    };
  }

  let validatedMeta;
  try {
    validatedMeta = validatePhotoUpload({
      fileName: fileEntry.name,
      mimeType: fileEntry.type as AllowedImageMimeType,
      sizeBytes: fileEntry.size,
      width: Number.isFinite(widthEntry) && widthEntry >= 400 ? Math.round(widthEntry) : 1200,
      height: Number.isFinite(heightEntry) && heightEntry >= 300 ? Math.round(heightEntry) : 900,
    });
  } catch (err) {
    const appErr =
      err instanceof AppError
        ? err
        : new AppError("VALIDATION_ERROR", "Formato o tamaño de imagen inválido", 422);
    return {
      ok: false,
      error: {
        code: appErr.code,
        message: appErr.message,
        details: appErr.details,
      },
    };
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(validatedMeta.mimeType)) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Formato de imagen no permitido. Solo se aceptan WebP, AVIF, JPEG o PNG.",
      },
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ownerPrefix = user?.id ?? "public-host";
  const ext = validatedMeta.fileName.split(".").pop()?.toLowerCase() ?? "webp";
  const storagePath = `${ownerPrefix}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const arrayBuffer = await fileEntry.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const adminClient = createSupabaseAdminClient();
  let publicUrl = "";

  try {
    const { data: buckets } = await adminClient.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === STORAGE_BUCKET_NAME);
    if (!bucketExists) {
      await adminClient.storage.createBucket(STORAGE_BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
      });
    }

    const { error: uploadError } = await adminClient.storage
      .from(STORAGE_BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: validatedMeta.mimeType,
        upsert: false,
      });

    if (!uploadError) {
      const { data } = adminClient.storage
        .from(STORAGE_BUCKET_NAME)
        .getPublicUrl(storagePath);
      publicUrl = data.publicUrl;
    }
  } catch {
    // Fallback abajo si el bucket aún no admite service key actual
  }

  if (!publicUrl) {
    publicUrl = `data:${validatedMeta.mimeType};base64,${fileBuffer.toString("base64")}`;
  }

  return {
    ok: true,
    data: {
      url: publicUrl,
      alt: altEntry.length >= 3 ? altEntry.slice(0, 180) : "Vista de la Unidad Funcional",
      width: validatedMeta.width,
      height: validatedMeta.height,
      mimeType: validatedMeta.mimeType,
      sizeBytes: validatedMeta.sizeBytes,
    },
  };
}
