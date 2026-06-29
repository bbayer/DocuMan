import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { breakDownRequirements, DerivationContext } from "@/lib/ai/derivative-generator";

export async function POST(req: NextRequest) {
  const { projectId, parentDocumentId, title, docCategory, extraInstructions } = await req.json();

  if (!projectId || !parentDocumentId || !title || !docCategory) {
    return new Response(JSON.stringify({ error: "Missing parameters" }), { status: 400 });
  }

  // Create document
  const doc = await prisma.document.create({
    data: {
      projectId,
      parentDocumentId,
      title,
      docCategory,
      type: "DERIVATIVE",
      status: "DRAFT",
      majorVersion: 0,
      minorVersion: 1,
    },
  });

  // Fetch project context and parent document info for AI prompts
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { aiContext: true },
  });

  const parentDocument = await prisma.document.findUnique({
    where: { id: parentDocumentId },
    select: { title: true },
  });

  const parentReqs = await prisma.requirement.findMany({
    where: { documentId: parentDocumentId },
    orderBy: { sortOrder: "asc" },
  });

  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  (async () => {
    try {
      await writer.write(encoder.encode(JSON.stringify({ progress: 5, status: "Document created. Preparing breakdown..." }) + "\n"));

      let globalIdIndex = 1;

      // Filter requirements vs structural elements
      const chunks: { type: "STRUCTURAL" | "REQUIREMENTS", items: typeof parentReqs }[] = [];
      let currentReqChunk: typeof parentReqs = [];
      // Small chunk size helps avoid LLM context limits and guarantees stable json parsing
      const MAX_CHUNK_SIZE = 5;

      for (const pr of parentReqs) {
        if (pr.category === "REQUIREMENT") {
            currentReqChunk.push(pr);
            if (currentReqChunk.length >= MAX_CHUNK_SIZE) {
                chunks.push({ type: "REQUIREMENTS", items: currentReqChunk });
                currentReqChunk = [];
            }
        } else {
            if (currentReqChunk.length > 0) {
                chunks.push({ type: "REQUIREMENTS", items: currentReqChunk });
                currentReqChunk = [];
            }
            chunks.push({ type: "STRUCTURAL", items: [pr] });
        }
      }
      if (currentReqChunk.length > 0) {
          chunks.push({ type: "REQUIREMENTS", items: currentReqChunk });
      }

      let processedCount = 0;
      const totalElements = parentReqs.length;
      let globalSortOrder = 0;

      for (const chunk of chunks) {
         if (chunk.type === "STRUCTURAL") {
            const pr = chunk.items[0];
            const derivedReq = await prisma.requirement.create({
                data: {
                  documentId: doc.id,
                  itemNumber: pr.itemNumber,
                  uniqueId: `${docCategory}-${pr.uniqueId}`,
                  category: pr.category,
                  title: pr.title,
                  content: pr.content,
                  sortOrder: globalSortOrder++,
                  indentLevel: pr.indentLevel,
                },
            });
            await prisma.traceabilityLink.create({
              data: { sourceRequirementId: derivedReq.id, targetRequirementId: pr.id, linkType: "DERIVED_FROM" }
            });

            processedCount++;
            const pct = Math.floor(5 + ((processedCount / totalElements) * 90));
            await writer.write(encoder.encode(JSON.stringify({ progress: pct, status: `Copied structure: ${pr.title || "Paragraph"}` }) + "\n"));
         } else {
            // Compute section headings for this chunk — walk backwards
            // from the first item in the chunk to find ancestor TITLE items
            const firstItemIndex = parentReqs.indexOf(chunk.items[0]);
            const sectionHeadings: string[] = [];
            const seenLevels = new Set<number>();
            for (let si = firstItemIndex - 1; si >= 0; si--) {
              const pr = parentReqs[si];
              if (pr.category === "TITLE" && !seenLevels.has(pr.indentLevel)) {
                sectionHeadings.unshift(`${pr.itemNumber} ${pr.title || pr.content}`.trim());
                seenLevels.add(pr.indentLevel);
              }
            }

            // Build context for AI
            const derivationContext: DerivationContext = {
              projectAiContext: project?.aiContext || undefined,
              documentTitle: parentDocument?.title || undefined,
              sectionHeadings: sectionHeadings.length > 0 ? sectionHeadings : undefined,
              extraInstructions: extraInstructions || undefined,
            };

            // Process AI chunk
            const derivedResults = await breakDownRequirements(chunk.items, docCategory, derivationContext);

            // Save results
            for (const pr of chunk.items) {
               processedCount++;
               const relevantDerived = derivedResults.filter(d => d.parentRequirementId === pr.id);
               
               if (relevantDerived.length === 0) {
                   // Fallback 1:1 if AI omitted this item
                   const formattedId = `${docCategory}-${String(globalIdIndex).padStart(3, '0')}`;
                   globalIdIndex++;
                   const dr = await prisma.requirement.create({
                      data: {
                        documentId: doc.id,
                        itemNumber: pr.itemNumber,
                        uniqueId: formattedId,
                        category: "REQUIREMENT",
                        title: pr.title,
                        content: pr.content,
                        sortOrder: globalSortOrder++,
                        indentLevel: pr.indentLevel,
                      }
                   });
                   await prisma.traceabilityLink.create({ data: { sourceRequirementId: dr.id, targetRequirementId: pr.id, linkType: "DERIVED_FROM" } });
               } else {
                   for (let di = 0; di < relevantDerived.length; di++) {
                       const derivedItem = relevantDerived[di];
                       const formattedId = `${docCategory}-${String(globalIdIndex).padStart(3, '0')}`;
                       globalIdIndex++;
                       // Preserve parent's item number; sub-number if multiple derived from same parent
                       const derivedItemNumber = relevantDerived.length > 1
                         ? `${pr.itemNumber}.${di + 1}`
                         : pr.itemNumber;
                       const dr = await prisma.requirement.create({
                          data: {
                            documentId: doc.id,
                            itemNumber: derivedItemNumber,
                            uniqueId: formattedId,
                            category: "REQUIREMENT",
                            title: derivedItem.title,
                            content: derivedItem.content,
                            sortOrder: globalSortOrder++,
                            indentLevel: pr.indentLevel,
                          }
                       });
                       await prisma.traceabilityLink.create({ data: { sourceRequirementId: dr.id, targetRequirementId: pr.id, linkType: "DERIVED_FROM" } });
                   }
               }

               const pct = Math.floor(5 + ((processedCount / totalElements) * 90));
               await writer.write(encoder.encode(JSON.stringify({ progress: pct, status: `Processed requirements batch...` }) + "\n"));
            }
         }
      }

      await writer.write(encoder.encode(JSON.stringify({ progress: 100, status: "Complete", documentId: doc.id }) + "\n"));
    } catch (e) {
      console.error(e);
      await writer.write(encoder.encode(JSON.stringify({ error: String(e) }) + "\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
