export type IntegrationStatus = "native" | "configured" | "coming_soon";

export type Integration = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  status: IntegrationStatus;
  docs?: string;
  setupLang?: string;
  setupCode?: string;
  /** Signals this integration produces */
  signals?: Array<"traces" | "metrics" | "logs" | "alerts">;
  /** Short prereqs the user needs before starting */
  prerequisites?: string[];
  /** Where to verify in Pulse after connecting */
  verifyIn?: Array<{ label: string; href: string }>;
};

export type IntegrationCategory = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  color: string; // tailwind bg stop color for card accent
  integrations: Integration[];
};

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  {
    id: "opentelemetry",
    label: "OpenTelemetry",
    emoji: "📊",
    description: "The standard ingestion layer — ingest traces, metrics and logs via OTLP HTTP.",
    color: "#06d6c7",
    integrations: [
      {
        id: "otel-collector",
        name: "OTel Collector",
        emoji: "🔭",
        description: "Route all signals through the official OpenTelemetry Collector into Pulse.",
        status: "native",
        signals: ["traces", "metrics", "logs"],
        prerequisites: ["Docker or a running host to deploy the collector", "PULSE_INGEST_API_KEY set in your environment"],
        verifyIn: [{ label: "Dashboard", href: "/" }, { label: "Metrics explorer", href: "/metrics" }, { label: "Logs explorer", href: "/logs" }],
        setupLang: "yaml",
        setupCode: `# docker-compose.otel.yml already bundled — run:
npm run otel:collector

# Or configure any collector manually:
exporters:
  otlphttp/pulse:
    endpoint: http://localhost:3001/api/v1/ingest/otlp
    headers:
      x-pulse-ingest-key: "\${PULSE_INGEST_API_KEY}"`,
      },
      {
        id: "otlp-http",
        name: "OTLP HTTP",
        emoji: "📡",
        description: "Send traces, metrics and logs directly over OTLP/HTTP from any SDK.",
        status: "native",
        signals: ["traces", "metrics", "logs"],
        prerequisites: ["PULSE_INGEST_API_KEY set in your environment", "OpenTelemetry SDK installed in your application"],
        verifyIn: [{ label: "Traces", href: "/traces" }, { label: "Metrics explorer", href: "/metrics" }],
        setupLang: "bash",
        setupCode: `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3001/api/v1/ingest/otlp
OTEL_EXPORTER_OTLP_HEADERS=x-pulse-ingest-key=your-key`,
      },
      {
        id: "prometheus",
        name: "Prometheus",
        emoji: "🔥",
        description: "Scrape Prometheus exposition format metrics directly into Pulse.",
        status: "native",
        signals: ["metrics"],
        prerequisites: ["PULSE_INGEST_API_KEY set in your environment", "A /metrics endpoint exposing Prometheus format"],
        verifyIn: [{ label: "Metrics explorer", href: "/metrics" }],
        setupLang: "bash",
        setupCode: `# POST Prometheus text format:
curl -X POST http://localhost:3001/api/v1/ingest/metrics/prometheus \\
  -H "x-api-key: your-key" \\
  -H "Content-Type: text/plain" \\
  --data-binary @metrics.prom`,
      },
    ],
  },
  {
    id: "languages",
    label: "Languages & Frameworks",
    emoji: "🧑‍💻",
    description: "Auto-instrument your application with the OpenTelemetry SDK for your language.",
    color: "#38bdf8",
    integrations: [
      {
        id: "nodejs",
        name: "Node.js",
        emoji: "🟩",
        description: "Auto-instrument Express, Fastify, NestJS and more with zero code changes.",
        status: "native",
        setupLang: "bash",
        setupCode: `npm install @opentelemetry/sdk-node \\
  @opentelemetry/auto-instrumentations-node \\
  @opentelemetry/exporter-trace-otlp-http

# instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
const sdk = new NodeSDK({
  serviceName: 'my-service',
  instrumentations: [getNodeAutoInstrumentations()],
});
sdk.start();`,
      },
      {
        id: "python",
        name: "Python",
        emoji: "🐍",
        description: "Instrument Django, FastAPI, Flask with opentelemetry-instrument.",
        status: "native",
        setupLang: "bash",
        setupCode: `pip install opentelemetry-distro opentelemetry-exporter-otlp
opentelemetry-bootstrap -a install

OTEL_SERVICE_NAME=my-service \\
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3001/api/v1/ingest/otlp \\
OTEL_EXPORTER_OTLP_HEADERS=x-pulse-ingest-key=your-key \\
opentelemetry-instrument python app.py`,
      },
      {
        id: "java",
        name: "Java",
        emoji: "☕",
        description: "Drop-in Java agent for Spring Boot, Quarkus, Micronaut.",
        status: "native",
        setupLang: "bash",
        setupCode: `# Download the agent
curl -L https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/latest/download/opentelemetry-javaagent.jar -o otel-agent.jar

java -javaagent:otel-agent.jar \\
  -DOTEL_SERVICE_NAME=my-service \\
  -DOTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:3001/api/v1/ingest/otlp \\
  -DOTEL_EXPORTER_OTLP_HEADERS=x-pulse-ingest-key=your-key \\
  -jar app.jar`,
      },
      {
        id: "go",
        name: "Go",
        emoji: "🐹",
        description: "Instrument Go services with the OTel Go SDK and HTTP exporter.",
        status: "native",
        setupLang: "go",
        setupCode: `go get go.opentelemetry.io/otel \\
  go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp

exp, _ := otlptracehttp.New(ctx,
  otlptracehttp.WithEndpoint("localhost:3001"),
  otlptracehttp.WithURLPath("/api/v1/ingest/otlp/v1/traces"),
  otlptracehttp.WithHeaders(map[string]string{
    "x-pulse-ingest-key": os.Getenv("PULSE_INGEST_API_KEY"),
  }),
)`,
      },
      {
        id: "dotnet",
        name: ".NET",
        emoji: "🔷",
        description: "Auto-instrument ASP.NET Core, gRPC and more.",
        status: "native",
        setupLang: "bash",
        setupCode: `dotnet add package OpenTelemetry.Extensions.Hosting
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol

// Program.cs
builder.Services.AddOpenTelemetry()
  .WithTracing(b => b
    .AddAspNetCoreInstrumentation()
    .AddOtlpExporter(o => {
      o.Endpoint = new Uri("http://localhost:3001/api/v1/ingest/otlp/v1/traces");
      o.Headers = "x-pulse-ingest-key=your-key";
    }));`,
      },
      {
        id: "ruby",
        name: "Ruby",
        emoji: "💎",
        description: "Instrument Rails and Sinatra with opentelemetry-ruby.",
        status: "native",
        setupLang: "bash",
        setupCode: `gem 'opentelemetry-sdk'
gem 'opentelemetry-instrumentation-rails'
gem 'opentelemetry-exporter-otlp'

# config/initializers/opentelemetry.rb
OpenTelemetry::SDK.configure do |c|
  c.use_all
  c.add_span_processor(
    OpenTelemetry::SDK::Trace::Export::BatchSpanProcessor.new(
      OpenTelemetry::Exporter::OTLP::Exporter.new(
        endpoint: 'http://localhost:3001/api/v1/ingest/otlp/v1/traces',
        headers: { 'x-pulse-ingest-key' => ENV['PULSE_INGEST_API_KEY'] }
      )
    )
  )
end`,
      },
      {
        id: "rust",
        name: "Rust",
        emoji: "🦀",
        description: "Integrate the opentelemetry crate with your Rust services.",
        status: "native",
        setupLang: "toml",
        setupCode: `[dependencies]
opentelemetry = "0.22"
opentelemetry-otlp = { version = "0.15", features = ["http-proto"] }`,
      },
      {
        id: "nextjs",
        name: "Next.js",
        emoji: "▲",
        description: "Instrument Next.js App Router with the built-in instrumentation hook.",
        status: "native",
        setupLang: "typescript",
        setupCode: `// instrumentation.ts
export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const sdk = new NodeSDK({ serviceName: 'my-next-app' });
    sdk.start();
  }
}
// next.config.ts
export default { experimental: { instrumentationHook: true } };`,
      },
    ],
  },
  {
    id: "cloud",
    label: "Cloud Providers",
    emoji: "☁️",
    description: "Monitor compute, networking, and managed services across every major cloud.",
    color: "#818cf8",
    integrations: [
      { id: "aws", name: "Amazon Web Services", emoji: "🟠", description: "EC2, ECS, EKS, Lambda, RDS, S3 metrics via CloudWatch → OTLP bridge.", status: "native", setupLang: "yaml", setupCode: `# Use the AWS Distro for OpenTelemetry (ADOT) collector
receivers:
  awscloudwatch:
    region: us-east-1
exporters:
  otlphttp/pulse:
    endpoint: http://your-pulse-host/api/v1/ingest/otlp
    headers:
      x-pulse-ingest-key: "\${PULSE_INGEST_API_KEY}"` },
      { id: "gcp", name: "Google Cloud Platform", emoji: "🔵", description: "GKE, Cloud Run, BigQuery, Pub/Sub metrics via the GCP OTLP exporter.", status: "native", setupLang: "bash", setupCode: `# Use the Google Cloud Ops Agent with OTLP export\ngcloud components install google-cloud-ops-agent` },
      { id: "azure", name: "Microsoft Azure", emoji: "🟦", description: "AKS, App Service, Functions, Cosmos DB via Azure Monitor OTLP bridge.", status: "native", setupLang: "bash", setupCode: `# Enable Azure Monitor OpenTelemetry Distro\npip install azure-monitor-opentelemetry` },
      { id: "digitalocean", name: "DigitalOcean", emoji: "🌊", description: "Droplets, Kubernetes, App Platform metrics via OTLP exporter.", status: "native" },
      { id: "vmware", name: "VMware", emoji: "🖥️", description: "vSphere, Tanzu metrics forwarded via OTel Collector.", status: "coming_soon" },
      { id: "hetzner", name: "Hetzner", emoji: "🔴", description: "Bare metal and cloud server metrics via node_exporter + OTLP.", status: "native" },
    ],
  },
  {
    id: "containers",
    label: "Containers & Orchestration",
    emoji: "🐳",
    description: "Full-stack visibility into Kubernetes pods, nodes, namespaces and Docker workloads.",
    color: "#34d399",
    integrations: [
      { id: "kubernetes", name: "Kubernetes", emoji: "⎈", description: "Pod, node, namespace metrics + events via the OTel K8s receiver.", status: "native", setupLang: "yaml", setupCode: `# Add to your OTel Collector config:
receivers:
  k8s_cluster:
    auth_type: serviceAccount
  kubeletstats:
    auth_type: serviceAccount
    endpoint: "\${K8S_NODE_IP}:10250"` },
      { id: "docker", name: "Docker", emoji: "🐋", description: "Container metrics and logs via the Docker Stats receiver.", status: "native", setupLang: "yaml", setupCode: `receivers:
  docker_stats:
    endpoint: unix:///var/run/docker.sock
    metrics:
      container.cpu.usage.total: { enabled: true }
      container.memory.usage.total: { enabled: true }` },
      { id: "openshift", name: "OpenShift", emoji: "🔴", description: "OCP cluster metrics via Prometheus + OTLP bridge.", status: "native" },
      { id: "helm", name: "Helm", emoji: "⛵", description: "Track Helm release events and correlate with deployments.", status: "coming_soon" },
    ],
  },
  {
    id: "databases",
    label: "Databases & Data Stores",
    emoji: "🗄️",
    description: "Track query latency, connection pool saturation, replication lag and errors.",
    color: "#fb923c",
    integrations: [
      { id: "postgresql", name: "PostgreSQL", emoji: "🐘", description: "Query latency, connections, replication lag via pg_stat_statements + OTLP.", status: "native", setupLang: "yaml", setupCode: `receivers:
  postgresql:
    endpoint: localhost:5432
    username: otel
    password: \${POSTGRES_PASSWORD}
    databases: [mydb]` },
      { id: "mysql", name: "MySQL", emoji: "🐬", description: "Slow queries, InnoDB metrics, replication status via OTLP receiver.", status: "native" },
      { id: "mongodb", name: "MongoDB", emoji: "🍃", description: "Op counters, replication lag, index usage via the MongoDB OTel receiver.", status: "native" },
      { id: "redis", name: "Redis", emoji: "🔴", description: "Memory, evictions, hit rate, command latency via Redis OTel receiver.", status: "native", setupLang: "yaml", setupCode: `receivers:
  redis:
    endpoint: localhost:6379
    password: \${REDIS_PASSWORD}
    collection_interval: 10s` },
      { id: "elasticsearch", name: "Elasticsearch", emoji: "🟡", description: "Cluster health, shard stats, indexing throughput.", status: "native" },
      { id: "clickhouse", name: "ClickHouse", emoji: "🟠", description: "Query metrics, merge tree stats, distributed table performance.", status: "native" },
      { id: "cassandra", name: "Cassandra", emoji: "👁️", description: "Read/write latencies, compaction metrics via JMX receiver.", status: "native" },
      { id: "dynamodb", name: "DynamoDB", emoji: "🟠", description: "Consumed capacity, throttling, latency via AWS CloudWatch bridge.", status: "native" },
    ],
  },
  {
    id: "messaging",
    label: "Messaging & Streaming",
    emoji: "📬",
    description: "Consumer lag, throughput, error rates across your event backbone.",
    color: "#facc15",
    integrations: [
      { id: "kafka", name: "Apache Kafka", emoji: "⚡", description: "Consumer group lag, topic throughput, broker metrics via JMX or OTLP.", status: "native", setupLang: "yaml", setupCode: `receivers:
  kafkametrics:
    brokers: [localhost:9092]
    protocol_version: 2.0.0
    scrapers: [brokers, topics, consumers]` },
      { id: "rabbitmq", name: "RabbitMQ", emoji: "🐰", description: "Queue depth, message rates, channel metrics via the RabbitMQ receiver.", status: "native" },
      { id: "sqs", name: "Amazon SQS", emoji: "🟠", description: "Queue depth, oldest message age, send/receive rates via CloudWatch.", status: "native" },
      { id: "pulsar", name: "Apache Pulsar", emoji: "💫", description: "Producer/consumer stats, subscription backlog via Prometheus endpoint.", status: "native" },
      { id: "nats", name: "NATS", emoji: "🔵", description: "Subject throughput, connection stats via NATS monitoring endpoint.", status: "coming_soon" },
      { id: "kinesis", name: "Amazon Kinesis", emoji: "🌀", description: "Shard iterator lag, put/get record rates via CloudWatch.", status: "native" },
    ],
  },
  {
    id: "cicd",
    label: "CI/CD & DevOps",
    emoji: "🚀",
    description: "Correlate deployments, build failures and release frequency with service performance.",
    color: "#a78bfa",
    integrations: [
      { id: "github", name: "GitHub", emoji: "🐙", description: "Deployment events, PR merge times, workflow run status via webhooks.", status: "native", setupLang: "bash", setupCode: `# Configure GitHub webhook → Pulse ingest endpoint
# Payload URL: https://your-pulse/api/v1/ingest/logs
# Content type: application/json
# Events: Deployments, Workflow runs` },
      { id: "gitlab", name: "GitLab", emoji: "🦊", description: "Pipeline events, deployment tracking, DORA metrics.", status: "native" },
      { id: "jenkins", name: "Jenkins", emoji: "🎩", description: "Build duration, failure rates, queue depth via OpenTelemetry plugin.", status: "native", setupLang: "groovy", setupCode: `// Jenkinsfile
pipeline {
  agent any
  options { openTelemetry() }  // Jenkins OTel plugin
  environment {
    OTEL_EXPORTER_OTLP_ENDPOINT = 'http://your-pulse/api/v1/ingest/otlp'
  }
}` },
      { id: "octopus", name: "Octopus Deploy", emoji: "🐙", description: "Deployment lifecycle events and environment promotion tracking.", status: "coming_soon" },
      { id: "argocd", name: "Argo CD", emoji: "🐙", description: "Sync status, deployment events, rollback tracking.", status: "native" },
      { id: "circleci", name: "CircleCI", emoji: "⭕", description: "Workflow run durations, failure rates, queue times.", status: "coming_soon" },
    ],
  },
  {
    id: "incident",
    label: "Incident & Collaboration",
    emoji: "📟",
    description: "Route alerts to your on-call team and collaboration tools automatically.",
    color: "#f472b6",
    integrations: [
      { id: "pagerduty", name: "PagerDuty", emoji: "🚨", description: "Fire Events API v2 alerts from Pulse alert rules with full context.", status: "configured", setupLang: "json", setupCode: `// In Alerts → New Rule → PagerDuty routing key
// Pulse sends Events API v2 payloads:
{
  "routing_key": "your-pagerduty-routing-key",
  "event_action": "trigger",
  "payload": {
    "summary": "checkout-api p95 > 500ms",
    "severity": "critical",
    "source": "Pulse"
  }
}` },
      { id: "slack", name: "Slack", emoji: "💬", description: "Post rich alert messages with service context to any Slack channel.", status: "configured", setupLang: "bash", setupCode: `# In Alerts → New Rule → Slack webhook URL
# Pulse sends structured messages with:
# - Alert name and threshold
# - Firing service
# - Current metric value
# - Link to dashboard` },
      { id: "teams", name: "Microsoft Teams", emoji: "🟦", description: "Route alert notifications to Teams channels via Incoming Webhooks.", status: "coming_soon" },
      { id: "jira", name: "Jira", emoji: "🔵", description: "Auto-create Jira issues from critical alerts with runbook links.", status: "coming_soon" },
      { id: "opsgenie", name: "OpsGenie", emoji: "🟠", description: "On-call routing and escalation via OpsGenie Alerts API.", status: "coming_soon" },
      { id: "webhook", name: "Custom Webhook", emoji: "🔗", description: "POST alert payloads to any HTTP endpoint in your infrastructure.", status: "native", setupLang: "json", setupCode: `// Pulse fires:
POST https://your-endpoint.com/alerts
{
  "event": "pulse.alert.firing",
  "rule": "checkout-api p95",
  "service": "checkout-api",
  "value": 612,
  "threshold": 500,
  "severity": "warning"
}` },
    ],
  },
  {
    id: "cdn",
    label: "CDN & Edge",
    emoji: "🌐",
    description: "Monitor cache hit rates, origin latency, and error rates at the edge.",
    color: "#22d3ee",
    integrations: [
      { id: "cloudflare", name: "Cloudflare", emoji: "🟠", description: "Logpush to Pulse logs ingest — requests, cache, firewall events.", status: "native", setupLang: "bash", setupCode: `# Cloudflare Logpush → Pulse
# Destination: https://your-pulse/api/v1/ingest/logs
# Fields: ClientIP, EdgeResponseStatus, CacheCacheStatus,
#         OriginResponseDurationMs, RequestURI` },
      { id: "fastly", name: "Fastly", emoji: "⚡", description: "Real-time log streaming to Pulse via Fastly Log Streaming endpoint.", status: "native" },
      { id: "akamai", name: "Akamai", emoji: "🔵", description: "EdgeWorker traces and delivery logs via DataStream 2.", status: "coming_soon" },
      { id: "vercel", name: "Vercel", emoji: "▲", description: "Function execution traces, edge latency and build logs.", status: "native" },
    ],
  },
  {
    id: "security",
    label: "Security & SIEM",
    emoji: "🔐",
    description: "Correlate security events with service telemetry for unified observability.",
    color: "#f87171",
    integrations: [
      { id: "okta", name: "Okta", emoji: "🔒", description: "Authentication events, failed logins, policy violations via Okta System Log.", status: "native", setupLang: "bash", setupCode: `# Stream Okta System Log to Pulse logs:
curl -X POST https://your-pulse/api/v1/ingest/logs \\
  -H "x-api-key: your-key" \\
  -d '{"logs":[{"level":"warn","message":"MFA challenge failed","service":"okta"}]}'` },
      { id: "crowdstrike", name: "CrowdStrike", emoji: "🦅", description: "Falcon detection events and threat intelligence via Event Streams.", status: "coming_soon" },
      { id: "paloalto", name: "Palo Alto Networks", emoji: "🔥", description: "Firewall traffic logs and threat events via syslog → OTLP bridge.", status: "coming_soon" },
      { id: "snyk", name: "Snyk", emoji: "🛡️", description: "Vulnerability scan results correlated with deployment events.", status: "coming_soon" },
    ],
  },
  {
    id: "ai",
    label: "AI / ML & Modern Stack",
    emoji: "🤖",
    description: "Monitor LLM token usage, GPU workloads, vector DB latency and model inference.",
    color: "#a78bfa",
    integrations: [
      { id: "openai", name: "OpenAI", emoji: "🧠", description: "Token usage, request latency, error rates per model via custom metrics.", status: "native", setupLang: "typescript", setupCode: `// Wrap OpenAI client to emit metrics to Pulse:
const start = Date.now();
const res = await openai.chat.completions.create({ model: 'gpt-4o', messages });
await fetch('/api/v1/ingest/metrics', {
  method: 'POST',
  headers: { 'x-api-key': process.env.PULSE_INGEST_API_KEY! },
  body: JSON.stringify({ metrics: [
    { name: 'llm.request.duration_ms', value: Date.now() - start, labels: { model: 'gpt-4o' } },
    { name: 'llm.tokens.total', value: res.usage?.total_tokens ?? 0, labels: { model: 'gpt-4o' } },
  ]})
});` },
      { id: "anthropic", name: "Anthropic", emoji: "🤖", description: "Claude API latency, token consumption and error tracking.", status: "native" },
      { id: "nvidia", name: "NVIDIA", emoji: "💚", description: "GPU utilisation, memory, NCCL throughput via DCGM OTLP exporter.", status: "native", setupLang: "yaml", setupCode: `# DCGM Exporter → OTLP
receivers:
  prometheus:
    config:
      scrape_configs:
        - job_name: dcgm
          static_configs:
            - targets: [localhost:9400]` },
      { id: "langchain", name: "LangChain", emoji: "🔗", description: "Chain execution traces, tool call latency and LLM spans.", status: "native" },
      { id: "pinecone", name: "Pinecone", emoji: "🌲", description: "Vector query latency, index stats and upsert throughput.", status: "coming_soon" },
      { id: "weaviate", name: "Weaviate", emoji: "🔵", description: "GraphQL query latency, batch import throughput.", status: "coming_soon" },
    ],
  },
];

export const ALL_INTEGRATIONS: Integration[] = INTEGRATION_CATEGORIES.flatMap(
  (c) => c.integrations,
);
