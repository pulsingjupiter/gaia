"use client";
/**
 * FileIcon — pick a Lucide glyph and tint based on a file's preview_kind/ext.
 */
import {
  FileText,
  FileJson,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  FileCode,
} from "lucide-react";
import type { FileEntry } from "@/lib/hooks/use-shared-files";

type Tint = { bg: string; fg: string };

const TINTS: Record<string, Tint> = {
  text: { bg: "#EEF2FF", fg: "#5B5BD6" },
  markdown: { bg: "#F0F9FF", fg: "#0EA5E9" },
  json: { bg: "#FEF3C7", fg: "#B45309" },
  csv: { bg: "#DCFCE7", fg: "#15803D" },
  image: { bg: "#FCE7F3", fg: "#BE185D" },
  code: { bg: "#F3F4F6", fg: "#374151" },
  binary: { bg: "#F3F4F6", fg: "#6B7280" },
};

function pick(file: FileEntry) {
  if (file.preview_kind === "markdown")
    return { Glyph: FileText, tint: TINTS.markdown };
  if (file.ext === "json") return { Glyph: FileJson, tint: TINTS.json };
  if (file.ext === "csv" || file.ext === "tsv")
    return { Glyph: FileSpreadsheet, tint: TINTS.csv };
  if (file.preview_kind === "image")
    return { Glyph: FileImage, tint: TINTS.image };
  if (
    file.ext === "js" ||
    file.ext === "ts" ||
    file.ext === "html" ||
    file.ext === "xml"
  )
    return { Glyph: FileCode, tint: TINTS.code };
  if (file.preview_kind === "text")
    return { Glyph: FileText, tint: TINTS.text };
  return { Glyph: FileArchive, tint: TINTS.binary };
}

export function FileIcon({ file, size = 18 }: { file: FileEntry; size?: number }) {
  const { Glyph, tint } = pick(file);
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg"
      style={{
        background: tint.bg,
        color: tint.fg,
        width: Math.round(size * 2),
        height: Math.round(size * 2),
      }}
    >
      <Glyph size={size} />
    </span>
  );
}
