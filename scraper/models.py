from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, HttpUrl


class ScrapePayload(BaseModel):
    source_platform: Literal[
        "linkedin", "indeed", "glassdoor", "dice",
        "lever", "greenhouse", "workday", "angellist", "direct", "other"
    ]
    external_job_id: str
    company_name: str
    job_title: str
    job_link: str
    job_location: Optional[str] = None
    is_remote: bool = False
    job_description: Optional[str] = None
    date_posted: Optional[str] = None  # ISO date string
    salary_text: Optional[str] = None
    salary_type: Optional[Literal["annual", "hourly"]] = None
    salary_min: Optional[int] = None       # cents, annual only
    salary_max: Optional[int] = None       # cents, annual only
    hourly_rate_min: Optional[float] = None
    hourly_rate_max: Optional[float] = None
    job_type: Optional[Literal[
        "full_time", "part_time", "contract", "internship", "temp", "freelance"
    ]] = None
    experience_level: Optional[Literal[
        "entry", "mid", "senior", "lead", "executive"
    ]] = None
    security_clearance_req: bool = False
    skills: list[str] = []
    software: list[str] = []
    keywords: list[str] = []
    certifications: list[str] = []


class ScrapeResponse(BaseModel):
    action: Literal["created", "updated", "duplicate_skipped"]
    job_id: int
