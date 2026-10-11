"use client";

import { api } from "@/lib/client";
import type { Post } from "@/lib/model";
import { useEffect, useState } from "react";

function tomorrow(): string {
  return new Date(Date.now() + 24 * 3600 * 1000).toISOString();
}

export default function ContentPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState("");
  const [when, setWhen] = useState("");

  function load() {
    api<{ posts: Post[] }>("/api/posts")
      .then((r) => setPosts(r.posts))
      .catch((e: Error) => setError(e.message));
  }

  useEffect(load, []);

  async function schedule(post: Post) {
    setError("");
    try {
      const scheduledFor = when ? new Date(when).toISOString() : tomorrow();
      await api(`/api/posts/${post.id}/schedule`, { method: "POST", body: JSON.stringify({ scheduledFor }) });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function publish(post: Post) {
    setError("");
    try {
      await api(`/api/posts/${post.id}/publish`, { method: "POST" });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Content</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex items-center gap-3 text-sm">
        <label>Send time for scheduling</label>
        <input
          type="datetime-local"
          className="rounded-md border border-zinc-300 px-2 py-1"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
        <span className="text-zinc-500">empty means 24 hours from now</span>
      </div>
      {posts.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600">No drafts yet. Make one from a Variant on the Ads page.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-1">Post</th>
              <th>Platform</th>
              <th>Status</th>
              <th>Send time</th>
              <th>Provider id</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-t border-zinc-200">
                <td className="py-2 font-mono">{post.id}</td>
                <td>{post.platform}</td>
                <td>
                  {post.status}
                  {post.error && <span className="ml-2 text-red-700">{post.error}</span>}
                </td>
                <td>{post.scheduledFor ? new Date(post.scheduledFor).toLocaleString() : "-"}</td>
                <td className="font-mono text-xs">{post.providerPostId ?? "-"}</td>
                <td className="flex gap-2 py-2">
                  <button onClick={() => schedule(post)} className="rounded-md border border-zinc-300 px-3 py-1 text-xs">
                    Schedule
                  </button>
                  <button onClick={() => publish(post)} className="rounded-md bg-zinc-900 px-3 py-1 text-xs text-white">
                    Publish now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
