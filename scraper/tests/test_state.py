import json
from pathlib import Path
import pytest
from scraper.state import ScraperState, DEDUP_WINDOW


def _state(tmp_path: Path) -> ScraperState:
    return ScraperState(path=tmp_path / "state.json")


def test_cursor_roundtrip(tmp_path):
    s = _state(tmp_path)
    assert s.get_cursor("linkedin") is None
    s.set_cursor("linkedin", "2024-06-01")
    s2 = ScraperState(path=tmp_path / "state.json")
    assert s2.get_cursor("linkedin") == "2024-06-01"


def test_mark_and_check_seen(tmp_path):
    s = _state(tmp_path)
    s.mark_seen("linkedin", ["aaa", "bbb"])
    assert s.is_seen("linkedin", "aaa")
    assert s.is_seen("linkedin", "bbb")
    assert not s.is_seen("linkedin", "zzz")


def test_seen_persists_across_reload(tmp_path):
    s = _state(tmp_path)
    s.mark_seen("indeed", ["x"])
    s2 = ScraperState(path=tmp_path / "state.json")
    assert s2.is_seen("indeed", "x")


def test_platforms_isolated(tmp_path):
    s = _state(tmp_path)
    s.mark_seen("linkedin", ["shared-id"])
    assert not s.is_seen("indeed", "shared-id")


def test_clear_platform(tmp_path):
    s = _state(tmp_path)
    s.set_cursor("linkedin", "2024-01-01")
    s.mark_seen("linkedin", ["x", "y"])
    s.clear_platform("linkedin")
    assert s.get_cursor("linkedin") is None
    assert not s.is_seen("linkedin", "x")


def test_rolling_window_evicts_oldest(tmp_path):
    s = _state(tmp_path)
    ids = [str(i) for i in range(DEDUP_WINDOW + 10)]
    s.mark_seen("linkedin", ids)
    # first 10 evicted
    for i in range(10):
        assert not s.is_seen("linkedin", str(i))
    # last ones retained
    assert s.is_seen("linkedin", str(DEDUP_WINDOW + 9))


def test_atomic_write_leaves_no_tmp(tmp_path):
    s = _state(tmp_path)
    s.set_cursor("linkedin", "2024-01-01")
    tmp = tmp_path / "state.tmp"
    assert not tmp.exists()
