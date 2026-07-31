import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateObject } from "ai";
import { z } from "zod";
import type { SystemFunctionSummary } from "@/lib/ai/document-analyzer";

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
      targetSectionNumber: z.string().describe("Target LEAF section number, e.g. '1.1', '1.2', '1.3', '2', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '5.4'. DO NOT map to parent headers '1', '3', '4', '5'"),
      category: z.enum(["TITLE", "REQUIREMENT", "PARAGRAPH", "NOTE"]).describe("Category of item: PARAGRAPH for narrative design text/tables/diagrams, TITLE for sub-headings"),
      title: z.string().describe("Concise, meaningful engineering title for this paragraph. NEVER output generic titles like 'Derived Design Description' or 'Scope'"),
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
  /** Executive architectural summary of source document (from Pass 1) */
  documentSummary?: string;
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
  /** Synthesized granular system functions joining upstream requirements (for SSDD Section 5.2) */
  systemFunctions?: SystemFunctionSummary[];
  /** Running summary of previously generated requirement titles (for dedup) */
  previouslyGenerated?: string[];
}

// ─── Quality constraints appended to every prompt ────────

const QUALITY_CONSTRAINTS = `
Quality constraints for generated items:
- Map items ONLY to leaf section numbers (e.g. '1.1', '1.2', '1.3', '2', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '5.4'). NEVER map to parent headers '1', '3', '4', '5'.
- PARAGRAPH TITLES MUST BE MEANINGFUL: Generate concise, domain-specific engineering titles (e.g. 'Sistem Kimlik Bilgileri', 'Yazılım Mimari Kararları'). NEVER output generic titles like 'Derived Design Description' or 'Scope'.
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

  // Source Document Summary (Pass 1 Output)
  if (context.documentSummary) {
    systemContext += `\n\nSOURCE DOCUMENT ARCHITECTURAL SUMMARY:\n${context.documentSummary}`;
  }

  // Document context
  if (context.documentTitle) {
    systemContext += `\n\nSOURCE DOCUMENT TITLE: "${context.documentTitle}"`;
  }

  // Glossary enforcement
  if (context.glossary && context.glossary.length > 0) {
    const glossaryLines = context.glossary.slice(0, 30).map(
      (g) => `- "${g.term}": ${g.definition}`
    ).join("\n");
    systemContext += `\n\nTERMINOLOGY GLOSSARY:\n${glossaryLines}`;
  }

  // Synthesized System Functions (Pass 1 Output for Section 5.2 grouping)
  if (context.systemFunctions && context.systemFunctions.length > 0) {
    const funcLines = context.systemFunctions.map((fn) =>
      `- [${fn.functionId}] ${fn.functionTitle} (Upstream SSS Reqs: ${fn.upstreamRequirementIds.join(", ")})\n  Description: ${fn.description}`
    ).join("\n");
    systemContext += `\n\nSYNTHESIZED SYSTEM FUNCTIONS REGISTRY (Use these granular functions for Section 5.2 Functional Architecture tables):\n${funcLines}`;
  }

  // Target document outline awareness
  if (context.targetOutline && context.targetOutline.length > 0) {
    const outlineLines = context.targetOutline.map(
      (s) => `- ${s.sectionNumber} ${s.sectionTitle}`
    ).join("\n");
    systemContext += `\n\nTARGET DOCUMENT OUTLINE SECTIONS (map all derived items ONLY to leaf section numbers):\n${outlineLines}`;
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
      "1. ITEM CATEGORIES: Do NOT use 'REQUIREMENT' category for SSDD items. Use ONLY 'PARAGRAPH' (narrative text, tables, diagrams) or 'TITLE' for subheadings. SSDD is a design description, not a requirement specification.\n" +
      "2. LEAF SECTION MAPPING ONLY: Map items ONLY to leaf section numbers ('1.1', '1.2', '1.3', '2', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '5.1', '5.2', '5.3', '5.4', '6'). NEVER map items directly to container headers '1', '3', '4', '5'.\n" +
      "3. MEANINGFUL PARAGRAPH TITLES: Every paragraph item MUST have a concise, meaningful engineering title reflecting its specific content. NEVER output generic titles like 'Derived Design Description' or 'Scope'.\n" +
      "4. GRANULAR FUNCTION GROUPING: Group ONLY closely related parent requirements (at most 1–3 requirements per function). Do NOT create overly generalized macro functions. Keep distinct functions for distinct capabilities.\n" +
      "5. MERMAID DIAGRAMS & INTERFACE TABLES (MANDATORY IN SECTIONS 4.3 & 5.3):\n" +
      "   - Section 4.1: HWCI/CSCI component breakdown + Mermaid breakdown diagram.\n" +
      "   - Section 4.3: Data flow architecture + Mermaid data flow diagram + System Interface Summary Table:\n" +
      "     | Interface ID | Source Subsystem / HWCI | Target Subsystem / CSCI | Protocol / Transport | Data Exchanged & Purpose |\n" +
      "   - Section 5.3: Interface Data Dictionary & Signal Specification Tables:\n" +
      "     | Signal / Data ID | Signal Name | Data Type & Range | Subfields / Payload Structure | Rate / Latency | Upstream SSS Reqs |\n" +
      "6. SECTION 5.2 FUNCTIONAL ARCHITECTURE MANDATORY 4-ROW TABLE FORMAT:\n" +
      "   For each system function in Section 5.2 (System functional architecture & functional detailed design), generate a PARAGRAPH item containing an EXACT 4-row Markdown table:\n" +
      "   | Field | Details |\n" +
      "   | :--- | :--- |\n" +
      "   | **Function Name** | **Fn-00X: [Function Title]** |\n" +
      "   | **Function Description** | [Detailed description of function purpose, behavior, algorithm, and operation] |\n" +
      "   | **Inputs / Outputs** | **Inputs:**<br/>- **[Input Parameter/Signal 1]**: [Purpose] (subfields/structure: field_a, field_b, field_c)<br/>- **[Input Parameter/Signal 2]**: [Purpose] (subfields/structure: field_x, field_y)<br/><br/>**Outputs:**<br/>- **[Output Data/Signal 1]**: [Description] (subfields/structure: out_field1, out_field2)<br/>- **[Output Data/Signal 2]**: [Description] (subfields/structure: status_code, timestamp) |\n" +
      "   | **Upstream SSS Requirements** | [List of grouped Requirement Reference Number(s) e.g. SSS-001, SSS-002 — NEVER use raw database UUIDs] |\n\n";
  } else if (docCategory === "SDD") {
    systemContext += "\n\nTranslate upstream SRS requirements into a MIL-STD-498 DI-IPSC-81435 / IEEE 1016 Software Design Description (SDD).\n" +
      "For each software requirement, specify concrete software units, execution control, algorithms, and data structures:\n" +
      "- Target Section 3.1 / 3.2 (Software Architecture & Data Processing Decisions): Generate PARAGRAPH items.\n" +
      "- Target Section 4.1 / 4.2 (CSCI Component Breakdown & Execution Concept): Detail software modules with Mermaid diagrams.\n" +
      "- Target Section 5.1 (Software Units & Functions): Provide function signatures, purpose, and pseudo-code logic.\n" +
      "- Target Section 5.2 (Data Dictionary & Schemas): Generate Markdown tables for data structures and database schemas:\n" +
      "  | Field Name | Type | Range / Units | Description |\n";
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

Analyze the following parent requirements. Formulate derived items and map each item ONLY to a LEAF targetSectionNumber in the target document outline.
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
    const fallbackSection = context.targetOutline?.[1]?.sectionNumber || "1.1";
    const category = docCategory === "SSDD" ? ("PARAGRAPH" as const) : ("REQUIREMENT" as const);
    return parentChunk.map((req, idx) => ({
      parentRequirementId: req.uniqueId || req.itemNumber || req.id,
      targetSectionNumber: fallbackSection,
      category,
      title: req.title ? `${req.title} Tasarımı` : `Sistem Tasarım Detayı ${idx + 1}`,
      content: req.content,
    }));
  }
}

/**
 * Synthesizes concrete, rich design paragraphs for a target document outline section when no chunk item was mapped to it.
 */
export async function synthesizeSectionParagraphs(
  sectionNumber: string,
  sectionTitle: string,
  docCategory: string,
  context: DerivationContext = {}
): Promise<DerivedItemOutput[]> {
  let prompt = `You are a Chief Systems Engineer writing a MIL-STD-498 / PPI PPA-003461-5 ${docCategory} document.
