"use client";

import { useState } from "react";
import Link from "next/link";
import {
  updateRequirement,
  addRequirement,
  deleteRequirement,
  updateDocumentStatus,
} from "@/app/actions";
import { AIChatPanel } from "./ai-chat-panel";

interface Requirement {
  id: string;
  itemNumber: string;
  uniqueId: string;
  category: string;
  title: string;
  content: string;
  sortOrder: number;
  indentLevel: number;
  sourceLinks: {
    id: string;
    linkType: string;
    isSuspect: boolean;
    targetRequirement: { id: string; uniqueId: string; title: string; content: string };
  }[];
  targetLinks: {
    id: string;
    linkType: string;
    isSuspect: boolean;
    sourceRequirement: { id: string; uniqueId: string; title: string; content: string };
  }[];
  versions: { id: string; version: number; content: string; createdAt: string }[];
}

interface Document {
  id: string;
  title: string;
  type: string;
  docCategory: string;
  status: string;
  majorVersion: number;
  minorVersion: number;
  parentDocument: { id: string; title: string } | null;
  derivatives: { id: string; title: string; docCategory: string; status: string }[];
  requirements: Requirement[];
}

const categoryColors: Record<string, string> = {
  TITLE: "badge-title",
  REQUIREMENT: "badge-requirement",
  PARAGRAPH: "badge-paragraph",
  NOTE: "badge-note",
};

const statusBadge: Record<string, string> = {
  DRAFT: "badge badge-draft",
  REVIEW: "badge badge-review",
  PUBLISHED: "badge badge-published",
};

