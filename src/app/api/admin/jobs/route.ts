// API-013 slice 1 — canonical admin catalog creation.
// Admin-only: gated inside the shared handler via resolveAdminUser.
export { createCatalogJob as POST } from '@/lib/admin-catalog-handlers'
