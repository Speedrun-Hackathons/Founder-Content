// Reads the Company's public page as plain text for the Brief. Runs on the server, so it refuses
// addresses inside a private network and follows at most a few redirects, checking each hop.

export type SitePage = { url: string; title: string; description: string; text: string };

export interface SiteReader {
  read(url: string): Promise<SitePage>;
}

const MAX_TEXT = 12_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 15_000;

export function privateHostReason(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return `${url.hostname} is a local address`;
  }
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
      return `${url.hostname} is a private network address`;
    }
  }
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return `${url.hostname} is a private network address`;
  }
  return null;
}

export function htmlToPage(url: string, html: string): SitePage {
  const pick = (re: RegExp) => decode(html.match(re)?.[1] ?? "").trim();
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  const text = decode(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe|title)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/?(p|div|section|article|header|footer|li|ul|ol|h[1-6]|br|tr|td|main|nav)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT);
  return { url, title, description, text };
}

function decode(text: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return named[code.toLowerCase()] ?? whole;
  });
}

export function createSiteReader(doFetch: typeof fetch = fetch): SiteReader {
  return {
    async read(start) {
      let url = new URL(start);
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const blocked = privateHostReason(url);
        if (blocked) throw new Error(`The site cannot be read: ${blocked}.`);
        let response: Response;
        try {
          response = await doFetch(url.toString(), {
            redirect: "manual",
            headers: { "User-Agent": "FounderContentBot/1.0 (+brief builder)", Accept: "text/html,text/plain;q=0.9" },
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
        } catch (error) {
          throw new Error(`${url.hostname} could not be reached: ${error instanceof Error ? error.message : String(error)}`);
        }
        const location = response.headers.get("location");
        if (response.status >= 300 && response.status < 400 && location) {
          url = new URL(location, url);
          continue;
        }
        if (!response.ok) throw new Error(`${url.toString()} answered ${response.status} ${response.statusText}`.trim() + ".");
        const type = response.headers.get("content-type") ?? "";
        if (type && !/text\/html|text\/plain|application\/xhtml/i.test(type)) {
          throw new Error(`${url.toString()} is not a web page (${type.split(";")[0]}).`);
        }
        const page = htmlToPage(url.toString(), await response.text());
        if (!page.text && !page.description) throw new Error(`${url.toString()} has no readable text; add a Document instead.`);
        return page;
      }
      throw new Error(`${start} redirected more than ${MAX_REDIRECTS} times.`);
    },
  };
}

let current: SiteReader = createSiteReader();

export function siteReader(): SiteReader {
  return current;
}

export function setSiteReader(reader: SiteReader): void {
  current = reader;
}

export function resetSiteReader(): void {
  current = createSiteReader();
}
