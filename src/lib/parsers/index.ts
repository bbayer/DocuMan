import { parsePdf } from "./pdf-parser";
import { parseDocx } from "./docx-parser";
import { parseTxt } from "./txt-parser";
import { parseCsv } from "./csv-parser";
export type { CSVParseResult, CSVRequirement } from "./csv-parser";

export interface ParsedDocument {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    pages?: number;
  };
}

export async function parseDocument(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ParsedDocument> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (mimeType === "application/pdf" || ext === "pdf") {
    return parsePdf(buffer);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) {
    return parseDocx(buffer);
  }

  // CSV handled separately via parseCsvDocument (structured path)
  if (mimeType === "text/csv" || ext === "csv") {
    const result = await parseCsv(buffer);
    return result.document;
  }

  if (mimeType === "text/plain" || ext === "txt") {
    return parseTxt(buffer);
  }

  // Fallback: try as text
  return parseTxt(buffer);
}

/**
 * Parse a CSV file and return the full result including structured
 * requirements when the CSV columns match known field names.
 */
export async function parseCsvDocument(buffer: Buffer) {
  return parseCsv(buffer);
}
