from __future__ import annotations
import yaml
from pathlib import Path
from dataclasses import dataclass, field


SCRAPER_DIR = Path(__file__).parent


@dataclass
class PlatformConfig:
    enabled: bool
    queries: list[str]
    location: str = "United States"
    remote_only: bool = False
    max_pages: int = 5


@dataclass
class ScraperSettings:
    headless: bool
    min_delay_s: float
    max_delay_s: float
    max_retries: int


@dataclass
class Config:
    api_base_url: str
    api_key: str
    proxy_enabled: bool
    proxy_url: str
    platforms: dict[str, PlatformConfig]
    scraper: ScraperSettings


def load_config(path: Path | None = None) -> Config:
    cfg_path = path or SCRAPER_DIR / "config.yml"
    with open(cfg_path) as f:
        raw = yaml.safe_load(f)

    platforms = {
        name: PlatformConfig(
            enabled=p.get("enabled", False),
            queries=p.get("queries", []),
            location=p.get("location", "United States"),
            remote_only=p.get("remote_only", False),
            max_pages=p.get("max_pages", 5),
        )
        for name, p in raw.get("platforms", {}).items()
    }

    s = raw.get("scraper", {})
    return Config(
        api_base_url=raw["api"]["base_url"].rstrip("/"),
        api_key=raw["api"]["key"],
        proxy_enabled=raw.get("proxy", {}).get("enabled", False),
        proxy_url=raw.get("proxy", {}).get("url", ""),
        platforms=platforms,
        scraper=ScraperSettings(
            headless=s.get("headless", False),
            min_delay_s=s.get("min_delay_s", 2.5),
            max_delay_s=s.get("max_delay_s", 6.0),
            max_retries=s.get("max_retries", 3),
        ),
    )
