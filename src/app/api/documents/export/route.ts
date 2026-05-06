import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ error: "Missing documentId" }, { status: 400 });
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      title: true,
      type: true,
      docCategory: true,
      status: true,
      majorVersion: true,
      minorVersion: true,
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const requirements = await prisma.requirement.findMany({
    where: { documentId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      itemNumber: true,
      uniqueId: true,
      category: true,
      title: true,
      content: true,
      sortOrder: true,
      indentLevel: true,
      sourceLinks: {
        select: {
          linkType: true,
          isSuspect: true,
          targetRequirement: {
            select: {
              id: true,
              uniqueId: true,
              itemNumber: true,
              title: true,
              content: true,
            },
          },
        },
      },
      targetLinks: {
        select: {
          linkType: true,
          isSuspect: true,
          sourceRequirement: {
            select: {
              id: true,
              uniqueId: true,
              itemNumber: true,
              title: true,
              content: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({ document, requirements });
}
