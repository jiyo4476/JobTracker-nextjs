from __future__ import annotations
from .state import ScraperState
from .models import ScrapePayload


def filter_new(
    platform: str,
    jobs: list[ScrapePayload],
    state: ScraperState,
) -> list[ScrapePayload]:
    """Return only jobs not already in the local dedup set."""
    return [j for j in jobs if not state.is_seen(platform, j.external_job_id)]
