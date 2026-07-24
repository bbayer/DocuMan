import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";

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

const DerivedRequirementSchema = z.object({
  derivedRequirements: z.array(
    z.object({
      parentRequirementId: z.string().describe("The ID of the parent requirement this is derived from"),
      title: z.string().describe("A short, concise title for this specific atomic piece"),
      content: z.string().describe("The detailed, atomic specification or constraint text"),
    })
  ).describe("List of newly formulated, atomic testable requirements"),
});

export type DerivedRequirementOutput = z.infer<typeof DerivedRequirementSchema.shape.derivedRequirements>[0];

// ─── Context passed to every derivation call ─────────────

export interface DerivationContext {
  /** User-defined project-level system description */
  projectAiContext?: string;
  /** Title of the parent document being derived from */
  documentTitle?: string;
  /** Section headings (TITLE items) that are ancestors of the current chunk */
  sectionHeadings?: string[];
  /** User-provided extra instructions for the AI */
  extraInstructions?: string;
  /** Reasoning effort level for models that support chain-of-thought */
  reasoningEffort?: "none" | "low" | "medium" | "high";
  /** Detected document language (ISO 639-1 code) */
  language?: string;
  /** Glossary of canonical terms to enforce (from analysis pass) */
  glossary?: { term: string; definition: string }[];
  /** Target document outline sections in document language (from analysis pass) */
  targetOutline?: { sectionNumber: string; sectionTitle: string }[];
  /** Cross-cutting themes that apply to all requirements */
  themes?: string[];
  /** Running summary of previously generated requirement titles (for dedup) */
  previouslyGenerated?: string[];
}

// ─── Quality constraints appended to every prompt ────────

const QUALITY_CONSTRAINTS = `
Quality constraints for generated requirements:
- Each requirement SHALL be atomic — exactly one testable statement per requirement.
- Each requirement must be verifiable — include measurable acceptance criteria where applicable.
- Maintain consistent terminology from the glossary and source document.
- Preserve the hierarchical section structure of the parent document.
- Do NOT merge multiple parent requirements into a single derived requirement.
- Do NOT generate requirements that are not traceable to a parent requirement.
- Do NOT duplicate requirements that have already been generated (see PREVIOUSLY GENERATED list).`;

/**
 * Iterates through a chunk of parent requirements and breaks them down.
 * @param parentChunk Array of parent requirements (which must only be of category "REQUIREMENT")
 * @param docCategory The type of target document (SSS, SRS, SDD, STP, IRS)
 * @param context Additional context for domain-aware, stable generation
 */
