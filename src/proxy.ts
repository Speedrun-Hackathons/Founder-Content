import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const proxy = auth((req) => {
  if (req.auth?.user) return NextResponse.next();
  return NextResponse.json({ error: "unauthorized", message: "Sign in first." }, { status: 401 });
});

export const config = {
  matcher: ["/api/((?!auth|health|ads/media).*)"],
};
