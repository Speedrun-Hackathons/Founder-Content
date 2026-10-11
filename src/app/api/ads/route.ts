import { json } from "@/lib/http";
import { getState } from "@/lib/store";

export function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId");
  const ads = getState().ads.filter((ad) => !runId || ad.runId === runId);
  return json({ ads });
}
