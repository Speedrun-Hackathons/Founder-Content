import { auth, credentialsConfigured, signIn } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Founder Content</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Paste a company URL, approve the Brief, and get posts and ads generated, tested and scheduled.
        </p>
        {credentialsConfigured ? (
          <form
            className="mt-6 flex flex-col gap-3"
            action={async (formData: FormData) => {
              "use server";
              try {
                await signIn("credentials", {
                  email: String(formData.get("email") ?? ""),
                  password: String(formData.get("password") ?? ""),
                  redirectTo: "/dashboard",
                });
              } catch (error) {
                if (error instanceof AuthError) redirect("/signin?error=CredentialsSignin");
                throw error;
              }
            }}
          >
            <label className="text-sm font-medium">
              Email
              <input
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal"
              />
            </label>
            <label className="text-sm font-medium">
              Password
              <input
                name="password"
                type="password"
                required
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 font-normal"
              />
            </label>
            {error && (
              <p className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">
                Sign-in failed: the email or password did not match.
              </p>
            )}
            <button
              type="submit"
              className="mt-2 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
            >
              Sign in
            </button>
          </form>
        ) : (
          <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            Sign-in is not configured on this server: DEMO_EMAIL or DEMO_PASSWORD is empty.
          </p>
        )}
      </div>
    </main>
  );
}
