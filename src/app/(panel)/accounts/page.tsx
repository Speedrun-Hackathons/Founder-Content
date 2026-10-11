"use client";

import { api } from "@/lib/client";
import type { Account, Platform } from "@/lib/model";
import { useEffect, useState } from "react";

type AccountsResponse = { accounts: Account[]; missing: Platform[]; connectUrl: string };

export default function AccountsPage() {
  const [data, setData] = useState<AccountsResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AccountsResponse>("/api/accounts")
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold">Accounts</h1>
      {error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {data && (
        <>
          <table className="mt-6 w-full max-w-2xl text-sm">
            <thead className="text-left text-zinc-500">
              <tr>
                <th className="py-1">Platform</th>
                <th>Handle</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((account) => (
                <tr key={account.id} className="border-t border-zinc-200">
                  <td className="py-2">{account.platform}</td>
                  <td>{account.handle}</td>
                  <td>{account.connected ? "connected" : "disabled"}</td>
                </tr>
              ))}
              {data.missing.map((platform) => (
                <tr key={platform} className="border-t border-zinc-200 text-zinc-500">
                  <td className="py-2">{platform}</td>
                  <td>-</td>
                  <td>
                    not connected,{" "}
                    <a className="underline" href={data.connectUrl} target="_blank" rel="noreferrer">
                      connect in the posting service
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-zinc-500">
            Connecting an account happens in the posting service; this page reads the result.
          </p>
        </>
      )}
    </div>
  );
}
