import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { breakDownRequirements, DerivationContext, DerivedItemOutput } from "@/lib/ai/derivative-generator";
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
      // PASS 2: OUTLINE INITIALIZATION & GENERATION
      // ═══════════════════════════════════════════════════════════════

      await send({ progress: 18, status: "🏗️ Building target document section outline..." });

      // 1. Determine target outline sections
      const targetSections = (analysis.outline && analysis.outline.length > 0)
        ? analysis.outline
        : getSectionsForCategory(docCategory).map((s) => ({
            sectionNumber: s.section,
            sectionTitle: s.title,
            description: "",
          }));

      const targetSectionNumbers = new Set(targetSections.map((s) => s.sectionNumber));

      // 2. Batch parent requirements into chunks for generation
      const parentRequirementsOnly = parentReqs.filter((r) => r.category === "REQUIREMENT");
      const parentItemsToProcess = parentRequirementsOnly.length > 0 ? parentRequirementsOnly : parentReqs;

      const CHUNK_SIZE = 5;
      const parentChunks: (typeof parentItemsToProcess)[] = [];
      for (let i = 0; i < parentItemsToProcess.length; i += CHUNK_SIZE) {
        parentChunks.push(parentItemsToProcess.slice(i, i + CHUNK_SIZE));
      }

      const previouslyGenerated: string[] = [];
      const sectionBucket = new Map<string, DerivedItemOutput[]>();

      for (let cIdx = 0; cIdx < parentChunks.length; cIdx++) {
        const chunk = parentChunks[cIdx];
        const pct = Math.floor(20 + ((cIdx / parentChunks.length) * 70));
        await send({
          progress: pct,
          status: `⚙️ Generating design elements... (chunk ${cIdx + 1}/${parentChunks.length})`,
        });

        const derivationContext: DerivationContext = {
          projectAiContext: project?.aiContext || undefined,
          documentTitle: parentDocument?.title || undefined,
          extraInstructions: extraInstructions || undefined,
          reasoningEffort: reasoningEffort || undefined,
          language: analysis.language,
          glossary: dedupedGlossary,
          targetOutline: targetSections,
          themes: analysis.themes.length > 0 ? analysis.themes : undefined,
          previouslyGenerated: previouslyGenerated.slice(-30),
        };

        const derivedItems = await breakDownRequirements(chunk, docCategory, derivationContext);

        for (const item of derivedItems) {
          // Resolve target section number
          let secNum = item.targetSectionNumber || "3.1";
          if (!targetSectionNumbers.has(secNum)) {
            let matched = false;
            for (const tSec of targetSections) {
              if (secNum.startsWith(tSec.sectionNumber)) {
                secNum = tSec.sectionNumber;
                matched = true;
                break;
              }
            }
            if (!matched) secNum = targetSections[0]?.sectionNumber || "3.1";
          }

          const bucket = sectionBucket.get(secNum) || [];
          bucket.push(item);
          sectionBucket.set(secNum, bucket);

          previouslyGenerated.push(`${secNum}: ${item.title || item.content.slice(0, 80)}`);
        }
      }

      // 3. Sequential Tree Assembly: Write Section TITLEs and Paragraphs in exact outline order
      let currentSortOrder = 0;
      let globalIdIndex = 1;
      const generatedRequirementIds: string[] = [];

      for (const sec of targetSections) {
        const dots = (sec.sectionNumber.match(/\./g) || []).length;
        const secIndentLevel = Math.min(dots, 3);

        // Create Section TITLE node in database
        await prisma.requirement.create({
          data: {
            documentId: doc.id,
            itemNumber: sec.sectionNumber,
            uniqueId: `${docCategory}-SEC-${sec.sectionNumber}`,
            category: "TITLE",
            title: sec.sectionTitle,
            content: sec.description || "",
            sortOrder: currentSortOrder++,
            indentLevel: secIndentLevel,
          },
        });

        // Insert items for this section immediately after the TITLE node
        const sectionItems = sectionBucket.get(sec.sectionNumber) || [];
        let childIdx = 1;

        for (const item of sectionItems) {
          let itemCategory = item.category || "PARAGRAPH";
          if (docCategory === "SSDD" && itemCategory === "REQUIREMENT") {
            itemCategory = "PARAGRAPH";
          }

          let itemNumber = item.targetSectionNumber;
          if (itemCategory === "REQUIREMENT" || itemCategory === "PARAGRAPH") {
            itemNumber = `${sec.sectionNumber}.${childIdx++}`;
          }

          // Strip leading item numbers from title if AI prefixed them (e.g. "1.2.1 Title" -> "Title")
          let cleanTitle = (item.title || "").trim();
          cleanTitle = cleanTitle.replace(/^(\d+\.)+\d*\s*/, "");

          const formattedId = `${docCategory}-${String(globalIdIndex).padStart(3, "0")}`;
          globalIdIndex++;

          const dr = await prisma.requirement.create({
            data: {
              documentId: doc.id,
              itemNumber: itemNumber || sec.sectionNumber,
              uniqueId: formattedId,
              category: itemCategory,
              title: cleanTitle,
              content: item.content || "",
              sortOrder: currentSortOrder++,
              indentLevel: secIndentLevel + (itemCategory === "REQUIREMENT" ? 1 : 0),
            },
          });

          // Link to parent requirement if provided and exists
          const parentId = item.parentRequirementId;
          const parentReq = parentReqs.find(
            (pr) => pr.id === parentId || pr.uniqueId === parentId || pr.itemNumber === parentId
          );
          if (parentReq) {
            await prisma.traceabilityLink.create({
              data: {
                sourceRequirementId: dr.id,
                targetRequirementId: parentReq.id,
                linkType: "DERIVED_FROM",
              },
            });
          }

          if (itemCategory === "REQUIREMENT") {
            generatedRequirementIds.push(dr.id);
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

      // Build a mapping from id, uniqueId, and itemNumber to database UUID
      const reqIdMap = new Map<string, string>();
      for (const r of generatedReqs) {
        reqIdMap.set(r.id, r.id);
        reqIdMap.set(r.uniqueId, r.id);
        if (r.itemNumber) reqIdMap.set(r.itemNumber, r.id);
      }

      // Flag requirements that have warnings
      const dbReqWarnings = new Map<string, string[]>();
      for (const warning of validationResult.warnings) {
        if (warning.requirementId) {
          const dbId = reqIdMap.get(warning.requirementId);
          if (dbId) {
            const reasons = dbReqWarnings.get(dbId) || [];
            reasons.push(`[${warning.type}] ${warning.message}`);
            dbReqWarnings.set(dbId, reasons);
          }
        }
      }

      // Batch update flagged requirements by their actual database UUID
      for (const [dbId, reasons] of dbReqWarnings) {
        await prisma.requirement.update({
          where: { id: dbId },
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

      const flaggedCount = dbReqWarnings.size;
      const totalGenerated = generatedReqs.length;

      await send({
        progress: 100,
        status: `Complete — ${totalGenerated} requirements generated, ${flaggedCount} flagged for review (score: ${validationResult.score}/100)`,
        documentId: doc.id,
      });
    } catch (e) {
      console.error("Derivation error:", e);
      try {
        await send({ error: String(e) });
      } catch {}
    } finally {
      try {
        await writer.close();
      } catch {}
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
