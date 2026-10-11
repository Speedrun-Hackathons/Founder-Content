import { respond } from "@/lib/social";

/** The posts that used this item. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return respond(async (ss) => ({ posts: await ss.libraryItemPosts(id) }));
}

/** Takes the item out of the library; posts already published with it are unaffected. */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return respond(async (ss) => {
    await ss.deleteLibraryItem(id);
    return { deleted: true, id };
  });
}
