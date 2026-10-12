"""Response models for the platform API (also the source of the generated TypeScript types)."""
from typing import Any, Literal

from pydantic import BaseModel

ProductStatus = Literal["draft", "in_enrichment", "flagged", "ready", "live", "upcoming"]
Flag = Literal["ok", "watch", "flag"]


class ProductSummary(BaseModel):
    id: int
    sku: str
    name: str | None
    category: str | None
    status: ProductStatus
    audit_score: int | None
    audit_status: str | None
    quality_score: int | None
    launch_date: str | None
    live_platforms: list[str]
    best_rank: int | None
    flag: Flag
    batch_id: int | None
    origin: Literal["demo", "live"]


class ProductList(BaseModel):
    items: list[ProductSummary]
    total: int
    page: int
    page_size: int


class FacetCount(BaseModel):
    key: str
    count: int


class Facets(BaseModel):
    status: list[FacetCount]
    category: list[FacetCount]
    platform: list[FacetCount]


class ImageCheck(BaseModel):
    rule: str
    ok: bool
    detail: str


class ImageOut(BaseModel):
    kind: str
    width: int
    height: int
    bg_white: bool
    quality_score: int
    notes: str | None


class PlatformImageReport(BaseModel):
    platform_key: str
    platform_name: str
    checks: list[ImageCheck]


class ContentOut(BaseModel):
    platform_key: str
    platform_name: str
    kind: str
    status: str
    simulated: bool
    title: str
    title_ar: str | None
    title_limit: int | None
    bullets: list[str]
    bullet_limit: int | None
    bullet_count: int | None
    description: str
    description_limit: int | None
    attributes: dict[str, Any]
    mandatory_missing: list[str]
    keywords: list[str]
    keyword_hits: list[str]
    listed: bool


class ListingOut(BaseModel):
    id: int
    platform_key: str
    platform_name: str
    status: str
    published_at: str | None
    price: float | None
    rank: int | None
    rank_prev: int | None
    primary_keyword: str | None
    flag: Flag
    diagnosis: str | None
    clicks_30d: int
    orders_30d: int
    revenue_30d: float


class AuditIssueOut(BaseModel):
    field: str
    code: str
    severity: str
    issue: str


class ReviewItemOut(BaseModel):
    id: int
    product_id: int
    reason: str
    severity: str
    status: str
    created_at: str
    resolved_at: str | None


class AbTestOut(BaseModel):
    id: int
    listing_id: int
    platform_key: str
    variant_a: str
    variant_b: str
    status: str
    winner: str | None
    uplift_pct: float | None
    started_at: str


class ProductDetail(BaseModel):
    id: int
    sku: str
    name: str | None
    brand: str | None
    category: str | None
    line: str | None
    size: str | None
    price: float | None
    country: str | None
    status: ProductStatus
    origin: Literal["demo", "live"]
    launch_date: str | None
    batch_id: int | None
    batch_name: str | None
    audit_score: int | None
    audit_status: str | None
    audit_issues: list[AuditIssueOut]
    quality_score: int | None
    score_detail: dict[str, int] | None
    gate_blocked: bool
    gate_reason: str | None
    source: dict[str, Any]
    enriched: dict[str, Any]
    images: list[ImageOut]
    image_reports: list[PlatformImageReport]
    content: list[ContentOut]
    listings: list[ListingOut]
    review: ReviewItemOut | None
    ab_tests: list[AbTestOut]


class PerfPoint(BaseModel):
    day: str
    rank: int
    impressions: int
    clicks: int
    orders: int
    revenue: float
    returns: int


class ListingPerformance(BaseModel):
    listing_id: int
    platform_key: str
    platform_name: str
    points: list[PerfPoint]
