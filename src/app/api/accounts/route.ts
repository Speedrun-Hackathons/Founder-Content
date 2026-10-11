import { json } from "@/lib/http";
import { PLATFORMS, type Account } from "@/lib/model";
import { serviceFailure, socialStreamline } from "@/lib/social";
import { getState } from "@/lib/store";

/** The accounts connected in the posting service. Connecting one happens on its own site. */
export async function GET() {
  let accounts: Account[];
  try {
    accounts = (await socialStreamline().listAccounts()).map(({ id, platform, handle, connected }) => ({ id, platform, handle, connected }));
  } catch (err) {
    return serviceFailure(err);
  }
  getState().accounts = accounts;
  const missing = PLATFORMS.filter((platform) => !accounts.some((a) => a.platform === platform && a.connected));
  return json({ accounts, missing, connectUrl: "https://socialstreamline.me" });
}
