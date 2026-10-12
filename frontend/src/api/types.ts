// Response shapes of the platform API. Endpoints with Pydantic response models could be generated
// (`npm run gen:api`), but most return plain dicts, so these are kept by hand next to the routes.

export type Role = 'admin' | 'manager' | 'viewer'
export type ProductStatus = 'draft' | 'in_enrichment' | 'flagged' | 'ready' | 'upcoming' | 'live'
export type AuditStatus = 'PASS' | 'REVIEW' | 'FLAGGED'
export type Severity = 'high' | 'medium' | 'low'
export type ListingFlag = 'ok' | 'watch' | 'flag' | null

export interface Me {
  user_id: number
  name: string
  email: string
  role: Role
  workspace_id: number
  workspace_name: string
  is_demo: boolean
  onboarded: boolean
  plan: string
}

export interface TokenOut {
  token: string
  me: Me
}

export interface PlatformSummary {
  key: string
  name: string
  status: string
  live: number
  queued: number
  suppressed: number
}

export interface Mover {
  product_id: number
  name: string
  platform: string
  rank: number
  rank_prev: number
  change: number
}

export interface BatchLite {
  id: number
  name: string
  status: string
  stage: string
  total: number
  flagged: number
  kind: string
}

export interface Overview {
  workspace: { name: string; is_demo: boolean; plan: string }
  counts: { total: number; live: number; in_enrichment: number; flagged: number; ready: number; upcoming: number; launching_this_week: number }
  health: { avg_quality: number | null; gate_pass_rate: number | null; scored: number }
  funnel: { stage: string; count: number }[]
  platforms: PlatformSummary[]
  performance: {
    days: number
    impressions: number
    clicks: number
    orders: number
    revenue: number
    ctr: number | null
    conversion: number | null
    revenue_delta_pct: number | null
  }
  series: { day: string; clicks: number; orders: number; revenue: number }[]
  movers: { up: Mover[]; down: Mover[] }
  attention: { kind: string; level: Severity; text: string; href: string }[]
  upcoming: { id: number; sku: string; name: string; launch_date: string; quality_score: number | null }[]
  batches: BatchLite[]
  activity: { action: string; entity: string | null; detail: string | null; at: string; user: string | null }[]
}

export interface ProductSummary {
  id: number
  sku: string
  name: string | null
  category: string | null
  status: ProductStatus
  audit_score: number | null
  audit_status: AuditStatus | null
  quality_score: number | null
  launch_date: string | null
  live_platforms: string[]
  best_rank: number | null
  flag: ListingFlag
  batch_id: number | null
  origin: string
}

export interface ProductList {
  items: ProductSummary[]
  total: number
  page: number
  page_size: number
}

export interface Facet {
  key: string
  count: number
}

export interface Facets {
  status: Facet[]
  category: Facet[]
  platform: Facet[]
}

export interface ImageCheck {
  rule: string
  ok: boolean
  detail: string | null
}

export interface ImageOut {
  kind: string
  width: number
  height: number
  bg_white: boolean
  quality_score: number | null
  notes: string | null
}

export interface ContentOut {
  platform_key: string
  platform_name: string
  kind: string
  status: string
  simulated: boolean
  title: string
  title_ar: string | null
  title_limit: number | null
  bullets: string[]
  bullet_limit: number | null
  bullet_count: number | null
  description: string
  description_limit: number | null
  attributes: Record<string, string>
  mandatory_missing: string[]
  keywords: string[]
  keyword_hits: string[]
  listed: boolean
}

export interface ListingOut {
  id: number
  platform_key: string
  platform_name: string
  status: string
  published_at: string | null
  price: number | null
  rank: number | null
  rank_prev: number | null
  primary_keyword: string | null
  flag: ListingFlag
  diagnosis: string | null
  clicks_30d: number
  orders_30d: number
  revenue_30d: number
}

export interface AuditIssue {
  field: string
  code: string
  severity: Severity
  issue: string
}

export interface ReviewItem {
  id: number
  product_id: number
  sku: string
  name: string | null
  category: string | null
  reason: string
  severity: Severity
  status: string
  quality_score: number | null
  audit_score: number | null
  audit_status: AuditStatus | null
  created_at: string
  resolved_at: string | null
}

export interface AbTest {
  id: number
  listing_id: number
  product_id: number
  sku: string
  name: string
  platform_key: string
  variant_a: string
  variant_b: string
  status: string
  winner: string | null
  uplift_pct: number | null
  started_at: string
}

