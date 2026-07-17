export interface ExtractedTags {
  skills: string[]
  software: string[]
  keywords: string[]
  certifications: string[]
}

const MAX_TAGS_PER_TAXONOMY = 100

function mergeTagList(provided: string[], extracted: string[]): string[] {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const name of [...provided, ...extracted]) {
    const normalized = name.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    merged.push(name)
    if (merged.length === MAX_TAGS_PER_TAXONOMY) break
  }

  return merged
}

export function mergeExtractedTags(
  provided: ExtractedTags,
  extracted: ExtractedTags,
): ExtractedTags {
  return {
    skills: mergeTagList(provided.skills, extracted.skills),
    software: mergeTagList(provided.software, extracted.software),
    keywords: mergeTagList(provided.keywords, extracted.keywords),
    certifications: mergeTagList(provided.certifications, extracted.certifications),
  }
}

// ── Canonical taxonomy catalog ────────────────────────────────────────────────
// Each entry owns exactly one canonical term plus optional aliases, and belongs
// to exactly one structured taxonomy (skills, software, or certifications).
// A term detected via any alias is emitted as the entry's canonical form.
// assertNoCrossCategoryTerms() below rejects any term that appears in more
// than one structured catalog. KEYWORDS are contextual labels and exempt —
// they intentionally overlap with skills (e.g. 'microservices', 'DevOps').
export interface CatalogEntry {
  canonical: string
  aliases?: readonly string[]
}

