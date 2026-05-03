import { TraceWaterfallView } from "@/components/trace-waterfall-view";

type PageProps = { params: Promise<{ traceId: string }> };

export default async function TraceDetailPage({ params }: PageProps) {
  const { traceId } = await params;
  return <TraceWaterfallView traceId={traceId} />;
}
