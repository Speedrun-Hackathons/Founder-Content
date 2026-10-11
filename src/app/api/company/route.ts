import { fail, isResponse, json, readJson } from "@/lib/http";
import { createCompany, getState } from "@/lib/store";

export function GET() {
  const state = getState();
  return json({ company: state.company, documents: state.documents, brief: state.brief, voice: state.voice });
}

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
  const rawDocs = Array.isArray(body.documents) ? body.documents : [];
  const documents: { filename: string; text: string }[] = [];
  for (const [index, doc] of rawDocs.entries()) {
    const item = doc as Record<string, unknown>;
    if (typeof item?.filename !== "string" || typeof item?.text !== "string") {
      return fail("bad_document", `Document ${index + 1} needs a filename and text.`, 422);
    }
    documents.push({ filename: item.filename, text: item.text });
  }
  return json(createCompany(parsed.toString(), documents), 201);
}
