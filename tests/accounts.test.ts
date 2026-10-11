import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getAccounts } from "@/app/api/accounts/route";
import { resetSocialStreamline, setSocialStreamline } from "@/lib/social";
import { resetStore } from "@/lib/store";
import { fakeSocialStreamline, fixture } from "./fakes/social-streamline";

let fake: ReturnType<typeof fakeSocialStreamline>;

beforeEach(() => {
  resetStore();
  fake = fakeSocialStreamline();
  setSocialStreamline(fake.client);
});

afterEach(() => resetSocialStreamline());

describe("accounts from the posting service", () => {
  it("lists connected accounts with platform and handle", async () => {
    const body = await (await getAccounts()).json();
    const byPlatform = Object.fromEntries(body.accounts.map((a: { platform: string; handle: string }) => [a.platform, a.handle]));
    expect(byPlatform).toMatchObject({ tiktok: "@demo_founder", x: "@demo_founder", facebook: "@Demo Company", linkedin: "Demo Founder" });
  });

  it("shows platforms with no connection, and a disabled account, as not connected with the link", async () => {
    const body = await (await getAccounts()).json();
    expect(body.missing).toEqual(["youtube", "pinterest", "bluesky", "threads"]);
    expect(body.accounts.find((a: { platform: string }) => a.platform === "pinterest").connected).toBe(false);
    expect(body.connectUrl).toBe("https://socialstreamline.me");
  });

  it("passes a service failure through instead of showing stand-in accounts", async () => {
    fake.answer("GET /accounts", fixture("error-unauthorized"));
    const res = await getAccounts();
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain("Invalid or missing API key");
  });
});