// Skills: languages, practices, methods, and capabilities.
// Named products/platforms (frameworks, databases, cloud services, CI/CD,
// testing tools, monitoring products) live in SOFTWARE_CATALOG instead.
export const SKILL_CATALOG: readonly CatalogEntry[] = [
  // Programming & markup languages
  { canonical: 'TypeScript' },
  { canonical: 'JavaScript' },
  { canonical: 'Python' },
  { canonical: 'Kotlin' },
  { canonical: 'Swift' },
  { canonical: 'Scala' },
  { canonical: 'Haskell' },
  { canonical: 'Clojure' },
  { canonical: 'Elixir' },
  { canonical: 'Erlang' },
  { canonical: 'PowerShell' },
  { canonical: 'Ruby' },
  { canonical: 'Rust' },
  { canonical: 'Java' },
  { canonical: 'Go' },
  { canonical: 'PHP' },
  { canonical: 'C#' },
  { canonical: 'C++' },
  // 'Lua' omitted — false-positives on "evaluate", "valuable", etc.
  // 'C', 'R' omitted — single-letter patterns fire too broadly in prose
  { canonical: 'Bash / Shell Scripting', aliases: ['Bash', 'Shell Scripting'] },
  { canonical: 'HTML5' },
  { canonical: 'CSS3' },
  // 'CSS' and 'HTML' omitted — too generic; CSS3/HTML5 are the canonical forms
  { canonical: 'Sass / SCSS', aliases: ['SCSS', 'Sass'] },
  { canonical: 'CSS Modules' },
  { canonical: 'SQL' },
  // 'Assembly' kept — in an engineering job description context this rarely
  // false-positives; "assembly of components" is uncommon in SWE postings
  { canonical: 'Assembly' },

  // Web practices & capabilities
  { canonical: 'Accessibility (WCAG)', aliases: ['WCAG'] },
  { canonical: 'Progressive Web Apps', aliases: ['PWA'] },
  { canonical: 'Service Workers' },
  { canonical: 'WebSockets' },
  { canonical: 'WebRTC' },

  // API & protocol standards
  { canonical: 'OAuth 2.0 / OpenID Connect', aliases: ['OAuth 2.0', 'OpenID Connect', 'OAuth'] },
  { canonical: 'REST API Design', aliases: ['REST API'] },
  { canonical: 'WebSocket Server' },
  { canonical: 'GraphQL' },
  { canonical: 'gRPC' },
  { canonical: 'JWT' },

  // Database practices
  { canonical: 'Database Design' },
  { canonical: 'Data Modeling' },
  { canonical: 'Query Optimization' },

  // Cloud & DevOps practices
  { canonical: 'Infrastructure as Code', aliases: ['IaC'] },
  { canonical: 'Site Reliability Engineering', aliases: ['SRE'] },
  { canonical: 'Serverless / Lambda', aliases: ['Serverless', 'Lambda'] },
  { canonical: 'Load Balancing' },
  { canonical: 'Observability' },
  { canonical: 'CDN' },
  { canonical: 'CI/CD' },

  // Data & ML capabilities
  { canonical: 'Natural Language Processing', aliases: ['NLP'] },
  { canonical: 'Machine Learning', aliases: ['ML'] },
  { canonical: 'Deep Learning' },
  { canonical: 'Computer Vision' },
  { canonical: 'Feature Engineering' },
  { canonical: 'Model Evaluation' },
  { canonical: 'Generative AI', aliases: ['GenAI'] },
  { canonical: 'Large Language Models', aliases: ['LLMs', 'Large Language Model'] },
  { canonical: 'Prompt Engineering' },
  { canonical: 'Retrieval-Augmented Generation', aliases: ['RAG'] },
  { canonical: 'MLOps' },
  { canonical: 'Statistical Analysis' },
  { canonical: 'Data Visualization' },
  { canonical: 'Data Governance' },
  { canonical: 'Data Warehousing' },
  { canonical: 'ETL Pipelines', aliases: ['ETL'] },
  { canonical: 'Vector Databases' },

  // Mobile capabilities
  { canonical: 'iOS Development', aliases: ['iOS'] },
  { canonical: 'Android Development', aliases: ['Android'] },
  { canonical: 'App Store Deployment' },

  // Testing practices
  { canonical: 'Test-Driven Development', aliases: ['TDD'] },
  { canonical: 'End-to-End Testing', aliases: ['E2E Testing'] },
  { canonical: 'Integration Testing' },
  { canonical: 'Unit Testing' },
  { canonical: 'Load Testing' },
  { canonical: 'Performance Testing' },
  { canonical: 'Mock / Stub / Spy' },

  // Security practices
  { canonical: 'Zero Trust Architecture', aliases: ['Zero Trust'] },
  { canonical: 'Static Analysis (SAST)', aliases: ['SAST'] },
  { canonical: 'Application Security', aliases: ['AppSec'] },
  { canonical: 'Dependency Scanning' },
  { canonical: 'Secret Management' },
  { canonical: 'Penetration Testing', aliases: ['Pen Testing'] },
  { canonical: 'SOC 2 Compliance', aliases: ['SOC 2'] },
  { canonical: 'OWASP Top 10', aliases: ['OWASP'] },
  { canonical: 'Encryption' },
  { canonical: 'Incident Response' },
  { canonical: 'Threat Modeling' },
  { canonical: 'Vulnerability Management' },
  { canonical: 'Identity and Access Management', aliases: ['IAM'] },
  { canonical: 'Security Information and Event Management', aliases: ['SIEM'] },
  { canonical: 'Governance, Risk, and Compliance', aliases: ['GRC'] },
  // Security clearances are requirements, not certifications — kept under
  // skills alongside the jobs.security_clearance_req column
  { canonical: 'Security Clearance — TS/SCI', aliases: ['TS/SCI'] },
  { canonical: 'Security Clearance — Secret' },

  // Systems & networking
  { canonical: 'Concurrency & Parallelism', aliases: ['Concurrency'] },
  { canonical: 'Networking (TCP/IP)', aliases: ['TCP/IP'] },
  // 'Networking' omitted — matches too broadly (e.g. "networking events")
  { canonical: 'Operating Systems' },
  { canonical: 'Memory Management' },
  { canonical: 'Embedded Systems' },
  { canonical: 'Protocol Buffers', aliases: ['Protobuf'] },
  { canonical: 'Message Queues' },
  { canonical: 'DNS' },
  { canonical: 'HTTP' },
  { canonical: 'Network Security' },
  { canonical: 'Compiler Design' },
  { canonical: 'FPGA' },

  // Architecture & design
  { canonical: 'Event-Driven Architecture', aliases: ['Event-Driven'] },
  { canonical: 'Domain-Driven Design', aliases: ['DDD'] },
  { canonical: 'CQRS / Event Sourcing', aliases: ['CQRS'] },
  { canonical: 'High Availability Design', aliases: ['High Availability'] },
  { canonical: 'Performance Optimization' },
  { canonical: 'Distributed Systems' },
  { canonical: 'Clean Architecture' },
  { canonical: 'Design Patterns' },
  { canonical: 'Caching Strategies', aliases: ['Caching'] },
  { canonical: 'Microservices' },
  { canonical: 'System Design' },
  { canonical: 'API Gateway' },
  { canonical: 'Object-Oriented Programming', aliases: ['OOP'] },
  { canonical: 'Functional Programming' },
  { canonical: 'SOLID Principles', aliases: ['SOLID'] },

  // Version control & collaboration practices (Git/GitHub/GitLab are SOFTWARE)
  { canonical: 'Semantic Versioning', aliases: ['SemVer'] },
  { canonical: 'Code Review' },
  { canonical: 'Monorepo' },

  // Process & soft skills
  { canonical: 'Cross-Functional Collaboration' },
  { canonical: 'Stakeholder Communication' },
  { canonical: 'Agile / Scrum', aliases: ['Scrum', 'Agile'] },
  { canonical: 'Project Management' },
  { canonical: 'Product Management' },
  { canonical: 'Program Management' },
  { canonical: 'Change Management' },
  { canonical: 'Requirements Gathering' },
  { canonical: 'Business Analysis' },
  { canonical: 'Data Analysis' },
  { canonical: 'Technical Writing' },
  { canonical: 'Problem Solving' },
  { canonical: 'Kanban' },
  { canonical: 'Mentoring' },
  { canonical: 'Debugging' },
]

