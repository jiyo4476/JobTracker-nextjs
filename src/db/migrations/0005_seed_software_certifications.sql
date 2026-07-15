-- TAXONOMY-001: forward seed for software and certifications lookup tables.
-- Mirrors the canonical names in SOFTWARE_CATALOG and CERTIFICATION_CATALOG
-- (src/lib/nlp-extract.ts). Additive only — the already-applied skills seed
-- (0001_seed_swe_skills.sql) is left untouched, and no skills/job_skills rows
-- are removed here: legacy links may be manual or referenced by user_skills,
-- so any cleanup of misclassified links is a separate, reviewed step.

INSERT INTO "software" ("name") VALUES

-- ── Workplace & collaboration tools ───────────────────────────────────────────
('Jira'),
('Confluence'),
('Slack'),
('Bitbucket'),
('VS Code'),
('IntelliJ'),
('Figma'),
('Notion'),
('Splunk'),
('Tableau'),
('Git'),
('GitHub'),
('GitLab'),

-- ── Frontend frameworks & libraries ───────────────────────────────────────────
('React'),
('React Native'),
('Angular'),
('Vue.js'),
('Svelte'),
('SvelteKit'),
('Next.js'),
('Nuxt.js'),
('Remix'),
('Redux'),
('Zustand'),
('Recoil'),
('MobX'),
('TanStack Query'),
('TanStack Table'),
('Framer Motion'),
('Tailwind CSS'),
('Three.js'),
('D3.js'),
('Recharts'),
('Chart.js'),
('Webpack'),
('Rollup'),
('Vite'),
('esbuild'),

-- ── Backend frameworks & runtimes ─────────────────────────────────────────────
('Node.js'),
('Express.js'),
('Fastify'),
('NestJS'),
('Django'),
('Flask'),
('FastAPI'),
('Ruby on Rails'),
('Laravel'),
('Spring Boot'),
('ASP.NET Core'),
('tRPC'),

-- ── ORMs & database tooling ───────────────────────────────────────────────────
('Prisma'),
('Drizzle ORM'),
('SQLAlchemy'),
('Hibernate'),

-- ── Databases ─────────────────────────────────────────────────────────────────
('PostgreSQL'),
('MySQL'),
('SQLite'),
('MongoDB'),
('Redis'),
('Elasticsearch'),
('DynamoDB'),
('Cassandra'),
('Neo4j'),
('CockroachDB'),
('Supabase'),
('PlanetScale'),

-- ── Cloud platforms & hosting ─────────────────────────────────────────────────
('AWS'),
('GCP'),
('Azure'),
('Cloudflare'),
('Vercel'),
('Netlify'),
('Heroku'),
('Railway'),

-- ── DevOps, CI/CD & infrastructure products ───────────────────────────────────
('Docker'),
('Kubernetes'),
('Helm'),
('Terraform'),
('Ansible'),
('Pulumi'),
('GitHub Actions'),
('GitLab CI/CD'),
('CircleCI'),
('Jenkins'),
('Nginx'),
('Apache'),
('Linux'),

-- ── Monitoring & observability products ───────────────────────────────────────
('Prometheus'),
('Grafana'),
('Datadog'),
('OpenTelemetry'),

-- ── Data & ML tools ───────────────────────────────────────────────────────────
('PyTorch'),
('TensorFlow'),
('Keras'),
('scikit-learn'),
('Hugging Face Transformers'),
('LangChain'),
('OpenAI API'),
('Pandas'),
('NumPy'),
('Matplotlib'),
('Jupyter Notebooks'),
('MLflow'),
('Spark'),
('Kafka'),
('RabbitMQ'),
('Airflow'),
('dbt'),
('Snowflake'),
('BigQuery'),

-- ── Mobile frameworks & toolkits ──────────────────────────────────────────────
('Flutter'),
('Expo'),
('SwiftUI'),
('Jetpack Compose'),

-- ── Testing tools ─────────────────────────────────────────────────────────────
('Playwright'),
('Cypress'),
('Selenium'),
('Vitest'),
('Jest'),
('PyTest'),
('JUnit')

ON CONFLICT ON CONSTRAINT software_name_unique DO NOTHING;
--> statement-breakpoint

INSERT INTO "certifications" ("name") VALUES

-- ── AWS ───────────────────────────────────────────────────────────────────────
('AWS Certified Solutions Architect'),
('AWS Certified Developer'),
('AWS Certified SysOps Administrator'),
('AWS Certified DevOps Engineer'),
('AWS Certified Cloud Practitioner'),
('AWS Certified Security'),
('AWS Certified'),

-- ── Azure ─────────────────────────────────────────────────────────────────────
('Microsoft Certified: Azure Fundamentals'),
('Microsoft Certified: Azure Administrator'),
('Microsoft Certified: Azure Solutions Architect'),
('Microsoft Certified: Azure DevOps Engineer'),
('Azure Certified'),

-- ── Google Cloud ──────────────────────────────────────────────────────────────
('Google Cloud Professional Cloud Architect'),
('Google Cloud Associate Cloud Engineer'),
('Google Cloud Professional Data Engineer'),
('GCP Certified'),

-- ── CompTIA ───────────────────────────────────────────────────────────────────
('CompTIA Security+'),
('CompTIA Network+'),
('CompTIA A+'),
('CompTIA'),

-- ── Security & management ─────────────────────────────────────────────────────
('CISSP'),
('CISM'),
('CEH'),
('PMP'),
('CPA'),

-- ── Kubernetes & HashiCorp ────────────────────────────────────────────────────
('Certified Kubernetes Administrator (CKA)'),
('Certified Kubernetes Application Developer (CKAD)'),
('HashiCorp Terraform Associate')

ON CONFLICT ON CONSTRAINT certifications_name_unique DO NOTHING;