Synthesize concrete, highly detailed, professional design PARAGRAPH items for Section ${sectionNumber}: "${sectionTitle}".

Generate 1 to 2 comprehensive, technical PARAGRAPH items detailing the architectural decisions, operational concepts, safety/security mechanisms, or interface specifications for this section based on the project system context and document summary.
Every paragraph MUST have a meaningful, specific title (e.g., 'Sistem Kimlik Bilgileri ve Sürüm Kapsamı', 'Arayüz Detaylı Özellikleri ve Veri Sözlüğü'). NEVER output generic titles like 'Derived Design Description' or 'Scope'.
`;

  if (context.language) prompt += `\nDOCUMENT LANGUAGE: ${context.language}`;
  if (context.projectAiContext) prompt += `\nSYSTEM CONTEXT:\n${context.projectAiContext}`;
  if (context.documentSummary) prompt += `\nSOURCE DOCUMENT ARCHITECTURAL SUMMARY:\n${context.documentSummary}`;
  if (context.documentTitle) prompt += `\nSOURCE DOCUMENT TITLE: "${context.documentTitle}"`;

  if (context.glossary && context.glossary.length > 0) {
    const glossaryLines = context.glossary.slice(0, 20).map(g => `- ${g.term}: ${g.definition}`).join("\n");
    prompt += `\nGLOSSARY:\n${glossaryLines}`;
  }

  // Section specific technical guidelines (100% generic MIL-STD-498 / PPI standards statements)
  if (sectionNumber === "1.1") {
    prompt += `\nSECTION 1.1 GUIDELINES: Provide 1 to 2 narrative paragraphs detailing formal system identification, title, document control numbers, software/hardware release baselines, and scope boundaries. Title 1: 'Sistem Kimlik Bilgileri ve Sürüm Kapsamı'.`;
  } else if (sectionNumber === "1.2") {
    prompt += `\nSECTION 1.2 GUIDELINES: Provide 2 to 3 narrative paragraphs detailing high-level system overview, core system architecture, primary capabilities, operational domain, and major subsystem boundaries. Title 1: 'Sistem Genel Mimarisi ve Amacı', Title 2: 'Operasyonel Ortam ve Entegrasyon Kapsamı'.`;
  } else if (sectionNumber === "1.3") {
    prompt += `\nSECTION 1.3 GUIDELINES: Provide 1 to 2 narrative paragraphs detailing document organization, section structure, target engineering audience, and relationship to parent System Specification (SSS) baseline. Title 1: 'Doküman Yapısı ve Kullanım Amacı'.`;
  } else if (sectionNumber === "2" || sectionNumber.startsWith("2.")) {
    prompt += `\nSECTION 2 GUIDELINES: Provide 1 to 2 narrative paragraphs and a list/table detailing referenced documents (MIL-STD-498 DI-IPSC-81432, PPI PPA-003461-5, IEEE standards), ICD specifications, and project reference materials. Title 1: 'İlgili Standartlar ve Referans Dokümanlar'.`;
  } else if (sectionNumber === "3.1") {
    prompt += `\nSECTION 3.1 GUIDELINES: Detail the system architectural design decisions, major trade-offs, subsystem communications topology, component decoupling mechanisms, state synchronization, and execution determinism based on project context.`;
  } else if (sectionNumber === "3.2") {
    prompt += `\nSECTION 3.2 GUIDELINES: Detail the system operational concept decisions, operational modes, execution lifecycle, user/operator interactions, event-driven state transitions, and session recovery/replay capabilities.`;
  } else if (sectionNumber === "3.3") {
    prompt += `\nSECTION 3.3 GUIDELINES: Detail the system safety, security, and privacy decisions: safety interlocks, authentication mechanisms, role-based access controls (RBAC), data privacy boundaries, and fail-safe recovery procedures.`;
  } else if (sectionNumber === "4.3") {
    prompt += `\nSECTION 4.3 GUIDELINES: Provide a Mermaid data flow diagram AND a Markdown System Interface Summary Table listing all external and internal interfaces, source/target subsystems, protocol buses, and data exchanged. Title: 'Sistem Arayüz Tasarımı ve Veri Akış Mimarisi'.
