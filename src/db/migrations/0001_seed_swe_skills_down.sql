-- Manual rollback for 0001_seed_swe_skills.sql
-- Run with: psql $DATABASE_URL -f src/db/migrations/0001_seed_swe_skills_down.sql
-- Skips skills that are already in use (job_skills or user_skills).

DELETE FROM "skills"
WHERE "name" IN (
  'Python','JavaScript','TypeScript','Java','C','C++','C#','Go','Rust','Ruby',
  'PHP','Swift','Kotlin','Scala','R','Bash / Shell Scripting','PowerShell','Lua',
  'Haskell','Elixir','Erlang','Clojure','HTML5','CSS3','React','Next.js','Vue.js',
  'Nuxt.js','Angular','Svelte','SvelteKit','Remix','Tailwind CSS','Sass / SCSS',
  'CSS Modules','Webpack','Vite','esbuild','Rollup','Redux','Zustand','Recoil',
  'MobX','TanStack Query','TanStack Table','Framer Motion','Three.js','D3.js',
  'Recharts','Chart.js','WebSockets','WebRTC','Service Workers',
  'Progressive Web Apps','Accessibility (WCAG)','Node.js','Express.js','Fastify',
  'NestJS','Django','Flask','FastAPI','Ruby on Rails','Laravel','Spring Boot',
  'ASP.NET Core','GraphQL','REST API Design','gRPC','WebSocket Server',
  'OAuth 2.0 / OpenID Connect','JWT','tRPC','PostgreSQL','MySQL','SQLite','SQL',
  'MongoDB','Redis','Elasticsearch','DynamoDB','Cassandra','Neo4j','CockroachDB',
  'Supabase','PlanetScale','Prisma','Drizzle ORM','SQLAlchemy','Hibernate',
  'Database Design','Query Optimization','Data Modeling','AWS','GCP','Azure',
  'Docker','Kubernetes','Terraform','Ansible','Pulumi','GitHub Actions',
  'GitLab CI/CD','CircleCI','Jenkins','Helm','Linux','Nginx','Apache',
  'Cloudflare','Vercel','Netlify','Heroku','Railway','Serverless / Lambda','CDN',
  'Load Balancing','Infrastructure as Code','Site Reliability Engineering',
  'Observability','Prometheus','Grafana','OpenTelemetry','Datadog',
  'Machine Learning','Deep Learning','Natural Language Processing',
  'Computer Vision','PyTorch','TensorFlow','Keras','scikit-learn',
  'Hugging Face Transformers','LangChain','OpenAI API','Pandas','NumPy',
  'Matplotlib','Jupyter Notebooks','Spark','Kafka','Airflow','dbt','Snowflake',
  'BigQuery','Data Warehousing','ETL Pipelines','Feature Engineering',
  'Model Evaluation','MLflow','Vector Databases','React Native','Flutter',
  'iOS Development','Android Development','SwiftUI','Jetpack Compose','Expo',
  'App Store Deployment','Unit Testing','Integration Testing',
  'End-to-End Testing','Test-Driven Development','Jest','Vitest','Playwright',
  'Cypress','Selenium','PyTest','JUnit','Mock / Stub / Spy','Load Testing',
  'Performance Testing','Application Security','OWASP Top 10',
  'Penetration Testing','Static Analysis (SAST)','Dependency Scanning',
  'Secret Management','Encryption','Zero Trust Architecture','SOC 2 Compliance',
  'Security Clearance — TS/SCI','Security Clearance — Secret','Operating Systems',
  'Networking (TCP/IP)','Concurrency & Parallelism','Memory Management',
  'Embedded Systems','FPGA','Compiler Design','Assembly','Protocol Buffers',
  'Message Queues','RabbitMQ','System Design','Microservices',
  'Event-Driven Architecture','Domain-Driven Design','CQRS / Event Sourcing',
  'API Gateway','Design Patterns','Clean Architecture','Distributed Systems',
  'High Availability Design','Performance Optimization','Caching Strategies',
  'Git','GitHub','GitLab','Code Review','Monorepo','Semantic Versioning',
  'Agile / Scrum','Kanban','Technical Writing','Mentoring',
  'Cross-Functional Collaboration','Stakeholder Communication',
  'Problem Solving','Debugging'
)
AND id NOT IN (SELECT skill_id FROM job_skills)
AND id NOT IN (SELECT skill_id FROM user_skills);
