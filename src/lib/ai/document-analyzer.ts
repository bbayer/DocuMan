import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";
import { getSectionsForCategory } from "@/lib/standards/j-std-016";

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

export interface SystemFunctionSummary {
  functionId: string;
  functionTitle: string;
  upstreamRequirementIds: string[];
  description: string;
  inputs: string[];
  outputs: string[];
}

export interface DocumentAnalysis {
  /** Detected document language (ISO 639-1 code: "tr", "en", etc.) */
  language: string;

  /** Quick 2-3 paragraph summary of the source document and system capabilities */
  documentSummary: string;

  /** Extracted terminology: canonical term → definition + aliases */
  glossary: { term: string; definition: string; aliases: string[] }[];

  /** Target document outline — J-STD-016 sections translated to document language */
  outline: { sectionNumber: string; sectionTitle: string; description: string }[];

  /** Cross-cutting themes and constraints that apply to all requirements */
  themes: string[];

  /** System boundaries and interfaces identified */
  interfaces: string[];

  /** Synthesized granular system functions grouping upstream requirements (for SSDD Section 5.2) */
  systemFunctions?: SystemFunctionSummary[];

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

  documentSummary: z.string().describe("High-level 2-3 paragraph executive architectural summary of the source document purpose, domain, and core capabilities"),

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

  systemFunctions: z.array(z.object({
    functionId: z.string().describe("Function ID e.g. Fn-001, Fn-002, Fn-003..."),
    functionTitle: z.string().describe("Specific, concrete title of the System Function"),
    upstreamRequirementIds: z.array(z.string()).describe("List of 1 to 3 closely related parent Requirement Reference IDs (e.g. SSS-001, SSS-002) combined into this function"),
    description: z.string().describe("Detailed functional description of purpose, behavior, algorithm, and operation"),
    inputs: z.array(z.string()).describe("List of inputs with parameter name, purpose, and subfields"),
    outputs: z.array(z.string()).describe("List of outputs with data name, purpose, and subfields"),
  })).optional().describe("Granular system functions joining 1-3 closely related upstream requirements for Section 5.2 Functional Architecture"),

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

function prepareInput(requirements: RequirementSummary[]): string {
  const MAX_TOTAL_CHARS = 50_000;
  const MAX_CONTENT_CHARS = 200;

  let lines = requirements.map((r) =>
    `[${r.category}] ${r.itemNumber} | ${r.title || ""} | ${r.content}`
  );

  let total = lines.join("\n").length;

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

export async function analyzeSourceDocument(
  documentTitle: string,
  requirements: RequirementSummary[],
  docCategory: string,
  projectAiContext?: string,
  extraInstructions?: string,
  promptMode: "ENHANCE" | "OVERRIDE" = "ENHANCE",
): Promise<DocumentAnalysis> {
  const sectionTemplates = getSectionsForCategory(docCategory);
  const sectionReference = sectionTemplates.length > 0
    ? sectionTemplates.map((s) => `${s.section} — ${s.title}`).join("\n")
    : "";

  const compressedInput = prepareInput(requirements);

  let prompt = `You are an expert Systems Engineer and Chief System Architect specializing in IEEE 12207 / J-STD-016 and MIL-STD-498 standards.

Analyze the following source document requirements and produce a comprehensive document analysis.`;

  if (projectAiContext) {
    prompt += `\n\nPROJECT CONTEXT (provided by the project owner):\n${projectAiContext}`;
  }

  if (extraInstructions?.trim()) {
    prompt += `\n\nUSER EXTRA INSTRUCTIONS & GENERATION DIRECTIVES:\n${extraInstructions.trim()}`;
    if (promptMode === "OVERRIDE") {
      prompt += `\n\n⚠️ CRITICAL USER OVERRIDE MODE ENABLED:
The user instructions above take TOP PRIORITY. If the user specified custom function/component groupings (e.g., group requirements into specific software functions/modules like Fn-001 Telemetry, Fn-002 FlightControl), custom section structures, or custom breakdown rules, synthesize the target outline and system functions registry strictly following the user's directives rather than default templates.`;
    }
  }

  prompt += `\n\nSOURCE DOCUMENT: "${documentTitle}"
TARGET DOCUMENT TYPE: ${docCategory}`;

  if (sectionReference) {
    prompt += `\n\nJ-STD-016 REFERENCE SECTION TEMPLATE (English canonical — translate to the document's language):
${sectionReference}`;
  }

  prompt += `\n\nLANGUAGE-SPECIFIC CONVENTIONS:
- If the document is in Turkish:
  - CSCI must be translated as "YKE" (Yazılım Konfigürasyon Elemanı), NOT "BYKÖ"
  - "shall" (mandatory) must use definite future tense: "...yacaktır" / "...yecektir"
  - "should" (recommended) must use necessity modal: "...malıdır" / "...melidir"
  - "may" (optional) must use: "...bilir" / "...abilir"
  - Include these verb forms in the validationDictionary accordingly`;

  prompt += `\n\nINSTRUCTIONS:
1. DETECT the language of the source document.
2. GENERATE a 2-3 paragraph executive document summary describing the overall system purpose, operational domain, and core capabilities.
3. EXTRACT domain-specific terminology (canonical form, definition, aliases).
4. MAP the target document outline for ${docCategory}. (If user provided custom section directives, honor them).
5. IDENTIFY cross-cutting themes and system interfaces.
6. GRANULAR SYSTEM FUNCTIONS SYNTHESIS:
   Synthesize concrete System Functions (Fn-001, Fn-002, Fn-003...).
   - ${promptMode === "OVERRIDE" && extraInstructions?.trim() ? "Strictly follow any custom function/module groupings requested by the user." : "Group ONLY closely related requirements. Do NOT lump requirements into overly broad macro-functions."}
   - For each function specify: functionId, functionTitle, upstreamRequirementIds, description, bulleted inputs, and bulleted outputs with subfields.
7. INTERFACE DICTIONARY & SIGNALS:
   Extract all system interface protocols, data buses, signals, and message schemas for Sections 4.3 and 5.3 interface tables.

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
    return {
      language: "en",
      documentSummary: `This document contains the requirements specification for ${documentTitle}.`,
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
