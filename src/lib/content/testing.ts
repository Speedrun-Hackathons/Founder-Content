// Fakes for the Brief builder, in the style of src/lib/ads/testing.ts. Tests that create a Company
// call installFakeContent() in beforeEach and resetContent() in afterEach.

import { resetBriefAI, setBriefAI, type BriefAI, type BriefDraft, type BriefRequest } from "./ai";
import { memoryArchive, resetCompanyArchive, setCompanyArchive, type CompanyArchive } from "./archive";
import { resetSiteReader, setSiteReader, type SitePage, type SiteReader } from "./site";

export class FakeBriefAI implements BriefAI {
  calls: BriefRequest[] = [];
  error: string | null = null;
  next: BriefDraft | null = null;

  async writeBrief(request: BriefRequest): Promise<BriefDraft> {
    this.calls.push(request);
    if (this.error) throw new Error(this.error);
    const name = new URL(request.url).hostname.replace(/^www\./, "").split(".")[0];
    return (
      this.next ?? {
        companyName: name,
        brief: `${name} helps founders turn their company site into social posts and Ads that are tested and scheduled. ${request.documents.length} document(s) read.`,
        voice: {
          tone: "plain, direct, confident",
          rules: ["Short sentences.", "One idea per post.", "End with a concrete action."],
          bannedWords: ["revolutionary", "seamless", "game-changing"],
        },
      }
    );
  }
}

export class FakeSiteReader implements SiteReader {
  reads: string[] = [];
  error: string | null = null;

  async read(url: string): Promise<SitePage> {
    this.reads.push(url);
    if (this.error) throw new Error(this.error);
    return { url, title: "Example", description: "An example company.", text: "We help founders write less and ship more." };
  }
}

/** Fakes OpenAI and the site reader, and starts an empty in-memory archive for the Company. */
export function installFakeContent(): { ai: FakeBriefAI; site: FakeSiteReader; archive: CompanyArchive } {
  const ai = new FakeBriefAI();
  const site = new FakeSiteReader();
  const archive = memoryArchive();
  setBriefAI(ai);
  setSiteReader(site);
  setCompanyArchive(archive);
  return { ai, site, archive };
}

export function resetContent(): void {
  resetBriefAI();
  resetSiteReader();
  resetCompanyArchive();
}
