import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { DocumentEditor } from "./document-editor";

interface Props {
  params: Promise<{ projectId: string; documentId: string }>;
}

export default async function DocumentPage({ params }: Props) {
  const { projectId, documentId } = await params;

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      requirements: {
        orderBy: { sortOrder: "asc" },
        include: {
          sourceLinks: {
            include: {
              targetRequirement: {
                select: { id: true, uniqueId: true, title: true, content: true },
              },
            },
          },
          targetLinks: {
            include: {
              sourceRequirement: {
                select: { id: true, uniqueId: true, title: true, content: true },
              },
            },
          },
          versions: {
            orderBy: { version: "desc" },
            take: 5,
          },
        },
      },
      parentDocument: { select: { id: true, title: true } },
      derivatives: { select: { id: true, title: true, docCategory: true, status: true } },
    },
  });

  if (!document) notFound();

  return (
    <DocumentEditor
      document={JSON.parse(JSON.stringify(document))}
      projectId={projectId}
    />
  );
}
