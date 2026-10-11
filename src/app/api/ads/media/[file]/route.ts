import { imageStore, isMediaName } from "@/lib/ads/media";
import { fail } from "@/lib/http";

export async function GET(_req: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  if (!isMediaName(file)) return fail("no_media", `No image "${file}".`, 404);
  const bytes = await imageStore().read(file);
  if (!bytes) return fail("no_media", `No image "${file}".`, 404);
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
