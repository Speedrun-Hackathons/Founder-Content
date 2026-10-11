"use client";

import { Banner, Card, PageHeader, platformName } from "@/app/(panel)/ads/_components/ui";
import { api } from "@/lib/client";
import { PLATFORMS, type Platform } from "@/lib/model";
import type { Preset, Webhook } from "@/lib/social/client";
import { useCallback, useEffect, useState } from "react";

type Flash = { tone: "error" | "notice" | "warning"; text: string } | null;

function parseJson(text: string): Record<string, unknown> {
  const value = JSON.parse(text || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Settings must be a JSON object, such as {}.");
  return value;
}

export default function SettingsPage() {
  const [flash, setFlash] = useState<Flash>(null);
  const report = useCallback((e: unknown) => setFlash({ tone: "error", text: e instanceof Error ? e.message : String(e) }), []);

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Saved options in Social Streamline: caption styles, platform presets, posting defaults and webhooks." />
      {flash && <Banner tone={flash.tone}>{flash.text}</Banner>}
      <Presets kind="caption" onError={report} onFlash={setFlash} />
      <Presets kind="platform" onError={report} onFlash={setFlash} />
      <PostingDefaults onError={report} onFlash={setFlash} />
      <Webhooks onError={report} onFlash={setFlash} />
    </div>
  );
}

type SectionProps = { onError: (e: unknown) => void; onFlash: (f: Flash) => void };