// Software: named tools, products, platforms, frameworks, and services.
export const SOFTWARE_CATALOG: readonly CatalogEntry[] = [
  // Workplace & collaboration tools
  { canonical: 'Jira' },
  { canonical: 'Confluence' },
  { canonical: 'Slack' },
  { canonical: 'Bitbucket' },
  { canonical: 'VS Code' },
  { canonical: 'IntelliJ' },
  { canonical: 'Figma' },
  { canonical: 'Notion' },
  { canonical: 'Microsoft Teams', aliases: ['MS Teams'] },
  { canonical: 'Microsoft 365', aliases: ['Office 365'] },
  { canonical: 'ServiceNow' },
  { canonical: 'Salesforce' },
  { canonical: 'Asana' },
  { canonical: 'Trello' },
  { canonical: 'Miro' },
  { canonical: 'Splunk' },
  { canonical: 'Tableau' },
  { canonical: 'Git' },
  { canonical: 'GitHub' },
  { canonical: 'GitLab' },

  // Frontend frameworks & libraries
  { canonical: 'React' },
  { canonical: 'React Native' },
  { canonical: 'Angular' },
  { canonical: 'Vue.js', aliases: ['Vue'] },
  { canonical: 'Svelte' },
  { canonical: 'SvelteKit' },
  { canonical: 'Next.js' },
  { canonical: 'Nuxt.js' },
  { canonical: 'Remix' },
  { canonical: 'Redux' },
  { canonical: 'Zustand' },
  { canonical: 'Recoil' },
  { canonical: 'MobX' },
  { canonical: 'TanStack Query' },
  { canonical: 'TanStack Table' },
  { canonical: 'Framer Motion' },
  { canonical: 'Tailwind CSS', aliases: ['Tailwind'] },
  { canonical: 'Three.js' },
  { canonical: 'D3.js', aliases: ['D3'] },
  { canonical: 'Recharts' },
  { canonical: 'Chart.js' },
  { canonical: 'Webpack' },
  { canonical: 'Rollup' },
  { canonical: 'Vite' },
  { canonical: 'esbuild' },
  { canonical: 'Storybook' },
  { canonical: 'Material UI', aliases: ['MUI'] },
  { canonical: 'Bootstrap' },

  // Backend frameworks & runtimes
  { canonical: 'Node.js' },
  { canonical: 'Express.js', aliases: ['Express'] },
  { canonical: 'Fastify' },
  { canonical: 'NestJS' },
  { canonical: 'Django' },
  { canonical: 'Flask' },
  { canonical: 'FastAPI' },
  { canonical: 'Ruby on Rails', aliases: ['Rails'] },
  { canonical: 'Laravel' },
  { canonical: 'Spring Boot', aliases: ['Spring'] },
  { canonical: 'ASP.NET Core', aliases: ['ASP.NET'] },
  { canonical: 'tRPC' },
  { canonical: 'Go Fiber' },
  { canonical: 'Gin Framework' },
  { canonical: 'Phoenix Framework' },

  // ORMs & database tooling
  { canonical: 'Prisma' },
  { canonical: 'Drizzle ORM' },
  { canonical: 'SQLAlchemy' },
  { canonical: 'Hibernate' },
  { canonical: 'Entity Framework' },
  { canonical: 'Sequelize' },

  // Databases
  { canonical: 'PostgreSQL', aliases: ['Postgres'] },
  { canonical: 'MySQL' },
  { canonical: 'SQLite' },
  { canonical: 'MongoDB' },
  { canonical: 'Redis' },
  { canonical: 'Elasticsearch' },
  { canonical: 'DynamoDB' },
  { canonical: 'Cassandra' },
  { canonical: 'Neo4j' },
  { canonical: 'CockroachDB' },
  { canonical: 'Supabase' },
  { canonical: 'PlanetScale' },
  { canonical: 'Oracle Database', aliases: ['Oracle DB'] },
  { canonical: 'Microsoft SQL Server', aliases: ['SQL Server'] },
  { canonical: 'MariaDB' },
  { canonical: 'Amazon Redshift', aliases: ['Redshift'] },
  { canonical: 'Pinecone' },
  { canonical: 'Weaviate' },

  // Cloud platforms & hosting
  { canonical: 'AWS', aliases: ['Amazon Web Services'] },
  { canonical: 'GCP', aliases: ['Google Cloud Platform', 'Google Cloud'] },
  { canonical: 'Azure' },
  { canonical: 'Cloudflare' },
  { canonical: 'Vercel' },
  { canonical: 'Netlify' },
  { canonical: 'Heroku' },
  { canonical: 'Railway' },
  { canonical: 'DigitalOcean' },
  { canonical: 'OpenShift' },
  { canonical: 'VMware' },

  // DevOps, CI/CD & infrastructure products
  { canonical: 'Docker' },
  { canonical: 'Kubernetes', aliases: ['k8s'] },
  { canonical: 'Helm' },
  { canonical: 'Terraform' },
  { canonical: 'Ansible' },
  { canonical: 'Pulumi' },
  { canonical: 'GitHub Actions' },
  { canonical: 'GitLab CI/CD', aliases: ['GitLab CI'] },
  { canonical: 'CircleCI' },
  { canonical: 'Jenkins' },
  { canonical: 'Nginx' },
  { canonical: 'Apache' },
  { canonical: 'Linux' },
  { canonical: 'Argo CD', aliases: ['ArgoCD'] },
  { canonical: 'Tekton' },
  { canonical: 'HashiCorp Packer' },
  { canonical: 'HashiCorp Vault' },

  // Monitoring & observability products
  { canonical: 'Prometheus' },
  { canonical: 'Grafana' },
  { canonical: 'Datadog' },
  { canonical: 'OpenTelemetry' },
  { canonical: 'New Relic' },
  { canonical: 'Sentry' },
  { canonical: 'PagerDuty' },
  { canonical: 'Dynatrace' },

  // Data & ML tools
  { canonical: 'PyTorch' },
  { canonical: 'TensorFlow' },
  { canonical: 'Keras' },
  { canonical: 'scikit-learn', aliases: ['sklearn'] },
  { canonical: 'Hugging Face Transformers', aliases: ['Hugging Face'] },
  { canonical: 'LangChain' },
  { canonical: 'OpenAI API', aliases: ['OpenAI'] },
  { canonical: 'Pandas' },
  { canonical: 'NumPy' },
  { canonical: 'Matplotlib' },
  { canonical: 'Jupyter Notebooks', aliases: ['Jupyter'] },
  { canonical: 'MLflow' },
  { canonical: 'Spark' },
  { canonical: 'Kafka' },
  { canonical: 'RabbitMQ' },
  { canonical: 'Airflow' },
  { canonical: 'dbt' },
  { canonical: 'Snowflake' },
  { canonical: 'BigQuery' },
  { canonical: 'Databricks' },
  { canonical: 'Flink' },
  { canonical: 'Hadoop' },
  { canonical: 'Looker' },
  { canonical: 'Power BI' },

  // Mobile frameworks & toolkits
  { canonical: 'Flutter' },
  { canonical: 'Expo' },
  { canonical: 'SwiftUI' },
  { canonical: 'Jetpack Compose' },

  // Testing tools
  { canonical: 'Playwright' },
  { canonical: 'Cypress' },
  { canonical: 'Selenium' },
  { canonical: 'Vitest' },
  { canonical: 'Jest' },
  { canonical: 'PyTest' },
  { canonical: 'JUnit' },
  { canonical: 'Postman' },
  { canonical: 'k6' },
  { canonical: 'Gatling' },
]

