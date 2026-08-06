import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",

  /**
   * PAGE-017 — deep-link map for the catalog/personal split.
   *
   * The full map (including the routes whose PATH is unchanged but whose capability
   * moved) is documented in the vault at `.obsidian/App/Page Routes.md`. Only the
   * genuinely non-resolving paths need a real redirect, and they are all in the new
   * `/admin` namespace:
   *
   *   /admin              → the catalog view of the jobs list
   *   /admin/jobs         → same; there is no separate admin list, the catalog scope IS it
   *   /admin/jobs/:id     → that posting's catalog editor (the only admin surface per job)
   *
   * Deliberately NOT redirected:
   *   /jobs/:id/edit  still resolves — it is now the PERSONAL application editor. Catalog
   *                   editing moved to /admin/jobs/:id/edit, but redirecting the path
   *                   would break the personal editor that legitimately lives there.
   *   /jobs/new       still resolves — it is now catalog search/select. Admin catalog
   *                   creation is a separate page at /admin/jobs/new.
   * Both are covered in the vault map instead.
   *
   * These are 307 (temporary) rather than 308: they are convenience entry points into a
   * young namespace, and a permanently cached redirect would be hard to walk back if an
   * actual admin index page is added later.
   */
  redirects() {
    return Promise.resolve([
      { source: "/admin", destination: "/jobs?scope=catalog", permanent: false },
      { source: "/admin/jobs", destination: "/jobs?scope=catalog", permanent: false },
      // The `\\d+` constraint matters: redirects are checked BEFORE the filesystem, so an
      // unconstrained `:id` would swallow `/admin/jobs/new` and send it to a 404.
      { source: "/admin/jobs/:id(\\d+)", destination: "/admin/jobs/:id/edit", permanent: false },
    ]);
  },
};

export default nextConfig;
