import { prisma } from "@/lib/db";
import Link from "next/link";
import { ProjectList } from "./project-list";

export default async function ProjectsPage() {
  let projects: {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
    _count: { documents: number };
  }[] = [];

  try {
    projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { documents: true } },
      },
    });
  } catch {
    // DB might not be ready
  }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-subtitle">
              Manage your requirement document projects
            </p>
          </div>
        </div>
      </div>

      <ProjectList projects={projects} />
    </>
  );
}