// Certifications: named credentials and licenses only. Security clearances are
// NOT certifications — they live in SKILL_CATALOG (and jobs.security_clearance_req).
// Umbrella terms ('AWS Certified', 'CompTIA') are kept as fallbacks but are
// suppressed when a more specific certification from the same family matched —
// see suppressGenericCertifications().
export const CERTIFICATION_CATALOG: readonly CatalogEntry[] = [
  // AWS
  { canonical: 'AWS Certified Solutions Architect', aliases: ['AWS Solutions Architect'] },
  { canonical: 'AWS Certified Developer' },
  { canonical: 'AWS Certified SysOps Administrator' },
  { canonical: 'AWS Certified DevOps Engineer' },
  { canonical: 'AWS Certified Cloud Practitioner' },
  { canonical: 'AWS Certified Security' },
  { canonical: 'AWS Certified Machine Learning Engineer' },
  { canonical: 'AWS Certified Data Engineer' },
  { canonical: 'AWS Certified' },

  // Azure
  { canonical: 'Microsoft Certified: Azure Fundamentals', aliases: ['Azure Fundamentals', 'AZ-900'] },
  { canonical: 'Microsoft Certified: Azure Administrator', aliases: ['Azure Administrator', 'AZ-104'] },
  { canonical: 'Microsoft Certified: Azure Solutions Architect', aliases: ['Azure Solutions Architect', 'AZ-305'] },
  { canonical: 'Microsoft Certified: Azure DevOps Engineer', aliases: ['Azure DevOps Engineer', 'AZ-400'] },
  { canonical: 'Microsoft Certified: Azure Security Engineer', aliases: ['Azure Security Engineer', 'AZ-500'] },
  { canonical: 'Microsoft Certified: Azure Data Engineer', aliases: ['Azure Data Engineer', 'DP-203'] },
  { canonical: 'Microsoft Certified: Azure AI Engineer', aliases: ['Azure AI Engineer', 'AI-102'] },
  { canonical: 'Azure Certified' },

  // Google Cloud
  { canonical: 'Google Cloud Professional Cloud Architect', aliases: ['Professional Cloud Architect'] },
  { canonical: 'Google Cloud Associate Cloud Engineer', aliases: ['Associate Cloud Engineer'] },
  { canonical: 'Google Cloud Professional Data Engineer', aliases: ['Professional Data Engineer'] },
  { canonical: 'Google Cloud Professional Cloud Developer', aliases: ['Professional Cloud Developer'] },
  { canonical: 'Google Cloud Professional Cloud Security Engineer', aliases: ['Professional Cloud Security Engineer'] },
  { canonical: 'GCP Certified', aliases: ['Google Cloud Certified'] },

  // CompTIA — bare 'A+' omitted: false-positives on letter grades / ratings
  { canonical: 'CompTIA Security+', aliases: ['Security+'] },
  { canonical: 'CompTIA Network+', aliases: ['Network+'] },
  { canonical: 'CompTIA Cloud+', aliases: ['Cloud+'] },
  { canonical: 'CompTIA Linux+', aliases: ['Linux+'] },
  { canonical: 'CompTIA CySA+', aliases: ['CySA+'] },
  { canonical: 'CompTIA A+' },
  { canonical: 'CompTIA' },

  // Security & management
  { canonical: 'CISSP' },
  { canonical: 'CISM' },
  { canonical: 'CCSP', aliases: ['Certified Cloud Security Professional'] },
  { canonical: 'OSCP', aliases: ['Offensive Security Certified Professional'] },
  { canonical: 'GIAC Security Essentials', aliases: ['GSEC'] },
  { canonical: 'CEH', aliases: ['Certified Ethical Hacker'] },
  { canonical: 'PMP', aliases: ['Project Management Professional'] },
  // Bare CSM/PSM are omitted because they also name common job roles.
  { canonical: 'Certified ScrumMaster' },
  { canonical: 'Professional Scrum Master' },
  { canonical: 'ITIL Foundation', aliases: ['ITIL'] },
  { canonical: 'Six Sigma Green Belt' },
  { canonical: 'Six Sigma Black Belt' },
  { canonical: 'CPA' },

  // Kubernetes & HashiCorp
  {
    canonical: 'Certified Kubernetes Administrator (CKA)',
    aliases: ['CKA', 'Certified Kubernetes Administrator', 'Kubernetes Administrator'],
  },
  {
    canonical: 'Certified Kubernetes Application Developer (CKAD)',
    aliases: ['CKAD', 'Certified Kubernetes Application Developer'],
  },
  { canonical: 'HashiCorp Terraform Associate', aliases: ['Terraform Associate'] },
  { canonical: 'Cisco Certified Network Associate', aliases: ['CCNA'] },
  { canonical: 'Cisco Certified Network Professional', aliases: ['CCNP'] },
  { canonical: 'Red Hat Certified System Administrator', aliases: ['RHCSA'] },
  { canonical: 'Red Hat Certified Engineer', aliases: ['RHCE'] },
]

