import { NextRequest, NextResponse } from "next/server";
import { parseDocument, parseCsvDocument } from "@/lib/parsers";
import { extractRequirements } from "@/lib/ai/requirement-extractor";
import { prisma } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string;
    const useAI = formData.get("useAI") !== "false";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/csv",
      "text/tab-separated-values",
      "text/tsv",
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!allowedTypes.includes(file.type) && !["pdf", "docx", "txt", "csv", "tsv"].includes(ext || "")) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PDF, DOCX, TXT, CSV, or TSV." },
        { status: 400 }
      );
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save original file
    const uploadDir = process.env.UPLOAD_DIR || "./uploads";
    const fileId = uuidv4();
    const storagePath = path.join(uploadDir, projectId, `${fileId}-${file.name}`);
    await mkdir(path.dirname(storagePath), { recursive: true });
    await writeFile(storagePath, buffer);

    // ── CSV / TSV structured fast-path ───────────────────
    const isCsv = file.type === "text/csv" || file.type === "text/tab-separated-values" || file.type === "text/tsv" || ext === "csv" || ext === "tsv";
    if (isCsv) {
      const csvResult = await parseCsvDocument(buffer);

      if (csvResult.isStructured) {
        // Columns matched — return pre-mapped requirements directly
        return NextResponse.json({
          success: true,
          fileId,
          fileName: file.name,
          mimeType: file.type || "text/csv",
          fileSize: file.size,
          storagePath,
          documentTitle: csvResult.document.metadata.title || file.name,
          requirements: csvResult.requirements.map((req, index) => ({
            ...req,
            sortOrder: index,
            uniqueId: `REQ-${String(index + 1).padStart(3, "0")}`,
          })),
          rawTextPreview: csvResult.document.text.substring(0, 500),
          importMode: "csv-structured",
        });
      }
      // Unrecognised columns — fall through to AI extraction below
    }

    // Parse document
    const parsed = await parseDocument(buffer, file.type, file.name);

    // Extract requirements (AI or fallback)
    let extraction;
    if (useAI && process.env.AI_API_KEY) {
      extraction = await extractRequirements(parsed.text);
    } else {
      // Use fallback extraction
      extraction = await extractRequirements(parsed.text);
    }

    // Return parsed data for user review (don't save yet)
    return NextResponse.json({
      success: true,
      fileId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      storagePath,
      documentTitle: extraction.documentTitle || parsed.metadata.title || file.name,
      requirements: extraction.requirements.map((req, index) => ({
        ...req,
        sortOrder: index,
        uniqueId: `REQ-${String(index + 1).padStart(3, "0")}`,
      })),
      rawTextPreview: parsed.text.substring(0, 500),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

// Confirm and save to database
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId,
      fileId,
      fileName,
      mimeType,
      fileSize,
      storagePath,
      documentTitle,
      requirements,
    } = body;

    // Ensure user exists
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "admin@documan.local",
          name: "Admin",
          passwordHash: "dev-mode",
        },
      });
    }

    // Create document
    const doc = await prisma.document.create({
      data: {
        projectId,
        title: documentTitle,
        type: "ORIGINAL",
        docCategory: "CUSTOM",
        status: "DRAFT",
        majorVersion: 0,
        minorVersion: 1,
        originalFile: {
          create: {
            fileName,
            mimeType,
            storagePath,
            fileSize,
          },
        },
      },
    });

    // Create initial document version
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        majorVersion: 0,
        minorVersion: 1,
        status: "DRAFT",
        changeDescription: "Initial upload and AI extraction",
        createdById: user.id,
      },
    });

    // Save requirements
    for (let i = 0; i < requirements.length; i++) {
      const req = requirements[i];
      await prisma.requirement.create({
        data: {
          documentId: doc.id,
          itemNumber: req.itemNumber || "",
          uniqueId: req.uniqueId || `REQ-${String(i + 1).padStart(3, "0")}`,
          category: req.category || "PARAGRAPH",
          title: req.title || "",
          content: req.content || "",
          sortOrder: req.sortOrder ?? i,
          indentLevel: req.indentLevel ?? 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      documentId: doc.id,
    });
  } catch (error) {
    console.error("Save error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Save failed" },
      { status: 500 }
    );
  }
}
