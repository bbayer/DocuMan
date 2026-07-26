import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { breakDownRequirements, DerivationContext } from "@/lib/ai/derivative-generator";
import { analyzeSourceDocument } from "@/lib/ai/document-analyzer";
import { validateRequirements, mergeWithDefaults, type RequirementInput } from "@/lib/ai/quality-validator";
import { getSectionsForCategory } from "@/lib/standards/j-std-016";

export async function POST(req: NextRequest) {
  const { projectId, parentDocumentId, title, docCategory, extraInstructions, reasoningEffort } = await req.json();

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
      aiPrompt: extraInstructions?.trim() || "",
    },
  });

  // Fetch project context, glossary, and parent document info
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { aiContext: true },
  });

  const existingGlossary = await prisma.glossaryTerm.findMany({
    where: { projectId },
    orderBy: { term: "asc" },
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

  const send = async (data: Record<string, unknown>) => {
    await writer.write(encoder.encode(JSON.stringify(data) + "\n"));
  };

  (async () => {
    try {
      // ═══════════════════════════════════════════════════════════════
      // PASS 1: ANALYSIS — single LLM call to scan the source document
      // ═══════════════════════════════════════════════════════════════

      await send({ progress: 2, status: "📊 Analyzing source document structure..." });

      const analysisInput = parentReqs.map((r) => ({
        itemNumber: r.itemNumber,
        category: r.category,
        title: r.title,
        content: r.content,
      }));

      const analysis = await analyzeSourceDocument(
        parentDocument?.title || title,
        analysisInput,
        docCategory,
        project?.aiContext || undefined,
      );

      await send({ progress: 8, status: "📊 Extracting terminology glossary..." });

      // Upsert glossary terms — merge with existing project glossary, don't overwrite user edits
      for (const g of analysis.glossary) {
        const existing = existingGlossary.find(
          (eg) => eg.term.toLowerCase() === g.term.toLowerCase()
        );
        if (!existing) {
          await prisma.glossaryTerm.create({
            data: {
              projectId,
              term: g.term,
              definition: g.definition,
              aliases: g.aliases.join(", "),
              source: parentDocument?.title || title,
            },
          });
        }
      }

      await send({ progress: 12, status: "📊 Mapping to J-STD-016 section outline..." });

      // Merge validation dictionary with hardcoded defaults
      const validationDictionary = mergeWithDefaults(
        analysis.language,
        analysis.validationDictionary,
      );

      // Save analysis metadata on the document
      const generationMeta = {
        analysis: {
          language: analysis.language,
          glossaryCount: analysis.glossary.length,
          outlineSections: analysis.outline.length,
          themes: analysis.themes,
          interfaces: analysis.interfaces,
        },
        validationDictionary,
      };

      await prisma.document.update({
        where: { id: doc.id },
        data: { generationMeta: JSON.stringify(generationMeta) },
      });

      await send({ progress: 15, status: "✅ Analysis complete. Starting requirement generation..." });

      // Build combined glossary for generation context (existing + newly extracted)
      const combinedGlossary = [
        ...existingGlossary.map((g) => ({ term: g.term, definition: g.definition })),
        ...analysis.glossary.map((g) => ({ term: g.term, definition: g.definition })),
      ];
      // Deduplicate by term
      const glossaryMap = new Map<string, { term: string; definition: string }>();
      for (const g of combinedGlossary) {
        glossaryMap.set(g.term.toLowerCase(), g);
      }
      const dedupedGlossary = Array.from(glossaryMap.values());

      // ═══════════════════════════════════════════════════════════════
      // PASS 2: GENERATION — chunked, with cross-chunk memory
      // ═══════════════════════════════════════════════════════════════

      let globalIdIndex = 1;
      const previouslyGenerated: string[] = []; // Running summary for dedup

      // Filter requirements vs structural elements
      const chunks: { type: "STRUCTURAL" | "REQUIREMENTS", items: typeof parentReqs }[] = [];
      let currentReqChunk: typeof parentReqs = [];
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
      let chunkIndex = 0;
      const totalChunks = chunks.filter((c) => c.type === "REQUIREMENTS").length;

      // Track all generated requirement IDs for validation pass
      const generatedRequirementIds: string[] = [];

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
            const pct = Math.floor(15 + ((processedCount / totalElements) * 75));
            await send({ progress: pct, status: `Copied structure: ${pr.title || "Paragraph"}` });
         } else {
            chunkIndex++;
            // Compute section headings for this chunk
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

            // Build context with cross-chunk memory
            const derivationContext: DerivationContext = {
              projectAiContext: project?.aiContext || undefined,
              documentTitle: parentDocument?.title || undefined,
              sectionHeadings: sectionHeadings.length > 0 ? sectionHeadings : undefined,
              extraInstructions: extraInstructions || undefined,
              reasoningEffort: reasoningEffort || undefined,
              // ── New: analysis pass outputs ──
              language: analysis.language,
              glossary: dedupedGlossary,
              targetOutline: analysis.outline.map((s) => ({
                sectionNumber: s.sectionNumber,
                sectionTitle: s.sectionTitle,
              })),
              themes: analysis.themes.length > 0 ? analysis.themes : undefined,
              previouslyGenerated: previouslyGenerated.length > 0 ? previouslyGenerated : undefined,
            };

            const pctBefore = Math.floor(15 + ((processedCount / totalElements) * 75));
            await send({ progress: pctBefore, status: `⚙️ Generating requirements... (chunk ${chunkIndex}/${totalChunks})` });

            // Process AI chunk
            const derivedResults = await breakDownRequirements(chunk.items, docCategory, derivationContext);

            // Save results
            for (const pr of chunk.items) {
               processedCount++;
               const relevantDerived = derivedResults.filter(d => d.parentRequirementId === pr.id);
               
               if (relevantDerived.length === 0) {
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
                   generatedRequirementIds.push(dr.id);
                   // Add to running summary for next chunk
                   previouslyGenerated.push(`${formattedId}: ${pr.title || pr.content.slice(0, 80)}`);
               } else {
                   for (let di = 0; di < relevantDerived.length; di++) {
                       const derivedItem = relevantDerived[di];
                       const formattedId = `${docCategory}-${String(globalIdIndex).padStart(3, '0')}`;
                       globalIdIndex++;
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
                       generatedRequirementIds.push(dr.id);
                       // Add to running summary for next chunk
                       previouslyGenerated.push(`${formattedId}: ${derivedItem.title || derivedItem.content.slice(0, 80)}`);
                   }
               }

               const pct = Math.floor(15 + ((processedCount / totalElements) * 75));
               await send({ progress: pct, status: `⚙️ Generating requirements... (chunk ${chunkIndex}/${totalChunks})` });
            }
         }
      }

      // ═══════════════════════════════════════════════════════════════
      // PASS 3: VALIDATION — deterministic quality checks (no LLM)
      // ═══════════════════════════════════════════════════════════════

      await send({ progress: 92, status: "✅ Validating generated requirements..." });

      // Fetch all generated requirements for validation
      const generatedReqs = await prisma.requirement.findMany({
        where: {
          documentId: doc.id,
          category: "REQUIREMENT",
        },
        orderBy: { sortOrder: "asc" },
      });

      const requirementInputs: RequirementInput[] = generatedReqs.map((r) => ({
        id: r.id,
        uniqueId: r.uniqueId,
        title: r.title,
        content: r.content,
        category: r.category,
        itemNumber: r.itemNumber,
      }));

      // Build glossary entries for validation
      const glossaryEntries = dedupedGlossary.map((g) => {
        const aliasEntry = analysis.glossary.find(
          (ag) => ag.term.toLowerCase() === g.term.toLowerCase()
        );
        return {
          term: g.term,
          aliases: aliasEntry ? aliasEntry.aliases.join(", ") : "",
        };
      });

      // Get expected sections for completeness check
      const expectedSections = getSectionsForCategory(docCategory);

      const validationResult = validateRequirements(
        requirementInputs,
        validationDictionary,
        glossaryEntries,
        expectedSections,
      );

      await send({ progress: 95, status: "✅ Flagging requirements for review..." });

      // Flag requirements that have warnings
      const requirementWarnings = new Map<string, string[]>();
      for (const warning of validationResult.warnings) {
        if (warning.requirementId) {
          const reasons = requirementWarnings.get(warning.requirementId) || [];
          reasons.push(`[${warning.type}] ${warning.message}`);
          requirementWarnings.set(warning.requirementId, reasons);
        }
      }

      // Batch update flagged requirements
      for (const [reqId, reasons] of requirementWarnings) {
        await prisma.requirement.update({
          where: { id: reqId },
          data: {
            requiresReview: true,
            reviewReason: reasons.join(" | "),
          },
        });
      }

      // Save validation results in generationMeta
      const fullGenerationMeta = {
        ...generationMeta,
        validation: {
          score: validationResult.score,
          stats: validationResult.stats,
          warningCount: validationResult.warnings.length,
        },
      };

      await prisma.document.update({
        where: { id: doc.id },
        data: { generationMeta: JSON.stringify(fullGenerationMeta) },
      });

      const flaggedCount = requirementWarnings.size;
      const totalGenerated = generatedReqs.length;

      await send({
        progress: 100,
        status: `Complete — ${totalGenerated} requirements generated, ${flaggedCount} flagged for review (score: ${validationResult.score}/100)`,
        documentId: doc.id,
      });
    } catch (e) {
      console.error(e);
      await send({ error: String(e) });
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
