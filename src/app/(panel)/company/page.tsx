"use client";

import { api } from "@/lib/client";
import type { Brief, Company, Voice } from "@/lib/model";
import { useEffect, useState } from "react";

type CompanyState = { company: Company | null; brief: Brief | null; voice: Voice | null };

export default function CompanyPage() {
  const [url, setUrl] = useState("");
  const [docName, setDocName] = useState("");
  const [docText, setDocText] = useState("");
  const [state, setState] = useState<CompanyState>({ company: null, brief: null, voice: null });
  const [briefText, setBriefText] = useState("");
  const [tone, setTone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api<CompanyState>("/api/company")
      .then((s) => {
        setState(s);
        setBriefText(s.brief?.text ?? "");
        setTone(s.voice?.tone ?? "");
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  async function submitCompany() {
    setBusy(true);
    setError("");
    try {
      const documents = docText.trim() ? [{ filename: docName || "notes.txt", text: docText }] : [];
      await api("/api/company", { method: "POST", body: JSON.stringify({ url, documents }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveBrief(approved: boolean) {
    setBusy(true);
    setError("");
    try {
      await api("/api/brief", { method: "PUT", body: JSON.stringify({ text: briefText, approved, voice: { tone } }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Company</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <label className="block text-sm font-medium">Company URL</label>
        <input
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <label className="mt-4 block text-sm font-medium">Document (optional)</label>
        <input
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="filename, such as deck.txt"
          value={docName}
          onChange={(e) => setDocName(e.target.value)}
        />
        <textarea
          className="mt-2 h-28 w-full rounded-md border border-zinc-300 px-3 py-2"
          placeholder="Paste the text of a deck or product sheet"
          value={docText}
          onChange={(e) => setDocText(e.target.value)}
        />
        <button
          disabled={busy || !url}
          onClick={submitCompany}
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Build the Brief
        </button>
      </section>
      {state.brief && (
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Brief for {state.company?.name}</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs ${state.brief.approved ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}
            >
              {state.brief.approved ? "approved" : "not approved"}
            </span>
          </div>
          <textarea
            className="mt-3 h-32 w-full rounded-md border border-zinc-300 px-3 py-2"
            value={briefText}
            onChange={(e) => setBriefText(e.target.value)}
          />
          <label className="mt-4 block text-sm font-medium">Voice: tone</label>
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          />
          {state.voice && (
            <p className="mt-2 text-xs text-zinc-500">
              Rules: {state.voice.rules.join(" ")} Banned words: {state.voice.bannedWords.join(", ")}
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <button
              disabled={busy}
              onClick={() => saveBrief(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50"
            >
              Save
            </button>
            <button
              disabled={busy}
              onClick={() => saveBrief(true)}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Approve the Brief
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
