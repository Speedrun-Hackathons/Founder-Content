// A small Markdown preview for blog posts: headings, paragraphs, lists, quotes, bold, italic, code
// and links. It builds React elements, so nothing in the text is ever injected as HTML.

import { Fragment, type ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (match.index > last) out.push(text.slice(last, match.index));
    const k = `${key}-${index++}`;
    if (token.startsWith("**")) out.push(<strong key={k}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) out.push(<code key={k} className="rounded bg-zinc-100 px-1 text-[0.9em]">{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      out.push(
        /^https?:\/\//.test(href ?? "") ? (
          <a key={k} href={href} target="_blank" rel="noreferrer" className="text-brand-700 underline">
            {label}
          </a>
        ) : (
          label
        ),
      );
    } else out.push(<em key={k}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const cls = level <= 2 ? "mt-6 text-xl font-semibold" : "mt-5 text-lg font-semibold";
      blocks.push(level <= 2 ? <h2 key={key} className={cls}>{inline(heading[2], key)}</h2> : <h3 key={key} className={cls}>{inline(heading[2], key)}</h3>);
      i++;
      continue;
    }
    const ordered = /^\s*\d+[.)]\s+/;
    const bullet = /^\s*[-*+]\s+/;
    if (ordered.test(line) || bullet.test(line)) {
      const isOrdered = ordered.test(line);
      const marker = isOrdered ? ordered : bullet;
      const items: ReactNode[] = [];
      while (i < lines.length && marker.test(lines[i])) {
        items.push(<li key={`${key}-${i}`}>{inline(lines[i].replace(marker, ""), `${key}-${i}`)}</li>);
        i++;
      }
      blocks.push(
        isOrdered ? (
          <ol key={key} className="mt-3 list-decimal space-y-1 pl-6">
            {items}
          </ol>
        ) : (
          <ul key={key} className="mt-3 list-disc space-y-1 pl-6">
            {items}
          </ul>
        ),
      );
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(
        <blockquote key={key} className="mt-3 border-l-4 border-zinc-200 pl-4 italic text-zinc-600">
          {inline(quote.join(" "), key)}
        </blockquote>,
      );
      continue;
    }
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) paragraph.push(lines[i++]);
    blocks.push(
      <p key={key} className="mt-3 leading-relaxed">
        {paragraph.map((text, n) => (
          <Fragment key={n}>
            {n > 0 && " "}
            {inline(text, `${key}-${n}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="text-[15px] text-zinc-800">{blocks}</div>;
}
