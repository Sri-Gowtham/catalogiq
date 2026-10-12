"""Agent registry: the single list the runner executes and the frontend renders.

Adding an agent means adding one entry here. `mode` tells the UI whether the
agent really runs ("live") or is a labelled stand-in ("simulated").
"""
from dataclasses import dataclass
from typing import Callable

from pipeline import adapters
from pipeline.context import JobContext, StageResult


@dataclass(frozen=True)
class Agent:
    id: str
    name: str
    layer: int
    mode: str  # "live" | "simulated"
    description: str
    in_pipeline: bool = True
    run: Callable[[JobContext], StageResult] | None = None


def _stub(agent_id: str) -> Callable[[JobContext], StageResult]:
    return lambda ctx: adapters.simulated_stage(ctx, agent_id)


def _simulated(id_, name, layer, description, in_pipeline=True) -> Agent:
    return Agent(id_, name, layer, "simulated", description, in_pipeline, _stub(id_) if in_pipeline else None)


AGENTS: list[Agent] = [
    Agent("ingestion", "Feed Ingestion", 1, "live",
          "Normalises supplier CSV/JSON into one standard schema.", True, adapters.ingestion_stage),
    Agent("audit", "Pre-Enrichment Audit", 2, "live",
          "Scores data quality before any AI runs; flags records that are not worth enriching.", True,
          adapters.audit_stage),
    _simulated("duplicate_detector", "Duplicate Detector", 2,
               "Finds semantic duplicates using embeddings, before any LLM spend."),
    _simulated("image_analysis", "Image Analysis", 2, "Extracts visual attributes from product images."),
    _simulated("attribute_extraction", "Attribute Extraction", 2,
               "Pulls structured attributes from messy text with an LLM."),
    _simulated("channel_content", "Channel-Schema Content", 2,
               "Writes titles, bullets and descriptions that fit each marketplace's limits."),
    _simulated("brand_compliance", "Brand Compliance", 2,
               "Validates content against the brand's JSON rulebook."),
    _simulated("translation", "Translation & Localisation", 2, "Adapts content culturally per market."),
    _simulated("taxonomy", "Taxonomy Mapping", 2, "Maps each SKU to the right marketplace category."),
    _simulated("quality_gate", "Quality Gate", 2, "Scores 6 weighted parameters and blocks anything below 70."),
    _simulated("publishing", "Zero-Touch Publishing", 3, "Pushes approved listings to marketplace APIs."),
    # Not part of a pipeline run: always-on watchers and the feedback loop.
    _simulated("competitive_intel", "Competitive Intelligence", 1,
               "Watches competitor listings for price, content and rank changes.", in_pipeline=False),
    _simulated("performance_monitor", "Performance Monitor", 3,
               "Tracks rank, CTR, conversion and returns for live listings.", in_pipeline=False),
    _simulated("diagnosis", "Failure Diagnosis", 3,
               "Works out why a listing underperforms.", in_pipeline=False),
    _simulated("optimizer", "Auto-Fix & Optimizer", 3,
               "Generates a better variant, tests it and promotes the winner.", in_pipeline=False),
]


def pipeline_agents() -> list[Agent]:
    return [a for a in AGENTS if a.in_pipeline and a.run is not None]
