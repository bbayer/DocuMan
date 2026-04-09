import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { ProjectDetail } from "./project-detail";

interface Props {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: Props) {
  const { projectId } = await params;

  let project;
  try {
    project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          orderBy: { updatedAt: "desc" },
          include: {
            _count: { select: { requirements: true } },
            parentDocument: { select: { id: true, title: true } },
          },
        },
      },
    });
  } catch {
    notFound();
  }

  if (!project) notFound();

  return <ProjectDetail project={project} />;
}
