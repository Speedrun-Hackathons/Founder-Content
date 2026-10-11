import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });

export const metadata: Metadata = {
  title: "Founder Content",
  description: "Paste a company URL, get posts and ads generated, tested and scheduled.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${bricolage.variable}`}>
      <body className="flex min-h-full flex-col bg-canvas font-sans text-zinc-900">{children}</body>
    </html>
  );
}
