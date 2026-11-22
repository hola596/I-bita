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
    "Alquilá en Argentina por día o por mes con tranquilidad: precio claro en pesos o USDT, ingreso amigable para el edificio y contrato digital simple.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: env.NEXT_PUBLIC_APP_URL,
    siteName: "I-bita Argentina",
    title: "I-bita | Alojamientos claros y tranquilos en Argentina",
    description:
      "Alojamientos verificados por día o de 1 a 6 meses. Pagá en pesos en cuotas o USDT, con ingreso ordenado y contrato claro.",
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
        "Plataforma de alquileres temporarios y media estadía en Argentina con precios claros en pesos o USDT, ingreso ordenado para consorcios y acuerdos digitales simples.",
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
            className="border-t border-[var(--border-subtle)] bg-[var(--bg-secondary)] pt-8 pb-24 lg:py-8 text-sm text-[var(--text-secondary)]"
          >
            <div className="mx-auto flex max-w-7xl flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 text-center sm:text-left">
              <p className="font-semibold text-[var(--text-primary)]">
                © {new Date().getFullYear()} I-bita Argentina · Alquileres claros,
                previsibles y seguros.
              </p>
              <nav
                aria-label="Enlaces legales y ayuda"
                className="flex flex-wrap items-center justify-center gap-4 font-semibold"
              >
                <Link href="/legal/privacidad" className="hover:underline">
                  Privacidad
                </Link>
                <Link href="/legal/terminos" className="hover:underline">
                  Términos claros
                </Link>
                <Link href="/contacto" className="hover:underline">
                  ¿Necesitás ayuda?
                </Link>
                <span className="badge-consorcio-friendly rounded-full px-3 py-1 text-xs font-bold">
                  ✓ Edificio protegido
                </span>
              </nav>
            </div>
          </footer>

          <MobileBottomNav />
          <CookieConsentBanner />
        </PreferencesProvider>
      </body>
    </html>
  );
}
