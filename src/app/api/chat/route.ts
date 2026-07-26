import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

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
    const { messages, requirement, documentId, projectId } = await request.json();

    // ── Fetch contextual data from the database ───────────
    let projectContext = "";
    let documentContext = "";
    let sectionContext = "";
    let siblingContext = "";

    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true, aiContext: true },
      });
      if (project?.aiContext) {
        projectContext = `\nSYSTEM CONTEXT (provided by the project owner — treat as ground truth):\n${project.aiContext}\n`;
      }
    }

    if (documentId) {
      const doc = await prisma.document.findUnique({
        where: { id: documentId },
        select: { title: true, docCategory: true, type: true },
      });
      if (doc) {
        documentContext = `\nDOCUMENT: "${doc.title}" (${doc.docCategory}, ${doc.type})\n`;
      }

      // Fetch sibling requirements and section heading for local context
      if (requirement?.id) {
        const selectedReq = await prisma.requirement.findUnique({
          where: { id: requirement.id },
          select: { sortOrder: true },
        });

        if (selectedReq) {
          // Find the nearest section heading (TITLE item with lower sortOrder)
          const sectionHeading = await prisma.requirement.findFirst({
            where: {
              documentId,
              category: "TITLE",
              sortOrder: { lt: selectedReq.sortOrder },
            },
            orderBy: { sortOrder: "desc" },
            select: { itemNumber: true, title: true, content: true },
          });

          if (sectionHeading) {
            sectionContext = `\nCURRENT SECTION: ${sectionHeading.itemNumber} ${sectionHeading.title || sectionHeading.content}\n`;
          }

          // Fetch 5 requirements around the selected one (2 before, self, 2 after)
          const siblings = await prisma.requirement.findMany({
            where: {
              documentId,
              sortOrder: {
                gte: Math.max(0, selectedReq.sortOrder - 2),
                lte: selectedReq.sortOrder + 2,
              },
            },
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              itemNumber: true,
              uniqueId: true,
              category: true,
              title: true,
              content: true,
            },
          });

          if (siblings.length > 1) {
            const siblingLines = siblings.map((s) => {
              const marker = s.id === requirement.id ? " ← SELECTED" : "";
              const text = s.content.length > 200 ? s.content.substring(0, 200) + "..." : s.content;
              return `- [${s.uniqueId}] ${s.category}: ${s.title ? s.title + " — " : ""}${text}${marker}`;
            });
            siblingContext = `\nNEARBY REQUIREMENTS (for context — do NOT modify these unless explicitly asked):\n${siblingLines.join("\n")}\n`;
          }
        }
      }
    }

    // ── Build system prompt ───────────────────────────────
    const systemPrompt = `You are an expert requirements engineering assistant for a MIL-STD-498 compliant document management system called DocuMan.

Your role is to help users improve, edit, analyze, and create technical requirements.
${projectContext}${documentContext}${sectionContext}${siblingContext}
When the user references a requirement, it will be provided as context. You should:
1. Provide clear, actionable suggestions
2. When suggesting rewrites, wrap the new requirement text in a code block with \`\`\`requirement markers
3. Ensure requirements follow best practices:
   - Use "shall" for mandatory, "should" for recommended, "may" for optional
   - Be specific and measurable
   - Avoid ambiguity (no "appropriate", "as needed", "etc.", "user-friendly")
   - Include acceptance criteria where applicable
   - Each requirement must be atomic and independently testable
4. Understand MIL-STD-498 document types (SSS, SSDD, SRS, SDD, IDD, IRS, STP) and their structures
5. Maintain consistency with the system context and neighboring requirements
6. Use IEEE 830 / MIL-STD-498 language conventions

${
  requirement
    ? `SELECTED REQUIREMENT:
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
