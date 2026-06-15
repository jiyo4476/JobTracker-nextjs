import pytest, yaml
from pathlib import Path
from scraper.config import load_config

SAMPLE_CONFIG = {
    "api": {"base_url": "http://localhost:3000", "key": "testkey"},
    "proxy": {"enabled": False, "url": ""},
    "platforms": {
        "linkedin": {"enabled": True, "queries": ["software engineer"], "location": "US", "max_pages": 2},
        "indeed": {"enabled": False, "queries": [], "max_pages": 1},
    },
    "scraper": {"headless": True, "min_delay_s": 0.1, "max_delay_s": 0.2, "max_retries": 1},
}


def test_load_config(tmp_path):
    cfg_file = tmp_path / "config.yml"
    cfg_file.write_text(yaml.dump(SAMPLE_CONFIG))
    cfg = load_config(cfg_file)
    assert cfg.api_key == "testkey"
    assert cfg.platforms["linkedin"].enabled is True
    assert cfg.platforms["indeed"].enabled is False
    assert cfg.scraper.headless is True
