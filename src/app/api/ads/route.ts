import { failuresFor } from "@/lib/ads/generate";
import { json } from "@/lib/http";
import { getState } from "@/lib/store";

export function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId");
  const state = getState();
  const ads = state.ads.filter((ad) => !runId || ad.runId === runId);
  const runIds = state.runs.map((run) => run.id).filter((id) => !runId || id === runId);
  return json({ ads, failures: failuresFor(runIds) });
}
