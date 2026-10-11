"use client";

import { api } from "@/lib/client";
import type { Brief, Company, Document, Voice } from "@/lib/model";
import { useEffect, useState } from "react";

type Archive = { kind: "postgres" | "memory"; error: string | null };
type Version = { brief: string; voice: Voice | null; approved: boolean; savedAt: string };
type CompanyState = {
  company: Company | null;
  documents: Document[];
  brief: Brief | null;
  voice: Voice | null;
  archive?: Archive;
  history?: Version[];
};
type NewDocument = { filename: string; text: string };

const TEXT_FILE = /\.(txt|md|markdown|csv|json|html?)$/i;

export default function CompanyPage() {
  const [url, setUrl] = useState("");
  const [documents, setDocuments] = useState<NewDocument[]>([]);
  const [pasteName, setPasteName] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [state, setState] = useState<CompanyState>({ company: null, documents: [], brief: null, voice: null });
  const [briefText, setBriefText] = useState("");
  const [tone, setTone] = useState("");
  const [rules, setRules] = useState("");
  const [banned, setBanned] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "building" | "saving">("");

  function load() {
    api<CompanyState>("/api/company")
      .then((s) => {
        setState(s);
        if (s.company) setUrl((current) => current || s.company!.url);
        setBriefText(s.brief?.text ?? "");
        setTone(s.voice?.tone ?? "");
        setRules(s.voice?.rules.join("\n") ?? "");
        setBanned(s.voice?.bannedWords.join(", ") ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  /** Puts a saved version into the editor; it is kept only once saved again. */
  function restore(version: Version) {
    setBriefText(version.brief);
    if (version.voice) {
      setTone(version.voice.tone);
      setRules(version.voice.rules.join("\n"));
      setBanned(version.voice.bannedWords.join(", "));
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setError("");
    const added: NewDocument[] = [];
    const refused: string[] = [];
    for (const file of Array.from(files)) {
      if (!TEXT_FILE.test(file.name)) refused.push(file.name);
      else added.push({ filename: file.name, text: await file.text() });
    }
    setDocuments((current) => [...current, ...added]);
    if (refused.length) {
      setError(`${refused.join(", ")}: only text files (.txt, .md, .csv, .json, .html) can be read. Paste the text of a PDF or slide deck below.`);
    }
  }

  function addPasted() {
    if (!pasteText.trim()) return;
    setDocuments((current) => [...current, { filename: pasteName.trim() || `notes-${current.length + 1}.txt`, text: pasteText }]);
    setPasteName("");
    setPasteText("");
  }

  async function build() {
    setBusy("building");
    setError("");
    try {
      await api("/api/company", { method: "POST", body: JSON.stringify({ url, documents }) });
      setDocuments([]);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function saveBrief(approved: boolean) {
    setBusy("saving");
    setError("");
    try {
      const voice = {
        tone,
        rules: rules.split("\n").map((r) => r.trim()).filter(Boolean),
        bannedWords: banned.split(",").map((w) => w.trim()).filter(Boolean),
      };
      await api("/api/brief", { method: "PUT", body: JSON.stringify({ text: briefText, approved, voice }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const input = "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Company</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Paste the Company URL and add Documents. The site reads them and writes a Brief and a Voice; nothing is generated until you approve the Brief.
      </p>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <label htmlFor="company-url" className="block text-sm font-medium">
          Company URL
        </label>
        <input id="company-url" className={input} placeholder="https://example.com" value={url} onChange={(e) => setUrl(e.target.value)} />

        <h2 className="mt-5 text-sm font-medium">Documents (optional)</h2>
        <p className="text-xs text-zinc-500">A deck, a product sheet or notes, so the Brief rests on more than the home page.</p>
        <input
          type="file"
          multiple
          accept=".txt,.md,.markdown,.csv,.json,.html,.htm,text/*"
          className="mt-2 block text-sm"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="mt-3 rounded-md border border-dashed border-zinc-300 p-3">
          <input className={input} placeholder="Name, such as deck.txt" value={pasteName} onChange={(e) => setPasteName(e.target.value)} />
          <textarea
            className={`${input} h-24`}
            placeholder="Or paste the text of a deck, PDF or product sheet"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button onClick={addPasted} disabled={!pasteText.trim()} className="mt-2 rounded-md border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50">
            Add pasted text
          </button>
        </div>
        {documents.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {documents.map((doc, i) => (
              <li key={`${doc.filename}-${i}`} className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-1.5">
                <span>
                  {doc.filename} <span className="text-zinc-500">- {doc.text.length.toLocaleString()} characters</span>
                </span>
                <button onClick={() => setDocuments((current) => current.filter((_, j) => j !== i))} className="text-xs text-zinc-600 underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          disabled={busy !== "" || !url}
          onClick={build}
          className="mt-5 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy === "building" ? "Reading the site and writing the Brief..." : state.brief ? "Rebuild the Brief" : "Build the Brief"}
        </button>
        {state.brief && <p className="mt-2 text-xs text-zinc-500">Rebuilding replaces the Brief and the Voice below and clears the approval.</p>}
      </section>

      {state.brief && (
        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Brief for {state.company?.name}</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs ${state.brief.approved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
            >
              {state.brief.approved ? "approved" : "not approved"}
            </span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            From {state.company?.url}
            {state.documents.length > 0 && ` and ${state.documents.map((d) => d.filename).join(", ")}`}
          </p>
          <textarea className={`${input} mt-3 h-40`} value={briefText} onChange={(e) => setBriefText(e.target.value)} />

          <h3 className="mt-5 text-sm font-semibold">Voice</h3>
          <label htmlFor="voice-tone" className="mt-2 block text-sm font-medium">
            Tone
          </label>
          <input id="voice-tone" className={input} value={tone} onChange={(e) => setTone(e.target.value)} />
          <label htmlFor="voice-rules" className="mt-3 block text-sm font-medium">
            Rules, one per line
          </label>
          <textarea id="voice-rules" className={`${input} h-24`} value={rules} onChange={(e) => setRules(e.target.value)} />
          <label htmlFor="voice-banned" className="mt-3 block text-sm font-medium">
            Banned words, comma separated
          </label>
          <input id="voice-banned" className={input} value={banned} onChange={(e) => setBanned(e.target.value)} />

          <div className="mt-5 flex gap-3">
            <button
              disabled={busy !== ""}
              onClick={() => saveBrief(state.brief!.approved)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Save
            </button>
            <button
              disabled={busy !== ""}
              onClick={() => saveBrief(true)}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {state.brief.approved ? "Save and keep approved" : "Approve the Brief"}
            </button>
          </div>
          {state.archive && (
            <p className={`mt-3 text-xs ${state.archive.error ? "text-amber-700" : "text-zinc-500"}`}>
              {state.archive.error ??
                (state.archive.kind === "postgres"
                  ? "Saved in the database, so it survives restarts and redeploys."
                  : "Kept in memory only: set DATABASE_URL to keep it across restarts.")}
            </p>
          )}
        </section>
      )}

      {state.history && state.history.length > 1 && (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="text-sm font-semibold">Earlier versions</h2>
          <ul className="mt-2 divide-y divide-zinc-100">
            {state.history.map((version, i) => (
              <li key={`${version.savedAt}-${i}`} className="flex items-start gap-3 py-2 text-sm">
                <span className="w-36 shrink-0 text-xs text-zinc-500">
                  {new Date(version.savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {version.approved && <span className="ml-1 text-green-700">approved</span>}
                </span>
                <span className="line-clamp-2 flex-1 text-zinc-700">{version.brief}</span>
                {i > 0 && (
                  <button onClick={() => restore(version)} className="shrink-0 text-xs underline">
                    Restore
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
