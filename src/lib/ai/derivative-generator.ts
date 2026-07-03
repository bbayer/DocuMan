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
}

// ─── Quality constraints appended to every prompt ────────

const QUALITY_CONSTRAINTS = `
Quality constraints for generated requirements:
- Each requirement SHALL be atomic — exactly one testable statement per requirement.
- Use "shall" for mandatory, "should" for recommended, "may" for optional.
- Each requirement must be verifiable — include measurable acceptance criteria where applicable.
- Avoid ambiguous terms: "appropriate", "as needed", "etc.", "user-friendly", "adequate".
- Maintain consistent terminology from the source document and system context.
- Preserve the hierarchical section structure of the parent document.
- Do NOT merge multiple parent requirements into a single derived requirement.
- Do NOT generate requirements that are not traceable to a parent requirement.`;

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

  // Project-level AI context (domain, standards, system description)
  if (context.projectAiContext) {
    systemContext += `\n\nSYSTEM CONTEXT (provided by the project owner — treat as ground truth):\n${context.projectAiContext}`;
  }

  // Document context
  if (context.documentTitle) {
    systemContext += `\n\nSOURCE DOCUMENT: "${context.documentTitle}"`;
  }

  // Section context — helps the LLM understand what chapter these requirements belong to
  if (context.sectionHeadings && context.sectionHeadings.length > 0) {
    systemContext += `\n\nCURRENT SECTION HIERARCHY:\n${context.sectionHeadings.map((h, i) => `${"  ".repeat(i)}→ ${h}`).join("\n")}`;
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
