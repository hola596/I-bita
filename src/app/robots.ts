import type { MetadataRoute } from "next";
import { env } from "@/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/p/", "/contacto", "/legal/"],
        disallow: [
          "/admin",
          "/api",
          "/perfil",
          "/dashboard",
          "/mensajes",
          "/checkout",
          "/checkin",
          "/contratos",
          "/onboarding",
          "/verify",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
