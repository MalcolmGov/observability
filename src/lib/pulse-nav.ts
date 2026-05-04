export type PulseNavItem = {
  href: string;
  label: string;
  desc: string;
  keywords?: string;
};

/** Single source for sidebar + command palette (⌘K). */
export const PULSE_PRIMARY_NAV: readonly PulseNavItem[] = [
  {
    href: "/getting-started",
    label: "Get Started",
    desc: "Setup & feature tour",
    keywords: "onboarding setup welcome tour wizard",
  },
  {
    href: "/briefing",
    label: "Briefing",
    desc: "Executive storyline",
    keywords: "exec summary report",
  },
  {
    href: "/",
    label: "Dashboard",
    desc: "Command center",
    keywords: "home overview kpi",
  },
  {
    href: "/services",
    label: "Services",
    desc: "APM inventory",
    keywords: "inventory list",
  },
  {
    href: "/catalog",
    label: "Catalog",
    desc: "Product × market grid",
    keywords: "apps matrix regions consumer merchant agent",
  },
  {
    href: "/explore",
    label: "Explore",
    desc: "Logs, metrics & traces",
    keywords: "grafana promql inspector live tail query",
  },
  {
    href: "/metrics",
    label: "Metrics",
    desc: "Explorer & ranges",
    keywords: "charts promql",
  },
  {
    href: "/logs",
    label: "Logs",
    desc: "Search & filters",
    keywords: "logql tail",
  },
  {
    href: "/map",
    label: "Service map",
    desc: "Dependency graph",
    keywords: "topology graph dependencies",
  },
  {
    href: "/traces",
    label: "Traces",
    desc: "Distributed tracing",
    keywords: "apm waterfall",
  },
  {
    href: "/alerts",
    label: "Alerts",
    desc: "Detection rules",
    keywords: "monitoring slo silence",
  },
  {
    href: "/incidents",
    label: "Incidents",
    desc: "Command centre",
    keywords: "war room outage on-call triage",
  },
  {
    href: "/integrations",
    label: "Integrations",
    desc: "Connect data sources",
    keywords: "cloud kubernetes docker aws gcp azure database kafka otlp prometheus",
  },
] as const;
