/**
 * CSV / TSV Parser for DocuMan
 *
 * Supports two modes:
 * 1. **Structured import**: When CSV/TSV headers match known requirement fields
 *    (itemNumber, category, title, content, indentLevel), rows are mapped
 *    directly to requirements — bypassing AI extraction entirely.
 * 2. **Text fallback**: If headers don't match, the CSV/TSV is converted to a
 *    plain text representation and passed through the normal AI extraction
 *    pipeline.
 *
 * Automatically detects whether the file is comma-separated (,), tab-separated (\t),
 * or semicolon-separated (;).
 */

import type { ParsedDocument } from "./index";

// ─── Known column aliases (case-insensitive) ─────────────

const COLUMN_ALIASES: Record<string, string[]> = {
  itemNumber: ["itemnumber", "item_number", "item number", "item", "section", "id", "number", "no", "req_id", "requirement_id", "req id"],
  category:   ["category", "type", "kind", "classification", "cat"],
  title:      ["title", "heading", "name", "subject", "summary"],
  content:    ["content", "text", "description", "body", "requirement", "detail", "details", "statement", "req_text", "requirement_text"],
  indentLevel:["indentlevel", "indent_level", "indent level", "indent", "level", "depth"],
};

function resolveColumnName(header: string): string | null {
  const normalised = header.trim().toLowerCase();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalised)) return field;
  }
  return null;
}

// ─── Automatic Delimiter Detection ───────────────────────

/**
 * Detects whether text uses comma (,), tab (\t), or semicolon (;) delimiters.
 */
export function detectDelimiter(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const sampleLines = lines.filter((l) => l.trim().length > 0).slice(0, 15);
  if (sampleLines.length === 0) return ",";

  const candidateDelimiters = [",", "\t", ";"];
  let bestDelimiter = ",";
  let maxScore = -1;

  for (const delim of candidateDelimiters) {
    const colCounts = sampleLines.map((line) => {
      let count = 0;
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (!inQuotes && ch === delim) {
          count++;
        }
      }
      return count + 1;
    });

    const firstCount = colCounts[0];
    if (firstCount <= 1) continue; // Single column implies delimiter is not present

    // Count how many sample lines have the exact same number of columns
    const matchingLines = colCounts.filter((c) => c === firstCount).length;
    const consistencyRatio = matchingLines / colCounts.length;

    // Score based on column count and consistency across lines
    const score = firstCount * 10 + consistencyRatio * 100;

    if (score > maxScore) {
      maxScore = score;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

// ─── Lightweight RFC 4180 CSV / TSV parser ─────────────────

function parseCSVLine(line: string, delimiter: string = ","): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Look-ahead for escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === delimiter) {
        fields.push(current);
        current = "";
        i++;
        continue;
      }
      current += ch;
      i++;
    }
  }
  fields.push(current);
  return fields;
}

function parseCSV(text: string, customDelimiter?: string): { rows: string[][]; delimiter: string } {
  const delimiter = customDelimiter || detectDelimiter(text);
  // Normalise line endings and split
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const rows: string[][] = [];

  let pendingLine = "";
  for (const line of lines) {
    // Handle multi-line quoted fields
    pendingLine = pendingLine ? pendingLine + "\n" + line : line;
    const quoteCount = (pendingLine.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      // Unbalanced quotes — continuation line
      continue;
    }
    if (pendingLine.trim().length > 0) {
      rows.push(parseCSVLine(pendingLine, delimiter));
    }
    pendingLine = "";
  }
  // Push any remaining partial line
  if (pendingLine.trim().length > 0) {
    rows.push(parseCSVLine(pendingLine, delimiter));
  }

  return { rows, delimiter };
}

// ─── Structured Requirement from CSV row ─────────────────

export interface CSVRequirement {
  itemNumber: string;
  category: string;
  title: string;
  content: string;
  indentLevel: number;
}

// ─── Public API ──────────────────────────────────────────

export interface CSVParseResult {
  /** True when the CSV columns matched known requirement fields and rows
   *  were mapped directly (structured import). */
  isStructured: boolean;
  /** Detected delimiter (",", "\t", or ";"). */
  detectedDelimiter: string;
  /** Populated only in structured mode. */
  requirements: CSVRequirement[];
  /** The parsed document (always populated). In structured mode `text`
   *  contains the raw CSV for reference. */
  document: ParsedDocument;
}

const VALID_CATEGORIES = new Set(["TITLE", "REQUIREMENT", "PARAGRAPH", "NOTE"]);

export async function parseCsv(buffer: Buffer, customDelimiter?: string): Promise<CSVParseResult> {
  const text = buffer.toString("utf-8");
  const { rows, delimiter } = parseCSV(text, customDelimiter);

  if (rows.length < 2) {
    // Only header row (or empty) — nothing to map
    return {
      isStructured: false,
      detectedDelimiter: delimiter,
      requirements: [],
      document: { text, metadata: { title: "CSV Import" } },
    };
  }

  // ── Try structured mapping ──────────────────────────────
  const headerRow = rows[0];
  const columnMap = new Map<number, string>(); // colIndex → fieldName

  for (let i = 0; i < headerRow.length; i++) {
    const field = resolveColumnName(headerRow[i]);
    if (field) columnMap.set(i, field);
  }

  // We require at least a "content" column to consider this structured
  const hasContent = [...columnMap.values()].includes("content");

  if (hasContent) {
    const requirements: CSVRequirement[] = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const req: Record<string, string> = {};

      for (const [colIdx, fieldName] of columnMap.entries()) {
        req[fieldName] = (row[colIdx] ?? "").trim();
      }

      // Skip completely empty rows
      if (!req.content && !req.title) continue;

      const category = (req.category || "REQUIREMENT").toUpperCase();

      requirements.push({
        itemNumber: req.itemNumber || `${requirements.length + 1}`,
        category: VALID_CATEGORIES.has(category) ? category : "REQUIREMENT",
        title: req.title || "",
        content: req.content || "",
        indentLevel: parseInt(req.indentLevel || "0", 10) || 0,
      });
    }

    // Derive a document title from file content or first title row
    const firstTitle = requirements.find((r) => r.category === "TITLE");
    const docTitle = firstTitle?.title || firstTitle?.content || "CSV Import";

    return {
      isStructured: true,
      detectedDelimiter: delimiter,
      requirements,
      document: { text, metadata: { title: docTitle } },
    };
  }

  // ── Fallback: convert CSV to plain text for AI extraction ──
  const textLines: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    textLines.push(rows[r].join(" | "));
  }
  const plainText = textLines.join("\n");

  const title = rows[0]?.join(" ").substring(0, 200) || "CSV Import";

  return {
    isStructured: false,
    detectedDelimiter: delimiter,
    requirements: [],
    document: { text: plainText, metadata: { title } },
  };
}
