import { expect, test, type Page } from '@playwright/test'
import { ADMIN, USER_A } from './identities'
import { apiFor, createCatalogJob, pageFor } from './fixtures'

/**
 * PAGE-017 acceptance criterion:
 *
 *   "Mobile-4G targets: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1 on Jobs, Detail, and
 *    Dashboard."
 *
 * ## READ THIS BEFORE QUOTING A NUMBER FROM THIS FILE
 *
 * These specs run against the e2e harness, which serves `next dev` — see
 * `e2e/identities.ts` for why: the local dev auth escape is guarded by
 * `NODE_ENV !== 'production'`, and `next start` sets `NODE_ENV=production`, so a
 * production build cannot authenticate a simulated identity without standing up a real
 * OIDC provider or the forward-auth proxy.
 *
 * Consequences for each metric:
 *
 *   LCP  NOT COMPARABLE to the target. Dev serves unminified, unsplit bundles and
 *        compiles routes on demand. The dominant term is the toolchain, not the app.
 *   INP  NOT COMPARABLE for the same reason (dev-mode React plus unminified handlers),
 *        though it is directionally useful for spotting a pathological handler.
 *   CLS  MEANINGFUL. Layout stability is a function of markup, CSS, and whether skeletons
 *        reserve the space their content takes — none of which change between dev and
 *        production builds. This is the one target this harness can legitimately assert.
 *
 * So: CLS is ASSERTED against <= 0.1. LCP and INP are measured, recorded, and attached to
 * the report as evidence, but NOT asserted, because a dev-mode pass would be a false
 * claim and a dev-mode fail would be a false alarm.
 *
 * To produce a quotable LCP/INP number, run this file against a production build behind a
 * real identity provider (or the Authentik forward-auth outpost) and flip
 * `ASSERT_LOADING_METRICS` on via `E2E_PERF_PRODUCTION_PARITY=true`.
 */

// Lighthouse mobile defaults: ~1.6 Mbit/s down, 750 Kbit/s up, 150 ms RTT, 4x CPU slowdown.
const MOBILE_4G = {
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
}
const CPU_THROTTLE_RATE = 4
const MOBILE_VIEWPORT = { width: 412, height: 823 }

const TARGETS = { lcpMs: 2500, inpMs: 200, cls: 0.1 }
const ASSERT_LOADING_METRICS = process.env.E2E_PERF_PRODUCTION_PARITY === 'true'

type Metrics = { lcpMs: number | null; cls: number; inpMs: number | null }

async function throttle(page: Page) {
  const client = await page.context().newCDPSession(page)
  await client.send('Network.enable')
  await client.send('Network.emulateNetworkConditions', { offline: false, ...MOBILE_4G })
  await client.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE_RATE })
  return client
}

/** Installed before navigation so `buffered: true` observers see the very first entries. */
const COLLECTOR = `
  window.__perf = { lcp: null, cls: 0, inp: null };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (!entry.hadRecentInput) window.__perf.cls += entry.value;
    }
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const d = entry.duration;
      if (window.__perf.inp === null || d > window.__perf.inp) window.__perf.inp = d;
    }
  }).observe({ type: 'event', durationThreshold: 16, buffered: true });
`

async function measure(page: Page, path: string, interact: (page: Page) => Promise<void>): Promise<Metrics> {
  await page.addInitScript(COLLECTOR)
  await page.goto(path, { waitUntil: 'load' })
  await page.waitForLoadState('networkidle')
  await interact(page)
  // Give the event-timing observer a beat to flush the interaction it just saw.
  await page.waitForTimeout(500)
  return page.evaluate(() => (window as unknown as { __perf: Metrics & { lcp: number | null; cls: number; inp: number | null } }).__perf)
    .then(raw => ({
      lcpMs: (raw as unknown as { lcp: number | null }).lcp,
      cls: (raw as unknown as { cls: number }).cls,
      inpMs: (raw as unknown as { inp: number | null }).inp,
    }))
}

function report(label: string, metrics: Metrics) {
  const line =
    `${label}: LCP=${metrics.lcpMs === null ? 'n/a' : `${Math.round(metrics.lcpMs)}ms`} ` +
    `INP=${metrics.inpMs === null ? 'n/a' : `${Math.round(metrics.inpMs)}ms`} ` +
    `CLS=${metrics.cls.toFixed(4)} ` +
    `(mobile-4G emulation, ${CPU_THROTTLE_RATE}x CPU, ${ASSERT_LOADING_METRICS ? 'production parity' : 'DEV BUILD — LCP/INP not comparable'})`
  test.info().annotations.push({ type: 'perf', description: line })
  // The measured numbers are the deliverable, so they go to stdout as well as the report.
  console.log(line)
}

function assertMetrics(label: string, metrics: Metrics) {
  report(label, metrics)
  // Always asserted: layout stability does not depend on the build mode.
  expect(metrics.cls, `${label} CLS`).toBeLessThanOrEqual(TARGETS.cls)
  if (!ASSERT_LOADING_METRICS) return
  expect(metrics.lcpMs, `${label} LCP`).not.toBeNull()
  expect(metrics.lcpMs!, `${label} LCP`).toBeLessThanOrEqual(TARGETS.lcpMs)
  if (metrics.inpMs !== null) expect(metrics.inpMs, `${label} INP`).toBeLessThanOrEqual(TARGETS.inpMs)
}

let jobId: number

test.describe('@perf mobile-4G budgets', () => {
  test.describe.configure({ mode: 'serial' })
  test.slow()

  test.beforeAll(async () => {
    jobId = await createCatalogJob(`E2E Perf Probe ${Date.now()}`)
    const api = await apiFor(USER_A)
    try {
      await api.patch(`/api/jobs/${jobId}/state`, { data: { is_hidden: false, priority: 3 } })
    } finally {
      await api.dispose()
    }
  })

  test.afterAll(async () => {
    const api = await apiFor(ADMIN)
    try {
      if (jobId) await api.delete(`/api/admin/jobs/${jobId}`)
    } finally {
      await api.dispose()
    }
  })

  test('Dashboard', async ({ browser }) => {
    const page = await pageFor(browser, USER_A)
    await page.setViewportSize(MOBILE_VIEWPORT)
    await throttle(page)
    const metrics = await measure(page, '/', async (p) => {
      await p.getByRole('link', { name: 'Jobs' }).first().hover()
    })
    assertMetrics('Dashboard /', metrics)
    await page.close()
  })

  test('Jobs list', async ({ browser }) => {
    const page = await pageFor(browser, USER_A)
    await page.setViewportSize(MOBILE_VIEWPORT)
    await throttle(page)
    const metrics = await measure(page, '/jobs', async (p) => {
      await p.getByRole('tab', { name: 'Browse Catalog' }).click()
      await p.waitForLoadState('networkidle')
    })
    assertMetrics('Jobs /jobs', metrics)
    await page.close()
  })

  test('Job detail', async ({ browser }) => {
    const page = await pageFor(browser, USER_A)
    await page.setViewportSize(MOBILE_VIEWPORT)
    await throttle(page)
    const metrics = await measure(page, `/jobs/${jobId}`, async (p) => {
      await p.getByLabel('Interview stage').selectOption('applied')
    })
    assertMetrics(`Job detail /jobs/${jobId}`, metrics)
    await page.close()
  })
})
