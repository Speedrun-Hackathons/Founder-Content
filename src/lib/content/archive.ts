// Keeps the Company, its Documents, the Brief and the Voice in Postgres (DATABASE_URL), so they
// survive restarts and redeploys, and keeps every saved version of the Brief and Voice as history.
// The rest of the store stays in memory. Without DATABASE_URL the archive is in memory too, and
// every route says so through `archiveStatus()`.

import postgres from "postgres";
import type { Brief, Company, Document, Voice } from "@/lib/model";
import { founderId, getState } from "@/lib/store";

export type CompanyProfile = { company: Company; documents: Document[]; brief: Brief; voice: Voice | null };

export type BriefVersion = { brief: string; voice: Voice | null; approved: boolean; savedAt: string };

export interface CompanyArchive {
  readonly kind: "postgres" | "memory";
  load(founderId: string): Promise<CompanyProfile | null>;
  save(founderId: string, profile: CompanyProfile): Promise<void>;
  history(companyId: string, limit: number): Promise<BriefVersion[]>;
}

export function memoryArchive(): CompanyArchive {
  const profiles = new Map<string, CompanyProfile>();
  const versions: (BriefVersion & { companyId: string })[] = [];
  return {
    kind: "memory",
    async load(founder) {
      const p = profiles.get(founder);
      return p ? structuredClone(p) : null;
    },
    async save(founder, profile) {
      profiles.set(founder, structuredClone(profile));
      versions.push({ companyId: profile.company.id, brief: profile.brief.text, voice: profile.voice, approved: profile.brief.approved, savedAt: new Date().toISOString() });
    },
    async history(companyId, limit) {
      return versions
        .filter((v) => v.companyId === companyId)
        .reverse()
        .slice(0, limit)
        .map((v) => ({ brief: v.brief, voice: v.voice, approved: v.approved, savedAt: v.savedAt }));
    },
  };
}

export function postgresArchive(url: string): CompanyArchive {
  const sql = postgres(url, { max: 3, connect_timeout: 5, idle_timeout: 30, onnotice: () => {} });
  let ready: Promise<unknown> | null = null;
  const migrate = () =>
    (ready ??= sql
      .begin(async (tx) => {
        await tx`create table if not exists company_profiles (
          founder_id text primary key,
          company_id text not null,
          url text not null,
          profile jsonb not null,
          updated_at timestamptz not null default now()
        )`;
        await tx`create table if not exists brief_versions (
          id bigserial primary key,
          founder_id text not null,
          company_id text not null,
          brief text not null,
          voice jsonb,
          approved boolean not null,
          saved_at timestamptz not null default now()
        )`;
        await tx`create index if not exists brief_versions_company on brief_versions (company_id, saved_at desc)`;
      })
      .catch((err) => {
        ready = null;
        throw err;
      }));

  return {
    kind: "postgres",
    async load(founder) {
      await migrate();
      const rows = await sql<{ profile: CompanyProfile }[]>`select profile from company_profiles where founder_id = ${founder}`;
      return rows[0]?.profile ?? null;
    },
    async save(founder, profile) {
      await migrate();
      await sql.begin(async (tx) => {
        await tx`insert into company_profiles (founder_id, company_id, url, profile, updated_at)
          values (${founder}, ${profile.company.id}, ${profile.company.url}, ${tx.json(profile as never)}, now())
          on conflict (founder_id) do update set company_id = excluded.company_id, url = excluded.url, profile = excluded.profile, updated_at = now()`;
        await tx`insert into brief_versions (founder_id, company_id, brief, voice, approved)
          values (${founder}, ${profile.company.id}, ${profile.brief.text}, ${profile.voice ? tx.json(profile.voice as never) : null}, ${profile.brief.approved})`;
      });
    },
    async history(companyId, limit) {
      await migrate();
      const rows = await sql<{ brief: string; voice: Voice | null; approved: boolean; saved_at: Date }[]>`
        select brief, voice, approved, saved_at from brief_versions where company_id = ${companyId} order by saved_at desc limit ${limit}`;
      return rows.map((r) => ({ brief: r.brief, voice: r.voice, approved: r.approved, savedAt: r.saved_at.toISOString() }));
    },
  };
}

function fromEnv(): CompanyArchive {
  const url = process.env.DATABASE_URL;
  return url ? postgresArchive(url) : memoryArchive();
}

let current: CompanyArchive | null = null;

export function companyArchive(): CompanyArchive {
  return (current ??= fromEnv());
}

export function setCompanyArchive(archive: CompanyArchive): void {
  current = archive;
  lastError = null;
}

export function resetCompanyArchive(): void {
  current = null;
  lastError = null;
}

// ---- syncing the in-memory store ------------------------------------------------------------

let lastError: string | null = null;
const loaded = new WeakSet<object>();

/** Where the Company is kept and whether the last load or save worked, for the Company page. */
export function archiveStatus(): { kind: "postgres" | "memory"; error: string | null } {
  return { kind: companyArchive().kind, error: lastError };
}

/** After a restart, puts the saved Company back into the store. Runs once per store; a failure is reported, not thrown. */
export async function ensureCompanyLoaded(): Promise<void> {
  const state = getState();
  if (state.company || loaded.has(state)) return;
  loaded.add(state);
  try {
    const profile = await companyArchive().load(founderId());
    lastError = null;
    if (profile && !state.company) {
      state.company = profile.company;
      state.documents = profile.documents;
      state.brief = profile.brief;
      state.voice = profile.voice;
    }
  } catch (err) {
    loaded.delete(state);
    lastError = `The saved Company could not be loaded: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Saves the current Company, Documents, Brief and Voice. Returns the error text instead of throwing. */
export async function saveCompany(): Promise<string | null> {
  const { company, documents, brief, voice } = getState();
  if (!company || !brief) return null;
  try {
    await companyArchive().save(founderId(), { company, documents, brief, voice });
    lastError = null;
  } catch (err) {
    lastError = `The Brief was kept for this session but not saved: ${err instanceof Error ? err.message : String(err)}`;
  }
  return lastError;
}
