import { auth, googleConfigured, signIn } from "@/auth";
import { redirect } from "next/navigation";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Founder Content</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Paste a company URL, approve the Brief, and get posts and ads generated, tested and scheduled.
        </p>
        {googleConfigured ? (
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Sign in with Google
            </button>
          </form>
        ) : (
          <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Google sign-in is not configured on this server: AUTH_GOOGLE_ID or AUTH_GOOGLE_SECRET is empty.
          </p>
        )}
      </div>
    </main>
  );
}
