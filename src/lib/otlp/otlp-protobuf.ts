import "server-only";

import path from "node:path";
import protobuf from "protobufjs";

const PROTO_VENDOR = path.join(process.cwd(), "vendor/opentelemetry-proto");

const toObjectOpts: protobuf.IConversionOptions = {
  longs: String,
  enums: String,
  bytes: String,
  defaults: true,
  arrays: true,
  objects: true,
  oneofs: true,
};

function loadCollectorRoot(mainRel: string): protobuf.Root {
  const root = new protobuf.Root();
  root.resolvePath = (_origin: string, target: string) =>
    path.isAbsolute(target)
      ? target
      : path.normalize(path.join(PROTO_VENDOR, target));
  root.loadSync(path.join(PROTO_VENDOR, mainRel));
  return root;
}

let traceRoot: protobuf.Root | null = null;
let metricsRoot: protobuf.Root | null = null;
let logsRoot: protobuf.Root | null = null;

function traceExportType(): protobuf.Type {
  if (!traceRoot) {
    traceRoot = loadCollectorRoot(
      "opentelemetry/proto/collector/trace/v1/trace_service.proto",
    );
  }
  return traceRoot.lookupType(
    "opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest",
  );
}

function metricsExportType(): protobuf.Type {
  if (!metricsRoot) {
    metricsRoot = loadCollectorRoot(
      "opentelemetry/proto/collector/metrics/v1/metrics_service.proto",
    );
  }
  return metricsRoot.lookupType(
    "opentelemetry.proto.collector.metrics.v1.ExportMetricsServiceRequest",
  );
}

function logsExportType(): protobuf.Type {
  if (!logsRoot) {
    logsRoot = loadCollectorRoot(
      "opentelemetry/proto/collector/logs/v1/logs_service.proto",
    );
  }
  return logsRoot.lookupType(
    "opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest",
  );
}

export type OtlpPayloadKind = "traces" | "metrics" | "logs";

/** Decode OTLP/HTTP protobuf export body to a plain object (JSON-compatible keys). */
export function decodeOtlpProtobuf(
  buf: Uint8Array | Buffer,
  kind: OtlpPayloadKind,
): unknown {
  const T =
    kind === "traces"
      ? traceExportType()
      : kind === "metrics"
        ? metricsExportType()
        : logsExportType();
  const msg = T.decode(buf);
  return T.toObject(msg, toObjectOpts);
}
