"""Agent 1: Feed Ingestion.

Accepts a supplier CSV or JSON file and normalises every row into one standard
schema. A bad row never stops the run: it is reported in `errors` instead.
"""
import csv
import io
import json
import re
from pathlib import Path

# standard field -> accepted source column names (after key normalisation)
ALIASES = {
    "sku_id": ["sku_id", "sku", "item_code", "item_id", "product_id", "id"],
    "product_name": ["product_name", "name", "title", "product_title", "item_name"],
    "brand": ["brand", "brand_name", "manufacturer"],
    "category": ["category", "product_category", "cat"],
    "description": ["description", "desc", "product_description", "details"],
    "weight": ["weight", "net_weight", "net_quantity", "size", "pack_size"],
    "ingredients": ["ingredients", "ingredient_list"],
    "image_url": ["image_url", "image", "img", "image_link", "photo_url"],
    "price_usd": ["price_usd", "price", "mrp", "unit_price"],
    "country_of_origin": ["country_of_origin", "origin", "country", "made_in"],
}

UNIT_MAP = {
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g",
    "kg": "kg", "kgs": "kg", "kilo": "kg", "kilogram": "kg", "kilograms": "kg",
    "mg": "mg",
    "ml": "ml", "l": "l", "ltr": "l", "litre": "l", "liter": "l", "litres": "l", "liters": "l",
    "oz": "oz", "ounce": "oz", "ounces": "oz",
    "lb": "lb", "lbs": "lb", "pound": "lb", "pounds": "lb",
}

_WEIGHT_RE = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s*$")
_LIST_KEYS = ("products", "items", "data", "records", "skus")


def _key(name: str) -> str:
    return re.sub(r"[\s\-]+", "_", str(name).strip().lower())


def _clean(value):
    """Trim strings, collapse inner whitespace and turn blanks into None."""
    if value is None:
        return None
    if isinstance(value, str):
        value = re.sub(r"\s+", " ", value).strip()
        return value or None
    return value


def parse_weight(raw) -> tuple[float | None, str | None]:
    """'50g' / '50 g' -> (50.0, 'g'); '50' -> (50.0, None). The unit is never guessed."""
    raw = _clean(raw)
    if raw is None:
        return None, None
    match = _WEIGHT_RE.match(str(raw))
    if not match:
        return None, None
    value = float(match.group(1))
    unit = match.group(2)
    if unit is not None:
        unit = UNIT_MAP.get(unit.lower(), unit.lower())
    return value, unit


def parse_price(raw) -> float | None:
    raw = _clean(raw)
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    cleaned = re.sub(r"[^\d.]", "", str(raw))
    try:
        return float(cleaned) if cleaned else None
    except ValueError:
        return None


def parse_ingredients(raw) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        items = raw
    else:
        items = re.split(r"[;,]", str(raw))
    return [item for item in (_clean(i) for i in items) if item]


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("latin-1")


def _detect_format(path: Path, text: str) -> str:
    suffix = path.suffix.lower()
    if suffix in (".csv", ".json"):
        return suffix[1:]
    first = text.lstrip()[:1]
    if first in ("{", "["):
        return "json"
    if first == "<":
        raise ValueError("XML feeds are not supported yet")
    return "csv"


def _load_rows(path: Path) -> tuple[list, str]:
    text = _decode(path.read_bytes())
    fmt = _detect_format(path, text)
    if fmt == "json":
        data = json.loads(text)
        if isinstance(data, dict):
            data = next((data[k] for k in _LIST_KEYS if isinstance(data.get(k), list)), None)
        if not isinstance(data, list):
            raise ValueError("JSON feed must be an array of products or an object with a products list")
        return data, fmt
    try:
        dialect = csv.Sniffer().sniff(text[:2048], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    return list(csv.DictReader(io.StringIO(text), dialect=dialect)), fmt


def _normalise_row(raw: dict, source_row: int) -> dict:
    if not isinstance(raw, dict):
        raise ValueError("row is not an object")
    keyed = {_key(k): v for k, v in raw.items() if k is not None}

    def pick(field):
        for alias in ALIASES[field]:
            value = _clean(keyed.get(alias))
            if value is not None:
                return value
        return None

    sku_id = pick("sku_id")
    if sku_id is None:
        raise ValueError("missing sku_id")

    weight_raw = pick("weight")
    weight_value, weight_unit = parse_weight(weight_raw)
    return {
        "sku_id": str(sku_id),
        "product_name": pick("product_name"),
        "brand": pick("brand"),
        "category": pick("category"),
        "description": pick("description"),
        "weight_raw": None if weight_raw is None else str(weight_raw),
        "weight_value": weight_value,
        "weight_unit": weight_unit,
        "ingredients": parse_ingredients(pick("ingredients")),
        "image_url": pick("image_url"),
        "price_usd": parse_price(pick("price_usd")),
        "country_of_origin": pick("country_of_origin"),
        "source_row": source_row,
        "raw_record": raw,
    }


def ingest_feed(file_path) -> dict:
    """Return {"records": [...], "errors": [...], "summary": {...}}."""
    path = Path(file_path)
    rows, fmt = _load_rows(path)

    records, errors, seen = [], [], set()
    for number, raw in enumerate(rows, start=1):
        try:
            record = _normalise_row(raw, number)
        except ValueError as exc:
            errors.append({"row": number, "reason": str(exc), "raw": raw})
            continue
        if record["sku_id"] in seen:
            errors.append({"row": number, "reason": "duplicate sku_id (first one kept)", "raw": raw})
            continue
        seen.add(record["sku_id"])
        records.append(record)

    return {
        "records": records,
        "errors": errors,
        "summary": {
            "format": fmt,
            "total": len(rows),
            "ok": len(records),
            "failed": len(errors),
        },
    }
