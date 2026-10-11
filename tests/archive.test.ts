import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getCompany, POST as postCompany } from "@/app/api/company/route";
import { GET as getBrief, PUT as putBrief } from "@/app/api/brief/route";
import { POST as postCaptions } from "@/app/api/posts/captions/route";
import { POST as postRuns } from "@/app/api/runs/route";
import { installFakeAds, resetAds } from "@/lib/ads/testing";
import { setCompanyArchive, type CompanyArchive } from "@/lib/content/archive";
import { installFakeContent, resetContent } from "@/lib/content/testing";
import { resetSocialStreamline, setSocialStreamline } from "@/lib/social";
import { resetStore } from "@/lib/store";
import { fakeSocialStreamline } from "./fakes/social-streamline";

function send(method: string, path: string, body: unknown): Request {
  return new Request(`http://test${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

let fake: ReturnType<typeof fakeSocialStreamline>;

beforeEach(() => {
  resetStore();
  installFakeContent();
  installFakeAds();
  fake = fakeSocialStreamline();
  setSocialStreamline(fake.client);
});

afterEach(() => {
  resetContent();
  resetAds();
  resetSocialStreamline();
});

describe("the Company survives a restart", () => {
  it("restores the Company, Documents, Brief, Voice and approval after the store is lost", async () => {
    const built = await postCompany(send("POST", "/api/company", { url: "https://acme.example", documents: [{ filename: "deck.txt", text: "Robots for small warehouses." }] }));
    expect((await built.json()).archive).toEqual({ kind: "memory", error: null });
    await putBrief(send("PUT", "/api/brief", { text: "Acme sells warehouse robots.", voice: { tone: "dry" }, approved: true }));

    resetStore(); // what a redeploy does to the in-memory store

    const company = await (await getCompany()).json();
    expect(company.company.url).toBe("https://acme.example/");
    expect(company.documents).toEqual([expect.objectContaining({ filename: "deck.txt", text: "Robots for small warehouses." })]);
    expect(company.brief).toMatchObject({ text: "Acme sells warehouse robots.", approved: true });
    expect(company.voice.tone).toBe("dry");
  });

  it("lets generation start straight after a restart, without opening the Company page first", async () => {
    await postCompany(send("POST", "/api/company", { url: "https://acme.example" }));
    await putBrief(send("PUT", "/api/brief", { approved: true }));
    resetStore();
    expect((await postRuns(send("POST", "/api/runs", { platforms: ["facebook"] }))).status).toBe(201);
    resetStore();
    expect((await postCaptions(send("POST", "/api/posts/captions", { platforms: ["linkedin"] }))).status).toBe(201);
  });

  it("keeps every saved version of the Brief, newest first", async () => {
    await postCompany(send("POST", "/api/company", { url: "https://acme.example" }));
    await putBrief(send("PUT", "/api/brief", { text: "Second." }));
    await putBrief(send("PUT", "/api/brief", { text: "Third.", approved: true }));
    const { history } = await (await getCompany()).json();
    expect(history.map((v: { brief: string; approved: boolean }) => [v.brief, v.approved])).toEqual([
      ["Third.", true],
      ["Second.", false],
      [expect.stringContaining("helps founders"), false],
    ]);
  });
});

describe("a database that fails", () => {
  const broken: CompanyArchive = {
    kind: "postgres",
    load: async () => {
      throw new Error("connect ECONNREFUSED postgres.railway.internal:5432");
    },
    save: async () => {
      throw new Error("connect ECONNREFUSED postgres.railway.internal:5432");
    },
    history: async () => [],
  };

  it("keeps the Brief for the session and says it was not saved", async () => {
    setCompanyArchive(broken);
    const res = await postCompany(send("POST", "/api/company", { url: "https://acme.example" }));
    expect(res.status).toBe(201);
    expect((await res.json()).archive).toEqual({
      kind: "postgres",
      error: "The Brief was kept for this session but not saved: connect ECONNREFUSED postgres.railway.internal:5432",
    });
    expect((await getBrief()).status).toBe(200);
  });

  it("reports a failed load instead of pretending there is no Company", async () => {
    setCompanyArchive(broken);
    const body = await (await getCompany()).json();
    expect(body.company).toBeNull();
    expect(body.archive.error).toBe("The saved Company could not be loaded: connect ECONNREFUSED postgres.railway.internal:5432");
  });
});

describe("generation context", () => {
  it("gives the caption writer excerpts of the Documents next to the Brief", async () => {
    await postCompany(send("POST", "/api/company", { url: "https://acme.example", documents: [{ filename: "deck.txt", text: "Customers pick 40% faster." }] }));
    await putBrief(send("PUT", "/api/brief", { approved: true }));
    await postCaptions(send("POST", "/api/posts/captions", { platforms: ["linkedin"] }));
    const transcript = fake.calls.find((c) => c.path === "/content/generate")!.body.transcript as string;
    expect(transcript).toContain("[deck.txt] Customers pick 40% faster.");
  });
});
