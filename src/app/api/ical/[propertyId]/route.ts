import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/lib/errors/app-error";
import { generatePropertyIcalFeedAction } from "@/modules/ical/actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Endpoint público RFC 5545 (`GET /api/ical/[propertyId].ics` o `GET /api/ical/[propertyId]`).
 * Exporta todas las reservas y bloqueos activos (`status NOT IN ('CANCELLED', 'EXPIRED')`)
 * de la Unidad Funcional publicada en zona horaria `America/Argentina/Buenos_Aires`
 * sin filtrar PII de huéspedes ni el PIN de cerradura electrónica (`FR-5`, `AD-4`, `AC-3`).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ propertyId: string }> }
): Promise<NextResponse> {
  try {
    const { propertyId: rawPropertyId } = await context.params;
    const cleanPropertyId = rawPropertyId.replace(/\.ics$/i, "").trim();

    const feed = await generatePropertyIcalFeedAction(cleanPropertyId);

    return new NextResponse(feed.icsContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${feed.slug || feed.propertyId}.ics"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: err.code,
            message: err.message,
          },
        },
        { status: err.statusCode }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "Error interno al generar el feed iCal RFC 5545.",
        },
      },
      { status: 500 }
    );
  }
}
