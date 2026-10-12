"""Agent 2: Pre-Enrichment Audit.

Scores each normalised record out of 100 before any AI runs:
  completeness 50 pts (8 key fields), consistency 30 pts (4 checks), coverage 20 pts (3 checks).
PASS >= 70, REVIEW 50-69, FLAGGED < 50. A record with any high-severity issue is capped at REVIEW.
FLAGGED records are not sent downstream.
"""
import re
from collections import Counter

from config import PASS_THRESHOLD, REVIEW_THRESHOLD

# field -> (points, severity when missing)
COMPLETENESS_FIELDS = {
    "product_name": "high",
    "brand": "high",
    "category": "high",
    "description": "high",
    "weight": "medium",
    "ingredients": "medium",
    "image_url": "low",
    "country_of_origin": "low",
}
COMPLETENESS_POINTS = 50 / len(COMPLETENESS_FIELDS)
CONSISTENCY_POINTS = 30 / 4
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
MIN_DESCRIPTION_WORDS = 15
MIN_INGREDIENTS = 2

ISSUE_LABELS = {
    **{f"missing:{f}": f"Missing {f.replace('_', ' ')}" for f in COMPLETENESS_FIELDS},
    "name_lowercase": "Product name is all lowercase",
    "weight_unit_missing": "Weight has no unit",
    "price_invalid": "Price missing or not a positive number",
    "brand_not_in_name": "Brand does not appear in the product name",
    "description_short": "Description too short for SEO",
    "ingredients_sparse": "Fewer than 2 ingredients listed",
    "category_generic": "Category too broad (single word)",
}


def _issue(field, code, severity, detail=None):
    return {"field": field, "code": code, "severity": severity, "issue": detail or ISSUE_LABELS[code]}


def _alnum(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _present(record: dict, field: str) -> bool:
    if field == "weight":
        return record.get("weight_value") is not None and record.get("weight_unit") is not None
    value = record.get(field)
    return bool(value)


def _status(score: int, issues: list[dict]) -> str:
    if score >= PASS_THRESHOLD:
        # a missing core field (name, brand, category, description) can never pass on points alone
        return "REVIEW" if any(i["severity"] == "high" for i in issues) else "PASS"
    if score >= REVIEW_THRESHOLD:
        return "REVIEW"
    return "FLAGGED"


def audit_record(record: dict) -> dict:
    issues = []

    completeness = 0.0
    for field, severity in COMPLETENESS_FIELDS.items():
        if _present(record, field):
            completeness += COMPLETENESS_POINTS
        elif field == "weight" and record.get("weight_value") is not None:
            issues.append(_issue("weight", "weight_unit_missing", "medium"))
        else:
            issues.append(_issue(field, f"missing:{field}", severity))

    consistency = 0.0
    name = record.get("product_name")
    if name and name != name.lower():
        consistency += CONSISTENCY_POINTS
    elif name:
        issues.append(_issue("product_name", "name_lowercase", "low"))
    # a missing name is already reported under completeness

    if record.get("weight_unit"):
        consistency += CONSISTENCY_POINTS
    elif record.get("weight_value") is not None and not any(i["code"] == "weight_unit_missing" for i in issues):
        issues.append(_issue("weight", "weight_unit_missing", "medium"))

    price = record.get("price_usd")
    if price is not None and price > 0:
        consistency += CONSISTENCY_POINTS
    else:
        issues.append(_issue("price_usd", "price_invalid", "medium"))

    brand = record.get("brand")
    if name and brand and _alnum(brand) in _alnum(name):
        consistency += CONSISTENCY_POINTS
    elif name and brand:
        issues.append(_issue("brand", "brand_not_in_name", "low"))

    coverage = 0.0
    description = record.get("description")
    if description and len(description.split()) >= MIN_DESCRIPTION_WORDS:
        coverage += 8
    elif description:
        issues.append(_issue("description", "description_short", "medium",
                             f"Description has {len(description.split())} words (needs {MIN_DESCRIPTION_WORDS}+)"))

    if len(record.get("ingredients") or []) >= MIN_INGREDIENTS:
        coverage += 6
    elif record.get("ingredients"):
        issues.append(_issue("ingredients", "ingredients_sparse", "low"))

    category = record.get("category")
    if category and (len(category.split()) >= 2 or re.search(r"[>/|]", category)):
        coverage += 6
    elif category:
        issues.append(_issue("category", "category_generic", "medium", f"Category '{category}' is too broad"))

    score = round(completeness + consistency + coverage)
    issues.sort(key=lambda i: SEVERITY_ORDER[i["severity"]])
    return {
        "sku_id": record["sku_id"],
        "audit_score": score,
        "status": _status(score, issues),
        "breakdown": {
            "completeness": round(completeness, 1),
            "consistency": round(consistency, 1),
            "coverage": round(coverage, 1),
        },
        "issues": issues,
    }


def audit_records(records: list[dict]) -> dict:
    """Return {"results": [...], "summary": {...}}."""
    results = [audit_record(r) for r in records]

    status_counts = Counter(r["status"] for r in results)
    issue_counts = Counter(i["code"] for r in results for i in r["issues"])
    average = round(sum(r["audit_score"] for r in results) / len(results), 1) if results else 0.0

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "average_score": average,
            "status_counts": {s: status_counts.get(s, 0) for s in ("PASS", "REVIEW", "FLAGGED")},
            "top_issues": [
                {"code": code, "label": ISSUE_LABELS.get(code, code), "count": count}
                for code, count in issue_counts.most_common(3)
            ],
        },
    }
