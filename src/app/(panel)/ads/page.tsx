"use client";

import { api } from "@/lib/client";
import { PLATFORMS, type Ad, type Platform, type Variant } from "@/lib/model";
import { useEffect, useState } from "react";

export default function AdsPage() {
  const [chosen, setChosen] = useState<Platform[]>(["instagram", "facebook", "tiktok"]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api<{ ads: Ad[] }>("/api/ads")
      .then((r) => setAds(r.ads))
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  function toggle(platform: Platform) {
    setChosen((list) => (list.includes(platform) ? list.filter((p) => p !== platform) : [...list, platform]));
  }

  async function generate() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/api/runs", { method: "POST", body: JSON.stringify({ platforms: chosen }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pick(ad: Ad, variant: Variant) {
    setError("");
    try {
      await api(`/api/ads/${ad.id}/winner`, { method: "POST", body: JSON.stringify({ variantId: variant.id }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function draft(variant: Variant) {
    setError("");
    try {
      const r = await api<{ post: { id: string } }>("/api/posts", { method: "POST", body: JSON.stringify({ variantId: variant.id }) });
      setNotice(`Draft ${r.post.id} created for ${variant.platform}. Open Content to schedule or publish it.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Ads</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map((platform) => (
            <label key={platform} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={chosen.includes(platform)} onChange={() => toggle(platform)} />
              {platform}
            </label>
          ))}
        </div>
        <button
          disabled={busy || chosen.length === 0}
          onClick={generate}
          className="mt-4 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Generate two Variants per platform
        </button>
      </section>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {ads.map((ad) => (
          <div key={ad.id} className="rounded-xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{ad.platform}</h2>
              <span className="font-mono text-xs text-zinc-500">{ad.id}</span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {ad.variants.map((variant) => {
                const winner = ad.winnerVariantId === variant.id;
                return (
                  <div
                    key={variant.id}
                    className={`rounded-lg border p-3 ${winner ? "border-green-600 bg-green-50" : "border-zinc-200"}`}
                  >
                    <div className="flex items-center justify-between text-xs text-zinc-500">
                      <span>Variant {variant.label}</span>
                      <span>{variant.mediaKind}</span>
                    </div>
                    <p className="mt-2 text-sm">{variant.text}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => pick(ad, variant)}
                        className="rounded-md border border-zinc-300 px-3 py-1 text-xs"
                      >
                        {winner ? "Winner" : "Pick as Winner"}
                      </button>
                      <button onClick={() => draft(variant)} className="rounded-md bg-zinc-900 px-3 py-1 text-xs text-white">
                        Make a draft
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
