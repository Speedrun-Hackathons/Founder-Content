// Fakes for the Brief builder, in the style of src/lib/ads/testing.ts. Tests that create a Company
// call installFakeContent() in beforeEach and resetContent() in afterEach.

import { resetBriefAI, setBriefAI, type BriefAI, type BriefDraft, type BriefRequest } from "./ai";
import { memoryArchive, resetCompanyArchive, setCompanyArchive, type CompanyArchive } from "./archive";
import { resetBlogAI, setBlogAI, type BlogAI, type BlogDraft, type BlogRequest } from "./blog-ai";
import { memoryBlogStore, resetBlogStore, setBlogStore, type BlogStore } from "./blogs";
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
/** Writes a post from the request, or the scripted drafts in order. */
export class FakeBlogAI implements BlogAI {
  calls: BlogRequest[] = [];
  error: string | null = null;
  scripted: BlogDraft[] = [];

  async writeBlog(request: BlogRequest): Promise<BlogDraft> {
    this.calls.push(request);
    if (this.error) throw new Error(this.error);
    const next = this.scripted.shift();
    if (next) return next;
    const title = request.topic ? `How ${request.company.name} handles ${request.topic}` : `Getting started with ${request.company.name}`;
    return {
      title,
      slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      metaDescription: `What ${request.company.name} does and how to start.`,
      tags: ["founders", "content"],
      markdown: `Opening paragraph.

## Why it matters

A short section.

## Next step

Visit ${request.company.url}.`,
    };
  }
}

/** Fakes OpenAI and the site reader, and starts empty in-memory stores for the Company and blog posts. */
export function installFakeContent(): { ai: FakeBriefAI; site: FakeSiteReader; archive: CompanyArchive; blogAI: FakeBlogAI; blogs: BlogStore } {
  const ai = new FakeBriefAI();
  const site = new FakeSiteReader();
  const archive = memoryArchive();
  const blogAI = new FakeBlogAI();
  const blogs = memoryBlogStore();
  setBriefAI(ai);
  setSiteReader(site);
  setCompanyArchive(archive);
  setBlogAI(blogAI);
  setBlogStore(blogs);
  return { ai, site, archive, blogAI, blogs };
}

export function resetContent(): void {
  resetBriefAI();
  resetSiteReader();
  resetCompanyArchive();
  resetBlogAI();
  resetBlogStore();
}
