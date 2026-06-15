from __future__ import annotations
import re
from datetime import date
from playwright.async_api import BrowserContext
from .base import BaseScraper
from ..models import ScrapePayload
from ..dedup import filter_new


class LinkedInScraper(BaseScraper):
    platform = "linkedin"

    async def _scrape(self, context: BrowserContext, platform_cfg, full_refresh: bool) -> int:
        total = 0
        for query in platform_cfg.queries:
            count = await self._scrape_query(context, query, platform_cfg, full_refresh)
            total += count
        return total

    async def _scrape_query(self, context, query: str, cfg, full_refresh: bool) -> int:
        page = await self._new_stealth_page(context)
        processed = 0

        try:
            params = f"keywords={query.replace(' ', '%20')}&location={cfg.location.replace(' ', '%20')}&sortBy=DD"
            if cfg.remote_only:
                params += "&f_WT=2"

            await page.goto(f"https://www.linkedin.com/jobs/search/?{params}")
            await self._human_delay()

            for page_num in range(cfg.max_pages):
                jobs = await self._extract_job_cards(page)
                if not jobs:
                    break

                new_jobs = filter_new(self.platform, jobs, self.state)
                if not new_jobs and not full_refresh:
                    break

                for job in new_jobs:
                    # Fetch detail page for description
                    detail = await self._fetch_detail(context, job.job_link)
                    if detail:
                        job = job.model_copy(update=detail)

                    result = await self.post_job(job)
                    if result:
                        self.state.mark_seen(self.platform, [job.external_job_id])
                        processed += 1

                    await self._human_delay(1.0, 3.0)

                # Update cursor to most recent date seen
                if jobs:
                    self.state.set_cursor(self.platform, str(date.today()))

                # Try to go to next page
                next_btn = page.locator("button[aria-label='Next']")
                if await next_btn.count() == 0:
                    break
                await next_btn.click()
                await self._human_delay()

        finally:
            await page.close()

        return processed

    async def _extract_job_cards(self, page) -> list[ScrapePayload]:
        """Extract job listings from the search results page."""
        jobs = []
        cards = page.locator("li.jobs-search-results__list-item")
        count = await cards.count()

        for i in range(count):
            try:
                card = cards.nth(i)

                title_el = card.locator("a.job-card-list__title, a.base-card__full-link")
                href = await title_el.get_attribute("href") or ""
                title = (await title_el.inner_text()).strip()

                company_el = card.locator(".job-card-container__primary-description, .base-search-card__subtitle")
                company = (await company_el.first.inner_text()).strip() if await company_el.count() > 0 else "Unknown"

                location_el = card.locator(".job-card-container__metadata-item, .job-search-card__location")
                location = (await location_el.first.inner_text()).strip() if await location_el.count() > 0 else None

                # Extract job ID from URL
                match = re.search(r'/jobs/view/(\d+)', href)
                if not match:
                    continue
                job_id = match.group(1)

                # Clean URL
                job_link = f"https://www.linkedin.com/jobs/view/{job_id}/"

                is_remote = location is not None and "remote" in location.lower()

                jobs.append(ScrapePayload(
                    source_platform="linkedin",
                    external_job_id=job_id,
                    company_name=company,
                    job_title=title,
                    job_link=job_link,
                    job_location=location,
                    is_remote=is_remote,
                ))
            except Exception as e:
                print(f"[WARN] Failed to parse LinkedIn card {i}: {e}")
                continue

        return jobs

    async def _fetch_detail(self, context: BrowserContext, job_link: str) -> dict | None:
        """Fetch job description and salary from detail page."""
        page = await self._new_stealth_page(context)
        try:
            await page.goto(job_link)
            await self._human_delay(1.5, 3.0)

            desc_el = page.locator(".job-view-layout .jobs-description__content, .show-more-less-html__markup")
            description = None
            if await desc_el.count() > 0:
                description = (await desc_el.first.inner_text()).strip()

            salary_el = page.locator(".compensation__salary-range, [data-test-salary-range]")
            salary_text = None
            if await salary_el.count() > 0:
                salary_text = (await salary_el.first.inner_text()).strip()

            date_el = page.locator("time[datetime]")
            date_posted = None
            if await date_el.count() > 0:
                date_posted = await date_el.first.get_attribute("datetime")

            return {k: v for k, v in {
                "job_description": description,
                "salary_text": salary_text,
                "date_posted": date_posted,
            }.items() if v is not None}

        except Exception as e:
            print(f"[WARN] Failed to fetch detail {job_link}: {e}")
            return None
        finally:
            await page.close()
