import { json } from "@/lib/http";
import { PLATFORMS } from "@/lib/model";
import { getState } from "@/lib/store";

export function GET() {
  const accounts = getState().accounts;
  const missing = PLATFORMS.filter((platform) => !accounts.some((a) => a.platform === platform && a.connected));
  return json({ accounts, missing, connectUrl: "https://socialstreamline.me" });
}
