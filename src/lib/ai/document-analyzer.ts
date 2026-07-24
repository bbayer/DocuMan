import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";
import { getSectionsForCategory, type SectionTemplate } from "@/lib/standards/j-std-016";

// ─── Provider / Model (shared with derivative-generator) ─────────

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

// ─── Output types ────────────────────────────────────────────────

export interface DocumentAnalysis {
  /** Detected document language (ISO 639-1 code: "tr", "en", etc.) */
  language: string;

  /** Extracted terminology: canonical term → definition + aliases */
  glossary: { term: string; definition: string; aliases: string[] }[];

  /** Target document outline — J-STD-016 sections translated to document language */
  outline: { sectionNumber: string; sectionTitle: string; description: string }[];

  /** Cross-cutting themes and constraints that apply to all requirements */
  themes: string[];

  /** System boundaries and interfaces identified */
  interfaces: string[];

  /** Language-specific validation dictionary (used for deterministic regex checks) */
  validationDictionary: {
    ambiguousTerms: string[];
    obligationShall: string[];
    obligationShould: string[];
    obligationMay: string[];
  };
}

// ─── Zod schema for structured output ────────────────────────────

const DocumentAnalysisSchema = z.object({
  language: z.string().describe("ISO 639-1 language code of the source document, e.g. 'tr', 'en', 'de'"),

  glossary: z.array(z.object({
    term: z.string().describe("The canonical/preferred term"),
    definition: z.string().describe("Brief definition (1-2 sentences)"),
    aliases: z.array(z.string()).describe("Alternative names found in the document for this concept"),
  })).describe("Domain-specific terminology extracted from the source document"),

  outline: z.array(z.object({
    sectionNumber: z.string().describe("Section number, e.g. '3.2'"),
    sectionTitle: z.string().describe("Section title IN THE DOCUMENT LANGUAGE"),
    description: z.string().describe("Brief description of what belongs in this section"),
  })).describe("Target document outline based on J-STD-016, translated to the document language"),

  themes: z.array(z.string()).describe("Cross-cutting themes and constraints that apply to multiple requirements"),

  interfaces: z.array(z.string()).describe("External systems, protocols, and data formats mentioned in the document"),

  validationDictionary: z.object({
    ambiguousTerms: z.array(z.string()).describe("Vague/imprecise terms that should NOT appear in requirements in this language"),
    obligationShall: z.array(z.string()).describe("Word suffixes/patterns expressing mandatory obligation ('shall'-equivalent) in this language"),
    obligationShould: z.array(z.string()).describe("Word suffixes/patterns expressing recommendation ('should'-equivalent) in this language"),
    obligationMay: z.array(z.string()).describe("Word suffixes/patterns expressing optionality ('may'-equivalent) in this language"),
  }).describe("Language-specific validation rules for quality checking"),
});

// ─── Input preparation ───────────────────────────────────────────

interface RequirementSummary {
  itemNumber: string;
  category: string;
  title: string;
  content: string;
}

/**
 * Compress requirements for the analysis prompt.
 * If total text exceeds 50K chars, truncate each requirement's content.
 */
function prepareInput(requirements: RequirementSummary[]): string {
  const MAX_TOTAL_CHARS = 50_000;
  const MAX_CONTENT_CHARS = 200;

  // First pass: full content
  let lines = requirements.map((r) =>
    `[${r.category}] ${r.itemNumber} | ${r.title || ""} | ${r.content}`
  );

  let total = lines.join("\n").length;

  // If too large, truncate content
  if (total > MAX_TOTAL_CHARS) {
    lines = requirements.map((r) => {
      const content = r.content.length > MAX_CONTENT_CHARS
        ? r.content.slice(0, MAX_CONTENT_CHARS) + "..."
        : r.content;
      return `[${r.category}] ${r.itemNumber} | ${r.title || ""} | ${content}`;
    });
  }

  return lines.join("\n");
}

