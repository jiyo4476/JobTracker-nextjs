export interface ExtractedTags {
  skills: string[]
  software: string[]
  keywords: string[]
  certifications: string[]
}

// Full SWE skill list — mirrors the DB seed in 0001_seed_swe_skills.sql.
// Aliases (e.g. 'Bash', 'k8s') are included so they can be detected and then
// collapsed to their canonical form by deduplicateSkills().
const SKILLS = [
  // Programming Languages
  'TypeScript', 'JavaScript', 'Python', 'Kotlin', 'Swift', 'Scala', 'Haskell',
  'Clojure', 'Elixir', 'Erlang', 'PowerShell', 'Ruby', 'Rust', 'Java', 'Go',
  'PHP', 'C#', 'C++',
  // 'Lua' omitted — false-positives on "evaluate", "valuable", etc.
  // 'C', 'R', 'Go' omitted — single-letter / verb patterns fire too broadly in prose
  //   ("Go to our website", "evaluate candidates", "required at assembly")
  'Bash / Shell Scripting', 'Bash', 'Shell Scripting',

  // Web — Frontend
  'Accessibility (WCAG)', 'WCAG',
  'Progressive Web Apps', 'PWA',
  'Service Workers',
  'TanStack Query', 'TanStack Table',
  'Framer Motion',
  'Tailwind CSS', 'Tailwind',
  'Sass / SCSS', 'SCSS', 'Sass',
  'CSS Modules', 'CSS3',
  // 'CSS' and 'HTML' omitted — too generic; CSS3/HTML5 are the canonical forms
  'HTML5',
  'SvelteKit', 'Svelte',
  'Next.js', 'Nuxt.js', 'Remix',
  'Angular', 'Vue.js', 'Vue',
  'React Native', 'React',
  'Redux', 'Zustand', 'Recoil', 'MobX',
  'Webpack', 'Rollup', 'Vite', 'esbuild',
  'Three.js', 'D3.js', 'D3',
  'Recharts', 'Chart.js',
  'WebSockets', 'WebRTC',

  // Web — Backend
  'OAuth 2.0 / OpenID Connect', 'OAuth 2.0', 'OpenID Connect', 'OAuth',
  'REST API Design', 'REST API',
  'WebSocket Server',
  'ASP.NET Core', 'ASP.NET',
  'Spring Boot', 'Spring',
  'Ruby on Rails', 'Rails',
  'Express.js', 'Express',
  'Fastify', 'NestJS',
  'Django', 'Flask', 'FastAPI',
  'Laravel',
  'Node.js',
  'GraphQL', 'gRPC', 'tRPC', 'JWT',

  // Databases
  'Database Design', 'Data Modeling', 'Query Optimization',
  'Drizzle ORM', 'SQLAlchemy', 'Hibernate', 'Prisma',
  'CockroachDB', 'PlanetScale', 'Supabase',
  'Elasticsearch',
  'PostgreSQL', 'Postgres',
  'MySQL', 'SQLite',
  'DynamoDB', 'Cassandra', 'Neo4j',
  'MongoDB', 'Redis',
  'SQL',

  // Cloud & DevOps
  'Infrastructure as Code', 'IaC',
  'Site Reliability Engineering', 'SRE',
  'Serverless / Lambda', 'Serverless', 'Lambda',
  'GitHub Actions', 'GitLab CI/CD', 'GitLab CI',
  'Load Balancing',
  'OpenTelemetry', 'Observability',
  'Kubernetes', 'k8s',
  'Terraform', 'Ansible', 'Pulumi',
  'CircleCI', 'Jenkins',
  'Prometheus', 'Grafana', 'Datadog',
  'Docker', 'Helm',
  'Cloudflare', 'Vercel', 'Netlify', 'Heroku', 'Railway',
  'Nginx', 'Apache',
  'Linux', 'CDN',
  'AWS', 'GCP', 'Azure',
  'CI/CD',

  // Data & ML
  'Natural Language Processing', 'NLP',
  'Machine Learning', 'ML',
  'Deep Learning',
  'Computer Vision',
  'Hugging Face Transformers', 'Hugging Face',
  'Feature Engineering', 'Model Evaluation',
  'Data Warehousing', 'ETL Pipelines', 'ETL',
  'Vector Databases',
  'Jupyter Notebooks', 'Jupyter',
  'LangChain', 'OpenAI API', 'OpenAI',
  'scikit-learn', 'sklearn',
  'PyTorch', 'TensorFlow', 'Keras',
  'Pandas', 'NumPy', 'Matplotlib',
  'MLflow',
  'BigQuery', 'Snowflake',
  'Airflow', 'Spark', 'Kafka',
  'dbt',

  // Mobile
  'iOS Development', 'iOS',
  'Android Development', 'Android',
  'App Store Deployment',
  'Jetpack Compose',
  'SwiftUI', 'Flutter', 'Expo',

  // Testing
  'Test-Driven Development', 'TDD',
  'End-to-End Testing', 'E2E Testing',
  'Integration Testing',
  'Unit Testing',
  'Load Testing', 'Performance Testing',
  'Mock / Stub / Spy',
  'Playwright', 'Cypress', 'Selenium',
  'Vitest', 'Jest', 'PyTest', 'JUnit',

  // Security
  'Zero Trust Architecture', 'Zero Trust',
  'Static Analysis (SAST)', 'SAST',
  'Application Security', 'AppSec',
  'Dependency Scanning',
  'Secret Management',
  'Penetration Testing', 'Pen Testing',
  'SOC 2 Compliance', 'SOC 2',
  'OWASP Top 10', 'OWASP',
  'Encryption',
  'Security Clearance — TS/SCI', 'TS/SCI',
  'Security Clearance — Secret',

  // Systems & Networking
  'Concurrency & Parallelism', 'Concurrency',
  'Networking (TCP/IP)', 'TCP/IP',
  // 'Networking' omitted — matches too broadly (e.g. "networking events")
  'Operating Systems',
  'Memory Management',
  'Embedded Systems',
  'Protocol Buffers', 'Protobuf',
  'Message Queues',
  'Compiler Design',
  // 'Assembly' kept — in an engineering job description context this rarely false-positives;
  // "assembly of components" is uncommon in SWE postings vs. "Assembly language"
  'Assembly',
  'FPGA',

  // Architecture & Design
  'Event-Driven Architecture', 'Event-Driven',
  'Domain-Driven Design', 'DDD',
  'CQRS / Event Sourcing', 'CQRS',
  'High Availability Design', 'High Availability',
  'Performance Optimization',
  'Distributed Systems',
  'Clean Architecture',
  'Design Patterns',
  'Caching Strategies', 'Caching',
  'Microservices',
  'System Design',
  'API Gateway',

  // Version Control & Collaboration
  'Semantic Versioning', 'SemVer',
  'Code Review',
  'Monorepo',
  // GitHub and GitLab live in SOFTWARE; no need to duplicate them here
  'Git',

  // Process & Soft Skills
  'Cross-Functional Collaboration',
  'Stakeholder Communication',
  'Agile / Scrum', 'Scrum', 'Agile',
  'Technical Writing',
  'Problem Solving',
  'Kanban',
  'Mentoring',
  'Debugging',
]

