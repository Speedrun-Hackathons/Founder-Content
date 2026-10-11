// Blog posts, kept in Postgres (DATABASE_URL, table blog_posts, created on first use) so they
// survive restarts like the Brief does; in memory without a database.

import postgres from "postgres";
import type { Voice } from "@/lib/model";
import type { BlogLength } from "./blog-ai";

export type BlogPost = {
  id: string;
  companyId: string;
  title: string;
  slug: string;
  metaDescription: string;
  tags: string[];
  markdown: string;
  topic: string;
  keyword: string;
  length: BlogLength;
  /** Banned Voice words still in the post; the Founder edits them out before using it. */
  warnings: string[];
  createdAt: string;
  updatedAt: string;
};

export interface BlogStore {
  readonly kind: "postgres" | "memory";
  list(founderId: string): Promise<BlogPost[]>;
  get(founderId: string, id: string): Promise<BlogPost | null>;
  save(founderId: string, post: BlogPost): Promise<void>;
  remove(founderId: string, id: string): Promise<boolean>;
}

export function memoryBlogStore(): BlogStore {
  const posts = new Map<string, BlogPost & { founderId: string }>();
  const strip = (stored: BlogPost & { founderId: string }): BlogPost => {
    const post: Partial<BlogPost & { founderId: string }> = structuredClone(stored);
    delete post.founderId;
    return post as BlogPost;
  };
  return {
    kind: "memory",
    async list(founderId) {
      return [...posts.values()]
        .filter((p) => p.founderId === founderId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(strip);
    },
    async get(founderId, id) {
      const post = posts.get(id);
      return post && post.founderId === founderId ? strip(post) : null;
    },
    async save(founderId, post) {
      posts.set(post.id, { ...structuredClone(post), founderId });
    },
    async remove(founderId, id) {
      const post = posts.get(id);
      if (!post || post.founderId !== founderId) return false;
      return posts.delete(id);
    },
  };
}

type Row = { post: BlogPost };

export function postgresBlogStore(url: string): BlogStore {
  const sql = postgres(url, { max: 2, connect_timeout: 5, idle_timeout: 30, onnotice: () => {} });
  let ready: Promise<unknown> | null = null;
  const migrate = () =>
    (ready ??= sql`create table if not exists blog_posts (
        id text primary key,
        founder_id text not null,
        company_id text not null,
        post jsonb not null,
        updated_at timestamptz not null default now()
      )`.catch((err) => {
      ready = null;
      throw err;
    }));
  return {
    kind: "postgres",
    async list(founderId) {
      await migrate();
      const rows = await sql<Row[]>`select post from blog_posts where founder_id = ${founderId} order by updated_at desc limit 100`;
      return rows.map((r) => r.post);
    },
    async get(founderId, id) {
      await migrate();
      const rows = await sql<Row[]>`select post from blog_posts where founder_id = ${founderId} and id = ${id}`;
      return rows[0]?.post ?? null;
    },
    async save(founderId, post) {
      await migrate();
      await sql`insert into blog_posts (id, founder_id, company_id, post, updated_at)
        values (${post.id}, ${founderId}, ${post.companyId}, ${sql.json(post as never)}, now())
        on conflict (id) do update set post = excluded.post, updated_at = now()`;
    },
    async remove(founderId, id) {
      await migrate();
      const rows = await sql`delete from blog_posts where founder_id = ${founderId} and id = ${id} returning id`;
      return rows.length > 0;
    },
  };
}

let current: BlogStore | null = null;

export function blogStore(): BlogStore {
  const url = process.env.DATABASE_URL;
  return (current ??= url ? postgresBlogStore(url) : memoryBlogStore());
}

export function setBlogStore(store: BlogStore): void {
  current = store;
}

export function resetBlogStore(): void {
  current = null;
}

/** The Voice's banned words that appear in the text, matched as whole words in any case. */
export function bannedWordsIn(text: string, voice: Voice | null): string[] {
  if (!voice) return [];
  return voice.bannedWords.filter((word) => {
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped && new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(text);
  });
}
