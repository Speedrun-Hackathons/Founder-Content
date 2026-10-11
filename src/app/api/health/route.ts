import { json } from "@/lib/http";

export function GET() {
  return json({
    ok: true,
    build: process.env.RAILWAY_GIT_COMMIT_SHA ?? "local",
    time: new Date().toISOString(),
  });
}