export function DocumentEditor({
  document: doc,
  projectId,
}: {
  document: Document;
  projectId: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReq, setChatReq] = useState<Requirement | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showVersions, setShowVersions] = useState<string | null>(null);

  const isEditable = doc.status !== "PUBLISHED";

  async function handleSave(reqId: string) {
    await updateRequirement(reqId, editContent, editTitle, projectId, doc.id);
    setEditingId(null);
  }

  async function handleAdd(formData: FormData) {
    const maxOrder = Math.max(...doc.requirements.map((r) => r.sortOrder), 0);
    await addRequirement(
      doc.id,
      {
        itemNumber: formData.get("itemNumber") as string,
        uniqueId: `REQ-${String(doc.requirements.length + 1).padStart(3, "0")}`,
        category: formData.get("category") as string,
        title: formData.get("title") as string,
        content: formData.get("content") as string,
        sortOrder: maxOrder + 1,
        indentLevel: parseInt(formData.get("indentLevel") as string) || 0,
      },
      projectId
    );
    setShowAddForm(false);
  }

  async function handleDelete(reqId: string) {
    if (!confirm("Delete this requirement?")) return;
    await deleteRequirement(reqId, projectId, doc.id);
  }

  async function handleStatusChange(newStatus: string) {
    if (newStatus === "PUBLISHED") {
      const suspectLinks = doc.requirements.some(
        (r) =>
          r.sourceLinks.some((l) => l.isSuspect) ||
          r.targetLinks.some((l) => l.isSuspect)
      );
      if (suspectLinks) {
        if (
          !confirm(
            "There are suspect traceability links. Publish anyway?"
          )
        )
          return;
      }
      if (!confirm(`Publish as v${doc.majorVersion + 1}.0? This will freeze the document.`))
        return;
    }
    await updateDocumentStatus(doc.id, newStatus, projectId);
  }

  function openChat(req: Requirement) {
    setChatReq(req);
    setChatOpen(true);
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3" style={{ marginBottom: "var(--space-2)" }}>
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "-8px" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="page-title" style={{ fontSize: "var(--font-size-2xl)" }}>
                {doc.title}
              </h1>
              <span className={statusBadge[doc.status]}>{doc.status}</span>
              {doc.docCategory !== "CUSTOM" && (
                <span className="badge badge-requirement">{doc.docCategory}</span>
              )}
            </div>
            <div className="flex items-center gap-4" style={{ marginTop: "var(--space-2)" }}>
              <span className="text-sm text-secondary">
                v{doc.majorVersion}.{doc.minorVersion}
              </span>
              <span className="text-sm text-secondary">
                {doc.requirements.length} requirements
              </span>
              {doc.type === "DERIVATIVE" && doc.parentDocument && (
                <span className="text-sm text-secondary">
                  Derived from:{" "}
                  <Link
                    href={`/dashboard/projects/${projectId}/documents/${doc.parentDocument.id}`}
                    style={{ color: "var(--color-accent)" }}
                  >
                    {doc.parentDocument.title}
                  </Link>
                </span>
              )}
            </div>
          </div>

          {/* Status actions */}
          <div className="flex items-center gap-3">
            {doc.status === "DRAFT" && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleStatusChange("REVIEW")}
                id="move-to-review-btn"
              >
                Move to Review
              </button>
            )}
            {doc.status === "REVIEW" && (
              <>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleStatusChange("DRAFT")}
                >
                  Back to Draft
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleStatusChange("PUBLISHED")}
                  id="publish-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Publish
                </button>
              </>
            )}
            {doc.status === "PUBLISHED" && (
              <span className="text-sm text-secondary" style={{ fontStyle: "italic" }}>
                Published — read only
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Derivatives section */}
      {doc.derivatives.length > 0 && (
        <div
          className="card"
          style={{ marginBottom: "var(--space-5)", padding: "var(--space-4) var(--space-5)" }}
        >
          <div className="text-sm font-semibold" style={{ marginBottom: "var(--space-2)" }}>
            Derivative Documents
          </div>
          <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
            {doc.derivatives.map((d) => (
              <Link
                key={d.id}
                href={`/dashboard/projects/${projectId}/documents/${d.id}`}
                className="badge badge-requirement"
                style={{ textDecoration: "none", cursor: "pointer" }}
              >
                {d.docCategory}: {d.title}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Add requirement button */}
      {isEditable && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowAddForm(!showAddForm)}
            id="add-requirement-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Requirement
          </button>
        </div>
      )}

      {/* Add requirement form */}
      {showAddForm && (
        <div className="card" style={{ marginBottom: "var(--space-5)" }}>
          <form action={handleAdd}>
            <div className="flex gap-4" style={{ flexWrap: "wrap" }}>
              <div className="input-group" style={{ flex: "0 0 100px" }}>
                <label className="input-label">Item #</label>
                <input className="input" name="itemNumber" placeholder="3.2.1" />
              </div>
              <div className="input-group" style={{ flex: "0 0 160px" }}>
                <label className="input-label">Category</label>
                <select className="select" name="category" defaultValue="REQUIREMENT">
                  <option value="TITLE">Title</option>
                  <option value="REQUIREMENT">Requirement</option>
                  <option value="PARAGRAPH">Paragraph</option>
                  <option value="NOTE">Note</option>
                </select>
              </div>
              <div className="input-group" style={{ flex: "0 0 80px" }}>
                <label className="input-label">Indent</label>
                <input className="input" name="indentLevel" type="number" defaultValue="0" min="0" max="3" />
              </div>
              <div className="input-group" style={{ flex: 1, minWidth: "200px" }}>
                <label className="input-label">Title</label>
                <input className="input" name="title" placeholder="Requirement title" />
              </div>
            </div>
            <div className="input-group" style={{ marginTop: "var(--space-3)" }}>
              <label className="input-label">Content</label>
              <textarea className="textarea" name="content" rows={3} placeholder="Requirement content..." />
            </div>
            <div className="flex items-center gap-3" style={{ marginTop: "var(--space-4)", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">Add</button>
            </div>
          </form>
        </div>
      )}

      {/* Requirements list */}
      <div className="card" style={{ padding: 0 }}>
        <div className="req-list">
          {doc.requirements.map((req) => (
            <div key={req.id}>
              <div className={`req-row req-indent-${Math.min(req.indentLevel, 3)}`}>
                <span className="req-item-number">{req.itemNumber}</span>
                <span className={`badge ${categoryColors[req.category] || "badge-paragraph"}`}>
                  {req.category === "REQUIREMENT" ? "REQ" : req.category.substring(0, 4)}
                </span>

                {editingId === req.id ? (
                  /* Editing mode */
                  <div className="req-content" style={{ flex: 1 }}>
                    <input
                      className="input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title"
                      style={{ marginBottom: "var(--space-2)", height: 34 }}
                    />
                    <textarea
                      className="textarea"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                    />
                    <div className="flex items-center gap-2" style={{ marginTop: "var(--space-2)" }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSave(req.id)}>
                        Save
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View mode */
                  <div className="req-content" style={{ flex: 1 }}>
                    {req.title && <div className="req-content-title">{req.title}</div>}
                    <div className="req-content-text">{req.content}</div>

                    {/* Traceability indicators */}
                    {(req.sourceLinks.length > 0 || req.targetLinks.length > 0) && (
                      <div className="flex items-center gap-2" style={{ marginTop: "var(--space-2)" }}>
                        {req.sourceLinks.map((link) => (
                          <span
                            key={link.id}
                            className={`badge ${link.isSuspect ? "badge-note" : "badge-requirement"}`}
                            title={`${link.linkType}: ${link.targetRequirement.uniqueId}`}
                            style={{ fontSize: "10px", cursor: "help" }}
                          >
                            {link.isSuspect && "⚠ "}
                            → {link.targetRequirement.uniqueId}
                          </span>
                        ))}
                        {req.targetLinks.map((link) => (
                          <span
                            key={link.id}
                            className={`badge ${link.isSuspect ? "badge-note" : "badge-paragraph"}`}
                            title={`Derived by: ${link.sourceRequirement.uniqueId}`}
                            style={{ fontSize: "10px", cursor: "help" }}
                          >
                            {link.isSuspect && "⚠ "}
                            ← {link.sourceRequirement.uniqueId}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Hover actions */}
                {isEditable && editingId !== req.id && (
                  <div className="req-actions">
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Edit"
                      onClick={() => {
                        setEditingId(req.id);
                        setEditContent(req.content);
                        setEditTitle(req.title);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="AI Assist"
                      onClick={() => openChat(req)}
                      style={{ color: "var(--color-accent)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Version history"
                      onClick={() => setShowVersions(showVersions === req.id ? null : req.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title="Delete"
                      onClick={() => handleDelete(req.id)}
                      style={{ color: "var(--color-error)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* Version history dropdown */}
              {showVersions === req.id && req.versions.length > 0 && (
                <div
                  style={{
                    padding: "var(--space-3) var(--space-6)",
                    background: "var(--color-surface)",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                >
                  <div className="text-xs font-semibold text-secondary" style={{ marginBottom: "var(--space-2)" }}>
                    Version History
                  </div>
                  {req.versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center gap-3"
                      style={{
                        padding: "var(--space-1) 0",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--color-text-secondary)",
                      }}
                    >
                      <span className="badge badge-paragraph">v{v.version}</span>
                      <span className="truncate" style={{ flex: 1 }}>
                        {v.content.substring(0, 100)}...
                      </span>
                      <span className="text-tertiary">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* AI Chat Panel */}
      <AIChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        requirement={chatReq}
        projectId={projectId}
        documentId={doc.id}
      />
    </div>
  );
}
