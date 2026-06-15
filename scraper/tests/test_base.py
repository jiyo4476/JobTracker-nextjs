import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from scraper.platforms.base import BaseScraper
from scraper.config import Config, PlatformConfig, ScraperSettings
from scraper.state import ScraperState
from scraper.models import ScrapePayload, ScrapeResponse


def _make_config(enabled: bool = True) -> Config:
    return Config(
        api_base_url="http://localhost:3000",
        api_key="testkey",
        proxy_enabled=False,
        proxy_url="",
        platforms={
            "test": PlatformConfig(
                enabled=enabled,
                queries=["engineer"],
                location="US",
                remote_only=False,
                max_pages=1,
            )
        },
        scraper=ScraperSettings(
            headless=True,
            min_delay_s=0.0,
            max_delay_s=0.0,
            max_retries=2,
        ),
    )


class ConcreteScraper(BaseScraper):
    platform = "test"

    async def _scrape(self, context, platform_cfg, full_refresh):
        return 0


def _make_scraper(enabled=True, dry_run=False) -> ConcreteScraper:
    import tempfile, pathlib
    cfg = _make_config(enabled)
    state = ScraperState(path=pathlib.Path(tempfile.mktemp(suffix=".json")))
    return ConcreteScraper(cfg, state, dry_run=dry_run, headless=True)


def test_dry_run_does_not_post():
    scraper = _make_scraper(dry_run=True)
    payload = ScrapePayload(
        source_platform="linkedin",
        external_job_id="1",
        company_name="X",
        job_title="Y",
        job_link="https://example.com/1",
    )
    result = asyncio.run(scraper.post_job(payload))
    assert result is None  # dry-run returns None without calling API


def test_disabled_platform_returns_zero():
    scraper = _make_scraper(enabled=False)
    # Override platform name to match config key
    scraper.platform = "test"
    # Config has "test" disabled
    scraper.config.platforms["test"].enabled = False
    count = asyncio.run(scraper.run())
    assert count == 0


@pytest.mark.asyncio
async def test_post_job_retries_on_failure():
    scraper = _make_scraper()
    payload = ScrapePayload(
        source_platform="linkedin",
        external_job_id="99",
        company_name="Retry Corp",
        job_title="Dev",
        job_link="https://example.com/99",
    )

    import httpx
    call_count = 0

    async def mock_post(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        raise httpx.RequestError("timeout")

    with patch("httpx.AsyncClient") as MockClient:
        instance = AsyncMock()
        instance.__aenter__ = AsyncMock(return_value=instance)
        instance.__aexit__ = AsyncMock(return_value=False)
        instance.post = mock_post
        MockClient.return_value = instance

        result = await scraper.post_job(payload)

    assert result is None
    assert call_count == scraper.config.scraper.max_retries


@pytest.mark.asyncio
async def test_save_session_called_even_when_scrape_raises():
    """_save_session must be in finally so cookies persist even on scrape error."""
    import pathlib, tempfile

    class FailingScraper(BaseScraper):
        platform = "test"

        async def _scrape(self, context, platform_cfg, full_refresh):
            raise RuntimeError("scrape exploded")

    cfg = _make_config()
    state = ScraperState(path=pathlib.Path(tempfile.mktemp(suffix=".json")))
    scraper = FailingScraper(cfg, state, headless=True)

    mock_context = AsyncMock()
    mock_context.storage_state = AsyncMock(return_value={"cookies": [], "origins": []})
    mock_context.browser = MagicMock()
    mock_context.browser.close = AsyncMock()

    mock_pw = AsyncMock()
    mock_pw.__aenter__ = AsyncMock(return_value=mock_pw)
    mock_pw.__aexit__ = AsyncMock(return_value=False)

    with patch.object(scraper, "_build_context", return_value=mock_context), \
         patch("scraper.platforms.base.async_playwright", return_value=mock_pw):
        with pytest.raises(RuntimeError, match="scrape exploded"):
            await scraper.run()

    mock_context.storage_state.assert_called_once()


@pytest.mark.asyncio
async def test_mark_seen_not_called_when_post_returns_none():
    """state.mark_seen must NOT be called if post_job returns None (dry run or error)."""
    import pathlib, tempfile

    class OneShotScraper(BaseScraper):
        platform = "test"

        async def _scrape(self, context, platform_cfg, full_refresh):
            payload = ScrapePayload(
                source_platform="test",
                external_job_id="abc",
                company_name="Acme",
                job_title="Dev",
                job_link="https://example.com",
            )
            result = await self.post_job(payload)
            if result:
                self.state.mark_seen(self.platform, [payload.external_job_id])
            return 1

    cfg = _make_config()
    state = ScraperState(path=pathlib.Path(tempfile.mktemp(suffix=".json")))
    scraper = OneShotScraper(cfg, state, dry_run=True, headless=True)

    mock_context = AsyncMock()
    mock_context.storage_state = AsyncMock(return_value={"cookies": [], "origins": []})
    mock_context.browser = MagicMock()
    mock_context.browser.close = AsyncMock()

    mock_pw = AsyncMock()
    mock_pw.__aenter__ = AsyncMock(return_value=mock_pw)
    mock_pw.__aexit__ = AsyncMock(return_value=False)

    with patch.object(scraper, "_build_context", return_value=mock_context), \
         patch("scraper.platforms.base.async_playwright", return_value=mock_pw):
        await scraper.run()

    assert not state.has_seen("test", "abc")
