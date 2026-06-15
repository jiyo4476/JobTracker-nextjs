import pytest, json, tempfile
from pathlib import Path
from scraper.state import ScraperState, DEDUP_WINDOW


def make_state(tmp_path):
    return ScraperState(path=tmp_path / "state.json")


def test_cursor_roundtrip(tmp_path):
    s = make_state(tmp_path)
    assert s.get_cursor("linkedin") is None
    s.set_cursor("linkedin", "2024-06-01")
    s2 = ScraperState(path=tmp_path / "state.json")  # reload
    assert s2.get_cursor("linkedin") == "2024-06-01"


def test_dedup(tmp_path):
    s = make_state(tmp_path)
    s.mark_seen("linkedin", ["a", "b", "c"])
    assert s.is_seen("linkedin", "a")
    assert not s.is_seen("linkedin", "z")


def test_clear_platform(tmp_path):
    s = make_state(tmp_path)
    s.set_cursor("linkedin", "2024-01-01")
    s.mark_seen("linkedin", ["x"])
    s.clear_platform("linkedin")
    assert s.get_cursor("linkedin") is None
    assert not s.is_seen("linkedin", "x")


def test_rolling_window(tmp_path):
    s = make_state(tmp_path)
    ids = [str(i) for i in range(DEDUP_WINDOW + 5)]
    s.mark_seen("indeed", ids)
    # first 5 should have been evicted
    assert not s.is_seen("indeed", "0")
    assert s.is_seen("indeed", str(DEDUP_WINDOW + 4))
