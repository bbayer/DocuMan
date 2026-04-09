import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { NextRequest } from "next/server";

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

export async function POST(request: NextRequest) {
  try {
    const { messages, requirement } = await request.json();

    const systemPrompt = `You are an expert requirements engineering assistant for a MIL-STD-498 compliant document management system called DocuMan.

Your role is to help users improve, edit, analyze, and create technical requirements.

When the user references a requirement, it will be provided as context. You should:
1. Provide clear, actionable suggestions
2. When suggesting rewrites, wrap the new requirement text in a code block with \`\`\`requirement markers
3. Ensure requirements follow best practices:
   - Use "shall" for mandatory, "should" for recommended, "may" for optional
   - Be specific and measurable
   - Avoid ambiguity
   - Include acceptance criteria where applicable
4. Understand MIL-STD-498 document types (SRS, SDD, STP, IRS) and their structures

${
  requirement
    ? `CURRENT REQUIREMENT CONTEXT:
- ID: ${requirement.uniqueId}
- Category: ${requirement.category}
- Title: ${requirement.title || "(no title)"}
- Content: ${requirement.content}`
    : ""
}

Be concise. Focus on practical, implementable improvements.`;

    const result = streamText({
      model: getModel(),
      system: systemPrompt,
      messages,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Chat failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
