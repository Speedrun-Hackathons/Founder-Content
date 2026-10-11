import type { Platform } from "@/lib/model";
import { resetAdsAI, setAdsAI, type AdsAI, type ImageRequest, type TextRequest, type VariantPair } from "./ai";
import { resetFailures } from "./generate";
import { resetImageStore, setImageStore, type ImageStore } from "./media";

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function defaultPair(request: TextRequest): VariantPair {
  const draft = (label: string, angle: string, text: string) => ({
    angle,
    text,
    imagePrompts: Array.from({ length: request.rule.images }, (_, i) => `${request.platform} ${label} image ${i + 1}`),
  });
  return {
    A: draft("A", "Time saved", `${request.company.name} gives founders their week back. See how in 60 seconds.`),
    B: draft("B", "Social proof", `Founders like you stopped writing posts by hand. Try ${request.company.name} today.`),
  };
}

export class FakeAdsAI implements AdsAI {
  textCalls: TextRequest[] = [];
  imageCalls: ImageRequest[] = [];
  scripted = new Map<Platform, VariantPair[]>();
  textErrors = new Map<Platform, string>();
  imageErrors: { match: string; error: string }[] = [];

  script(platform: Platform, ...pairs: VariantPair[]): this {
    this.scripted.set(platform, pairs);
    return this;
  }

  async writeVariants(request: TextRequest): Promise<VariantPair> {
    this.textCalls.push(request);
    const error = this.textErrors.get(request.platform);
    if (error) throw new Error(error);
    const next = this.scripted.get(request.platform)?.shift();
    return next ?? defaultPair(request);
  }

  async makeImage(request: ImageRequest): Promise<Uint8Array<ArrayBuffer>> {
    this.imageCalls.push(request);
    const failure = this.imageErrors.find((f) => request.prompt.includes(f.match));
    if (failure) throw new Error(failure.error);
    return PNG;
  }

  callsFor(platform: Platform): TextRequest[] {
    return this.textCalls.filter((c) => c.platform === platform);
  }
}

export class FakeImageStore implements ImageStore {
  files = new Map<string, Uint8Array<ArrayBuffer>>();

  async save(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const file = `fake_${this.files.size + 1}.png`;
    this.files.set(file, bytes);
    return `https://media.test/api/ads/media/${file}`;
  }

  async read(file: string): Promise<Uint8Array<ArrayBuffer> | null> {
    return this.files.get(file) ?? null;
  }
}

export function installFakeAds(): { ai: FakeAdsAI; images: FakeImageStore } {
  const ai = new FakeAdsAI();
  const images = new FakeImageStore();
  setAdsAI(ai);
  setImageStore(images);
  resetFailures();
  return { ai, images };
}

export function resetAds(): void {
  resetAdsAI();
  resetImageStore();
  resetFailures();
}
