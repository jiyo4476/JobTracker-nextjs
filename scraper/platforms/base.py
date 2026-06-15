from __future__ import annotations
import asyncio, random, json
from abc import ABC, abstractmethod
from pathlib import Path
from playwright.async_api import async_playwright, BrowserContext, Page
from playwright_stealth import Stealth as _Stealth
_stealth = _Stealth()
import httpx
from ..config import Config
from ..models import ScrapePayload, ScrapeResponse
from ..state import ScraperState
from ..dedup import filter_new

SESSIONS_DIR = Path(__file__).parent.parent / "session"
UA_LIST = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]
VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1440, "height": 900},
    {"width": 1366, "height": 768},
    {"width": 2560, "height": 1440},
]


class BaseScraper(ABC):
    platform: str  # subclasses set this as class var

    def __init__(self, config: Config, state: ScraperState, dry_run: bool = False, headless: bool | None = None):
        self.config = config
        self.state = state
        self.dry_run = dry_run
        self.headless = headless if headless is not None else config.scraper.headless
        self._ua = random.choice(UA_LIST)
        self._viewport = random.choice(VIEWPORTS)
        self._session_file = SESSIONS_DIR / f"{self.platform}.json"
        SESSIONS_DIR.mkdir(exist_ok=True)

    async def _build_context(self, playwright) -> BrowserContext:
        """Launch browser with stealth + proxy if configured."""
        launch_kwargs = {"headless": self.headless}
        if self.config.proxy_enabled and self.config.proxy_url:
            launch_kwargs["proxy"] = {"server": self.config.proxy_url}

        browser = await playwright.chromium.launch(**launch_kwargs)

        context_kwargs = {
            "user_agent": self._ua,
            "viewport": self._viewport,
            "locale": random.choice(["en-US", "en-GB"]),
            "timezone_id": "America/New_York",
        }

        # Load saved session cookies if they exist
        if self._session_file.exists():
            storage = json.loads(self._session_file.read_text())
            context_kwargs["storage_state"] = storage

        context = await browser.new_context(**context_kwargs)
        return context

    async def _new_stealth_page(self, context: BrowserContext) -> Page:
        page = await context.new_page()
        await _stealth.apply_stealth_async(page)
        return page

    async def _save_session(self, context: BrowserContext) -> None:
        storage = await context.storage_state()
        self._session_file.write_text(json.dumps(storage))

    async def _human_delay(self, min_s: float | None = None, max_s: float | None = None) -> None:
        lo = min_s if min_s is not None else self.config.scraper.min_delay_s
        hi = max_s if max_s is not None else self.config.scraper.max_delay_s
        await asyncio.sleep(random.uniform(lo, hi))

    async def post_job(self, payload: ScrapePayload) -> ScrapeResponse | None:
        """POST a single job to the API. Returns None on dry-run."""
        if self.dry_run:
            print(f"[DRY RUN] {payload.source_platform} | {payload.company_name} | {payload.job_title}")
            return None

        url = f"{self.config.api_base_url}/api/scrape"
        async with httpx.AsyncClient(timeout=30) as client:
            for attempt in range(self.config.scraper.max_retries):
                try:
                    resp = await client.post(
                        url,
                        json=payload.model_dump(mode="json", exclude_none=True),
                        headers={"Authorization": f"Bearer {self.config.api_key}"},
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    result = ScrapeResponse(**data)
                    print(f"[{result.action.upper()}] {payload.company_name} | {payload.job_title}")
                    return result
                except (httpx.HTTPStatusError, httpx.RequestError) as e:
                    wait = 2 ** attempt
                    print(f"[WARN] POST failed (attempt {attempt+1}): {e}. Retrying in {wait}s")
                    await asyncio.sleep(wait)
        return None

    async def run(self, full_refresh: bool = False) -> int:
        """Main entry point. Returns count of jobs processed."""
        platform_cfg = self.config.platforms.get(self.platform)
        if not platform_cfg or not platform_cfg.enabled:
            print(f"[{self.platform}] disabled, skipping")
            return 0

        if full_refresh:
            self.state.clear_platform(self.platform)

        total = 0
        async with async_playwright() as pw:
            context = await self._build_context(pw)
            try:
                total = await self._scrape(context, platform_cfg, full_refresh)
            finally:
                await self._save_session(context)
                await context.browser.close()

        return total

    @abstractmethod
    async def _scrape(self, context, platform_cfg, full_refresh: bool) -> int:
        """Platform-specific scraping logic. Returns job count processed."""
        ...
