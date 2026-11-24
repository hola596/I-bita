/**
 * Componente condicional para exhibir el Data Fiscal de ARCA (ex AFIP) — Formulario 960/D.
 * Lee `NEXT_PUBLIC_DATA_FISCAL_URL` y `NEXT_PUBLIC_DATA_FISCAL_QR_IMG`.
 * Si alguna no está configurada todavía, no renderiza contenido roto.
 */
export function DataFiscalBadge() {
  const fiscalUrl = process.env.NEXT_PUBLIC_DATA_FISCAL_URL?.trim();
  const qrImgUrl = process.env.NEXT_PUBLIC_DATA_FISCAL_QR_IMG?.trim();

  if (!fiscalUrl || !qrImgUrl) {
    return null;
  }

  return (
    <a
      href={fiscalUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Data Fiscal ARCA — Formulario 960/D"
      className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-primary)] px-2.5 py-1.5 shadow-xs hover:border-[var(--brand-primary)] transition-colors"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={qrImgUrl}
        alt="Código QR Data Fiscal ARCA Formulario 960/D"
        width={40}
        height={54}
        loading="lazy"
        className="h-12 w-auto rounded-xs bg-white"
      />
      <span className="text-[10px] font-extrabold leading-tight text-[var(--text-secondary)]">
        Data Fiscal
        <br />
        ARCA · 960/D
      </span>
    </a>
  );
}