export interface ProductDetail {
  id: number
  sku: string
  name: string | null
  brand: string | null
  category: string | null
  line: string | null
  size: string | null
  price: number | null
  country: string | null
  status: ProductStatus
  origin: string
  launch_date: string | null
  batch_id: number | null
  batch_name: string | null
  audit_score: number | null
  audit_status: AuditStatus | null
  audit_issues: AuditIssue[]
  quality_score: number | null
  score_detail: Record<string, number> | null
  gate_blocked: boolean
  gate_reason: string | null
  source: Record<string, unknown>
  enriched: Record<string, unknown> | null
  images: ImageOut[]
  image_reports: { platform_key: string; platform_name: string; checks: ImageCheck[] }[]
  content: ContentOut[]
  listings: ListingOut[]
  review: { id: number; reason: string; severity: Severity; status: string } | null
  ab_tests: Omit<AbTest, 'listing_id' | 'product_id' | 'sku' | 'name'>[]
}

export interface PerfPoint {
  day: string
  rank: number | null
  impressions: number
  clicks: number
  orders: number
  revenue: number
  returns: number
}

export interface ListingPerformance {
  listing_id: number
  platform_key: string
  platform_name: string
  points: PerfPoint[]
}

export interface Batch {
  id: number
  name: string
  source_file: string | null
  kind: string
  status: string
  stage: string
  stage_name: string
  stage_index: number
  stage_total: number
  total: number
  flagged: number
  ready: number
  created_at: string
  finished_at: string | null
  error: string | null
  job_id: string | null
}

export interface BatchStage {
  agent_id: string
  name: string
  layer: number
  mode: 'live' | 'simulated'
  status: string
  duration_ms: number | null
  processed: number | null
  skipped: number | null
  tokens: number | null
  note: string | null
}

export interface BatchDetail {
  batch: Batch
  stages: BatchStage[]
  product_status: Record<string, number>
}

export interface Platform {
  key: string
  name: string
  kind: string
  region: string
  status: string
  connected_at: string | null
  rules: {
    title_limit: number
    bullet_count: number
    bullet_limit: number
    desc_limit: number
    mandatory: string[]
    images: { min_px: number; white_bg: boolean; min_count: number }
    bilingual?: boolean
  }
  live: number
  queued: number
  suppressed: number
  flagged: number
  avg_rank: number | null
  clicks: number | null
  orders: number | null
  revenue: number | null
  ctr: number | null
}

export interface Coverage {
  platforms: string[]
  rows: { category: string; products: number; cells: Record<string, number> }[]
}

export interface PublishRow {
  id: number
  platform_key: string
  platform_name: string
  status: string
  date: string | null
  product_id: number
  sku: string
  name: string
  quality_score: number | null
  rank: number | null
}

export interface Publishing {
  queue: PublishRow[]
  recent: PublishRow[]
  ready_to_publish: { product_id: number; sku: string; name: string; quality_score: number | null }[]
  counts: { queued: number; ready: number }
}

export interface Breakdown {
  key: string
  clicks: number
  orders: number
  revenue: number
  avg_rank: number | null
}

export interface PerfSummary {
  days: number
  impressions: number
  clicks: number
  orders: number
  revenue: number
  ctr: number | null
  conversion: number | null
  return_rate: number | null
  avg_rank: number | null
  series: { day: string; impressions: number; clicks: number; orders: number; revenue: number; rank: number }[]
  by_platform: Breakdown[]
  by_category: Breakdown[]
}

export interface ListingRow {
  listing_id: number
  product_id: number
  sku: string
  name: string
  category: string
  platform_key: string
  platform_name: string
  status: string
  rank: number | null
  rank_prev: number | null
  flag: ListingFlag
  diagnosis: string | null
  clicks: number
  orders: number
  revenue: number
  ctr: number | null
  conversion: number | null
}

export interface Rule {
  id: number
  region: 'ALL' | 'IN' | 'AE' | 'US'
  kind: 'restricted_claim' | 'mandatory_claim' | 'trademark' | 'allergen_format'
  value: string
  note: string | null
}

export interface RuleFinding {
  rule_id: number
  kind: string
  severity: Severity
  match: string
  start: number
  end: number
  message: string
}

export interface Workbench {
  connection: { name: string; endpoint: string; status: string; detail: string }
  agents: {
    id: string
    name: string
    layer: number
    mode: 'live' | 'simulated'
    description: string
    in_pipeline: boolean
    runs: number
    avg_ms: number | null
    failed: number
    processed: number
    tokens: number | null
  }[]
  recent_runs: {
    id: number
    agent_id: string
    agent_name: string
    mode: 'live' | 'simulated'
    status: string
    batch: string | null
    duration_ms: number | null
    processed: number | null
    tokens: number | null
    note: string | null
  }[]
}

export interface Reports {
  products_processed: number
  flagged_early: number
  hours_saved_estimate: number
  cost_saved_estimate: number
  assumptions: string[]
  categories: { category: string; products: number; avg_quality: number | null }[]
}

export interface Notification {
  id: number
  text: string
  level: string
  read: boolean
  created_at: string
}

export interface Member {
  id: number
  name: string
  email: string
  role: Role
}

export interface AuditLogRow {
  id: number
  action: string
  entity: string | null
  detail: string | null
  user: string | null
  at: string
}
