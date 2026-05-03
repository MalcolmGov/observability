export function FeaturePlaceholder({
  title,
  body,
  bullets,
}: {
  title: string;
  body: string;
  bullets: string[];
}) {
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">{body}</p>
      </div>
      <div className="rounded-2xl border border-dashed border-indigo-500/30 bg-indigo-500/[0.04] p-6">
        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-300/90">
          Roadmap
        </div>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-zinc-300">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