Markdown Table format:
| Interface ID | Source Subsystem / HWCI | Target Subsystem / CSCI | Protocol / Transport | Data Exchanged & Purpose |
| :--- | :--- | :--- | :--- | :--- |`;
  } else if (sectionNumber === "5.1") {
    prompt += `\nSECTION 5.1 GUIDELINES: Provide detailed design overview of component responsibilities, software module encapsulation, hardware interfacing, and internal processing logic.`;
  } else if (sectionNumber === "5.3") {
    prompt += `\nSECTION 5.3 GUIDELINES: Provide detailed Interface Data Dictionary & Signal Specification Markdown tables listing all messages, signals, payload fields, subfield structures, update rates, and parent SSS requirement IDs. Title: 'Arayüz Detaylı Özellikleri ve Veri Sözlüğü'.
Markdown Table format:
| Signal / Data ID | Signal Name | Data Type & Range | Subfields / Payload Structure | Rate / Latency | Upstream SSS Reqs |
| :--- | :--- | :--- | :--- | :--- | :--- |`;
  } else if (sectionNumber === "5.4") {
    prompt += `\nSECTION 5.4 GUIDELINES: Detail resource allocation & performance budgets: CPU core utilization, memory budgets, network bandwidth limits, and processing performance margins as Markdown tables.`;
  } else if (sectionNumber.startsWith("6")) {
    prompt += `\nSECTION 6 GUIDELINES: Summarize requirements traceability, bi-directional mapping back to parent SSS requirements, and verification coverage.`;
  }

  prompt += `\n\nQuality constraints:
- Category MUST be 'PARAGRAPH'.
- targetSectionNumber MUST be '${sectionNumber}'.
- Title MUST be specific and meaningful (e.g. 'Sistem Genel Mimarisi ve Amacı'). NEVER use 'Derived Design Description' or repeat section names.
- Content MUST be detailed, concrete, professional engineering prose (with Markdown tables or diagrams where helpful). Do NOT use generic placeholder text.`;

  try {
    const result = await generateObject({
      model: getModel(),
      schema: DerivedItemSchema,
      prompt: prompt,
    });
    return result.object.derivedItems;
  } catch (err) {
    console.error(`Failed to synthesize section ${sectionNumber}:`, err);
    return [{
      parentRequirementId: "",
      targetSectionNumber: sectionNumber,
      category: "PARAGRAPH",
      title: `${sectionTitle} Tasarım Detayı`,
      content: `Bu bölüm, MIL-STD-498 DI-IPSC-81432 ve PPI PPA-003461-5 standartlarına uygun olarak ${sectionTitle} mimari ve tasarım kararlarını detaylandırır.`,
    }];
  }
}
