from __future__ import annotations
import re
from playwright.async_api import BrowserContext
from .base import BaseScraper
from ..models import ScrapePayload
from ..dedup import filter_new


class IndeedScraper(BaseScraper):
    platform = "indeed"
    RESULTS_PER_PAGE = 15

    async def _scrape(self, context: BrowserContext, platform_cfg, full_refresh: bool) -> int:
        total = 0
        for query in platform_cfg.queries:
            count = await self._scrape_query(context, query, platform_cfg, full_refresh)
            total += count
        return total

    async def _scrape_query(self, context, query: str, cfg, full_refresh: bool) -> int:
        page = await self._new_stealth_page(context)
        processed = 0
        start_offset = 0 if full_refresh else (int(self.state.get_cursor(self.platform) or 0))

        try:
            for page_num in range(cfg.max_pages):
                start = start_offset + page_num * self.RESULTS_PER_PAGE
                url = (
                    f"https://www.indeed.com/jobs"
                    f"?q={query.replace(' ', '+')}"
                    f"&l={cfg.location.replace(' ', '+')}"
                    f"&sort=date&start={start}"
                )

                await page.goto(url)
                await self._human_delay()

                jobs = await self._extract_job_cards(page)
                if not jobs:
                    break

                new_jobs = filter_new(self.platform, jobs, self.state)
                if not new_jobs and not full_refresh:
                    break

                for job in new_jobs:
                    detail = await self._fetch_detail(context, job.job_link)
                    if detail:
                        job = job.model_copy(update=detail)

                    result = await self.post_job(job)
                    if result:
                        self.state.mark_seen(self.platform, [job.external_job_id])
                        processed += 1

                    await self._human_delay(1.0, 2.5)

                self.state.set_cursor(self.platform, str(start + self.RESULTS_PER_PAGE))

        finally:
            if page:
                await page.close()

        return processed

    async def _extract_job_cards(self, page) -> list[ScrapePayload]:
        jobs = []
        cards = page.locator("div.job_seen_beacon, div[data-jk]")
        count = await cards.count()

        for i in range(count):
            try:
                card = cards.nth(i)
                job_id = await card.get_attribute("data-jk") or ""
                if not job_id:
                    continue

                title_el = card.locator("h2.jobTitle a, a[data-jk]")
                title = (await title_el.first.inner_text()).strip() if await title_el.count() > 0 else "Unknown"

                company_el = card.locator("[data-testid='company-name'], .companyName")
                company = (await company_el.first.inner_text()).strip() if await company_el.count() > 0 else "Unknown"

                location_el = card.locator("[data-testid='text-location'], .companyLocation")
                location = (await location_el.first.inner_text()).strip() if await location_el.count() > 0 else None

                salary_el = card.locator(".salary-snippet-container, [data-testid='attribute_snippet_testid']")
                salary_text = (await salary_el.first.inner_text()).strip() if await salary_el.count() > 0 else None

                job_link = f"https://www.indeed.com/viewjob?jk={job_id}"
                is_remote = location is not None and "remote" in location.lower()

                jobs.append(ScrapePayload(
                    source_platform="indeed",
                    external_job_id=job_id,
                    company_name=company,
                    job_title=title,
                    job_link=job_link,
                    job_location=location,
                    is_remote=is_remote,
                    salary_text=salary_text,
                ))
            except Exception as e:
                print(f"[WARN] Failed to parse Indeed card {i}: {e}")
                continue

        return jobs

    async def _fetch_detail(self, context: BrowserContext, job_link: str) -> dict | None:
        page = None
        try:
            page = await self._new_stealth_page(context)
            await page.goto(job_link)
            await self._human_delay(1.0, 2.5)

            desc_el = page.locator("#jobDescriptionText, .jobsearch-jobDescriptionText")
            description = None
            if await desc_el.count() > 0:
                description = (await desc_el.first.inner_text()).strip()

            return {"job_description": description} if description else None
        except Exception as e:
            print(f"[WARN] Failed to fetch Indeed detail {job_link}: {e}")
            return None
        finally:
            if page:
                await page.close()