// GitHub and GitLab are tools (appear in SOFTWARE) — not listed in SKILLS to
// avoid producing duplicate junction-table rows on the same job.
const SOFTWARE = [
  'Jira', 'Confluence', 'Slack', 'Bitbucket', 'VS Code', 'IntelliJ',
  'Figma', 'Notion', 'Datadog', 'Splunk', 'Tableau',
  'GitHub', 'GitLab',
]

const CERTIFICATIONS = [
  'AWS Certified', 'Azure Certified', 'GCP Certified',
  'CPA', 'PMP', 'CISSP', 'CompTIA',
  'Kubernetes Administrator', 'CKA',
  'Terraform Associate',
]

const KEYWORDS = [
  'remote', 'hybrid', 'on-site', 'full-stack', 'full stack',
  'backend', 'front-end', 'frontend',
  'machine learning', 'data engineering',
  'DevOps', 'platform engineering',
  'distributed systems', 'microservices',
  'startup', 'series A', 'series B', 'series C',
  'executive', 'senior', 'lead', 'staff', 'principal',
  'entry level', 'junior', 'mid-level',
]

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileTerms(terms: string[]) {
  return terms.map(term => ({
    term,
    pattern: new RegExp(`(?<![\\w])${escapeRegExp(term)}(?![\\w])`, 'i'),
  }))
}

