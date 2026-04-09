"use client";

import { useState } from "react";
import Link from "next/link";
import { createDerivativeDocument } from "@/app/actions";
import { useRouter } from "next/navigation";

interface Document {
  id: string;
  title: string;
  type: string;
  docCategory: string;
  status: string;
  majorVersion: number;
  minorVersion: number;
  createdAt: Date;
  updatedAt: Date;
  parentDocument: { id: string; title: string } | null;
  _count: { requirements: number };
}

interface Project {
  id: string;
  name: string;
  description: string;
  documents: Document[];
}

const statusBadgeClass: Record<string, string> = {
  DRAFT: "badge badge-draft",
  REVIEW: "badge badge-review",
  PUBLISHED: "badge badge-published",
};

const categoryLabels: Record<string, string> = {
  SRS: "Software Requirements Specification",
  SDD: "Software Design Description",
  STP: "Software Test Plan",
  IRS: "Interface Requirements Specification",
  CUSTOM: "Custom Document",
};

export function ProjectDetail({ project }: { project: Project }) {
  const [showDeriveModal, setShowDeriveModal] = useState(false);
  const [deriveFrom, setDeriveFrom] = useState<string>("");
  const [deriveCategory, setDeriveCategory] = useState("SRS");
  const [deriveTitle, setDeriveTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const originalDocs = project.documents.filter((d) => d.type === "ORIGINAL");
  const derivativeDocs = project.documents.filter((d) => d.type === "DERIVATIVE");

  async function handleDerive() {
    if (!deriveFrom || !deriveTitle.trim()) return;
    setLoading(true);
    const result = await createDerivativeDocument(
      project.id,
      deriveFrom,
      deriveTitle.trim(),
      deriveCategory
    );
    setLoading(false);
    setShowDeriveModal(false);
    if (result.document) {
      router.push(
        `/dashboard/projects/${project.id}/documents/${result.document.id}`
      );
    }
  }

  return (
    <>
      <div className="page-header">
        <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-2)" }}>
          <Link
            href="/dashboard/projects"
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "-8px" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Projects
          </Link>
        </div>
        <h1 className="page-title">{project.name}</h1>
        {project.description && (
          <p className="page-subtitle">{project.description}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-6)" }}>
        <Link
          href={`/dashboard/projects/${project.id}/upload`}
          className="btn btn-primary"
          id="upload-document-btn"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Document
        </Link>
        {originalDocs.length > 0 && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setDeriveFrom(originalDocs[0].id);
              setShowDeriveModal(true);
            }}
            id="create-derivative-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            Create Derivative
          </button>
        )}
      </div>

      {/* Original Documents */}
      <div style={{ marginBottom: "var(--space-8)" }}>
        <h2
          style={{
            fontSize: "var(--font-size-lg)",
            fontWeight: 700,
            marginBottom: "var(--space-4)",
          }}
        >
          Original Documents
        </h2>
        {originalDocs.length === 0 ? (
          <div className="card">
            <div className="empty-state" style={{ padding: "var(--space-10)" }}>
              <div className="empty-state-title">No documents uploaded</div>
              <p className="empty-state-description">
                Upload a PDF, DOCX, or TXT file to extract requirements using AI.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 stagger-in">
            {originalDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                projectId={project.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Derivative Documents */}
      {derivativeDocs.length > 0 && (
        <div>
          <h2
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: 700,
              marginBottom: "var(--space-4)",
            }}
          >
            Derivative Documents
          </h2>
          <div className="flex flex-col gap-3 stagger-in">
            {derivativeDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                projectId={project.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create Derivative Modal */}
      {showDeriveModal && (
        <div className="modal-overlay" onClick={() => setShowDeriveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create Derivative Document</h2>
              <p className="modal-description">
                Generate a new document from an original, with requirement-level traceability.
              </p>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label" htmlFor="derive-source">
                  Source Document
                </label>
                <select
                  className="select"
                  id="derive-source"
                  value={deriveFrom}
                  onChange={(e) => setDeriveFrom(e.target.value)}
                >
                  {originalDocs.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="derive-category">
                  Document Type (MIL-STD-498)
                </label>
                <select
                  className="select"
                  id="derive-category"
                  value={deriveCategory}
                  onChange={(e) => {
                    setDeriveCategory(e.target.value);
                    const source = originalDocs.find((d) => d.id === deriveFrom);
                    setDeriveTitle(
                      `${source?.title || "Document"} — ${
                        categoryLabels[e.target.value] || e.target.value
                      }`
                    );
                  }}
                >
                  <option value="SRS">SRS — Software Requirements Specification</option>
                  <option value="SDD">SDD — Software Design Description</option>
                  <option value="STP">STP — Software Test Plan</option>
                  <option value="IRS">IRS — Interface Requirements Specification</option>
                  <option value="CUSTOM">Custom Document</option>
                </select>
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="derive-title">
                  Document Title
                </label>
                <input
                  className="input"
                  id="derive-title"
                  type="text"
                  value={deriveTitle}
                  onChange={(e) => setDeriveTitle(e.target.value)}
                  placeholder="e.g. Flight Control System SRS"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeriveModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleDerive}
                disabled={loading || !deriveTitle.trim() || !deriveFrom}
                id="submit-derive-btn"
              >
                {loading ? (
                  <>
                    <span className="spinner" /> Generating...
                  </>
                ) : (
                  "Generate Document"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DocumentCard({
  doc,
  projectId,
}: {
  doc: Document;
  projectId: string;
}) {
  return (
    <Link
      href={`/dashboard/projects/${projectId}/documents/${doc.id}`}
      style={{ textDecoration: "none" }}
    >
      <div className="card card-interactive">
        <div className="flex items-center justify-between">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-1)" }}>
              <span className="card-title" style={{ marginBottom: 0 }}>
                {doc.title}
              </span>
              <span className={statusBadgeClass[doc.status] || "badge"}>
                {doc.status}
              </span>
              {doc.docCategory !== "CUSTOM" && (
                <span className="badge badge-requirement">
                  {doc.docCategory}
                </span>
              )}
            </div>
            <div className="card-meta" style={{ marginTop: "var(--space-2)" }}>
              <span>v{doc.majorVersion}.{doc.minorVersion}</span>
              <span>·</span>
              <span>{doc._count.requirements} requirements</span>
              {doc.parentDocument && (
                <>
                  <span>·</span>
                  <span>Derived from: {doc.parentDocument.title}</span>
                </>
              )}
              <span>·</span>
              <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
    </Link>
  );
}
