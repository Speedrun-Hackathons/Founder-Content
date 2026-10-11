import { adVariantAnalytics } from "@/lib/analytics/ad-variants";
import { loadPostAnalytics } from "@/lib/analytics/posting-service";
import { json } from "@/lib/http";
import { adAnalytics, timeSaved } from "@/lib/store";

export async function GET() {
  const posts = await loadPostAnalytics();
  return json({ ...posts, ads: adAnalytics(), adVariants: adVariantAnalytics(), timeSaved: timeSaved() });
}
