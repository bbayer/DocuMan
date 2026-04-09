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

const ExtractionResultSchema = z.object({
  documentTitle: z.string().describe("The overall title of the document"),
  requirements: z.array(RequirementSchema).describe("All extracted items in document order"),
});

export type ExtractedRequirement = z.infer<typeof RequirementSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ─── Extract Requirements from Text ──────────────────────

export async function extractRequirements(text: string): Promise<ExtractionResult> {
  // Truncate very long documents to fit in context window
  const maxChars = 60000;
  const truncatedText = text.length > maxChars
    ? text.substring(0, maxChars) + "\n\n[... document truncated ...]"
    : text;

  try {
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

Preserve the document's structure and ordering. Extract EVERY meaningful item, don't skip any content.

DOCUMENT TEXT:
${truncatedText}`,
    });

    return result.object;
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
