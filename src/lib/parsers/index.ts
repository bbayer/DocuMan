import { parsePdf } from "./pdf-parser";
import { parseDocx } from "./docx-parser";
import { parseTxt } from "./txt-parser";

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

  if (mimeType === "text/plain" || ext === "txt") {
    return parseTxt(buffer);
  }

  // Fallback: try as text
  return parseTxt(buffer);
}
