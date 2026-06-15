from unittest.mock import MagicMock
import pytest
from scraper.dedup import filter_new
from scraper.models import ScrapePayload


def _payload(job_id: str, platform: str = "linkedin") -> ScrapePayload:
    return ScrapePayload(
        source_platform=platform,  # type: ignore[arg-type]
        external_job_id=job_id,
        company_name="Acme",
        job_title="Engineer",
        job_link=f"https://example.com/job/{job_id}",
    )


def test_filters_seen_ids():
    state = MagicMock()
    state.is_seen.side_effect = lambda p, jid: jid in {"1", "2"}
    jobs = [_payload("1"), _payload("2"), _payload("3")]
    result = filter_new("linkedin", jobs, state)
    assert [j.external_job_id for j in result] == ["3"]


def test_empty_input():
    state = MagicMock()
    state.is_seen.return_value = False
    assert filter_new("linkedin", [], state) == []


def test_all_new():
    state = MagicMock()
    state.is_seen.return_value = False
    jobs = [_payload("a"), _payload("b")]
    assert len(filter_new("linkedin", jobs, state)) == 2


def test_all_seen():
    state = MagicMock()
    state.is_seen.return_value = True
    jobs = [_payload("x"), _payload("y")]
    assert filter_new("linkedin", jobs, state) == []


def test_calls_is_seen_with_correct_platform():
    state = MagicMock()
    state.is_seen.return_value = False
    _payload_indeed = _payload("42")
    filter_new("indeed", [_payload_indeed], state)
    state.is_seen.assert_called_once_with("indeed", "42")
