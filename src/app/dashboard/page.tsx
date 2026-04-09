import { prisma } from "@/lib/db";
import Link from "next/link";

export default async function DashboardPage() {
  let projects: { id: string; name: string; description: string; createdAt: Date; _count: { documents: number } }[] = [];

  try {
    projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        _count: { select: { documents: true } },
      },
    });
  } catch {
    // DB might not exist yet
  }

  const stats = [
    {
      label: "Projects",
      value: projects.length,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      ),
      color: "var(--color-accent)",
    },
    {
      label: "Documents",
      value: projects.reduce((sum, p) => sum + p._count.documents, 0),
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
      ),
      color: "var(--color-success)",
    },
    {
      label: "Published",
      value: "—",
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
      color: "var(--color-published)",
    },
  ];

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Welcome to DocuMan — your AI-powered requirements management system
        </p>
      </div>

      {/* Stats */}
      <div className="card-grid stagger-in" style={{ marginBottom: "var(--space-8)" }}>
        {stats.map((stat) => (
          <div className="card" key={stat.label}>
            <div className="flex items-center gap-4">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "var(--radius-md)",
                  background: `color-mix(in srgb, ${stat.color} 12%, transparent)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: stat.color,
                  flexShrink: 0,
                }}
              >
                {stat.icon}
              </div>
              <div>
                <div
                  style={{
                    fontSize: "var(--font-size-2xl)",
                    fontWeight: 800,
                    color: "var(--color-text-primary)",
                    lineHeight: 1,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{
                    fontSize: "var(--font-size-sm)",
                    color: "var(--color-text-tertiary)",
                    marginTop: "var(--space-1)",
                  }}
                >
                  {stat.label}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Projects */}
      <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-5)" }}>
        <h2 style={{ fontSize: "var(--font-size-xl)", fontWeight: 700 }}>
          Recent Projects
        </h2>
        <Link href="/dashboard/projects" className="btn btn-secondary btn-sm">
          View All
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <div className="empty-state-title">No projects yet</div>
            <p className="empty-state-description">
              Create your first project to start managing requirements with AI-powered extraction and traceability.
            </p>
            <Link href="/dashboard/projects" className="btn btn-primary" id="create-first-project">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Project
            </Link>
          </div>
        </div>
      ) : (
        <div className="card-grid stagger-in">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              style={{ textDecoration: "none" }}
            >
              <div className="card card-interactive">
                <div className="card-title">{project.name}</div>
                <div className="card-description">
                  {project.description || "No description"}
                </div>
                <div className="card-meta">
                  <span>{project._count.documents} document{project._count.documents !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
