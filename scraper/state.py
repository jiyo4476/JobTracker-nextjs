from __future__ import annotations
import json
from pathlib import Path
from collections import deque

SCRAPER_DIR = Path(__file__).parent
STATE_FILE = SCRAPER_DIR / "state.json"
DEDUP_WINDOW = 10_000  # max external_job_ids kept per platform


class ScraperState:
    """
    Persists per-platform cursors and a rolling dedup set of seen job IDs.
    Safe to read/write between interrupted runs — always flushes atomically.
    """

    def __init__(self, path: Path = STATE_FILE):
        self._path = path
        self._data: dict = self._load()

    def _load(self) -> dict:
        if self._path.exists():
            with open(self._path) as f:
                return json.load(f)
        return {}

    def _save(self) -> None:
        tmp = self._path.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(self._data, f, indent=2)
        tmp.replace(self._path)

    def _platform(self, platform: str) -> dict:
        if platform not in self._data:
            self._data[platform] = {"cursor": None, "seen_ids": []}
        return self._data[platform]

    def get_cursor(self, platform: str) -> str | None:
        return self._platform(platform).get("cursor")

    def set_cursor(self, platform: str, cursor: str | None) -> None:
        self._platform(platform)["cursor"] = cursor
        self._save()

    def is_seen(self, platform: str, job_id: str) -> bool:
        return job_id in self._platform(platform).get("seen_ids", [])

    def mark_seen(self, platform: str, job_ids: list[str]) -> None:
        p = self._platform(platform)
        seen: deque[str] = deque(p.get("seen_ids", []), maxlen=DEDUP_WINDOW)
        for jid in job_ids:
            seen.append(jid)
        p["seen_ids"] = list(seen)
        self._save()

    def clear_platform(self, platform: str) -> None:
        """Reset cursor and seen IDs for a full-refresh run."""
        self._data[platform] = {"cursor": None, "seen_ids": []}
        self._save()
