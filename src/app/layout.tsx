import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { env } from "@/env";
import { CookieConsentBanner } from "@/components/layout/CookieConsentBanner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: "I-bita | Alquileres Temporarios y Media Estadía en Argentina (ARS, Cuotas y USDT)",
    template: "%s | I-bita Argentina",
  },
  description:
    "El ecosistema argentino de alquileres temporarios y de media estadía (1 a 6 meses). Pagá en Pesos Argentinos (Mercado Pago, MODO, 3 y 6 cuotas sin percepciones) o USDT, con Pre-Check-in Biométrico Consorcio Friendly y Contratos Digitales CCyC Art. 1199.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: env.NEXT_PUBLIC_APP_URL,
    siteName: "I-bita Argentina",
    title: "I-bita | El Airbnb Argentino Bi-Monetario y Consorcio Friendly",
    description:
      "Alojamientos verificados por día y por mes (1 a 6 meses). Cobros en ARS en cuotas o USDT en Polygon, Pase Digital de Portería con QR y Contratos CCyC sellados con SHA-256.",
  },
};

const jsonLdSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${env.NEXT_PUBLIC_APP_URL}/#organization`,
      name: "I-bita Argentina",
      url: env.NEXT_PUBLIC_APP_URL,
      description:
        "Plataforma Fintech + PropTech + Travel de alquileres temporarios y de media estadía (1 a 6 meses) en Argentina con pagos bi-monetarios (ARS en cuotas / USDT), módulo Consorcio Friendly con validación biométrica y contratos temporarios CCyC Art. 1199.",
      areaServed: {
        "@type": "Country",
        name: "Argentina",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${env.NEXT_PUBLIC_APP_URL}/#website`,
      url: env.NEXT_PUBLIC_APP_URL,
      name: "I-bita",
      inLanguage: "es-AR",
      publisher: {
        "@id": `${env.NEXT_PUBLIC_APP_URL}/#organization`,
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" className={jakarta.variable}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <a href="#main-content" className="skip-to-content">
          Saltar al contenido principal
        </a>

        {/* Header Sticky inspirado en Airbnb Argentina con Search Pill y Toggle ARS / USDT */}
        <header
          role="banner"
          className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/95 backdrop-blur-md"
        >
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
            <a
              href="/"
              className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)] rounded-lg px-1"
              aria-label="I-bita Inicio"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--brand-primary)] text-white font-black">
                I
              </span>
              <span>i-bita</span>
              <span className="hidden sm:inline-block rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                .ar
              </span>
            </a>

            {/* Search Pill Central estilo Airbnb Argentina */}
            <nav
              aria-label="Buscador rápido de estadías"
              className="hidden md:flex items-center divide-x divide-[var(--border-subtle)] rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-4 py-2 shadow-sm hover:shadow-md transition-shadow"
            >
              <span className="pr-4 text-sm font-semibold">
                Corredores Argentina
              </span>
              <span className="px-4 text-sm font-semibold text-[var(--brand-primary)]">
                Por Día · Media Estadía (1–6m)
              </span>
              <span className="pl-4 text-sm text-[var(--text-secondary)]">
                Consorcio Friendly
              </span>
            </nav>

            {/* Toggle Global Persistente de Moneda ARS / USDT y Accesos */}
            <div className="flex items-center gap-3">
              <div
                role="group"
                aria-label="Selector de moneda de visualización"
                className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-1 text-xs font-bold"
              >
                <span className="rounded-full bg-[var(--bg-primary)] px-2.5 py-1 text-[var(--text-primary)] shadow-xs">
                  ARS $ (Cuotas)
                </span>
                <span className="px-2.5 py-1 text-[var(--text-secondary)]">
                  USDT ₮ (Polygon)
                </span>
              </div>
              <a
                href="/onboarding/anfitrion"
                className="hidden sm:inline-flex items-center rounded-full border border-[var(--border-subtle)] px-3.5 py-1.5 text-xs font-bold hover:bg-[var(--bg-secondary)]"
              >
                Modo Anfitrión
              </a>
              <a
                href="/login"
                className="inline-flex items-center rounded-full bg-[var(--brand-primary)] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[var(--brand-primary-hover)]"
              >
                Ingresar
              </a>
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1">
          {children}
        </main>

        <footer
          role="contentinfo"
          className="border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] py-8 text-sm text-[var(--text-secondary)]"
        >
          <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <p className="font-medium">
              © {new Date().getFullYear()} I-bita Argentina — Alquileres Temporarios y Media Estadía (CCyC Art. 1199 · Ley 25.326).
            </p>
            <div className="flex flex-wrap items-center gap-4 font-semibold">
              <a href="/legal/privacidad" className="hover:underline">
                Privacidad Biométrica
              </a>
              <a href="/legal/terminos" className="hover:underline">
                Términos CCyC
              </a>
              <a href="/contacto" className="hover:underline">
                Contacto Seguro
              </a>
              <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs">
                ✓ Zero-Trust Consorcial Activo
              </span>
            </div>
          </div>
        </footer>
        <CookieConsentBanner />
      </body>
    </html>
  );
}
