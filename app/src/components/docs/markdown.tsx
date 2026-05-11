/**
 * Tiny markdown renderer for the docs feature.
 *
 * Deliberately scoped to the subset our doc bodies actually use:
 *   - # / ## / ### headings (## gets an `id` for anchor linking)
 *   - paragraphs
 *   - unordered + ordered lists (single-level — that's all we use)
 *   - fenced code blocks (```lang ... ```)
 *   - inline `code`, **bold**, [text](url) links
 *
 * Everything is rendered with the existing Tailwind tokens (var(--text-*),
 * var(--border-subtle), etc.) so it matches the rest of the app without an
 * extra typography plugin or dependency.
 */
import React from "react";
import { extractHeadings } from "@/lib/docs/content";

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; id: string; text: string }
  | { kind: "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; lang: string; body: string };

function parse(body: string): Block[] {
  // Pre-compute the same heading slugs the TOC uses so anchors line up.
  const headings = extractHeadings(body);
  const headingIds = new Map<string, string>();
  for (const h of headings) headingIds.set(h.text, h.id);

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      i++;
      const buf: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      // Skip closing fence.
      if (i < lines.length) i++;
      blocks.push({ kind: "code", lang, body: buf.join("\n") });
      continue;
    }

    // Headings.
    if (line.startsWith("# ")) {
      blocks.push({ kind: "h1", text: line.slice(2).trim() });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      blocks.push({
        kind: "h2",
        id: headingIds.get(text) ?? "",
        text,
      });
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ kind: "h3", text: line.slice(4).trim() });
      i++;
      continue;
    }

    // Unordered list — collect contiguous "- " or "* " lines.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list — collect contiguous "1. " etc.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Blank line — paragraph separator.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Otherwise: a paragraph. Collect until blank, heading, list, or code.
    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      if (next.trim() === "") break;
      if (/^#{1,3}\s+/.test(next)) break;
      if (next.startsWith("```")) break;
      if (/^\s*[-*]\s+/.test(next)) break;
      if (/^\s*\d+\.\s+/.test(next)) break;
      buf.push(next);
      i++;
    }
    blocks.push({ kind: "p", text: buf.join(" ") });
  }

  return blocks;
}

/**
 * Inline formatting: **bold**, `code`, [text](url). Order matters — we
 * tokenize linearly to avoid re-applying replacements onto already-styled
 * spans.
 */
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Combined regex: code | link | bold. Each branch captures its content.
  const re = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(
        <code
          key={key++}
          className="rounded-[5px] border border-subtle bg-surface-muted px-1 py-px font-mono text-[12.5px] text-primary"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        parts.push(
          <a
            key={key++}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="text-accent underline-offset-2 hover:underline"
          >
            {label}
          </a>,
        );
      } else {
        parts.push(token);
      }
    } else if (token.startsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-primary">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length ? parts : text;
}

export function Markdown({ body }: { body: string }) {
  const blocks = parse(body);

  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        if (b.kind === "h1") {
          return (
            <h1
              key={i}
              className="text-[26px] font-bold leading-tight tracking-tight text-primary"
            >
              {renderInline(b.text)}
            </h1>
          );
        }
        if (b.kind === "h2") {
          return (
            <h2
              key={i}
              id={b.id || undefined}
              className="scroll-mt-24 pt-2 text-[18px] font-semibold text-primary"
            >
              {renderInline(b.text)}
            </h2>
          );
        }
        if (b.kind === "h3") {
          return (
            <h3
              key={i}
              className="text-[15px] font-semibold text-primary"
            >
              {renderInline(b.text)}
            </h3>
          );
        }
        if (b.kind === "p") {
          return (
            <p
              key={i}
              className="text-[14px] leading-relaxed text-secondary"
            >
              {renderInline(b.text)}
            </p>
          );
        }
        if (b.kind === "ul") {
          return (
            <ul
              key={i}
              className="ml-5 list-disc space-y-1.5 text-[14px] leading-relaxed text-secondary marker:text-muted"
            >
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        if (b.kind === "ol") {
          return (
            <ol
              key={i}
              className="ml-5 list-decimal space-y-1.5 text-[14px] leading-relaxed text-secondary marker:text-muted"
            >
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ol>
          );
        }
        if (b.kind === "code") {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg border border-subtle bg-surface-muted px-3 py-2.5 text-[12.5px] leading-relaxed scroll-thin"
            >
              <code className="font-mono text-primary">{b.body}</code>
            </pre>
          );
        }
        return null;
      })}
    </div>
  );
}
