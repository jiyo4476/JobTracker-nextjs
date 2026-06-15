import pytest
from pydantic import ValidationError
from scraper.models import ScrapePayload, ScrapeResponse


def test_required_fields_missing():
    with pytest.raises(ValidationError):
        ScrapePayload()  # type: ignore


def test_valid_minimal_payload():
    p = ScrapePayload(
        source_platform="linkedin",
        external_job_id="123",
        company_name="Acme",
        job_title="SWE",
        job_link="https://example.com/job/123",
    )
    assert p.is_remote is False
    assert p.security_clearance_req is False
    assert p.skills == []
    assert p.software == []
    assert p.keywords == []
    assert p.certifications == []


def test_annual_salary_fields():
    p = ScrapePayload(
        source_platform="indeed",
        external_job_id="456",
        company_name="Corp",
        job_title="Dev",
        job_link="https://example.com/job/456",
        salary_type="annual",
        salary_min=8_000_000,
        salary_max=12_000_000,
        salary_text="$80k–$120k/yr",
    )
    assert p.salary_min == 8_000_000
    assert p.salary_type == "annual"


def test_hourly_salary_fields():
    p = ScrapePayload(
        source_platform="dice",
        external_job_id="789",
        company_name="Staffing",
        job_title="Contractor",
        job_link="https://example.com/job/789",
        salary_type="hourly",
        hourly_rate_min=45.0,
        hourly_rate_max=65.0,
    )
    assert p.hourly_rate_min == 45.0


def test_invalid_platform():
    with pytest.raises(ValidationError):
        ScrapePayload(
            source_platform="twitter",  # type: ignore
            external_job_id="1",
            company_name="X",
            job_title="SWE",
            job_link="https://example.com",
        )


def test_scrape_response():
    r = ScrapeResponse(action="created", job_id=42)
    assert r.action == "created"
    assert r.job_id == 42

    with pytest.raises(ValidationError):
        ScrapeResponse(action="unknown_action", job_id=1)  # type: ignore
