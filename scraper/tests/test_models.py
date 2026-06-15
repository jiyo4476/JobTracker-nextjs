import pytest
from pydantic import ValidationError
from scraper.models import ScrapePayload


def test_required_fields():
    with pytest.raises(ValidationError):
        ScrapePayload()  # missing required fields


def test_valid_payload():
    p = ScrapePayload(
        source_platform="linkedin",
        external_job_id="123",
        company_name="Acme",
        job_title="SWE",
        job_link="https://example.com/job/123"
    )
    assert p.is_remote is False
    assert p.skills == []


def test_salary_fields():
    p = ScrapePayload(
        source_platform="indeed",
        external_job_id="456",
        company_name="Corp",
        job_title="Dev",
        job_link="https://example.com/job/456",
        salary_type="annual",
        salary_min=8000000,
        salary_max=12000000,
        salary_text="$80k-$120k/yr"
    )
    assert p.salary_min == 8000000
