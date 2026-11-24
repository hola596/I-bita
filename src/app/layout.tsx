import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { env } from "@/env";
import { PreferencesProvider } from "@/components/providers/PreferencesProvider";
import { TopProgressBar } from "@/components/layout/TopProgressBar";
import { AppHeader } from "@/components/layout/AppHeader";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { NavigationWayfinder } from "@/components/layout/NavigationWayfinder";
import { CookieConsentBanner } from "@/components/layout/CookieConsentBanner";
import { DataFiscalBadge } from "@/components/layout/DataFiscalBadge";
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
    default:
      "I-bita | Alojamientos en Argentina con precio claro en pesos o USDT",
    template: "%s | I-bita Argentina",
  },
  description:
    "Plataforma tecnológica de publicación, calendario e ingreso ordenado para alquileres temporarios en Argentina. Los contratos se celebran directamente entre Anfitrión y Huésped.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: env.NEXT_PUBLIC_APP_URL,
    siteName: "I-bita Argentina",
    title: "I-bita | Plataforma tecnológica de alquileres en Argentina",
    description:
      "Publicación, calendario e ingreso ordenado en portería para alquileres temporarios en Argentina (1 día a 6 meses). I-bita no actúa como inmobiliaria.",
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
        "Plataforma tecnológica de software, calendario y publicación para alquileres temporarios en Argentina. No actúa como inmobiliaria ni corredor inmobiliario.",
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

const ANTI_FOUC_SCRIPT = `(function(){try{var t=localStorage.getItem('ibita_theme_v1');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;var r=localStorage.getItem('ibita_reading_size_v1');if(r==='comfortable'){document.documentElement.dataset.readingSize='comfortable';}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ANTI_FOUC_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdSchema) }}
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <a href="#main-content" className="skip-to-content">
          Saltar al contenido principal
        </a>

        <PreferencesProvider>
          <TopProgressBar />
          <AppHeader />
          <NavigationWayfinder />

          <main id="main-content" className="flex-1">
            {children}
          </main>

          <footer
            role="contentinfo"
            className="border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] pt-10 pb-28 lg:py-10 text-sm text-[var(--text-secondary)]"
          >
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-5">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-5 text-center lg:text-left">
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--text-primary)]">
                    © {new Date().getFullYear()} I-bita Argentina · Plataforma
                    tecnológica de software, calendario y publicación.
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Los acuerdos de locación se celebran directa y exclusivamente
                    entre Anfitrión y Huésped. I-bita no ejerce corretaje
                    inmobiliario (Ley 20.266 / Ley 2340).
                  </p>
                </div>

                <nav
                  aria-label="Enlaces legales, arrepentimiento y ayuda"
                  className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 font-semibold"
                >
                  <Link
                    href="/legal/arrepentimiento"
                    className="inline-flex min-h-[36px] items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs font-extrabold text-[var(--text-primary)] hover:border-[var(--brand-primary)] transition-colors"
                  >
                    Botón de Arrepentimiento
                  </Link>
                  <Link
                    href="/legal/baja"
                    className="inline-flex min-h-[36px] items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs font-extrabold text-[var(--text-primary)] hover:border-[var(--brand-primary)] transition-colors"
                  >
                    Botón de Baja
                  </Link>
                  <Link href="/legal/privacidad" className="hover:underline">
                    Privacidad
                  </Link>
                  <Link href="/legal/terminos" className="hover:underline">
                    Términos claros
                  </Link>
                  <Link href="/contacto" className="hover:underline">
                    ¿Necesitás ayuda?
                  </Link>
                  <span
                    title="Control de identidad previa (eKYC) y pase digital de portería declarado por el anfitrión para edificios adheridos."
                    className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold"
                  >
                    Ingreso ordenado en portería
                  </span>
                  <DataFiscalBadge />
                </nav>
              </div>
            </div>
          </footer>

          <MobileBottomNav />
          <CookieConsentBanner />
        </PreferencesProvider>
      </body>
    </html>
  );
}
