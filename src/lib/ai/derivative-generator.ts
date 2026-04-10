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

/**
 * Iterates through a chunk of parent requirements and breaks them down.
 * @param parentChunk Array of parent requirements (which must only be of category "REQUIREMENT")
 * @param docCategory The type of target document (SSS, SRS, SDD, STP, IRS)
 */
export async function breakDownRequirements(
  parentChunk: { id: string; content: string; title: string }[],
  docCategory: string
): Promise<DerivedRequirementOutput[]> {
  if (parentChunk.length === 0) return [];

  // Determine system prompt based on category
  let systemContext = "You are an expert Systems Engineer.";
  if (docCategory === "SSS") {
    systemContext += " Analyze the upstream requirements and synthesize overarching System/Subsystem Specifications. Describe system boundaries, operational capabilities, and behavioral models.";
  } else if (docCategory === "SRS") {
    systemContext += " Analyze the upstream requirements and break them down into granular, atomic, and testable Software Requirements (functional, non-functional, interface constraints).";
  } else if (docCategory === "SDD") {
    systemContext += " Translate the upstream requirements into Software Design Descriptions. Describe architecture constraints, modules, components, and database structures.";
  } else if (docCategory === "STP") {
    systemContext += " Frame the upstream requirements as Software Test Plans. Describe testable verification procedures and overarching test cases needed to satisfy the requirements.";
  } else if (docCategory === "IRS") {
    systemContext += " Extract external system boundaries, protocols, and data exchange formats for an Interface Requirements Specification.";
  } else {
    systemContext += " Break down the upstream requirements into logically structured, atomic, and granular lower-level elements tailored for technical implementation.";
  }

  // Construct input representing the chunk
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
    const result = await generateObject({
      model: getModel(),
      schema: DerivedRequirementSchema,
      prompt: prompt,
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
