import { fail } from "@/lib/http";
import { respond } from "@/lib/social";

const MAX_BYTES = 500 * 1024 * 1024;
const ALLOWED = /^(image|video|audio)\//;

/** Uploads one image, video or audio file to the posting service; the answer carries its public URL. */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("bad_body", "Send the file as multipart/form-data with a field named file.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return fail("no_file", "Add a file in the field named file.", 422);
  if (!ALLOWED.test(file.type)) return fail("bad_file", `"${file.name}" is ${file.type || "an unknown type"}; upload an image, video or audio file.`, 422);
  if (file.size > MAX_BYTES) return fail("bad_file", `"${file.name}" is larger than 500 MB.`, 422);
  return respond((ss) => ss.uploadMedia(file, file.name), 201);
}
