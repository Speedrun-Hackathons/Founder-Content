import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const MEDIA_ROUTE = "/api/ads/media";

const MEDIA_NAME = /^[a-zA-Z0-9_-]+\.png$/;

export interface ImageStore {
  save(bytes: Uint8Array<ArrayBuffer>, baseUrl: string): Promise<string>;
  read(file: string): Promise<Uint8Array<ArrayBuffer> | null>;
}

export function isMediaName(file: string): boolean {
  return MEDIA_NAME.test(file);
}

export function mediaDir(): string {
  return process.env.MEDIA_DIR || path.join(os.tmpdir(), "founder-content-media");
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL || process.env.AUTH_URL;
  if (configured) return trimSlash(configured);
  const host = req.headers.get("x-forwarded-host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || "https";
    return `${proto}://${host.split(",")[0].trim()}`;
  }
  return new URL(req.url).origin;
}

export const fileImageStore: ImageStore = {
  async save(bytes, baseUrl) {
    const file = `${randomBytes(16).toString("hex")}.png`;
    const dir = mediaDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, file), bytes);
    return `${trimSlash(baseUrl)}${MEDIA_ROUTE}/${file}`;
  },

  async read(file) {
    if (!isMediaName(file)) return null;
    try {
      return new Uint8Array(await readFile(path.join(mediaDir(), file)));
    } catch {
      return null;
    }
  },
};

let current: ImageStore = fileImageStore;

export function imageStore(): ImageStore {
  return current;
}

export function setImageStore(store: ImageStore): void {
  current = store;
}

export function resetImageStore(): void {
  current = fileImageStore;
}
