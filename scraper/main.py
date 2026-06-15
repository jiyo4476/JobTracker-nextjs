from __future__ import annotations
import argparse, asyncio
from .config import load_config
from .state import ScraperState
from .platforms.linkedin import LinkedInScraper
from .platforms.indeed import IndeedScraper
from .platforms.glassdoor import GlassdoorScraper
from .platforms.dice import DiceScraper

SCRAPERS = {
    "linkedin": LinkedInScraper,
    "indeed": IndeedScraper,
    "glassdoor": GlassdoorScraper,
    "dice": DiceScraper,
}


async def run(args):
    config = load_config()
    state = ScraperState()

    platforms = [args.platform] if args.platform else list(SCRAPERS.keys())
    total = 0

    for name in platforms:
        cls = SCRAPERS.get(name)
        if not cls:
            print(f"[ERROR] Unknown platform: {name}")
            continue
        scraper = cls(config, state, dry_run=args.dry_run, headless=args.headless)
        try:
            count = await scraper.run(full_refresh=args.full_refresh)
            total += count
            print(f"[{name}] processed {count} jobs")
        except NotImplementedError as e:
            print(f"[{name}] skipped: {e}")
        except Exception as e:
            print(f"[{name}] ERROR: {e}")

    print(f"\nTotal jobs processed: {total}")


def main():
    parser = argparse.ArgumentParser(description="Job board scraper")
    parser.add_argument("--platform", choices=list(SCRAPERS.keys()), help="Single platform to scrape")
    parser.add_argument("--full-refresh", action="store_true", help="Ignore cursors, re-scrape everything")
    parser.add_argument("--dry-run", action="store_true", help="Scrape and print; do not POST to API")
    parser.add_argument("--headless", action="store_true", help="Run browser headlessly")
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
