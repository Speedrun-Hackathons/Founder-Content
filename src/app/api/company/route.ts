import { fail, isResponse, json, readJson } from "@/lib/http";
import { briefAI, OpenAINotConfigured } from "@/lib/content/ai";
import { privateHostReason, siteReader, type SitePage } from "@/lib/content/site";
import { createCompany, getState, updateBrief, updateVoice } from "@/lib/store";

const MAX_DOCUMENTS = 10;
const MAX_DOCUMENT_CHARS = 200_000;

export function GET() {
  const state = getState();
  return json({ company: state.company, documents: state.documents, brief: state.brief, voice: state.voice });
}

/** Reads the Company URL and the Documents, then writes a Brief and a Voice for the Founder to edit and approve. */
export async function POST(req: Request) {
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const url = typeof body.url === "string" ? body.url.trim() : "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return fail("bad_url", `"${url}" is not a URL. Enter the company site, such as https://example.com.`, 422);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return fail("bad_url", `"${url}" must start with http or https.`, 422);
  }
  const blocked = privateHostReason(parsed);
  if (blocked) return fail("bad_url", `"${url}" cannot be read: ${blocked}. Enter the public company site.`, 422);

  const rawDocs = Array.isArray(body.documents) ? body.documents : [];
  if (rawDocs.length > MAX_DOCUMENTS) return fail("too_many_documents", `Add at most ${MAX_DOCUMENTS} Documents; got ${rawDocs.length}.`, 422);
  const documents: { filename: string; text: string }[] = [];
  for (const [index, doc] of rawDocs.entries()) {
    const item = doc as Record<string, unknown>;
    if (typeof item?.filename !== "string" || typeof item?.text !== "string") {
      return fail("bad_document", `Document ${index + 1} needs a filename and text.`, 422);
    }
    if (item.text.length > MAX_DOCUMENT_CHARS) {
      return fail("bad_document", `Document "${item.filename}" is longer than ${MAX_DOCUMENT_CHARS.toLocaleString("en-US")} characters.`, 422);
    }
    documents.push({ filename: item.filename, text: item.text });
  }

  let page: SitePage;
  try {
    page = await siteReader().read(parsed.toString());
  } catch (error) {
    return fail("site_unreadable", error instanceof Error ? error.message : String(error), 422);
  }

  let draft;
  try {
    draft = await briefAI().writeBrief({ url: parsed.toString(), page, documents });
  } catch (error) {
    if (error instanceof OpenAINotConfigured) return fail("openai_not_configured", error.message, 503);
    return fail("brief_failed", error instanceof Error ? error.message : String(error), 502);
  }

  const created = createCompany(parsed.toString(), documents);
  if (draft.companyName) created.company.name = draft.companyName;
  const brief = updateBrief({ text: draft.brief });
  const voice = updateVoice(draft.voice);
  return json({ company: created.company, brief, voice }, 201);
}
