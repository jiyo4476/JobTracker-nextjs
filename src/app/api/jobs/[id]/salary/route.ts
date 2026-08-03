// API-013 slice 1: catalog salary mutation is now admin-only. This legacy path is a
// DEPRECATED admin-gated alias of the canonical `PATCH /api/admin/jobs/[id]/salary`.
import { deprecatedAlias } from '@/lib/http'
import { patchCatalogJobSalary } from '@/lib/admin-catalog-handlers'

export const PATCH = deprecatedAlias(patchCatalogJobSalary, '/api/admin/jobs/[id]/salary')
