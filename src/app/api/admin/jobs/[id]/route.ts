// API-013 slice 1 — canonical admin catalog mutation for a single job.
// PATCH updates catalog fields only (personal-state fields are rejected by the
// jobCatalogPatchSchema); DELETE is the global soft-delete. Both are admin-gated inside
// the shared handlers via resolveAdminUser.
export { patchCatalogJob as PATCH, deleteCatalogJob as DELETE } from '@/lib/admin-catalog-handlers'
