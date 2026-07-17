import { AnalyticsClient } from './AnalyticsClient'
import { parseAnalyticsUrlState } from './analytics-state'

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <AnalyticsClient initialState={parseAnalyticsUrlState(await searchParams)} />
}
