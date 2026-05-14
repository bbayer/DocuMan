import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";

// ─── AI Provider (generic OpenAI-compatible) ──────────────

function getProvider() {
  return createOpenAICompatible({
    name: "documan-ai",
    baseURL: process.env.AI_API_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.AI_API_KEY || "",
  });
}

function getModel() {
  const provider = getProvider();
  return provider.chatModel(process.env.AI_MODEL || "gpt-4o");
}

// ─── Requirement Extraction Schema ────────────────────────

const RequirementSchema = z.object({
  itemNumber: z.string().describe("The item/section number, e.g. '3.2.1', '1.', 'REQ-001'"),
  category: z.enum(["TITLE", "REQUIREMENT", "PARAGRAPH", "NOTE"]).describe(
    "TITLE for section headings, REQUIREMENT for actual requirements, PARAGRAPH for descriptive text, NOTE for notes/remarks"
  ),
  title: z.string().describe("Short title or heading text (for TITLE category) or brief summary"),
  content: z.string().describe("Full text content of this item"),
  indentLevel: z.number().describe("Nesting depth: 0 for top-level, 1 for sub-section, 2 for sub-sub-section, etc."),
});

const ChunkExtractionSchema = z.object({
  requirements: z.array(RequirementSchema).describe("All extracted items in document order"),
});

const ExtractionResultSchema = z.object({
  documentTitle: z.string().describe("The overall title of the document"),
  requirements: z.array(RequirementSchema).describe("All extracted items in document order"),
});

export type ExtractedRequirement = z.infer<typeof RequirementSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ─── Chunking Utilities ──────────────────────────────────

/**
 * Split text into chunks at paragraph/section boundaries.
 * Each chunk is at most `maxChars` characters, split on double-newlines
 * so we never break mid-paragraph.
 */
function splitIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  // Split on double-newlines (paragraph boundaries)
  const paragraphs = text.split(/\n\s*\n/);
  let currentChunk = "";

  for (const para of paragraphs) {
    const candidate = currentChunk
      ? currentChunk + "\n\n" + para
      : para;

    if (candidate.length > maxChars && currentChunk.length > 0) {
      // Current chunk is full, push it and start new one
      chunks.push(currentChunk);
      currentChunk = para;
    } else if (para.length > maxChars) {
      // Single paragraph is too large — push what we have, then split this paragraph by single newlines
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      const lines = para.split(/\n/);
      for (const line of lines) {
        const lineCandidate = currentChunk ? currentChunk + "\n" + line : line;
        if (lineCandidate.length > maxChars && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = line;
        } else {
          currentChunk = lineCandidate;
        }
      }
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// ─── Extract from a Single Chunk ─────────────────────────

async function extractChunk(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  contextHint: string
): Promise<ExtractedRequirement[]> {
  const chunkLabel = totalChunks > 1
    ? `\n\nNOTE: This is part ${chunkIndex + 1} of ${totalChunks} of the document. ${contextHint}`
    : "";

  const result = await generateObject({
    model: getModel(),
    schema: ChunkExtractionSchema,
    prompt: `You are an expert requirements engineer. Analyze the following document section and extract ALL items.

For each item, determine:
1. **itemNumber**: The section/item number as it appears (e.g., "1.", "3.2.1", "REQ-001"). If there's no explicit number, generate one based on position.
2. **category**: Classify as:
   - TITLE: Section headings and sub-headings
   - REQUIREMENT: Actual requirements (shall/must/will statements, specifications, constraints)
   - PARAGRAPH: Descriptive or explanatory text
   - NOTE: Notes, remarks, or informational items
3. **title**: A brief title or the heading text
4. **content**: The full text content
5. **indentLevel**: The nesting depth (0 = top-level, 1 = under a section, 2 = sub-sub-section, etc.)

IMPORTANT: You MUST extract EVERY item from the text below. Do NOT skip or summarize any content. Every paragraph, heading, requirement, and note must appear in your output.${chunkLabel}

DOCUMENT TEXT:
${chunkText}`,
  });

  return result.object.requirements;
}

// ─── Extract Requirements from Text (Chunked) ────────────

const CHUNK_MAX_CHARS = 30000; // ~7500 tokens input per chunk, leaves room for output

export async function extractRequirements(text: string): Promise<ExtractionResult> {
  try {
    const chunks = splitIntoChunks(text, CHUNK_MAX_CHARS);
    console.log(`[Extractor] Document is ${text.length} chars → ${chunks.length} chunk(s)`);

    const allRequirements: ExtractedRequirement[] = [];

    // First chunk: also extract document title
    if (chunks.length === 1) {
      // Small document — single call with full schema
      const result = await generateObject({
        model: getModel(),
        schema: ExtractionResultSchema,
        prompt: `You are an expert requirements engineer. Analyze the following document and extract ALL items.

For each item, determine:
1. **itemNumber**: The section/item number as it appears (e.g., "1.", "3.2.1", "REQ-001"). If there's no explicit number, generate one based on position.
2. **category**: Classify as:
   - TITLE: Section headings and sub-headings
   - REQUIREMENT: Actual requirements (shall/must/will statements, specifications, constraints)
   - PARAGRAPH: Descriptive or explanatory text
   - NOTE: Notes, remarks, or informational items
3. **title**: A brief title or the heading text
4. **content**: The full text content
5. **indentLevel**: The nesting depth (0 = top-level, 1 = under a section, 2 = sub-sub-section, etc.)

IMPORTANT: You MUST extract EVERY item from the text below. Do NOT skip or summarize any content. Every paragraph, heading, requirement, and note must appear in your output.

Preserve the document's structure and ordering. Extract EVERY meaningful item, don't skip any content.

DOCUMENT TEXT:
${text}`,
      });

      return result.object;
    }

    // Multi-chunk: process each chunk sequentially
    let documentTitle = "";

    for (let i = 0; i < chunks.length; i++) {
      const contextHint = i === 0
        ? "Extract all items from this first section. Subsequent sections will follow."
        : `Continue extracting from where the previous section ended. Maintain consistent numbering and structure.`;

      console.log(`[Extractor] Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
      const chunkReqs = await extractChunk(chunks[i], i, chunks.length, contextHint);
      console.log(`[Extractor] Chunk ${i + 1} yielded ${chunkReqs.length} items`);

      // Extract document title from the first chunk's first TITLE item
      if (i === 0 && documentTitle === "") {
        const firstTitle = chunkReqs.find(r => r.category === "TITLE");
        documentTitle = firstTitle?.title || firstTitle?.content || "Untitled Document";
      }

      allRequirements.push(...chunkReqs);
    }

    console.log(`[Extractor] Total extracted: ${allRequirements.length} items`);

    return {
      documentTitle: documentTitle || "Untitled Document",
      requirements: allRequirements,
    };
  } catch (error) {
    console.error("AI extraction failed:", error);
    // Fallback: simple line-based extraction
    return fallbackExtraction(text);
  }
}

// ─── Fallback extraction (no AI) ─────────────────────────

function fallbackExtraction(text: string): ExtractionResult {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const requirements: ExtractedRequirement[] = [];

  let sortIndex = 0;
  for (const line of lines) {
    const trimmed = line.trim();

    // Detect numbered items
    const numberMatch = trimmed.match(/^(\d+(?:\.\d+)*\.?\s*)/);
    const itemNumber = numberMatch ? numberMatch[1].trim() : `${sortIndex + 1}`;

    // Simple heuristic: short lines that look like headings = TITLE
    const isTitle =
      trimmed.length < 100 &&
      (trimmed === trimmed.toUpperCase() || /^[\d.]+\s+[A-Z]/.test(trimmed));

    // Requirements typically contain "shall", "must", "will"
    const isRequirement = /\b(shall|must|will|should|required)\b/i.test(trimmed);

    requirements.push({
      itemNumber,
      category: isTitle ? "TITLE" : isRequirement ? "REQUIREMENT" : "PARAGRAPH",
      title: isTitle ? trimmed.replace(/^[\d.]+\s*/, "") : "",
      content: trimmed,
      indentLevel: 0,
    });

    sortIndex++;
  }

  return {
    documentTitle: lines[0]?.substring(0, 200) || "Untitled Document",
    requirements,
  };
}