function Presets({ kind, onError, onFlash }: SectionProps & { kind: "caption" | "platform" }) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editing, setEditing] = useState<{ id: string | null; name: string; platform: Platform; settings: string } | null>(null);
  const query = kind === "caption" ? "?kind=caption" : "";

  const load = useCallback(() => {
    api<{ presets: Preset[] }>(`/api/social/presets${query}`)
      .then((r) => setPresets(r.presets))
      .catch(onError);
  }, [query, onError]);

  useEffect(load, [load]);

  async function save() {
    if (!editing) return;
    try {
      const settings = parseJson(editing.settings);
      if (editing.id) {
        await api(`/api/social/presets/${editing.id}${query}`, { method: "PATCH", body: JSON.stringify({ name: editing.name, settings }) });
      } else {
        await api("/api/social/presets", {
          method: "POST",
          body: JSON.stringify({ kind: kind === "caption" ? "caption" : undefined, name: editing.name, platform: editing.platform, settings }),
        });
      }
      setEditing(null);
      onFlash({ tone: "notice", text: `Saved "${editing.name}".` });
      load();
    } catch (e) {
      onError(e);
    }
  }

  async function remove(preset: Preset) {
    if (!window.confirm(`Delete "${preset.name}"?`)) return;
    try {
      await api(`/api/social/presets/${preset.id}${query}`, { method: "DELETE" });
      load();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{kind === "caption" ? "Caption styles" : "Platform presets"}</h2>
          <p className="text-sm text-zinc-500">
            {kind === "caption" ? "Burned-in caption looks a render can start from." : "Saved posting options for one platform."}
          </p>
        </div>
        <button onClick={() => setEditing({ id: null, name: "", platform: "youtube", settings: "{}" })} className="rounded-md border border-zinc-300 px-3 py-1 text-sm">
          Add
        </button>
      </div>
      {presets.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">None saved.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="font-medium">{p.name}</span>
              {p.platform && <span className="text-zinc-500">{platformName(p.platform)}</span>}
              <span className="truncate text-xs text-zinc-400">{Object.keys(p.settings).length} settings</span>
              <button
                onClick={() => setEditing({ id: p.id, name: p.name, platform: p.platform ?? "youtube", settings: JSON.stringify(p.settings, null, 2) })}
                className="ml-auto text-xs underline"
              >
                Edit
              </button>
              <button onClick={() => remove(p)} className="text-xs text-red-700 underline">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <div className="mt-4 rounded-lg border border-zinc-200 p-3">
          <div className="flex gap-2">
            <input
              placeholder="Name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="flex-1 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
            />
            {kind === "platform" && !editing.id && (
              <select
                value={editing.platform}
                onChange={(e) => setEditing({ ...editing, platform: e.target.value as Platform })}
                className="rounded-md border border-zinc-300 px-2 text-sm"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {platformName(p)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <textarea
            value={editing.settings}
            onChange={(e) => setEditing({ ...editing, settings: e.target.value })}
            spellCheck={false}
            className="mt-2 h-40 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={save} disabled={!editing.name.trim()} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              Save
            </button>
            <button onClick={() => setEditing(null)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function PostingDefaults({ onError, onFlash }: SectionProps) {
  const [keys, setKeys] = useState<string[]>([]);
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [key, setKey] = useState("short");
  const [text, setText] = useState("");

  useEffect(() => {
    api<{ keys: string[]; defaults: Record<string, unknown> }>("/api/social/posting-defaults")
      .then((r) => {
        setKeys(r.keys);
        setDefaults(r.defaults);
        setText(JSON.stringify(r.defaults.short ?? {}, null, 2));
      })
      .catch(onError);
  }, [onError]);

  function pick(next: string) {
    setKey(next);
    setText(JSON.stringify(defaults[next] ?? {}, null, 2));
  }

  async function save() {
    try {
      const value = parseJson(text);
      await api("/api/social/posting-defaults", { method: "PUT", body: JSON.stringify({ key, value }) });
      setDefaults((d) => ({ ...d, [key]: value }));
      onFlash({ tone: "notice", text: `Saved the ${key} defaults.` });
    } catch (e) {
      onError(e);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="text-lg font-semibold">Posting defaults</h2>
      <p className="text-sm text-zinc-500">What each posting flow in Social Streamline starts from. A flow that was never used has none.</p>
      <div className="mt-3 flex gap-1 rounded-md bg-zinc-100 p-1 text-sm">
        {keys.map((k) => (
          <button key={k} onClick={() => pick(k)} className={`rounded px-3 py-1 ${k === key ? "bg-white font-medium shadow-sm" : "text-zinc-600"}`}>
            {k}
            {!(k in defaults) && <span className="ml-1 text-xs text-zinc-400">(unused)</span>}
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="mt-3 h-64 w-full rounded-md border border-zinc-300 px-3 py-2 font-mono text-xs" />
      <button onClick={save} className="mt-2 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
        Save {key} defaults
      </button>
    </Card>
  );
}

function Webhooks({ onError, onFlash }: SectionProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [chosen, setChosen] = useState<string[]>(["post.published", "post.failed"]);
  const [description, setDescription] = useState("");
  const [deliveries, setDeliveries] = useState<{ id: string; rows: Record<string, unknown>[] } | null>(null);

  const load = useCallback(() => {
    api<{ webhooks: Webhook[]; events: string[] }>("/api/social/webhooks")
      .then((r) => {
        setWebhooks(r.webhooks);
        setEvents(r.events);
      })
      .catch(onError);
  }, [onError]);

  useEffect(load, [load]);

  async function create() {
    try {
      const r = await api<{ webhook: Webhook & { secret: string | null } }>("/api/social/webhooks", {
        method: "POST",
        body: JSON.stringify({ url, events: chosen, description }),
      });
      onFlash({
        tone: "warning",
        text: r.webhook.secret
          ? `Webhook added. Its signing secret is ${r.webhook.secret}. Copy it now; Social Streamline never shows it again.`
          : "Webhook added.",
      });
      setUrl("");
      setDescription("");
      load();
    } catch (e) {
      onError(e);
    }
  }

  async function act(webhook: Webhook, action: "toggle" | "test" | "delete" | "deliveries") {
    try {
      if (action === "toggle") await api(`/api/social/webhooks/${webhook.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !webhook.enabled }) });
      if (action === "test") {
        await api(`/api/social/webhooks/${webhook.id}/test`, { method: "POST" });
        onFlash({ tone: "notice", text: `Sent a test post.published event to ${webhook.url}.` });
      }
      if (action === "delete") {
        if (!window.confirm(`Delete the webhook to ${webhook.url}? Its delivery history goes too.`)) return;
        await api(`/api/social/webhooks/${webhook.id}`, { method: "DELETE" });
      }
      if (action === "deliveries") {
        const r = await api<{ deliveries: Record<string, unknown>[] }>(`/api/social/webhooks/${webhook.id}`);
        setDeliveries({ id: webhook.id, rows: r.deliveries });
        return;
      }
      load();
    } catch (e) {
      onError(e);
    }
  }

  return (
    <Card className="mt-6 p-5">
      <h2 className="text-lg font-semibold">Webhooks</h2>
      <p className="text-sm text-zinc-500">Social Streamline calls these URLs when posts publish or fail and when renders finish.</p>
      {webhooks.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">None registered.</p>
      ) : (
        <ul className="mt-3 divide-y divide-zinc-100">
          {webhooks.map((w) => (
            <li key={w.id} className="py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${w.enabled ? "bg-emerald-500" : "bg-zinc-300"}`} />
                <span className="break-all font-medium">{w.url}</span>
                <span className="text-xs text-zinc-500">{w.events.join(", ")}</span>
                {w.failureCount ? <span className="text-xs text-amber-700">{w.failureCount} failures</span> : null}
                <span className="ml-auto flex gap-2 text-xs">
                  <button onClick={() => act(w, "test")} className="underline">
                    Test
                  </button>
                  <button onClick={() => act(w, "deliveries")} className="underline">
                    Deliveries
                  </button>
                  <button onClick={() => act(w, "toggle")} className="underline">
                    {w.enabled ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => act(w, "delete")} className="text-red-700 underline">
                    Delete
                  </button>
                </span>
              </div>
              {deliveries?.id === w.id && (
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-zinc-50 p-2 text-[11px]">{JSON.stringify(deliveries.rows, null, 2)}</pre>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 rounded-lg border border-zinc-200 p-3">
        <input placeholder="https://your-endpoint.example/hooks" value={url} onChange={(e) => setUrl(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm" />
        <input
          placeholder="Label (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-2 w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {events.map((event) => (
            <label key={event} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={chosen.includes(event)}
                onChange={() => setChosen((c) => (c.includes(event) ? c.filter((x) => x !== event) : [...c, event]))}
              />
              {event === "*" ? "Everything" : event}
            </label>
          ))}
        </div>
        <button onClick={create} disabled={!url.startsWith("https://") || chosen.length === 0} className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          Add webhook
        </button>
      </div>
    </Card>
  );
}
