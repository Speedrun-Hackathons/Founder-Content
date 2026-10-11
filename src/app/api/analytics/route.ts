import { json } from "@/lib/http";
import { adAnalytics, postAnalytics, timeSaved } from "@/lib/store";

export function GET() {
  return json({ posts: postAnalytics(), ads: adAnalytics(), timeSaved: timeSaved() });
}
