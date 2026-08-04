// API-013 slice 1: catalog tag mutation is now admin-only. This legacy path is a
// DEPRECATED admin-gated alias of the canonical `PATCH /api/admin/jobs/[id]/tags`.
import { deprecatedAlias } from '@/lib/http'
import { patchCatalogJobTags } from '@/lib/admin-catalog-handlers'

export const PATCH = deprecatedAlias(patchCatalogJobTags, '/api/admin/jobs/[id]/tags')
