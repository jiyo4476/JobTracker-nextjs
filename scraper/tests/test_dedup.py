import pytest
from unittest.mock import MagicMock
from scraper.dedup import filter_new
from scraper.models import ScrapePayload


def make_payload(job_id: str) -> ScrapePayload:
    return ScrapePayload(
        source_platform="linkedin",
        external_job_id=job_id,
        company_name="Acme",
        job_title="Engineer",
        job_link=f"https://linkedin.com/jobs/view/{job_id}/"
    )


def test_filter_new_removes_seen():
    state = MagicMock()
    state.is_seen.side_effect = lambda plat, jid: jid in {"1", "2"}
    jobs = [make_payload("1"), make_payload("2"), make_payload("3")]
    result = filter_new("linkedin", jobs, state)
    assert len(result) == 1
    assert result[0].external_job_id == "3"


def test_filter_new_empty():
    state = MagicMock()
    state.is_seen.return_value = False
    result = filter_new("linkedin", [], state)
    assert result == []
