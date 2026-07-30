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

const DerivedItemSchema = z.object({
  derivedItems: z.array(
    z.object({
      parentRequirementId: z.string().describe("The Requirement Reference ID (e.g. SSS-001) or database key of the parent requirement this item relates to"),
      targetSectionNumber: z.string().describe("Target section number matching the outline, e.g. '1.2', '3.1', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '5.4'"),
      category: z.enum(["TITLE", "REQUIREMENT", "PARAGRAPH", "NOTE"]).describe("Category of item: TITLE for section headings, PARAGRAPH for design text/tables/diagrams, REQUIREMENT for shall-statements, NOTE for remarks"),
      title: z.string().describe("Short concise title or heading for this item"),
      content: z.string().describe("Detailed content: specification, design paragraph, Mermaid diagram code block, or Markdown table"),
    })
  ).describe("Formulated derived document items mapped to target section outline"),
});

export type DerivedItemOutput = z.infer<typeof DerivedItemSchema.shape.derivedItems>[0];

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
Quality constraints for generated items:
- Each item MUST strictly align with its targetSectionNumber and target section title.
- Use Requirement Reference IDs (e.g. SSS-001, SSS-004, 3.2.1) when citing parent requirements. NEVER use raw internal database UUID strings (e.g. 'd164bdf9-7622-4877-a3c0-8f562e8f733c').
- Maintain consistent terminology from the glossary and project context.
- Format interface schemas, data dictionary tables, and budget allocations as Markdown tables.
- MERMAID SYNTAX RULES (CRITICAL):
  1. ALWAYS enclose node labels and subgraph titles in double quotes if they contain spaces, parentheses '()', slashes '/', dots '.', or special characters. Example: subgraph MUHTES ["MUHTES.exe (Single Executable)"] and NodeID["Label (Detail)"].
  2. NEVER put unquoted parentheses '()' or brackets inside node definitions like 'ID[Name (Detail)]' — this causes Mermaid parse errors.
  3. For dotted or labeled arrows, format as: NodeA -.-|"Label text"| NodeB or NodeA -->|"Label text"| NodeB.
  4. Ensure all subgraphs end with 'end'.`;

/**
 * Iterates through a chunk of parent requirements and breaks them down into target document outline items.
 * @param parentChunk Array of parent requirements
 * @param docCategory The type of target document (SSDD, SDD, SSS, SRS, STP, IRS, IDD)
 * @param context Additional context for domain-aware, stable generation
 */
export async function breakDownRequirements(
  parentChunk: { id: string; uniqueId?: string; itemNumber?: string; content: string; title: string }[],
  docCategory: string,
  context: DerivationContext = {}
): Promise<DerivedItemOutput[]> {
  if (parentChunk.length === 0) return [];

  // ── Build system prompt ──────────────────────────────
  let systemContext = "You are a Chief Systems Engineer and Senior System Architect specializing in MIL-STD-498 DI-IPSC-81432 and PPI PPA-003461-5 System/Subsystem Design Description (SSDD) standards.";

  // Language instruction
  if (context.language) {
    systemContext += `\n\nDOCUMENT LANGUAGE: ${context.language}`;
    systemContext += `\nGenerate all item titles and text content in this language.`;
  }

  // Project-level AI context
  if (context.projectAiContext) {
    systemContext += `\n\nSYSTEM CONTEXT (provided by project owner — treat as ground truth):\n${context.projectAiContext}`;
  }

  // Document context
  if (context.documentTitle) {
    systemContext += `\n\nSOURCE DOCUMENT: "${context.documentTitle}"`;
  }

  // Glossary enforcement
  if (context.glossary && context.glossary.length > 0) {
    const glossaryLines = context.glossary.slice(0, 30).map(
      (g) => `- "${g.term}": ${g.definition}`
    ).join("\n");
    systemContext += `\n\nTERMINOLOGY GLOSSARY:\n${glossaryLines}`;
  }

  // Target document outline awareness
  if (context.targetOutline && context.targetOutline.length > 0) {
    const outlineLines = context.targetOutline.map(
      (s) => `- ${s.sectionNumber} ${s.sectionTitle}`
    ).join("\n");
    systemContext += `\n\nTARGET DOCUMENT OUTLINE SECTIONS (map all derived items to these section numbers):\n${outlineLines}`;
  }

  // Cross-cutting themes
  if (context.themes && context.themes.length > 0) {
    systemContext += `\n\nCROSS-CUTTING THEMES:\n${context.themes.map((t) => `- ${t}`).join("\n")}`;
  }

  // Cross-chunk deduplication
  if (context.previouslyGenerated && context.previouslyGenerated.length > 0) {
    const prevLines = context.previouslyGenerated.slice(-30).map(
      (t) => `- ${t}`
    ).join("\n");
    systemContext += `\n\nPREVIOUSLY GENERATED ITEMS (do NOT duplicate these):\n${prevLines}`;
  }

  // Document-type-specific instructions
  if (docCategory === "SSDD") {
    systemContext += "\n\nTranslate upstream System Specifications (SSS) into a MIL-STD-498 DI-IPSC-81432 / PPI PPA-003461-5 System/Subsystem Design Description (SSDD).\n" +
      "CRITICAL RULES FOR SSDD:\n" +
      "1. ITEM CATEGORIES: Do NOT use 'REQUIREMENT' category for SSDD items. Use ONLY 'TITLE' (subheadings) and 'PARAGRAPH' (narrative text, tables, diagrams). SSDD is a design description, not a requirement specification.\n" +
      "2. MERMAID ARCHITECTURAL DIAGRAMS: Generate Mermaid diagrams (using ```mermaid ... ``` blocks) in Section 4.1 (System Component Breakdown) and Section 4.3 (Data Flow Architecture) to visually illustrate system components, Subsystems, HWCIs (Hardware Configuration Items), CSCIs (Computer Software Configuration Items), and Manual Operations.\n" +
      "3. SECTION 5.2 FUNCTIONAL ARCHITECTURE MANDATORY 4-ROW TABLE FORMAT:\n" +
      "   For each system function in Section 5.2 (System functional architecture & functional detailed design), generate a PARAGRAPH item containing an EXACT 4-row Markdown table:\n" +
      "   | Field | Details |\n" +
      "   | :--- | :--- |\n" +
      "   | **Function Name** | **Fn-00X: [Function Title]** |\n" +
      "   | **Function Description** | [Detailed description of function purpose, behavior, algorithm, and operation] |\n" +
      "   | **Inputs / Outputs** | **Inputs:**<br/>- **[Input Parameter/Signal 1]**: [Purpose] (subfields/structure: field_a, field_b, field_c)<br/>- **[Input Parameter/Signal 2]**: [Purpose] (subfields/structure: field_x, field_y)<br/><br/>**Outputs:**<br/>- **[Output Data/Signal 1]**: [Description] (subfields/structure: out_field1, out_field2)<br/>- **[Output Data/Signal 2]**: [Description] (subfields/structure: status_code, timestamp) |\n" +
      "   | **Upstream SSS Requirements** | [List of Requirement Reference Number(s) e.g. SSS-001, SSS-004 — NEVER use raw database UUIDs] |\n\n" +
      "4. SECTION TITLE ALIGNMENT:\n" +
      "   - Target Section 1.2 (System overview): PARAGRAPH items for high-level system overview.\n" +
      "   - Target Section 3.1 (System architectural design decisions): PARAGRAPH items for architectural design trade-offs and decisions.\n" +
      "   - Target Section 3.2 (System operational concept decisions): PARAGRAPH items for operational modes and behavior decisions.\n" +
      "   - Target Section 3.3 (System safety, security, and privacy decisions): PARAGRAPH items for safety interlocks, fail-over behaviors, and security access controls.\n" +
      "   - Target Section 4.1 (System component breakdown & component allocation): PARAGRAPH items for HWCI/CSCI component allocations + a Mermaid system breakdown diagram.\n" +
      "   - Target Section 4.2 (Concept of execution & operational scenarios): PARAGRAPH items describing execution scenarios and state transitions.\n" +
      "   - Target Section 4.3 (System interface design & data flow architecture): PARAGRAPH items with a Mermaid data flow diagram and Markdown interface tables.\n" +
      "   - Target Section 5.1 (System detailed design overview): PARAGRAPH items describing detailed component responsibilities.\n" +
      "   - Target Section 5.2 (System functional architecture & functional detailed design): PARAGRAPH items containing the mandatory 4-row Functional Architecture table per function.\n" +
      "   - Target Section 5.3 (System interface detailed specifications): PARAGRAPH items with Markdown tables for detailed message schemas and signals.\n" +
      "   - Target Section 5.4 (System resource allocation & performance budgets): PARAGRAPH items with Markdown tables for memory, CPU, bandwidth, and processing budgets.\n" +
      "   - Target Section 6 (Requirements traceability): PARAGRAPH items summarizing traceability back to parent SSS requirements.\n";
  } else if (docCategory === "SDD") {
    systemContext += "\n\nTranslate upstream SRS requirements into a MIL-STD-498 DI-IPSC-81435 / IEEE 1016 Software Design Description (SDD).\n" +
      "For each software requirement, specify concrete software units, execution control, algorithms, and data structures:\n" +
      "- Target Section 3.1 / 3.2 (Software Architecture & Data Processing Decisions): Generate PARAGRAPH items.\n" +
      "- Target Section 4.1 / 4.2 (CSCI Component Breakdown & Execution Concept): Detail software modules with Mermaid diagrams.\n" +
      "- Target Section 5.1 (Software Units & Functions): Provide function signatures, purpose, and pseudo-code logic.\n" +
      "- Target Section 5.2 (Data Dictionary & Schemas): Generate Markdown tables for data structures and database schemas:\n" +
      "  | Field Name | Type | Range / Units | Description |\n";
  } else if (docCategory === "SRS") {
    systemContext += "\n\nBreak down upstream requirements into granular, atomic, and testable Software Requirements under Section 3.2 (CSCI capability requirements).";
  } else if (docCategory === "STP") {
    systemContext += "\n\nFrame upstream requirements as Software Test Plans (Section 4.2 Planned tests) with verification procedures and test cases.";
  } else if (docCategory === "IRS") {
    systemContext += "\n\nExtract external interface requirements and data formats under Section 3.2 (Interface requirements).";
  } else if (docCategory === "IDD") {
    systemContext += "\n\nFormulate detailed Interface Design Descriptions (IDD) under Section 3.2 with Markdown tables for pinouts, registers, and frame schemas.";
  } else {
    systemContext += "\n\nBreak down upstream requirements into logically structured, atomic items mapped to the target document outline.";
  }

  // Quality constraints
  systemContext += QUALITY_CONSTRAINTS;

  // User-provided extra instructions
  if (context.extraInstructions) {
    systemContext += `\n\nAdditional Instructions (provided by the user):\n${context.extraInstructions}`;
  }

  // ── Construct input payload ──────────────────────────
  const inputList = parentChunk.map((req) => {
    const sssRef = req.uniqueId || req.itemNumber || req.id;
    return `Requirement Reference Number: ${sssRef}\nRequirement Title: ${req.title || "Untitled"}\nRequirement Text: ${req.content}\n---`;
  }).join("\n");

  const prompt = `${systemContext}

Analyze the following parent requirements. Formulate derived items and map each item to its appropriate targetSectionNumber in the target document outline.
Use the Requirement Reference Number (e.g. SSS-001) when referencing parent requirements.

Parent Requirements Payload:
${inputList}`;

  try {
    const reasoningOption = context.reasoningEffort && context.reasoningEffort !== "none"
      ? { reasoning: { effort: context.reasoningEffort as "low" | "medium" | "high" } }
      : {};

    const result = await generateObject({
      model: getModel(),
      schema: DerivedItemSchema,
      prompt: prompt,
      ...reasoningOption,
    });

    return result.object.derivedItems;
  } catch (error) {
    console.error("AI derivation failed for chunk:", error);
    const fallbackSection = context.targetOutline?.[0]?.sectionNumber || "3.1";
    const category = docCategory === "SSDD" ? ("PARAGRAPH" as const) : ("REQUIREMENT" as const);
    return parentChunk.map(req => ({
      parentRequirementId: req.uniqueId || req.itemNumber || req.id,
      targetSectionNumber: fallbackSection,
      category,
      title: req.title || "Derived Design Description",
      content: req.content,
    }));
  }
}
