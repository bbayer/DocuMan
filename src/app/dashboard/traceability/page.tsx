import { prisma } from "@/lib/db";

export default async function TraceabilityPage() {
  let documents: {
    id: string;
    title: string;
    docCategory: string;
    type: string;
    project: { id: string; name: string };
    requirements: {
      id: string;
      uniqueId: string;
      title: string;
      sourceLinks: {
        id: string;
        linkType: string;
        isSuspect: boolean;
        targetRequirement: { id: string; uniqueId: string; title: string };
      }[];
    }[];
  }[] = [];

  try {
    documents = await prisma.document.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        requirements: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            uniqueId: true,
            title: true,
            sourceLinks: {
              include: {
                targetRequirement: {
                  select: { id: true, uniqueId: true, title: true },
                },
              },
            },
          },
        },
      },
    });
  } catch {
    // DB might not be ready
  }

  const totalLinks = documents.reduce(
    (sum, doc) =>
      sum + doc.requirements.reduce((s, r) => s + r.sourceLinks.length, 0),
    0
  );

  const suspectLinks = documents.reduce(
    (sum, doc) =>
      sum +
      doc.requirements.reduce(
        (s, r) => s + r.sourceLinks.filter((l) => l.isSuspect).length,
        0
      ),
    0
  );

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Traceability</h1>
        <p className="page-subtitle">
          Cross-document requirement traceability overview
        </p>
      </div>

      {/* Stats */}
      <div className="card-grid" style={{ marginBottom: "var(--space-8)" }}>
        <div className="card">
          <div className="flex items-center gap-4">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-md)",
                background: "var(--color-accent-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-accent)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800 }}>
                {totalLinks}
              </div>
              <div className="text-sm text-secondary">Total Links</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-4">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-md)",
                background: suspectLinks > 0 ? "var(--color-warning-muted)" : "var(--color-success-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: suspectLinks > 0 ? "var(--color-warning)" : "var(--color-success)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800 }}>
                {suspectLinks}
              </div>
              <div className="text-sm text-secondary">Suspect Links</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-4">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-md)",
                background: "var(--color-success-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-success)",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "var(--font-size-2xl)", fontWeight: 800 }}>
                {documents.length}
              </div>
              <div className="text-sm text-secondary">Documents</div>
            </div>
          </div>
        </div>
      </div>

      {/* Document traceability list */}
      {documents
        .filter((doc) => doc.requirements.some((r) => r.sourceLinks.length > 0))
        .map((doc) => (
          <div key={doc.id} className="card" style={{ marginBottom: "var(--space-4)" }}>
            <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-3)" }}>
              <span className="font-bold">{doc.title}</span>
              <span className="badge badge-requirement">{doc.docCategory}</span>
              <span className="text-xs text-tertiary">{doc.project.name}</span>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Source Requirement</th>
                    <th>Link Type</th>
                    <th>Target Requirement</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.requirements
                    .flatMap((req) =>
                      req.sourceLinks.map((link) => ({
                        sourceId: req.uniqueId,
                        sourceTitle: req.title,
                        linkType: link.linkType,
                        targetId: link.targetRequirement.uniqueId,
                        targetTitle: link.targetRequirement.title,
                        isSuspect: link.isSuspect,
                      }))
                    )
                    .map((link, i) => (
                      <tr key={i}>
                        <td>
                          <span className="font-semibold">{link.sourceId}</span>
                          {link.sourceTitle && (
                            <span className="text-xs text-secondary" style={{ marginLeft: "var(--space-2)" }}>
                              {link.sourceTitle}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="badge badge-paragraph">
                            {link.linkType.replace("_", " ")}
                          </span>
                        </td>
                        <td>
                          <span className="font-semibold">{link.targetId}</span>
                          {link.targetTitle && (
                            <span className="text-xs text-secondary" style={{ marginLeft: "var(--space-2)" }}>
                              {link.targetTitle}
                            </span>
                          )}
                        </td>
                        <td>
                          {link.isSuspect ? (
                            <span className="badge badge-note">⚠ Suspect</span>
                          ) : (
                            <span className="badge badge-published">✓ Valid</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {documents.every((doc) => doc.requirements.every((r) => r.sourceLinks.length === 0)) && (
        <div className="card">
          <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <div className="empty-state-title">No traceability links yet</div>
            <p className="empty-state-description">
              Create derivative documents to establish requirement-level traceability.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
