import { calculateStayPricing } from "@/lib/math/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPublicProperties } from "@/modules/properties/queries";
import {
  isCryptoPaymentsEnabled,
  isDemoOrUnsplashProperty,
} from "@/lib/compliance/feature-flags";
import { HomeExperienceClient } from "@/components/home/HomeExperienceClient";

export const dynamic = "force-dynamic";

export interface PublicHomePropertySummary {
  id: string;
  slug: string;
  title: string;
  corridor: string;
  jurisdiccion: string;
  numeroRegistroTuristico: string | null;
  addressLine: string;
  unitIdentifier: string;
  maxAdults: number;
  nightlyRate: number;
  baseCurrency: "ARS" | "USD" | "USDT";
  monthlyDiscountPct: number;
  wifiSpeedMbps: number | null;
  acceptsUsdt: boolean;
  coverUrl: string;
  coverAlt: string;
  imageCount: number;
  isConsortiumFriendly: boolean;
  requiresInterview: boolean;
  isDemoProperty: boolean;
}

const DEFAULT_HOME_COVER_URL =
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&q=80&fm=webp";

export default async function HomePage() {
  const shortStayArs = calculateStayPricing({
    nightlyRate: 65000,
    nights: 5,
    microCanonPct: 1.5,
    baseCurrency: "ARS",
    paymentCurrency: "ARS",
  });

  const shortStayUsdt = calculateStayPricing({
    nightlyRate: 65000,
    nights: 5,
    microCanonPct: 1.5,
    baseCurrency: "ARS",
    paymentCurrency: "USDT",
  });

  const midTermArs = calculateStayPricing({
    nightlyRate: 65000,
    nights: 60,
    monthlyDiscountPct: 20,
    microCanonPct: 1.5,
    baseCurrency: "ARS",
    paymentCurrency: "ARS",
  });

  const midTermUsdt = calculateStayPricing({
    nightlyRate: 65000,
    nights: 60,
    monthlyDiscountPct: 20,
    microCanonPct: 1.5,
    baseCurrency: "ARS",
    paymentCurrency: "USDT",
  });

  let userFirstName: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      const rawName =
        profile?.full_name?.trim() ||
        user.email?.split("@")[0]?.trim() ||
        "";
      if (rawName) {
        userFirstName = rawName.split(/\s+/)[0] ?? rawName;
      }
    }
  } catch {
    userFirstName = null;
  }

  const cryptoEnabled = isCryptoPaymentsEnabled();
  let availableProperties: PublicHomePropertySummary[] = [];
  try {
    const publicProps = await listPublicProperties();
    availableProperties = publicProps.slice(0, 12).map((p) => {
      const coverUrl = p.images[0]?.url ?? DEFAULT_HOME_COVER_URL;
      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        corridor: p.corridor,
        jurisdiccion: p.jurisdiccion,
        numeroRegistroTuristico: p.numero_registro_turistico,
        addressLine: p.address_line,
        unitIdentifier: p.unit_identifier,
        maxAdults: p.max_adults,
        nightlyRate: p.nightly_rate,
        baseCurrency: p.base_currency,
        monthlyDiscountPct: p.monthly_discount_pct,
        wifiSpeedMbps: p.wifi_speed_mbps,
        acceptsUsdt: cryptoEnabled && p.accepts_usdt,
        coverUrl,
        coverAlt: p.images[0]?.alt ?? p.title,
        imageCount: Math.max(1, p.images.length),
        isConsortiumFriendly: Boolean(p.consortium_config?.active),
        requiresInterview:
          p.mid_term_policy?.approvalMode === "HOST_APPROVAL_INTERVIEW",
        isDemoProperty: isDemoOrUnsplashProperty({
          id: p.id,
          slug: p.slug,
          images: p.images,
          coverUrl,
        }),
      };
    });
  } catch {
    availableProperties = [];
  }

  return (
    <HomeExperienceClient
      shortStayArs={shortStayArs}
      shortStayUsdt={shortStayUsdt}
      midTermArs={midTermArs}
      midTermUsdt={midTermUsdt}
      availableProperties={availableProperties}
      userFirstName={userFirstName}
      showDemoWalkthrough={process.env.NODE_ENV !== "production"}
    />
  );
}
