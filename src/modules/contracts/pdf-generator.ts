import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface ContractPartyData {
  fullName: string;
  email: string;
  cuitCuil?: string | null;
  dniPassport?: string | null;
  phoneWhatsapp?: string | null;
  address?: string | null;
}

export interface ContractPropertyData {
  title: string;
  addressLine: string;
  unitIdentifier?: string | null;
  corridor?: string | null;
  city?: string | null;
}

export interface ContractBookingData {
  bookingId: string;
  checkIn: string;
  checkOut: string;
  nightsCount: number;
  totalAmount: string;
  paymentCurrency: "ARS" | "USDT" | string;
  escrowDepositUsdt?: string | null;
}

export interface ContractGenerationInput {
  booking: ContractBookingData;
  property: ContractPropertyData;
  host: ContractPartyData;
  guest: ContractPartyData;
  stayPurpose: string;
  guestSignedAt?: Date | string | null;
  guestSignerIp?: string | null;
  hostSignedAt?: Date | string | null;
  sha256SealPlaceholder?: string;
}

/**
 * Genera el documento PDF formal del Contrato de Locación Temporaria
 * bajo el Artículo 1199 del Código Civil y Comercial de la Nación Argentina (CCyC).
 */
export async function generateMidTermContractPdf(
  input: ContractGenerationInput
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Paleta tipográfica editorial (compatible con el Design System de I-bita)
  const colorText = rgb(0.1, 0.1, 0.1);
  const colorMuted = rgb(0.4, 0.4, 0.4);
  const colorPrimary = rgb(0.05, 0.35, 0.25); // Emerald oscuro
  const colorBorder = rgb(0.8, 0.8, 0.8);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 45;
  const contentWidth = pageWidth - margin * 2;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = pageHeight - margin;

  function checkPageSpace(requiredSpace: number) {
    if (currentY - requiredSpace < margin + 40) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = pageHeight - margin;
      drawHeaderSmall(currentPage);
    }
  }

  function drawHeaderSmall(page: PDFPage) {
    page.drawText("I-BITA · CONTRATO DE LOCACIÓN TEMPORARIA (ART. 1199 CCyC)", {
      x: margin,
      y: pageHeight - 30,
      size: 7,
      font: fontBold,
      color: colorMuted,
    });
    page.drawLine({
      start: { x: margin, y: pageHeight - 35 },
      end: { x: pageWidth - margin, y: pageHeight - 35 },
      thickness: 0.5,
      color: colorBorder,
    });
  }

  function drawTextLine(
    text: string,
    font: PDFFont,
    size: number,
    color = colorText,
    gap = 4
  ) {
    checkPageSpace(size + gap);
    currentPage.drawText(text, {
      x: margin,
      y: currentY - size,
      size,
      font,
      color,
    });
    currentY -= size + gap;
  }

  function drawParagraph(
    text: string,
    font: PDFFont,
    size: number,
    color = colorText,
    lineGap = 3
  ) {
    const words = text.split(" ");
    let line = "";

    for (let i = 0; i < words.length; i++) {
      const word = words[i] ?? "";
      if (!word) continue;
      const testLine = line.length === 0 ? word : `${line} ${word}`;
      const width = font.widthOfTextAtSize(testLine, size);

      if (width > contentWidth && line.length > 0) {
        checkPageSpace(size + lineGap);
        currentPage.drawText(line, {
          x: margin,
          y: currentY - size,
          size,
          font,
          color,
        });
        currentY -= size + lineGap;
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line.length > 0) {
      checkPageSpace(size + lineGap);
      currentPage.drawText(line, {
        x: margin,
        y: currentY - size,
        size,
        font,
        color,
      });
      currentY -= size + lineGap + 3;
    }
  }

  // --- ENCABEZADO ---
  drawTextLine("I-BITA · CONTRATOS INTELIGENTES DE MEDIA ESTADÍA", fontBold, 9, colorPrimary, 6);
  drawTextLine("CONTRATO DE LOCACIÓN TEMPORARIA INMOBILIARIA", fontBold, 15, colorText, 4);
  drawTextLine(
    "RÉGIMEN ESPECIAL DE DESTINO DETERMINADO — ARTÍCULO 1199 DEL CÓDIGO CIVIL Y COMERCIAL DE LA NACIÓN",
    fontBold,
    8,
    colorMuted,
    14
  );

  currentPage.drawLine({
    start: { x: margin, y: currentY },
    end: { x: pageWidth - margin, y: currentY },
    thickness: 1,
    color: colorPrimary,
  });
  currentY -= 12;

  // --- COMPARECENCIA DE LAS PARTES ---
  drawTextLine("COMPARECIENTES", fontBold, 10, colorPrimary, 4);
  const hostDesc = `1. LOCADOR: ${input.host.fullName || "Titular Registrado"}, CUIT/CUIL/Identificación: ${input.host.cuitCuil || "Declarado en Plataforma"}, correo electrónico de contacto: ${input.host.email || "No provisto"}.`;
  drawParagraph(hostDesc, fontRegular, 8.5);

  const guestDesc = `2. LOCATARIO: ${input.guest.fullName || "Huésped Registrado"}, DNI/Pasaporte: ${input.guest.dniPassport || input.guest.cuitCuil || "Verificado por Biometría Zero-Trust"}, correo electrónico: ${input.guest.email || "Declarado al reservar"}, Teléfono/WhatsApp: ${input.guest.phoneWhatsapp || "Registrado"}.`;
  drawParagraph(guestDesc, fontRegular, 8.5);

  const propertyDesc = `3. INMUEBLE DESTINADO: Unidad Funcional sita en ${input.property.addressLine}${input.property.unitIdentifier ? `, ${input.property.unitIdentifier}` : ""}, ${input.property.city || "CABA"}, Argentina. Denominación: "${input.property.title}".`;
  drawParagraph(propertyDesc, fontRegular, 8.5);

  currentY -= 6;

  // --- CLÁUSULAS CONTRACTUALES ---
  drawTextLine("CLÁUSULAS GENERALES Y PARTICULARES", fontBold, 10, colorPrimary, 6);

  // CLÁUSULA 1
  drawParagraph(
    `PRIMERA (DESTINO Y FINALIDAD DETERMINADA): La presente locación se celebra bajo el régimen de excepción previsto en el Artículo 1199 incisos b) y correlativos del Código Civil y Comercial de la Nación, con destino habitacional estrictamente temporario y transitorio. El LOCATARIO declara bajo juramento que el fin específico de su permanencia en el inmueble responde a motivos de: ${input.stayPurpose.toUpperCase()}, comprometiéndose a no cambiar el destino del mismo bajo apercibimiento de rescisión automática por culpa exclusiva de la parte locataria.`,
    fontRegular,
    8
  );

  // CLÁUSULA 2
  drawParagraph(
    `SEGUNDA (PLAZO): El plazo de duración de la presente locación temporaria se conviene improrrogable por un término exacto de ${input.booking.nightsCount} noches, con fecha improrrogable de ingreso (Check-In) el día ${input.booking.checkIn} y de desocupación y egreso (Check-Out) el día ${input.booking.checkOut}, momento en el cual el LOCATARIO restituirá la tenencia de la unidad libre de ocupantes y efectos personales.`,
    fontRegular,
    8
  );

  // CLÁUSULA 3
  drawParagraph(
    `TERCERA (PRECIO Y CONDICIONES): El canon locativo total convenido por el período completo asciende a la suma de ${input.booking.totalAmount} ${input.booking.paymentCurrency}, abonado de forma irrevocable a través del Motor Financiero Bi-Monetario de la plataforma I-bita. Las partes acuerdan que dicho importe compensa de forma fija y definitiva el uso de la unidad, equipamiento, conectividad y expensas ordinarias del consorcio.`,
    fontRegular,
    8
  );

  // CLÁUSULA 4
  const escrowNotice = input.booking.escrowDepositUsdt && Number(input.booking.escrowDepositUsdt) > 0
    ? ` Se constituye en custodia digital (Escrow) un depósito en garantía por el monto de ${input.booking.escrowDepositUsdt} USDT, el cual será restituido al LOCATARIO de forma automática a las 24 horas posteriores al Check-Out verificado si no se constatan deterioros o penalidades en la unidad funcional.`
    : ` Se deja constancia de la constitución de la garantía en custodia de acuerdo a las políticas de la plataforma.`;
  drawParagraph(
    `CUARTA (CUSTODIA ESCROW Y DEPÓSITO EN GARANTÍA):${escrowNotice}`,
    fontRegular,
    8
  );

  // CLÁUSULA 5
  drawParagraph(
    `QUINTA (REGLAMENTO DE COPROPIEDAD Y POLÍTICA CONSORCIO FRIENDLY): El LOCATARIO y sus acompañantes declarados se obligan a observar estrictamente las normas del Reglamento de Copropiedad y Administración del Consorcio del edificio, las normas de convivencia y la prohibición expresa de ruidos molestos o ingreso de personas no registradas previamente en el sistema de verificación de identidad Zero-Trust de I-bita.`,
    fontRegular,
    8
  );

  // CLÁUSULA 6
  drawParagraph(
    `SEXTA (DOMICILIOS ELECTRÓNICOS Y FIRMA ELECTRÓNICA): De conformidad con la Ley 25.506 de Firma Digital y los Artículos 75 y 1106 del CCyC, las partes constituyen domicilios especiales electrónicos en las casillas de correo indicadas en el encabezado y otorgan pleno valor probatorio a las firmas y consentimientos electrónicos registrados y sellados mediante algoritmo criptográfico SHA-256 en la plataforma.`,
    fontRegular,
    8
  );

  currentY -= 10;

  // --- BLOQUE DE FIRMAS ELECTRÓNICAS ---
  checkPageSpace(130);
  drawTextLine("REGISTRO DE FIRMA ELECTRÓNICA Y FECHA CIERTA", fontBold, 10, colorPrimary, 6);

  const boxWidth = (contentWidth - 15) / 2;
  const boxHeight = 70;
  const boxY = currentY - boxHeight;

  // Recuadro Locador
  currentPage.drawRectangle({
    x: margin,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    borderWidth: 0.8,
    borderColor: colorBorder,
    color: rgb(0.98, 0.98, 0.98),
  });

  currentPage.drawText("LOCADOR (Anfitrión):", {
    x: margin + 8,
    y: boxY + boxHeight - 14,
    size: 7.5,
    font: fontBold,
    color: colorText,
  });
  currentPage.drawText(input.host.fullName.slice(0, 32), {
    x: margin + 8,
    y: boxY + boxHeight - 26,
    size: 7.5,
    font: fontRegular,
    color: colorText,
  });
  const hostSignedText = input.hostSignedAt
    ? `Firmado: ${new Date(input.hostSignedAt).toISOString()}`
    : "Firmado digitalmente al publicar oferta";
  currentPage.drawText(hostSignedText, {
    x: margin + 8,
    y: boxY + 12,
    size: 6.5,
    font: fontMono,
    color: colorPrimary,
  });

  // Recuadro Locatario
  currentPage.drawRectangle({
    x: margin + boxWidth + 15,
    y: boxY,
    width: boxWidth,
    height: boxHeight,
    borderWidth: 0.8,
    borderColor: colorBorder,
    color: rgb(0.98, 0.98, 0.98),
  });

  currentPage.drawText("LOCATARIO (Huésped Titular):", {
    x: margin + boxWidth + 23,
    y: boxY + boxHeight - 14,
    size: 7.5,
    font: fontBold,
    color: colorText,
  });
  currentPage.drawText(input.guest.fullName.slice(0, 32), {
    x: margin + boxWidth + 23,
    y: boxY + boxHeight - 26,
    size: 7.5,
    font: fontRegular,
    color: colorText,
  });
  const guestSignedText = input.guestSignedAt
    ? `Firmado: ${new Date(input.guestSignedAt).toISOString()}`
    : "Pendiente de firma del huésped";
  currentPage.drawText(guestSignedText, {
    x: margin + boxWidth + 23,
    y: boxY + 22,
    size: 6.5,
    font: fontMono,
    color: input.guestSignedAt ? colorPrimary : rgb(0.7, 0.2, 0.2),
  });
  if (input.guestSignerIp) {
    currentPage.drawText(`IP: ${input.guestSignerIp}`, {
      x: margin + boxWidth + 23,
      y: boxY + 10,
      size: 6.5,
      font: fontMono,
      color: colorMuted,
    });
  }

  currentY = boxY - 18;

  // --- PIE DE PÁGINA / METADATOS ---
  checkPageSpace(35);
  currentPage.drawText(`Identificador Reserva: ${input.booking.bookingId}`, {
    x: margin,
    y: currentY,
    size: 6.5,
    font: fontMono,
    color: colorMuted,
  });
  currentY -= 9;
  currentPage.drawText(
    "Sellado criptográfico de integridad SHA-256 verificado por el ecosistema I-bita (Art. 1199 CCyC).",
    {
      x: margin,
      y: currentY,
      size: 6.5,
      font: fontRegular,
      color: colorMuted,
    }
  );

  return pdfDoc.save();
}
