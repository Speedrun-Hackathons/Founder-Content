import { type Platform, type VariantLabel } from "@/lib/model";
import { getState } from "@/lib/store";

export type AdVariantAnalytics = {
  adId: string;
  variantId: string;
  platform: Platform;
  label: VariantLabel;
  impressions: number;
  clicks: number;
  clickRate: number;
  standIn: true;
};

// FNV-1a: a small string hash, so the same variant always gets the same numbers.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Stand-in numbers until a real source exists. They come from the variant id alone, so they
// never change between reads.
export function adVariantAnalytics(): AdVariantAnalytics[] {
  const rows: AdVariantAnalytics[] = [];
  for (const ad of getState().ads) {
    for (const variant of ad.variants) {
      const impressions = 400 + (hash(variant.id) % 1601);
      const basisPoints = 100 + (hash(`${variant.id}:clicks`) % 501);
      const clicks = Math.max(1, Math.round((impressions * basisPoints) / 10000));
      rows.push({
        adId: ad.id,
        variantId: variant.id,
        platform: ad.platform,
        label: variant.label,
        impressions,
        clicks,
        clickRate: Math.round((clicks / impressions) * 10000) / 10000,
        standIn: true,
      });
    }
  }
  return rows;
}
