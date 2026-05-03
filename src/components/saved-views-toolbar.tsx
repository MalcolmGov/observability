"use client";

import { useCallback, useEffect, useState } from "react";

type SavedViewsToolbarProps = {
  page: string;
  getState: () => Record<string, unknown>;
  applyState: (state: Record<string, unknown>) => void;
};

export function SavedViewsToolbar({
  page,
  getState,
  applyState,
}: SavedViewsToolbarProps) {
  const [saveName, setSaveName] = useState("");
  const [views, setViews] = useState<
    { id: number; name: string; state: Record<string, unknown> }[]
  >([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(
      `/api/v1/saved-views?page=${encodeURIComponent(page)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      views: { id: number; name: string; state: Record<string, unknown> }[];
    };
    setViews(data.views);
  }, [page]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function save() {
    const name =
      saveName.trim() ||
      `View ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;
    setFeedback(null);
    try {
      const res = await fetch("/api/v1/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, name, state: getState() }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveName("");
      await reload();
      setFeedback("Saved");
      window.setTimeout(() => setFeedback(null), 2000);
    } catch {
      setFeedback("Save failed");
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-[120px] flex-col gap-1 text-[10px] text-zinc-500">
        Saved views
        <select
          className="rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-xs text-zinc-100"
          defaultValue=""
          onChange={(e) => {
            const id = Number(e.target.value);
            if (!Number.isFinite(id)) return;
            const v = views.find((x) => x.id === id);
            if (v) applyState(v.state);
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            Load…
          </option>
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-[100px] flex-col gap-1 text-[10px] text-zinc-500">
        Save as
        <input
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="name"
          className="rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-xs text-zinc-100 placeholder:text-zinc-600"
        />
      </label>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-zinc-100 hover:bg-white/10"
      >
        Save view
      </button>
      {feedback ? (
        <span className="text-xs text-zinc-400">{feedback}</span>
      ) : null}
    </div>
  );
}
