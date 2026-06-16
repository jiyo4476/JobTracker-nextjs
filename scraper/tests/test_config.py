import yaml
import pytest
from pathlib import Path
from scraper.config import load_config

SAMPLE = {
    "api": {"base_url": "http://localhost:3000", "key": "test-key"},
    "proxy": {"enabled": False, "url": ""},
    "platforms": {
        "linkedin": {
            "enabled": True,
            "queries": ["software engineer", "devops engineer"],
            "location": "United States",
            "remote_only": False,
            "max_pages": 3,
        },
        "indeed": {
            "enabled": False,
            "queries": [],
            "location": "Remote",
            "max_pages": 2,
        },
    },
    "scraper": {
        "headless": True,
        "min_delay_s": 0.1,
        "max_delay_s": 0.2,
        "max_retries": 1,
    },
}


@pytest.fixture()
def cfg_file(tmp_path: Path) -> Path:
    f = tmp_path / "config.yml"
    f.write_text(yaml.dump(SAMPLE))
    return f


def test_loads_api_settings(cfg_file):
    cfg = load_config(cfg_file)
    assert cfg.api_base_url == "http://localhost:3000"
    assert cfg.api_key == "test-key"


def test_loads_platform_config(cfg_file):
    cfg = load_config(cfg_file)
    li = cfg.platforms["linkedin"]
    assert li.enabled is True
    assert li.queries == ["software engineer", "devops engineer"]
    assert li.max_pages == 3


def test_disabled_platform(cfg_file):
    cfg = load_config(cfg_file)
    assert cfg.platforms["indeed"].enabled is False


def test_scraper_settings(cfg_file):
    cfg = load_config(cfg_file)
    assert cfg.scraper.headless is True
    assert cfg.scraper.min_delay_s == 0.1


def test_proxy_disabled(cfg_file):
    cfg = load_config(cfg_file)
    assert cfg.proxy_enabled is False
