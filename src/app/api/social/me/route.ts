import { respond } from "@/lib/social";

/** The connected posting-service workspace and its credit balance, for the sidebar and before billed work. */
export async function GET() {
  return respond(async (ss) => {
    const [me, credits] = await Promise.all([ss.me(), ss.credits()]);
    return { email: me.email, role: me.role, credits };
  });
}
