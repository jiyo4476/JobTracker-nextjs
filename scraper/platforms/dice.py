from __future__ import annotations
from playwright.async_api import BrowserContext
from .base import BaseScraper


class DiceScraper(BaseScraper):
    platform = "dice"

    async def _scrape(self, context: BrowserContext, platform_cfg, full_refresh: bool) -> int:
        raise NotImplementedError(
            "Dice scraper not yet implemented. Enable another platform or implement _scrape()."
        )