// Contextual labels — not a structured taxonomy, so overlap with skills is fine.
export const KEYWORD_CATALOG: readonly CatalogEntry[] = [
  { canonical: 'remote' },
  { canonical: 'hybrid' },
  { canonical: 'on-site', aliases: ['onsite'] },
  { canonical: 'full-stack', aliases: ['full stack'] },
  { canonical: 'backend' },
  { canonical: 'frontend', aliases: ['front-end'] },
  { canonical: 'mobile' },
  { canonical: 'machine learning' },
  { canonical: 'data engineering' },
  { canonical: 'data science' },
  { canonical: 'artificial intelligence' },
  { canonical: 'generative AI' },
  { canonical: 'DevOps' },
  { canonical: 'platform engineering' },
  { canonical: 'distributed systems' },
  { canonical: 'microservices' },
  { canonical: 'cloud-native', aliases: ['cloud native'] },
  { canonical: 'cybersecurity' },
  { canonical: 'fintech' },
  { canonical: 'healthtech' },
  { canonical: 'e-commerce', aliases: ['ecommerce'] },
  { canonical: 'B2B' },
  { canonical: 'B2C' },
  { canonical: 'SaaS' },
  { canonical: 'startup' },
  { canonical: 'series A' },
  { canonical: 'series B' },
  { canonical: 'series C' },
  { canonical: 'executive' },
  { canonical: 'senior' },
  { canonical: 'lead' },
  { canonical: 'staff' },
  { canonical: 'principal' },
  { canonical: 'entry level', aliases: ['entry-level'] },
  { canonical: 'junior' },
  { canonical: 'mid-level', aliases: ['mid level'] },
  { canonical: 'contract' },
  { canonical: 'contract-to-hire', aliases: ['contract to hire'] },
  { canonical: 'part-time', aliases: ['part time'] },
  { canonical: 'full-time', aliases: ['full time'] },
  { canonical: 'visa sponsorship' },
  { canonical: 'no sponsorship' },
  { canonical: 'equity' },
  { canonical: 'bonus' },
  { canonical: 'clearance required' },
]