export async function breakDownRequirements(
  parentChunk: { id: string; content: string; title: string }[],
  docCategory: string,
  context: DerivationContext = {}
): Promise<DerivedRequirementOutput[]> {
  if (parentChunk.length === 0) return [];

  // ── Build system prompt ──────────────────────────────
  let systemContext = "You are an expert Systems Engineer.";

  // Language instruction
  if (context.language) {
    systemContext += `\n\nDOCUMENT LANGUAGE: ${context.language}`;
    systemContext += `\nGenerate all requirement text in this language.`;
    if (context.language === "tr") {
      systemContext += `\nUse Turkish definite future tense ("...yacaktır", "...yecektir") for mandatory requirements (shall-equivalent).`;
      systemContext += `\nUse "...malıdır"/"...melidir" for recommended (should-equivalent).`;
      systemContext += `\nUse "...bilir"/"...abilir" for optional (may-equivalent).`;
    } else {
      systemContext += `\nUse "shall" for mandatory, "should" for recommended, "may" for optional.`;
    }
  } else {
    systemContext += `\nUse "shall" for mandatory, "should" for recommended, "may" for optional.`;
  }

  // Project-level AI context (domain, standards, system description)
  if (context.projectAiContext) {
    systemContext += `\n\nSYSTEM CONTEXT (provided by the project owner — treat as ground truth):\n${context.projectAiContext}`;
  }

  // Document context
  if (context.documentTitle) {
    systemContext += `\n\nSOURCE DOCUMENT: "${context.documentTitle}"`;
  }

  // Glossary enforcement — the key to terminology consistency
  if (context.glossary && context.glossary.length > 0) {
    const glossaryLines = context.glossary.slice(0, 30).map(
      (g) => `- "${g.term}": ${g.definition}`
    ).join("\n");
    systemContext += `\n\nTERMINOLOGY GLOSSARY (use these EXACT terms — do NOT use alternatives or synonyms):\n${glossaryLines}`;
  }

  // Target document outline awareness
  if (context.targetOutline && context.targetOutline.length > 0) {
    const outlineLines = context.targetOutline.map(
      (s) => `- ${s.sectionNumber} ${s.sectionTitle}`
    ).join("\n");
    systemContext += `\n\nTARGET DOCUMENT STRUCTURE (J-STD-016 ${docCategory}):\n${outlineLines}`;
  }

  // Cross-cutting themes
  if (context.themes && context.themes.length > 0) {
    systemContext += `\n\nCROSS-CUTTING THEMES (apply to all requirements where relevant):\n${context.themes.map((t) => `- ${t}`).join("\n")}`;
  }

  // Section context — helps the LLM understand what chapter these requirements belong to
  if (context.sectionHeadings && context.sectionHeadings.length > 0) {
    systemContext += `\n\nCURRENT SECTION HIERARCHY:\n${context.sectionHeadings.map((h, i) => `${"  ".repeat(i)}→ ${h}`).join("\n")}`;
  }

  // Cross-chunk deduplication — the key to avoiding duplicates
  if (context.previouslyGenerated && context.previouslyGenerated.length > 0) {
    const prevLines = context.previouslyGenerated.slice(-30).map(
      (t) => `- ${t}`
    ).join("\n");
    systemContext += `\n\nPREVIOUSLY GENERATED REQUIREMENTS (do NOT duplicate these):\n${prevLines}`;
  }

  // Document-type-specific instructions
  if (docCategory === "SSS") {
    systemContext += "\n\nAnalyze the upstream requirements and synthesize overarching System/Subsystem Specifications. Describe system boundaries, operational capabilities, and behavioral models.";
  } else if (docCategory === "SRS") {
    systemContext += "\n\nAnalyze the upstream requirements and break them down into granular, atomic, and testable Software Requirements (functional, non-functional, interface constraints).";
  } else if (docCategory === "SDD") {
    systemContext += "\n\nTranslate the upstream requirements into Software Design Descriptions. Describe architecture constraints, modules, components, and database structures.";
  } else if (docCategory === "STP") {
    systemContext += "\n\nFrame the upstream requirements as Software Test Plans. Describe testable verification procedures and overarching test cases needed to satisfy the requirements.";
  } else if (docCategory === "IRS") {
    systemContext += "\n\nExtract external system boundaries, protocols, and data exchange formats for an Interface Requirements Specification.";
  } else {
    systemContext += "\n\nBreak down the upstream requirements into logically structured, atomic, and granular lower-level elements tailored for technical implementation.";
  }

  // Quality constraints
  systemContext += QUALITY_CONSTRAINTS;

  // User-provided extra instructions
  if (context.extraInstructions) {
    systemContext += `\n\nAdditional Instructions (provided by the user — follow these as extra rules):\n${context.extraInstructions}`;
  }

  // ── Construct input payload ──────────────────────────
  const inputList = parentChunk.map((req) => 
    `Parent ID: ${req.id}\nTitle: ${req.title || "Untitled"}\nContent: ${req.content}\n---`
  ).join("\n");

  const prompt = `${systemContext}

Analyze the following parent requirements. For each parent requirement, break it down into 1 or more strictly atomic and unambiguous derived items. 
- Return ONLY the derived items mapped back to their EXACT Parent ID.
- Ensure the derived "content" is descriptive and written cleanly.

Parent Requirements Payload:
${inputList}`;

  try {
    // Build reasoning option if enabled
    const reasoningOption = context.reasoningEffort && context.reasoningEffort !== "none"
      ? { reasoning: { effort: context.reasoningEffort as "low" | "medium" | "high" } }
      : {};

    const result = await generateObject({
      model: getModel(),
      schema: DerivedRequirementSchema,
      prompt: prompt,
      ...reasoningOption,
    });

    return result.object.derivedRequirements;
  } catch (error) {
    console.error("AI derivation failed for chunk:", error);
    // Fallback: copy 1:1 if AI fails
    return parentChunk.map(req => ({
      parentRequirementId: req.id,
      title: req.title || "Derived Requirement",
      content: req.content,
    }));
  }
}
