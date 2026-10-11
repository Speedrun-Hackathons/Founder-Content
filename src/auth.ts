import { timingSafeEqual } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const credentialsConfigured = Boolean(process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD);

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        const expectedEmail = (process.env.DEMO_EMAIL ?? "").trim().toLowerCase();
        const expectedPassword = process.env.DEMO_PASSWORD ?? "";
        if (!expectedEmail || !expectedPassword) return null;
        if (!same(email, expectedEmail) || !same(password, expectedPassword)) return null;
        return { id: "founder_demo", email, name: email.split("@")[0] };
      },
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/signin" },
});
