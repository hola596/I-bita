#!/usr/bin/env python3
"""Muestreador ligero y extractor de fricciones en datasets abiertos de hospedaje.

Soporta Inside Airbnb (reviews + listings opcional), Booking.com, TripAdvisor y Reddit
en streaming con memoria constante (stdlib Python únicamente, sin dependencias externas).
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import random
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


# Límite seguro multiplataforma (Windows C long máx = 2^31 - 1)
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

FRICTION_PATTERNS: Dict[str, re.Pattern[str]] = {
    "check_in_access": re.compile(
        r"\b(check[- ]?in|lockbox|smart ?lock|keyless|keys?|llaves?|cerradura|"
        r"código|codigo|porter[oa]|encargad[oa]|reception|stranded|waited|esperar|"
        r"acceso|no pude entrar|couldn'?t get in)\b",
        re.IGNORECASE,
    ),
    "cleanliness": re.compile(
        r"\b(dirty|cleanliness|filthy|stain(?:ed|s)?|dust(?:y)?|mold|mould|hair|"
        r"bugs?|roach(?:es)?|smell|odor|sucio|suciedad|limpieza|mancha(?:s)?|"
        r"pelos?|polvo|moho|cucaracha|olor|mal olor|mugre)\b",
        re.IGNORECASE,
    ),
    "noise": re.compile(
        r"\b(nois[ey]|loud|party|parties|construction|traffic|sirens?|thin walls|"
        r"earplugs?|sleep|ruido(?:s)?|ruidoso|fiesta(?:s)?|obra|construcci[oó]n|"
        r"paredes finas|boliche|m[uú]sica|dormir)\b",
        re.IGNORECASE,
    ),
    "wifi_work": re.compile(
        r"\b(wi-?fi|internet|router|disconnect(?:ed|ing)?|slow connection|bandwidth|"
        r"fibra|se corta|sin conexi[oó]n|lento|remote work|trabajar)\b",
        re.IGNORECASE,
    ),
    "hidden_fees_cash": re.compile(
        r"\b(hidden fee(?:s)?|cleaning fee|chores?|cash|efectivo|d[oó]lar|"
        r"sobreprecio|recargo|cargo oculto|extra fee|surcharge|exchange rate|blue)\b",
        re.IGNORECASE,
    ),
    "cancellation_refund": re.compile(
        r"\b(cancel(?:led|lation|lations)?|refund(?:s|ed)?|reembolso|devoluci[oó]n|"
        r"cancelaci[oó]n|cancel[oó]|rebook|reschedule)\b",
        re.IGNORECASE,
    ),
    "deposit_damage": re.compile(
        r"\b(deposit|security deposit|aircover|damage(?:d|s)?|claim|retaliat(?:ory|ed)|"
        r"dep[oó]sito|garant[ií]a|da[nñ]o(?:s)?|rotura|cobro extra)\b",
        re.IGNORECASE,
    ),
    "consorcio_portero": re.compile(
        r"\b(consorcio|reglamento|copropietarios|hoa|doorman|building rule|multa|"
        r"administraci[oó]n|vecinos?|porter[ií]a|prohibido)\b",
        re.IGNORECASE,
    ),
    "power_utilities": re.compile(
        r"\b(blackout|power outage|no electricity|hot water|water pressure|ac broken|"
        r"air conditioning|heating|corte de luz|sin luz|edesur|edenor|sin agua|"
        r"agua caliente|calefacci[oó]n|aire acondicionado|ascensor roto)\b",
        re.IGNORECASE,
    ),
    "misleading_listing": re.compile(
        r"\b(misleading|inaccurate|catfish|photos?|nothing like|fake|smaller than|"
        r"enga[nñ]oso|fotos viejas|no coincide|mentira|inexistente)\b",
        re.IGNORECASE,
    ),
    "unauthorized_party": re.compile(
        r"\b(unauthorized guest|extra guests?|sneak|party house|trespass|"
        r"hu[eé]spedes no autorizados|invitados de m[aá]s)\b",
        re.IGNORECASE,
    ),
    "midterm_holdover_scam": re.compile(
        r"\b(squatter|evict(?:ion)?|overstay|tenancy|tenant rights|scam(?:med|mer)?|"
        r"phishing|extortion|desalojo|usurp|estafa|extorsi[oó]n)\b",
        re.IGNORECASE,
    ),
}


def open_text_stream(file_path: Path):
    if file_path.suffix.lower() == ".gz":
        return gzip.open(file_path, mode="rt", encoding="utf-8", errors="replace")
    return open(file_path, mode="rt", encoding="utf-8", errors="replace", newline="")


def parse_float(raw: object) -> Optional[float]:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    cleaned = re.sub(r"[^0-9.,-]", "", text).replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def iter_csv_or_jsonl(file_path: Path) -> Iterable[Dict[str, object]]:
    is_jsonl = ".jsonl" in file_path.name.lower() or file_path.suffix.lower() == ".json"
    with open_text_stream(file_path) as handle:
        if is_jsonl:
            for line in handle:
                stripped = line.strip()
                if not stripped:
                    continue
                try:
                    obj = json.loads(stripped)
                    if isinstance(obj, dict):
                        yield obj
                except json.JSONDecodeError:
                    continue
        else:
            reader = csv.DictReader(handle)
            for row in reader:
                yield row


def load_listings_index(listings_path: Path) -> Dict[str, Dict[str, str]]:
    index: Dict[str, Dict[str, str]] = {}
    for row in iter_csv_or_jsonl(listings_path):
        listing_id = str(row.get("id") or "").strip()
        if not listing_id:
            continue
        index[listing_id] = {
            "neighbourhood": str(
                row.get("neighbourhood_cleansed") or row.get("neighbourhood") or ""
            ).strip(),
            "property_type": str(row.get("property_type") or "").strip(),
            "room_type": str(row.get("room_type") or "").strip(),
            "host_response_time": str(row.get("host_response_time") or "").strip(),
            "cancellation_policy": str(row.get("cancellation_policy") or "").strip(),
            "review_scores_rating": str(row.get("review_scores_rating") or "").strip(),
            "price": str(row.get("price") or "").strip(),
        }
    return index


def extract_record_fields(
    source: str,
    row: Dict[str, object],
    listings_index: Dict[str, Dict[str, str]],
) -> Tuple[str, Optional[float], Dict[str, object]]:
    if source == "inside_airbnb":
        listing_id = str(row.get("listing_id") or row.get("id") or "").strip()
        text = str(row.get("comments") or row.get("text") or "").strip()
        listing_meta = listings_index.get(listing_id, {})
        score = parse_float(
            row.get("rating") or listing_meta.get("review_scores_rating")
        )
        meta: Dict[str, object] = {
            "listing_id": listing_id,
            "date": str(row.get("date") or ""),
            "reviewer_name": str(row.get("reviewer_name") or ""),
            **listing_meta,
        }
        return text, score, meta

    if source == "booking":
        neg = str(row.get("review_negative") or row.get("negative") or "").strip()
        pos = str(row.get("review_positive") or row.get("positive") or "").strip()
        text = neg if neg else pos
        score = parse_float(
            row.get("guest_score") or row.get("Reviewer_Score") or row.get("score")
        )
        meta = {
            "guest_type": str(row.get("guest_type") or ""),
            "room_nights": str(row.get("room_nights") or ""),
            "accommodation_type": str(row.get("accommodation_type") or ""),
            "has_explicit_negative": bool(neg and neg.lower() not in {"no negative", "none", "n/a"}),
        }
        return text, score, meta

    if source == "tripadvisor":
        text = str(
            row.get("text")
            or row.get("review")
            or row.get("title")
            or ""
        ).strip()
        score = parse_float(
            row.get("rating") or row.get("overall") or row.get("score")
        )
        meta = {
            "title": str(row.get("title") or ""),
            "offering_id": str(row.get("offering_id") or ""),
        }
        return text, score, meta

    # reddit (r/airbnb_hosts, r/AirBnB, r/TalesFromTheFrontDesk)
    title = str(row.get("title") or "").strip()
    body = str(row.get("selftext") or row.get("body") or "").strip()
    text = f"{title}\n{body}".strip() if title and body else (title or body)
    score = parse_float(row.get("score"))
    meta = {
        "subreddit": str(row.get("subreddit") or ""),
        "id": str(row.get("id") or ""),
        "author": str(row.get("author") or ""),
    }
    return text, score, meta


def match_friction_categories(text: str) -> List[str]:
    matched: List[str] = []
    for category, pattern in FRICTION_PATTERNS.items():
        if pattern.search(text):
            matched.append(category)
    return matched


def build_markdown_summary(
    source: str,
    total_scanned: int,
    total_matched: int,
    sampled: List[Dict[str, object]],
    category_counts: Counter[str],
) -> str:
    lines: List[str] = [
        f"# Resumen de Muestreo de Fricciones ({source})",
        "",
        f"- **Registros escaneados:** {total_scanned:,}",
        f"- **Registros con señal de fricción o bajo puntaje:** {total_matched:,}",
        f"- **Muestra representativa exportada:** {len(sampled):,}",
        "",
        "## Frecuencia por Categoría de Conflicto",
        "",
        "| Categoría | Menciones en registros filtrados | % sobre filtrados |",
        "| :--- | ---: | ---: |",
    ]
    denom = max(1, total_matched)
    for cat, count in category_counts.most_common():
        pct = (count / denom) * 100.0
        lines.append(f"| `{cat}` | {count:,} | {pct:.1f}% |")

    lines.extend(["", "## Ejemplos Representativos de la Muestra", ""])
    shown_by_cat: Dict[str, int] = defaultdict(int)
    for item in sampled:
        cats = item.get("categories") or []
        primary = str(cats[0]) if cats else "low_score_only"
        if shown_by_cat[primary] >= 2:
            continue
        shown_by_cat[primary] += 1
        snippet = str(item.get("text") or "").replace("\n", " ").strip()[:240]
        score = item.get("score")
        lines.append(
            f"- **[{primary}]** (puntaje: `{score}`) — \"{snippet}\""
        )

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Muestreador streaming de fricciones en datasets abiertos de hospedaje."
    )
    parser.add_argument(
        "--source",
        required=True,
        choices=["inside_airbnb", "booking", "tripadvisor", "reddit"],
        help="Formato/origen del dataset local.",
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Ruta al archivo .csv, .csv.gz o .jsonl de reseñas/posts.",
    )
    parser.add_argument(
        "--listings",
        default="",
        help="(Opcional para Inside Airbnb) Ruta a listings.csv(.gz) para enriquecer barrio/cancelación/precio.",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Ruta de salida (.json o .csv) para la muestra filtrada.",
    )
    parser.add_argument(
        "--markdown-out",
        default="",
        help="(Opcional) Ruta .md para guardar resumen agregado por categoría.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=750,
        help="Cantidad máxima de registros a extraer mediante reservoir sampling (recomendado 500–1000).",
    )
    parser.add_argument(
        "--max-score",
        type=float,
        default=None,
        help="Umbral de puntaje numérico bajo (ej. 3.5 en escala 1-5 o 6.5 en Booking).",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Semilla aleatoria reproducible para reservoir sampling.",
    )

    args = parser.parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"[ERROR] No existe el archivo de entrada: {input_path}", file=sys.stderr)
        return 1

    default_max_score = {
        "inside_airbnb": 4.2,
        "booking": 6.5,
        "tripadvisor": 3.0,
        "reddit": None,
    }[args.source]
    score_cutoff = args.max_score if args.max_score is not None else default_max_score

    listings_index: Dict[str, Dict[str, str]] = {}
    if args.listings:
        listings_path = Path(args.listings)
        if not listings_path.exists():
            print(f"[ERROR] No existe --listings: {listings_path}", file=sys.stderr)
            return 1
        listings_index = load_listings_index(listings_path)

    rng = random.Random(args.seed)
    reservoir: List[Dict[str, object]] = []
    category_counts: Counter[str] = Counter()
    total_scanned = 0
    total_matched = 0
    target_k = max(1, args.sample_size)

    for row in iter_csv_or_jsonl(input_path):
        total_scanned += 1
        text, score, meta = extract_record_fields(args.source, row, listings_index)
        if not text:
            continue

        categories = match_friction_categories(text)
        low_score = (
            score is not None and score_cutoff is not None and score <= score_cutoff
        )
        explicit_booking_neg = bool(meta.get("has_explicit_negative"))

        if not categories and not low_score and not explicit_booking_neg:
            continue

        total_matched += 1
        for cat in categories:
            category_counts[cat] += 1
        if not categories:
            category_counts["low_score_unclassified"] += 1

        record: Dict[str, object] = {
            "source": args.source,
            "score": score,
            "categories": categories or ["low_score_unclassified"],
            "text": text[:1200],
            "meta": meta,
        }

        if len(reservoir) < target_k:
            reservoir.append(record)
        else:
            j = rng.randrange(total_matched)
            if j < target_k:
                reservoir[j] = record

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_path.suffix.lower() == ".csv":
        fieldnames = ["source", "score", "categories", "text", "meta_json"]
        with open(output_path, "wt", encoding="utf-8", newline="") as out_f:
            writer = csv.DictWriter(out_f, fieldnames=fieldnames)
            writer.writeheader()
            for item in reservoir:
                writer.writerow(
                    {
                        "source": item["source"],
                        "score": item["score"] if item["score"] is not None else "",
                        "categories": "|".join(item["categories"]),  # type: ignore[arg-type]
                        "text": item["text"],
                        "meta_json": json.dumps(item["meta"], ensure_ascii=False),
                    }
                )
    else:
        payload = {
            "source": args.source,
            "total_scanned": total_scanned,
            "total_matched": total_matched,
            "sample_count": len(reservoir),
            "category_counts": dict(category_counts.most_common()),
            "records": reservoir,
        }
        output_path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    summary_md = build_markdown_summary(
        args.source, total_scanned, total_matched, reservoir, category_counts
    )
    if args.markdown_out:
        md_path = Path(args.markdown_out)
        md_path.parent.mkdir(parents=True, exist_ok=True)
        md_path.write_text(summary_md, encoding="utf-8")

    print(summary_md)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