// Every canonical term and alias must live in exactly one structured catalog.
// Runs at module load so a collision fails tests and the build immediately.
function assertNoCrossCategoryTerms(catalogs: Record<string, readonly CatalogEntry[]>) {
  const owner = new Map<string, string>()
  for (const [taxonomy, entries] of Object.entries(catalogs)) {
    for (const entry of entries) {
      for (const term of [entry.canonical, ...(entry.aliases ?? [])]) {
        const key = term.toLowerCase()
        const existing = owner.get(key)
        if (existing) {
          throw new Error(
            `Taxonomy catalog conflict: "${term}" appears in both ${existing} and ${taxonomy}`,
          )
        }
        owner.set(key, taxonomy)
      }
    }
  }
}

assertNoCrossCategoryTerms({
  skills: SKILL_CATALOG,
  software: SOFTWARE_CATALOG,
  certifications: CERTIFICATION_CATALOG,
})

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compilePattern(term: string): RegExp {
  return new RegExp(`(?<![\\w])${escapeRegExp(term)}(?![\\w])`, 'i')
}

interface CompiledEntry {
  canonical: string
  patterns: RegExp[]
}

function compileCatalog(entries: readonly CatalogEntry[]): CompiledEntry[] {
  return entries.map(entry => ({
    canonical: entry.canonical,
    patterns: [entry.canonical, ...(entry.aliases ?? [])].map(compilePattern),
  }))
}

