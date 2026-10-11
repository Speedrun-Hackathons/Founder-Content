import type { MediaKind, Platform } from "@/lib/model";

export const IMAGE_SIZES = ["1024x1024", "1024x1536", "1536x1024"] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export type PlatformRule = {
  name: string;
  maxChars: number;
  mediaKind: MediaKind;
  images: number;
  imageSize: ImageSize | null;
  tone: string;
};

export const PLATFORM_RULES: Record<Platform, PlatformRule> = {
  x: {
    name: "X",
    maxChars: 280,
    mediaKind: "image",
    images: 1,
    imageSize: "1536x1024",
    tone: "Punchy and conversational. One sharp line, at most one hashtag.",
  },
  facebook: {
    name: "Facebook",
    maxChars: 2000,
    mediaKind: "image",
    images: 1,
    imageSize: "1024x1024",
    tone: "Friendly and clear. Lead with the benefit in the first line, end with a plain call to action.",
  },
  instagram: {
    name: "Instagram",
    maxChars: 2200,
    mediaKind: "carousel",
    images: 3,
    imageSize: "1024x1024",
    tone: "Visual and warm. A hook line, a short caption that walks through the slides, a few relevant hashtags.",
  },
  linkedin: {
    name: "LinkedIn",
    maxChars: 3000,
    mediaKind: "carousel",
    images: 3,
    imageSize: "1024x1024",
    tone: "Professional and specific. Lead with a problem founders recognise, give one concrete result, no hype.",
  },
  tiktok: {
    name: "TikTok",
    maxChars: 2200,
    mediaKind: "video",
    images: 0,
    imageSize: null,
    tone: "Casual and fast. Speak to camera, hook in the first second.",
  },
  youtube: {
    name: "YouTube",
    maxChars: 5000,
    mediaKind: "video",
    images: 0,
    imageSize: null,
    tone: "Explanatory. A clear title line, then what the viewer will learn.",
  },
  pinterest: {
    name: "Pinterest",
    maxChars: 500,
    mediaKind: "image",
    images: 1,
    imageSize: "1024x1536",
    tone: "Inspirational and searchable. Describe the outcome with keywords people search for.",
  },
  bluesky: {
    name: "Bluesky",
    maxChars: 300,
    mediaKind: "image",
    images: 1,
    imageSize: "1536x1024",
    tone: "Candid and human. Short, no marketing speak, no hashtag stuffing.",
  },
  threads: {
    name: "Threads",
    maxChars: 500,
    mediaKind: "image",
    images: 1,
    imageSize: "1024x1024",
    tone: "Conversational and light. Sounds like a person talking, invites a reply.",
  },
};

export function videoOnlyReason(rule: PlatformRule): string {
  return `${rule.name} takes video only through the posting service; video Ads come from the render flow (#11).`;
}
