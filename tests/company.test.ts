import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getCompany, POST as postCompany } from "@/app/api/company/route";
import { GET as getBrief, PUT as putBrief } from "@/app/api/brief/route";
import { POST as postCaptions } from "@/app/api/posts/captions/route";
import { GET as getEvents } from "@/app/api/events/route";
import { parseBrief } from "@/lib/content/ai";
import { createSiteReader, htmlToPage } from "@/lib/content/site";
import { installFakeContent, resetContent, type FakeBriefAI, type FakeSiteReader } from "@/lib/content/testing";
import { resetStore } from "@/lib/store";

function send(method: string, path: string, body: unknown): Request {
  return new Request(`http://test${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

let ai: FakeBriefAI;
let site: FakeSiteReader;

beforeEach(() => {
  resetStore();
  ({ ai, site } = installFakeContent());
});

afterEach(() => resetContent());

describe("Company URL and Documents to Brief and Voice", () => {
  it("reads the page and the Documents and saves the Brief and Voice OpenAI wrote", async () => {
    ai.next = {
      companyName: "Acme Robotics",
      brief: "Acme Robotics sells warehouse robots to small distributors.",
      voice: { tone: "warm, exact", rules: ["Name the customer."], bannedWords: ["synergy"] },
    };
    const res = await postCompany(
      send("POST", "/api/company", { url: "https://acme.example/", documents: [{ filename: "deck.txt", text: "Robots for small warehouses." }] }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.company.name).toBe("Acme Robotics");
    expect(body.brief).toMatchObject({ text: "Acme Robotics sells warehouse robots to small distributors.", approved: false });
    expect(body.voice).toMatchObject({ tone: "warm, exact", rules: ["Name the customer."], bannedWords: ["synergy"] });

    expect(site.reads).toEqual(["https://acme.example/"]);
    expect(ai.calls[0].page.text).toBe("We help founders write less and ship more.");
    expect(ai.calls[0].documents).toEqual([{ filename: "deck.txt", text: "Robots for small warehouses." }]);
    const stored = await (await getCompany()).json();
    expect(stored.documents).toHaveLength(1);
  });

  it("shows why the site could not be read and keeps the previous Company", async () => {
    await postCompany(send("POST", "/api/company", { url: "https://first.example" }));
    site.error = "https://second.example/ answered 404 Not Found.";
    const res = await postCompany(send("POST", "/api/company", { url: "https://second.example" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "site_unreadable", message: "https://second.example/ answered 404 Not Found." });
    expect((await (await getCompany()).json()).company.url).toBe("https://first.example/");
  });

  it("passes OpenAI's failure through and saves nothing", async () => {
    ai.error = "OpenAI refused the request (429): Rate limit reached.";
    const res = await postCompany(send("POST", "/api/company", { url: "https://acme.example" }));
    expect(res.status).toBe(502);
    expect((await res.json()).message).toBe("OpenAI refused the request (429): Rate limit reached.");
    expect((await (await getCompany()).json()).company).toBeNull();
  });

  it("refuses a private address before fetching it", async () => {
    for (const url of ["http://localhost:3000", "http://127.0.0.1/admin", "http://192.168.1.10", "http://169.254.169.254/latest"]) {
      const res = await postCompany(send("POST", "/api/company", { url }));
      expect(res.status).toBe(422);
      expect((await res.json()).message).toContain("cannot be read");
    }
    expect(site.reads).toEqual([]);
  });

  it("refuses a Document without text", async () => {
    const res = await postCompany(send("POST", "/api/company", { url: "https://acme.example", documents: [{ filename: "deck.pdf" }] }));
    expect(res.status).toBe(422);
    expect((await res.json()).message).toBe("Document 1 needs a filename and text.");
  });
});

describe("editing and approving", () => {
  it("edits the Brief and every part of the Voice, then approves once", async () => {
    await postCompany(send("POST", "/api/company", { url: "https://acme.example" }));
    const res = await putBrief(
      send("PUT", "/api/brief", { text: "Edited.", voice: { tone: "dry", rules: ["No exclamation marks."], bannedWords: ["disrupt"] } }),
    );
    expect((await res.json()).voice).toMatchObject({ tone: "dry", rules: ["No exclamation marks."], bannedWords: ["disrupt"] });
    await putBrief(send("PUT", "/api/brief", { approved: true }));
    await putBrief(send("PUT", "/api/brief", { approved: true }));
    const brief = await (await getBrief()).json();
    expect(brief.brief).toMatchObject({ text: "Edited.", approved: true });
    const events = (await (await getEvents()).json()).events.map((e: { type: string }) => e.type);
    expect(events.filter((t: string) => t === "brief_approved")).toHaveLength(1);
  });

  it("refuses generation on an unapproved Brief with a clear message", async () => {
    await postCompany(send("POST", "/api/company", { url: "https://acme.example" }));
    const res = await postCaptions(send("POST", "/api/posts/captions", { platforms: ["linkedin"] }));
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain("Approve it on the Company page");
  });
});

describe("site reader", () => {
  it("turns a page into its title, description and visible text", () => {
    const page = htmlToPage(
      "https://acme.example/",
      `<html><head><title>Acme &amp; Co</title><meta name="description" content="Robots for small warehouses."><style>p{}</style></head>
       <body><nav>Home</nav><script>alert(1)</script><h1>Pick faster</h1><p>Robots that&nbsp;fit.</p><!-- hidden --></body></html>`,
    );
    expect(page.title).toBe("Acme & Co");
    expect(page.description).toBe("Robots for small warehouses.");
    expect(page.text).toBe("Home\nPick faster\nRobots that fit.");
  });

  it("checks every redirect against private addresses", async () => {
    const reader = createSiteReader((async () =>
      new Response(null, { status: 302, headers: { location: "http://10.0.0.5/" } })) as unknown as typeof fetch);
    await expect(reader.read("https://acme.example/")).rejects.toThrow("10.0.0.5 is a private network address");
  });

  it("refuses something that is not a web page", async () => {
    const reader = createSiteReader((async () =>
      new Response("%PDF", { status: 200, headers: { "content-type": "application/pdf" } })) as unknown as typeof fetch);
    await expect(reader.read("https://acme.example/deck.pdf")).rejects.toThrow("is not a web page (application/pdf)");
  });
});

describe("OpenAI answer", () => {
  it("rejects a Brief in the wrong shape instead of saving half of it", () => {
    const answer = (content: unknown) => ({ choices: [{ message: { content: JSON.stringify(content) } }] });
    expect(() => parseBrief(answer({ companyName: "Acme", brief: "x" }))).toThrow("unexpected shape");
    expect(parseBrief(answer({ companyName: " Acme ", brief: " B ", voice: { tone: "t", rules: ["r", ""], bannedWords: [] } }))).toEqual({
      companyName: "Acme",
      brief: "B",
      voice: { tone: "t", rules: ["r"], bannedWords: [] },
    });
  });
});