const SKILL_PATTERNS = compileTerms(SKILLS)
const SOFTWARE_PATTERNS = compileTerms(SOFTWARE)
const CERTIFICATION_PATTERNS = compileTerms(CERTIFICATIONS)
const KEYWORD_PATTERNS = compileTerms(KEYWORDS)

function matchTerms(description: string, terms: ReturnType<typeof compileTerms>): string[] {
  return terms
    .filter(({ pattern }) => pattern.test(description))
    .map(({ term }) => term)
}

// Alias → canonical name map. When both an alias and its canonical form are
// detected (e.g. "k8s" and "Kubernetes" both appear), deduplicateSkills()
// collapses them to the canonical form via a Set so only one entry survives.
const CANONICAL: Record<string, string> = {
  'Bash': 'Bash / Shell Scripting',
  'Shell Scripting': 'Bash / Shell Scripting',
  'Postgres': 'PostgreSQL',
  'D3': 'D3.js',
  'Vue': 'Vue.js',
  'Rails': 'Ruby on Rails',
  'Express': 'Express.js',
  'k8s': 'Kubernetes',
  'Serverless': 'Serverless / Lambda',
  'Lambda': 'Serverless / Lambda',
  'REST API': 'REST API Design',
  'OAuth 2.0': 'OAuth 2.0 / OpenID Connect',
  'OpenID Connect': 'OAuth 2.0 / OpenID Connect',
  'OAuth': 'OAuth 2.0 / OpenID Connect',
  'SCSS': 'Sass / SCSS',
  'Sass': 'Sass / SCSS',
  // CSS and HTML removed from CANONICAL — these aliases were dropped from SKILLS
  // because they match too broadly; CSS3 and HTML5 are matched directly instead.
  'IaC': 'Infrastructure as Code',
  'SRE': 'Site Reliability Engineering',
  'Tailwind': 'Tailwind CSS',
  'NLP': 'Natural Language Processing',
  'ML': 'Machine Learning',
  'ETL': 'ETL Pipelines',
  'Jupyter': 'Jupyter Notebooks',
  'sklearn': 'scikit-learn',
  'iOS': 'iOS Development',
  'Android': 'Android Development',
  'TDD': 'Test-Driven Development',
  'E2E Testing': 'End-to-End Testing',
  'AppSec': 'Application Security',
  'SAST': 'Static Analysis (SAST)',
  'Zero Trust': 'Zero Trust Architecture',
  'Pen Testing': 'Penetration Testing',
  'SOC 2': 'SOC 2 Compliance',
  'OWASP': 'OWASP Top 10',
  'TS/SCI': 'Security Clearance — TS/SCI',
  'TCP/IP': 'Networking (TCP/IP)',
  // 'Networking' removed — too broad, dropped from SKILLS
  'Protobuf': 'Protocol Buffers',
  'Concurrency': 'Concurrency & Parallelism',
  'DDD': 'Domain-Driven Design',
  'CQRS': 'CQRS / Event Sourcing',
  'High Availability': 'High Availability Design',
  'Event-Driven': 'Event-Driven Architecture',
  'Caching': 'Caching Strategies',
  'SemVer': 'Semantic Versioning',
  'Scrum': 'Agile / Scrum',
  'Agile': 'Agile / Scrum',
  'PWA': 'Progressive Web Apps',
  'WCAG': 'Accessibility (WCAG)',
  'Hugging Face': 'Hugging Face Transformers',
  'OpenAI': 'OpenAI API',
  'GitLab CI': 'GitLab CI/CD',
  'Spring': 'Spring Boot',
  'ASP.NET': 'ASP.NET Core',
}

function deduplicateSkills(matched: string[]): string[] {
  const result = new Set(matched.map(s => CANONICAL[s] ?? s))
  return Array.from(result)
}

export function extractTags(description: string): ExtractedTags {
  return {
    skills: deduplicateSkills(matchTerms(description, SKILL_PATTERNS)),
    software: matchTerms(description, SOFTWARE_PATTERNS),
    keywords: matchTerms(description, KEYWORD_PATTERNS),
    certifications: matchTerms(description, CERTIFICATION_PATTERNS),
  }
}
