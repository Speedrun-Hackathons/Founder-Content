import { NextResponse } from "next/server";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: code, message }, { status });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("bad_body", "The request body must be a JSON object.", 400);
    }
    return body as Record<string, unknown>;
  } catch {
    return fail("bad_json", "The request body is not valid JSON.", 400);
  }
}

export function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}
