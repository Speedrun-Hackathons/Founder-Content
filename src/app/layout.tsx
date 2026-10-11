import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Founder Content",
  description: "Paste a company URL, get posts and ads generated, tested and scheduled.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">{children}</body>
    </html>
  );
}
