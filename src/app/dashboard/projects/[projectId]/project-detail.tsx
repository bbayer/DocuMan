"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteDocument, updateDocument, updateProject, addGlossaryTerm, updateGlossaryTerm, deleteGlossaryTerm } from "@/app/actions";
import { generateExportDocumentHtml, renderMarkdownToHtml } from "@/lib/export/html-exporter";

interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  aliases: string;
  source: string;
}

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
  aiContext: string;
  documents: Document[];
  glossaryTerms: GlossaryTerm[];
}

const statusBadgeClass: Record<string, string> = {
  DRAFT: "badge badge-draft",
  REVIEW: "badge badge-review",
  PUBLISHED: "badge badge-published",
};

const categoryLabels: Record<string, string> = {
  SSS: "System/Subsystem Specification",
  SSDD: "System/Subsystem Design Description",
  SRS: "Software Requirements Specification",
  SDD: "Software Design Description",
  STP: "Software Test Plan",
  IRS: "Interface Requirements Specification",
  IDD: "Interface Design Description",
  CUSTOM: "Custom Document",
};

export function ProjectDetail({ project }: { project: Project }) {
  const [showDeriveModal, setShowDeriveModal] = useState(false);
  const [deriveFrom, setDeriveFrom] = useState<string>("");
  const [deriveCategory, setDeriveCategory] = useState("SRS");
  const [deriveTitle, setDeriveTitle] = useState("");
  const [extraInstructions, setExtraInstructions] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<"none" | "low" | "medium" | "high">("medium");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // AI Context state
  const [showAiContext, setShowAiContext] = useState(!!project.aiContext);
  const [aiContextValue, setAiContextValue] = useState(project.aiContext || "");
  const [aiContextSaving, setAiContextSaving] = useState(false);
  const [aiContextSaved, setAiContextSaved] = useState(false);

  // Glossary state
  const [showGlossary, setShowGlossary] = useState((project.glossaryTerms || []).length > 0);
  const [glossaryTerms, setGlossaryTerms] = useState<GlossaryTerm[]>(project.glossaryTerms || []);
  const [newTerm, setNewTerm] = useState("");
  const [newDefinition, setNewDefinition] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [editingTermId, setEditingTermId] = useState<string | null>(null);
  const [editTerm, setEditTerm] = useState("");
  const [editDefinition, setEditDefinition] = useState("");
  const [editAliases, setEditAliases] = useState("");

  const originalDocs = project.documents.filter((d) => d.type === "ORIGINAL");
  const derivativeDocs = project.documents.filter((d) => d.type === "DERIVATIVE");

  const [progress, setProgress] = useState<number>(0);
  const [statusText, setStatusText] = useState("");

  async function handleDerive() {
    if (!deriveFrom || !deriveTitle.trim()) return;
    setLoading(true);
    setProgress(0);
    setStatusText("Starting AI derivation...");
    
    try {
      const res = await fetch("/api/documents/derive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          parentDocumentId: deriveFrom,
          title: deriveTitle.trim(),
          docCategory: deriveCategory,
          extraInstructions: extraInstructions.trim() || undefined,
          reasoningEffort,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Derivation failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      let newDocId = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const textChunk = decoder.decode(value, { stream: true });
        
        const lines = textChunk.split("\n").filter(l => l.trim().length > 0);
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.progress !== undefined) setProgress(data.progress);
            if (data.status) setStatusText(data.status);
            if (data.documentId) newDocId = data.documentId;
          } catch(e) {}
        }
      }

      setLoading(false);
      setShowDeriveModal(false);
      if (newDocId) {
        router.push(
          `/dashboard/projects/${project.id}/documents/${newDocId}`
        );
      }
    } catch(e) {
      console.error(e);
      setLoading(false);
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

      {/* AI Context Section */}
      <div className="card" style={{ marginBottom: "var(--space-6)", padding: "var(--space-4) var(--space-5)" }}>
        <div
          className="flex items-center justify-between"
          style={{ cursor: "pointer" }}
          onClick={() => setShowAiContext(!showAiContext)}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-accent)" }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="font-semibold" style={{ fontSize: "var(--font-size-sm)" }}>AI System Context</span>
            {project.aiContext && (
              <span className="badge badge-requirement" style={{ fontSize: "9px" }}>Configured</span>
            )}
          </div>
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: showAiContext ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "var(--color-text-tertiary)" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        {showAiContext && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-3)", marginTop: 0, lineHeight: 1.5 }}>
              Describe the system being specified. This context is included in all AI prompts for requirement extraction, derivative generation, and chat assistance.
            </p>
            <textarea
              className="input"
              id="ai-context-input"
              value={aiContextValue}
              onChange={(e) => {
                setAiContextValue(e.target.value);
                setAiContextSaved(false);
              }}
              placeholder={"e.g., Missile defense radar system. MIL-STD-498 Level A criticality. Ada/C++ codebase targeting VxWorks RTOS. All requirements must reference CSCI identifiers. Use passive voice for shall-statements."}
              rows={4}
              style={{ resize: "vertical", minHeight: "80px", fontFamily: "inherit", width: "100%" }}
            />
            <div className="flex items-center gap-3" style={{ marginTop: "var(--space-3)", justifyContent: "flex-end" }}>
              {aiContextSaved && (
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success, #10b981)" }}>
                  ✓ Saved
                </span>
              )}
              <button
                className="btn btn-primary btn-sm"
                id="save-ai-context-btn"
                disabled={aiContextSaving || aiContextValue === (project.aiContext || "")}
                onClick={async () => {
                  setAiContextSaving(true);
                  await updateProject(project.id, project.name, project.description, aiContextValue);
                  setAiContextSaving(false);
                  setAiContextSaved(true);
                  router.refresh();
                }}
              >
                {aiContextSaving ? (
                  <><span className="spinner" /> Saving...</>
                ) : (
                  "Save AI Context"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Terminology Glossary */}
      <div className="card" style={{ marginBottom: "var(--space-6)", padding: "var(--space-4) var(--space-5)" }}>
        <div
          className="flex items-center justify-between"
          style={{ cursor: "pointer" }}
          onClick={() => setShowGlossary(!showGlossary)}
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-accent)" }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span className="font-semibold" style={{ fontSize: "var(--font-size-sm)" }}>Terminology Glossary</span>
            {glossaryTerms.length > 0 && (
              <span className="badge badge-requirement" style={{ fontSize: "9px" }}>
                {glossaryTerms.length} terms
              </span>
            )}
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ transform: showGlossary ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "var(--color-text-tertiary)" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        {showGlossary && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-3)", marginTop: 0, lineHeight: 1.5 }}>
              Canonical terminology for this project. Terms are auto-extracted during AI generation and enforced across all derivative documents.
            </p>
            
            {/* Terms table */}
            {glossaryTerms.length > 0 && (
              <div style={{ overflowX: "auto", marginBottom: "var(--space-4)" }}>
                <table style={{ width: "100%", fontSize: "var(--font-size-sm)", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                      <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600 }}>Term</th>
                      <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600 }}>Definition</th>
                      <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600 }}>Aliases</th>
                      <th style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600, width: "80px" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {glossaryTerms.map((gt) => (
                      <tr key={gt.id} style={{ borderBottom: "1px solid var(--color-border-light, var(--color-border))" }}>
                        {editingTermId === gt.id ? (
                          <>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                              <input className="input" value={editTerm} onChange={(e) => setEditTerm(e.target.value)} style={{ fontSize: "var(--font-size-sm)", padding: "4px 8px" }} />
                            </td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                              <input className="input" value={editDefinition} onChange={(e) => setEditDefinition(e.target.value)} style={{ fontSize: "var(--font-size-sm)", padding: "4px 8px" }} />
                            </td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                              <input className="input" value={editAliases} onChange={(e) => setEditAliases(e.target.value)} style={{ fontSize: "var(--font-size-sm)", padding: "4px 8px" }} />
                            </td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                              <div className="flex items-center gap-1">
                                <button className="btn btn-sm btn-primary" style={{ padding: "2px 8px", fontSize: "11px" }}
                                  onClick={async () => {
                                    await updateGlossaryTerm(gt.id, { term: editTerm, definition: editDefinition, aliases: editAliases });
                                    setGlossaryTerms(prev => prev.map(t => t.id === gt.id ? { ...t, term: editTerm, definition: editDefinition, aliases: editAliases } : t));
                                    setEditingTermId(null);
                                    router.refresh();
                                  }}
                                >Save</button>
                                <button className="btn btn-sm" style={{ padding: "2px 8px", fontSize: "11px" }}
                                  onClick={() => setEditingTermId(null)}
                                >✕</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 500 }}>{gt.term}</td>
                            <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-secondary)" }}>{gt.definition}</td>
                            <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--color-text-tertiary)", fontStyle: "italic" }}>{gt.aliases || "—"}</td>
                            <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                              <div className="flex items-center gap-1">
                                <button className="btn btn-sm" style={{ padding: "2px 8px", fontSize: "11px" }}
                                  onClick={() => { setEditingTermId(gt.id); setEditTerm(gt.term); setEditDefinition(gt.definition); setEditAliases(gt.aliases); }}
                                >Edit</button>
                                <button className="btn btn-sm" style={{ padding: "2px 8px", fontSize: "11px", color: "var(--color-danger, #ef4444)" }}
                                  onClick={async () => {
                                    await deleteGlossaryTerm(gt.id);
                                    setGlossaryTerms(prev => prev.filter(t => t.id !== gt.id));
                                    router.refresh();
                                  }}
                                >✕</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add new term form */}
            <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
              <input className="input" placeholder="Term" value={newTerm} onChange={(e) => setNewTerm(e.target.value)}
                style={{ flex: "1 1 120px", fontSize: "var(--font-size-sm)", padding: "6px 10px", minWidth: "100px" }} />
              <input className="input" placeholder="Definition" value={newDefinition} onChange={(e) => setNewDefinition(e.target.value)}
                style={{ flex: "2 1 200px", fontSize: "var(--font-size-sm)", padding: "6px 10px", minWidth: "150px" }} />
              <input className="input" placeholder="Aliases (comma-separated)" value={newAliases} onChange={(e) => setNewAliases(e.target.value)}
                style={{ flex: "1 1 150px", fontSize: "var(--font-size-sm)", padding: "6px 10px", minWidth: "100px" }} />
              <button className="btn btn-primary btn-sm" style={{ whiteSpace: "nowrap" }}
                disabled={!newTerm.trim()}
                onClick={async () => {
                  const result = await addGlossaryTerm(project.id, newTerm.trim(), newDefinition.trim(), newAliases.trim());
                  if (result.glossaryTerm) {
                    setGlossaryTerms(prev => [...prev, result.glossaryTerm as GlossaryTerm]);
                    setNewTerm(""); setNewDefinition(""); setNewAliases("");
                    router.refresh();
                  }
                }}
              >+ Add Term</button>
            </div>
          </div>
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
                  <option value="SSS">SSS — System/Subsystem Specification</option>
                  <option value="SSDD">SSDD — System/Subsystem Design Description</option>
                  <option value="SRS">SRS — Software Requirements Specification</option>
                  <option value="SDD">SDD — Software Design Description</option>
                  <option value="STP">STP — Software Test Plan</option>
                  <option value="IRS">IRS — Interface Requirements Specification</option>
                  <option value="IDD">IDD — Interface Design Description</option>
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
              <div className="input-group">
                <label className="input-label" htmlFor="derive-extra-instructions">
                  Extra Instructions for AI
                  <span style={{ fontWeight: 400, color: "var(--color-text-tertiary)", marginLeft: "var(--space-2)" }}>(optional)</span>
                </label>
                <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)", marginTop: 0 }}>
                  Provide additional rules or guidelines for the AI to follow during document generation. You can type below or upload a .txt file.
                </p>
                <textarea
                  className="input"
                  id="derive-extra-instructions"
                  value={extraInstructions}
                  onChange={(e) => setExtraInstructions(e.target.value)}
                  placeholder="e.g. Use passive voice. Each requirement must reference a specific subsystem. Focus on safety-critical aspects..."
                  rows={4}
                  style={{ resize: "vertical", minHeight: "80px", fontFamily: "inherit" }}
                />
                <div style={{ marginTop: "var(--space-2)" }}>
                  <label
                    htmlFor="derive-instructions-file"
                    className="btn btn-ghost btn-sm"
                    style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload .txt file
                  </label>
                  <input
                    type="file"
                    id="derive-instructions-file"
                    accept=".txt"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const text = ev.target?.result as string;
                        setExtraInstructions((prev) => prev ? prev + "\n" + text : text);
                      };
                      reader.readAsText(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="derive-reasoning">
                  Reasoning Effort
                </label>
                <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)", marginTop: 0 }}>
                  Controls how much the AI model "thinks" before generating. Higher effort produces more thorough results but takes longer. Requires a reasoning-capable model.
                </p>
                <select
                  className="input"
                  id="derive-reasoning"
                  value={reasoningEffort}
                  onChange={(e) => setReasoningEffort(e.target.value as "none" | "low" | "medium" | "high")}
                >
                  <option value="none">None — Skip reasoning</option>
                  <option value="low">Low — Quick analysis</option>
                  <option value="medium">Medium — Balanced (default)</option>
                  <option value="high">High — Deep analysis</option>
                </select>
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
                    <span className="spinner" /> {progress}% - {statusText || "Generating..."}
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
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState(doc.title);
  const [editCategory, setEditCategory] = useState(doc.docCategory);
  const [editSaving, setEditSaving] = useState(false);
  const [exportFormat, setExportFormat] = useState<"html" | "csv">("html");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFields, setExportFields] = useState({
    itemNumber: true,
    uniqueId: true,
    category: true,
    title: true,
    content: true,
    derivedReqItemNumber: true,
    derivedReqId: true,
    derivedReqText: true,
  });
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document?")) return;
    setIsDeleting(true);
    await deleteDocument(doc.id, projectId);
    setIsDeleting(false);
  }

  async function handleEditSave() {
    setEditSaving(true);
    await updateDocument(doc.id, projectId, {
      title: editTitle,
      docCategory: editCategory,
    });
    setEditSaving(false);
    setShowEditModal(false);
    router.refresh();
  }

  function toggleField(field: keyof typeof exportFields) {
    setExportFields((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  async function handleExport() {
    setExportLoading(true);
    try {
      const res = await fetch(`/api/documents/export?documentId=${doc.id}`);
      if (!res.ok) throw new Error("Failed to fetch export data");
      const data = await res.json();

      // Build rows from requirements with traceability data
      const rows = data.requirements.map((req: any) => {
        // Source links: this requirement was derived FROM targets
        // Target links: other requirements link TO this one
        const derivedFromLinks = req.sourceLinks
          ?.filter((l: any) => l.linkType === "DERIVED_FROM")
          .map((l: any) => l.targetRequirement) || [];
        const derivedToLinks = req.targetLinks
          ?.filter((l: any) => l.linkType === "DERIVED_FROM")
          .map((l: any) => l.sourceRequirement) || [];
        const allLinked = [...derivedFromLinks, ...derivedToLinks];

        return {
          itemNumber: req.itemNumber || "",
          uniqueId: req.uniqueId || "",
          category: req.category || "",
          title: req.title || "",
          content: req.content || "",
          derivedReqItemNumber: allLinked.map((r: any) => r.itemNumber || "").join("; "),
          derivedReqId: allLinked.map((r: any) => r.uniqueId || r.id).join("; "),
          derivedReqText: allLinked.map((r: any) => r.content || r.title).join("; "),
        };
      });

      const fieldLabels: Record<string, string> = {
        itemNumber: "Item Number",
        uniqueId: "Unique ID",
        category: "Type",
        title: "Title",
        content: "Content",
        derivedReqItemNumber: "Derived Req Item No",
        derivedReqId: "Derived Req ID",
        derivedReqText: "Derived Req Text",
      };

      const activeFields = Object.entries(exportFields)
        .filter(([, v]) => v)
        .map(([k]) => k);

      if (activeFields.length === 0) {
        alert("Please select at least one field to export.");
        setExportLoading(false);
        return;
      }

      const fileName = `${doc.title.replace(/[^a-zA-Z0-9]/g, "_")}`;

      if (exportFormat === "csv") {
        const header = activeFields.map((f) => fieldLabels[f]).join(",");
        const csvRows = rows.map((row: any) =>
          activeFields
            .map((f) => {
              const val = String(row[f] || "").replace(/"/g, '""');
              return `"${val}"`;
            })
            .join(",")
        );
        const csvContent = "\uFEFF" + [header, ...csvRows].join("\n");
        downloadFile(csvContent, `${fileName}.csv`, "text/csv;charset=utf-8");
      } else {
        // HTML / PDF Print export
        const htmlContent = generateExportDocumentHtml({
          title: doc.title,
          docCategory: doc.docCategory,
          status: doc.status,
          majorVersion: doc.majorVersion,
          minorVersion: doc.minorVersion,
          requirements: (rows || []) as any[],
        });
        downloadFile(htmlContent, `${fileName}.html`, "text/html;charset=utf-8");
      }
    } catch (err) {
      console.error("Export failed:", err);
      alert("Export failed. Please try again.");
    }
    setExportLoading(false);
    setShowExportModal(false);
  }

  return (
    <>
      <Link
        href={`/dashboard/projects/${projectId}/documents/${doc.id}`}
        style={{ textDecoration: "none" }}
      >
        <div className="card card-interactive" style={{ position: "relative" }}>
          <div className="flex items-center justify-between">
            <div style={{ flex: 1, minWidth: 0, paddingRight: "var(--space-6)" }}>
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
            <div className="flex items-center gap-2">
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
          <div
            style={{
              position: "absolute",
              top: "var(--space-3)",
              right: "var(--space-3)",
              display: "flex",
              gap: "var(--space-1)",
            }}
          >
            <button
              className="btn btn-ghost btn-icon btn-sm"
              style={{ opacity: 0.5 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setEditTitle(doc.title);
                setEditCategory(doc.docCategory);
                setShowEditModal(true);
              }}
              title="Edit document"
              aria-label="Edit document"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              style={{ opacity: 0.5 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowExportModal(true);
              }}
              title="Export document"
              aria-label="Export document"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              className="btn btn-ghost btn-icon btn-sm"
              style={{ opacity: 0.5 }}
              onClick={handleDelete}
              disabled={isDeleting}
              title="Delete document"
              aria-label="Delete document"
            >
              {isDeleting ? (
                <span className="spinner spinner-sm" style={{ width: 14, height: 14 }} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </Link>

      {/* Export Modal */}
      {showExportModal && (
        <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Export Document</h2>
              <p className="modal-description">
                Export &ldquo;{doc.title}&rdquo; with selected fields and format.
              </p>
            </div>
            <div className="modal-body">
              {/* Format selection */}
              <div className="input-group">
                <label className="input-label">Export Format</label>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {(["html", "csv"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      className={`btn btn-sm ${exportFormat === fmt ? "btn-primary" : "btn-secondary"}`}
                      onClick={() => setExportFormat(fmt)}
                      type="button"
                      style={{ textTransform: "uppercase", fontWeight: 600, minWidth: 70 }}
                    >
                      {fmt}
                    </button>
                  ))}
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled
                    type="button"
                    title="Coming soon"
                    style={{ textTransform: "uppercase", fontWeight: 600, minWidth: 70, opacity: 0.4 }}
                  >
                    PDF
                  </button>
                </div>
              </div>

              {/* Field selection */}
              <div className="input-group" style={{ marginTop: "var(--space-4)" }}>
                <label className="input-label">Fields to Include</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-2)" }}>
                  {([
                    { key: "itemNumber", label: "Item Number" },
                    { key: "uniqueId", label: "Unique ID" },
                    { key: "category", label: "Type" },
                    { key: "title", label: "Title" },
                    { key: "content", label: "Content" },
                    { key: "derivedReqItemNumber", label: "Derived Req Item No" },
                    { key: "derivedReqId", label: "Derived Req ID" },
                    { key: "derivedReqText", label: "Derived Req Text" },
                  ] as { key: keyof typeof exportFields; label: string }[]).map((field) => (
                    <label
                      key={field.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        padding: "var(--space-2) var(--space-3)",
                        borderRadius: "var(--radius-md)",
                        border: `1px solid ${exportFields[field.key] ? "var(--color-accent)" : "var(--color-border)"}`,
                        background: exportFields[field.key]
                          ? "color-mix(in srgb, var(--color-accent) 8%, transparent)"
                          : "transparent",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        fontSize: "var(--font-size-sm)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={exportFields[field.key]}
                        onChange={() => toggleField(field.key)}
                        style={{ accentColor: "var(--color-accent)" }}
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowExportModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleExport}
                disabled={exportLoading}
                id="submit-export-btn"
              >
                {exportLoading ? (
                  <>
                    <span className="spinner" /> Exporting...
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export {exportFormat.toUpperCase()}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Document Modal */}
      {showEditModal && (
        <div className="modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Edit Document</h2>
              <p className="modal-description">
                Update the document title and category.
              </p>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Document Title</label>
                <input
                  className="input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Document title"
                  id="edit-doc-title"
                />
              </div>
              <div className="input-group">
                <label className="input-label">Category</label>
                <select
                  className="select"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  id="edit-doc-category"
                >
                  <option value="CUSTOM">Custom Document</option>
                  <option value="SSS">System/Subsystem Specification</option>
                  <option value="SSDD">System/Subsystem Design Description</option>
                  <option value="SRS">Software Requirements Specification</option>
                  <option value="SDD">Software Design Description</option>
                  <option value="STP">Software Test Plan</option>
                  <option value="IRS">Interface Requirements Specification</option>
                  <option value="IDD">Interface Design Description</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleEditSave}
                disabled={editSaving || !editTitle.trim()}
                id="submit-edit-doc-btn"
              >
                {editSaving ? (
                  <>
                    <span className="spinner" /> Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

