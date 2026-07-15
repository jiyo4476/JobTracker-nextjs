-- Manual rollback for 0005_seed_software_certifications.sql
-- Run with: psql $DATABASE_URL -f src/db/migrations/0005_seed_software_certifications_down.sql
-- Skips rows that are already in use (job_software / job_certifications).

DELETE FROM "software"
WHERE "name" IN (
  'Jira','Confluence','Slack','Bitbucket','VS Code','IntelliJ','Figma','Notion',
  'Splunk','Tableau','Git','GitHub','GitLab','React','React Native','Angular',
  'Vue.js','Svelte','SvelteKit','Next.js','Nuxt.js','Remix','Redux','Zustand',
  'Recoil','MobX','TanStack Query','TanStack Table','Framer Motion',
  'Tailwind CSS','Three.js','D3.js','Recharts','Chart.js','Webpack','Rollup',
  'Vite','esbuild','Node.js','Express.js','Fastify','NestJS','Django','Flask',
  'FastAPI','Ruby on Rails','Laravel','Spring Boot','ASP.NET Core','tRPC',
  'Prisma','Drizzle ORM','SQLAlchemy','Hibernate','PostgreSQL','MySQL','SQLite',
  'MongoDB','Redis','Elasticsearch','DynamoDB','Cassandra','Neo4j','CockroachDB',
  'Supabase','PlanetScale','AWS','GCP','Azure','Cloudflare','Vercel','Netlify',
  'Heroku','Railway','Docker','Kubernetes','Helm','Terraform','Ansible','Pulumi',
  'GitHub Actions','GitLab CI/CD','CircleCI','Jenkins','Nginx','Apache','Linux',
  'Prometheus','Grafana','Datadog','OpenTelemetry','PyTorch','TensorFlow',
  'Keras','scikit-learn','Hugging Face Transformers','LangChain','OpenAI API',
  'Pandas','NumPy','Matplotlib','Jupyter Notebooks','MLflow','Spark','Kafka',
  'RabbitMQ','Airflow','dbt','Snowflake','BigQuery','Flutter','Expo','SwiftUI',
  'Jetpack Compose','Playwright','Cypress','Selenium','Vitest','Jest','PyTest',
  'JUnit'
)
AND NOT EXISTS (SELECT 1 FROM job_software js WHERE js.software_id = software.id);

DELETE FROM "certifications"
WHERE "name" IN (
  'AWS Certified Solutions Architect','AWS Certified Developer',
  'AWS Certified SysOps Administrator','AWS Certified DevOps Engineer',
  'AWS Certified Cloud Practitioner','AWS Certified Security','AWS Certified',
  'Microsoft Certified: Azure Fundamentals','Microsoft Certified: Azure Administrator',
  'Microsoft Certified: Azure Solutions Architect','Microsoft Certified: Azure DevOps Engineer',
  'Azure Certified','Google Cloud Professional Cloud Architect',
  'Google Cloud Associate Cloud Engineer','Google Cloud Professional Data Engineer',
  'GCP Certified','CompTIA Security+','CompTIA Network+','CompTIA A+','CompTIA',
  'CISSP','CISM','CEH','PMP','CPA',
  'Certified Kubernetes Administrator (CKA)',
  'Certified Kubernetes Application Developer (CKAD)',
  'HashiCorp Terraform Associate'
)
AND NOT EXISTS (SELECT 1 FROM job_certifications jc WHERE jc.certification_id = certifications.id);