// ─── Main analysis function ──────────────────────────────────────

/**
 * Analyze a source document in a single LLM call before chunked generation.
 * Extracts glossary, outline, themes, interfaces, and a language-specific
 * validation dictionary for deterministic quality checks.
 */
export async function analyzeSourceDocument(
  documentTitle: string,
  requirements: RequirementSummary[],
  docCategory: string,
  projectAiContext?: string,
): Promise<DocumentAnalysis> {
  const sectionTemplates = getSectionsForCategory(docCategory);
  const sectionReference = sectionTemplates.length > 0
    ? sectionTemplates.map((s) => `${s.section} — ${s.title}`).join("\n")
    : "";

  const compressedInput = prepareInput(requirements);

  // ── Build prompt ────────────────────────────────────────
  let prompt = `You are an expert Systems Engineer and Requirements Analyst specializing in IEEE 12207 / J-STD-016 standards.

Analyze the following source document and produce a structured analysis.`;

  if (projectAiContext) {
    prompt += `\n\nPROJECT CONTEXT (provided by the project owner):\n${projectAiContext}`;
  }

  prompt += `\n\nSOURCE DOCUMENT: "${documentTitle}"
TARGET DOCUMENT TYPE: ${docCategory}`;

  if (sectionReference) {
    prompt += `\n\nJ-STD-016 REFERENCE SECTION TEMPLATE (English canonical — translate to the document's language):
${sectionReference}`;
  }

  // Turkish-specific conventions
  prompt += `\n\nLANGUAGE-SPECIFIC CONVENTIONS:
- If the document is in Turkish:
  - CSCI must be translated as "YKE" (Yazılım Konfigürasyon Elemanı), NOT "BYKÖ"
  - "shall" (mandatory) must use definite future tense: "...yacaktır" / "...yecektir"
  - "should" (recommended) must use necessity modal: "...malıdır" / "...melidir"
  - "may" (optional) must use: "...bilir" / "...abilir"
  - Include these verb forms in the validationDictionary accordingly`;

  prompt += `\n\nINSTRUCTIONS:
1. DETECT the language of the source document.
2. EXTRACT domain-specific terminology. For each term, identify the canonical form, a brief definition, and any aliases/variants found in the text.
3. MAP the source document to the J-STD-016 section structure for ${docCategory}. Translate section titles to the detected language.
4. IDENTIFY cross-cutting themes and constraints that apply across multiple requirements (safety, performance, security, etc.).
5. IDENTIFY external system interfaces, protocols, and data formats.
${docCategory === "SDD" ? `6. FOR SDD (Software Design Description):
   - Identify candidate software modules, components, and software units (e.g. Controllers, Managers, Processing Engines).
   - Identify key data structures, data dictionary tables, and parameter schemas that will be specified in Markdown format.
7. GENERATE a validation dictionary for the detected language:` : `6. GENERATE a validation dictionary for the detected language:`}
   - ambiguousTerms: vague/imprecise terms that should NOT appear in formal requirements
   - obligationShall/Should/May: verb forms for mandatory/recommended/optional requirements

SOURCE DOCUMENT CONTENT:
${compressedInput}`;

  try {
    const result = await generateObject({
      model: getModel(),
      schema: DocumentAnalysisSchema,
      prompt,
    });

    return result.object;
  } catch (error) {
    console.error("Document analysis failed:", error);
    // Return minimal fallback so generation can still proceed
    return {
      language: "en",
      glossary: [],
      outline: sectionTemplates.map((s) => ({
        sectionNumber: s.section,
        sectionTitle: s.title,
        description: "",
      })),
      themes: [],
      interfaces: [],
      validationDictionary: {
        ambiguousTerms: ["appropriate", "as needed", "etc.", "adequate", "timely", "sufficient"],
        obligationShall: ["shall"],
        obligationShould: ["should"],
        obligationMay: ["may"],
      },
    };
  }
}