const SKILL_MATCHERS = compileCatalog(SKILL_CATALOG)
const SOFTWARE_MATCHERS = compileCatalog(SOFTWARE_CATALOG)
const CERTIFICATION_MATCHERS = compileCatalog(CERTIFICATION_CATALOG)
const KEYWORD_MATCHERS = compileCatalog(KEYWORD_CATALOG)

// Returns canonical names; matching any alias yields the entry's canonical
// form, so alias/canonical co-mentions dedupe to a single entry by construction.
function matchCatalog(description: string, matchers: CompiledEntry[]): string[] {
  return matchers
    .filter(({ patterns }) => patterns.some(pattern => pattern.test(description)))
    .map(({ canonical }) => canonical)
}

// Drop an umbrella certification when a more specific one from the same family
// matched — e.g. 'AWS Certified Solutions Architect' suppresses 'AWS Certified',
// and 'CompTIA Security+' suppresses 'CompTIA'.
function suppressGenericCertifications(matched: string[]): string[] {
  return matched.filter(
    name => !matched.some(other => other !== name && other.startsWith(`${name} `)),
  )
}

export function extractTags(description: string): ExtractedTags {
  return {
    skills: matchCatalog(description, SKILL_MATCHERS),
    software: matchCatalog(description, SOFTWARE_MATCHERS),
    keywords: matchCatalog(description, KEYWORD_MATCHERS),
    certifications: suppressGenericCertifications(matchCatalog(description, CERTIFICATION_MATCHERS)),
  }
}
