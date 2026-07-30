"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateRequirement,
  addRequirement,
  deleteRequirement,
  updateDocumentStatus,
  dismissReviewFlag,
  repairDocumentStructure,
} from "@/app/actions";
import { generateExportDocumentHtml } from "@/lib/export/html-exporter";
import { AIChatPanel } from "./ai-chat-panel";
import { MermaidViewer } from "@/components/mermaid-viewer";

interface Requirement {
  id: string;
  itemNumber: string;
  uniqueId: string;
  category: string;
  title: string;
  content: string;
  sortOrder: number;
  indentLevel: number;
  requiresReview?: boolean;
  reviewReason?: string;
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
  aiPrompt: string;
  generationMeta?: string;
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

function renderInlineMarkdown(str: string, keyPrefix: string = "inline"): React.ReactNode {
  if (!str) return null;

  const brParts = str.split(/(?:<br\s*\/?>|\n)/gi);

  return brParts.map((part, pIdx) => {
    const trimmed = part.trim();
    const isBullet = /^[*-]\s+/.test(trimmed);
    const contentToParse = isBullet ? trimmed.replace(/^[*-]\s+/, "") : part;

    const tokens: React.ReactNode[] = [];
    let keyIdx = 0;

    if (isBullet) {
      tokens.push(
        <span key={`${keyPrefix}-${pIdx}-bullet`} style={{ color: "var(--color-primary, #3b82f6)", fontWeight: "bold", marginRight: "6px" }}>
          •
        </span>
      );
    }

    const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*|__.*?__|_[^_]+_)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(contentToParse)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(
          <React.Fragment key={`${keyPrefix}-${pIdx}-txt-${keyIdx++}`}>
            {contentToParse.substring(lastIndex, match.index)}
          </React.Fragment>
        );
      }

      const tokenStr = match[0];
      if ((tokenStr.startsWith("**") && tokenStr.endsWith("**")) || (tokenStr.startsWith("__") && tokenStr.endsWith("__"))) {
        tokens.push(<strong key={`${keyPrefix}-${pIdx}-b-${keyIdx++}`}>{tokenStr.slice(2, -2)}</strong>);
      } else if (tokenStr.startsWith("`") && tokenStr.endsWith("`")) {
        tokens.push(
          <code key={`${keyPrefix}-${pIdx}-c-${keyIdx++}`} style={{ background: "var(--color-bg-tertiary, #f1f5f9)", padding: "2px 5px", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.85em" }}>
            {tokenStr.slice(1, -1)}
          </code>
        );
      } else if ((tokenStr.startsWith("*") && tokenStr.endsWith("*")) || (tokenStr.startsWith("_") && tokenStr.endsWith("_"))) {
        tokens.push(<em key={`${keyPrefix}-${pIdx}-i-${keyIdx++}`}>{tokenStr.slice(1, -1)}</em>);
      } else {
        tokens.push(
          <React.Fragment key={`${keyPrefix}-${pIdx}-str-${keyIdx++}`}>
            {tokenStr}
          </React.Fragment>
        );
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < contentToParse.length) {
      tokens.push(
        <React.Fragment key={`${keyPrefix}-${pIdx}-end-${keyIdx++}`}>
          {contentToParse.substring(lastIndex)}
        </React.Fragment>
      );
    }

    return (
      <React.Fragment key={`${keyPrefix}-br-${pIdx}`}>
        {pIdx > 0 && <br />}
        {tokens}
      </React.Fragment>
    );
  });
}

function renderFormattedContent(text: string, keyPrefix: string = "fmt"): React.ReactNode {
  if (!text) return null;

  if (text.includes("```mermaid")) {
    const parts = text.split(/(```mermaid[\s\S]*?```)/g);
    return (
      <React.Fragment key={`${keyPrefix}-mblock`}>
        {parts.map((part, pIdx) => {
          if (part.startsWith("```mermaid")) {
            const mermaidCode = part.replace(/^```mermaid\s*/, "").replace(/```$/, "").trim();
            return <MermaidViewer key={`${keyPrefix}-mdiv-${pIdx}`} chart={mermaidCode} />;
          }
          return (
            <React.Fragment key={`${keyPrefix}-mpart-${pIdx}`}>
              {renderFormattedContent(part, `${keyPrefix}-mp-${pIdx}`)}
            </React.Fragment>
          );
        })}
      </React.Fragment>
    );
  }

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let tableBuffer: string[] = [];
  let listBuffer: string[] = [];
  let textBuffer: string[] = [];

  const flushText = (key: string) => {
    if (textBuffer.length > 0) {
      const fullText = textBuffer.join("\n").trim();
      if (fullText) {
        elements.push(
          <div key={key} style={{ lineHeight: 1.6, marginBottom: "8px" }}>
            {renderInlineMarkdown(fullText, `${key}-inline`)}
          </div>
        );
      }
      textBuffer = [];
    }
  };

  const flushList = (key: string) => {
    if (listBuffer.length > 0) {
      elements.push(
        <ul key={key} style={{ paddingLeft: "20px", margin: "6px 0", lineHeight: 1.6 }}>
          {listBuffer.map((item, iIdx) => (
            <li key={`li-${iIdx}`} style={{ marginBottom: "3px" }}>
              {renderInlineMarkdown(item, `${key}-li-${iIdx}`)}
            </li>
          ))}
        </ul>
      );
      listBuffer = [];
    }
  };

  const flushTable = (key: string) => {
    if (tableBuffer.length >= 2) {
      const rows = tableBuffer
        .map((line) => line.trim())
        .filter((line) => line.startsWith("|") && line.endsWith("|"))
        .map((line) =>
          line
            .slice(1, -1)
            .split("|")
            .map((cell) => cell.trim())
        );

      if (rows.length >= 2) {
        const header = rows[0];
        const dataRows = rows.slice(1).filter(
          (row) => !row.every((cell) => /^[-:\s]+$/.test(cell))
        );

        elements.push(
          <div key={key} className="md-table-wrapper" style={{ overflowX: "auto", margin: "10px 0" }}>
            <table className="md-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {header.map((col, idx) => (
                    <th key={`th-${idx}`} style={{ padding: "8px 12px", textTransform: "none", fontSize: "0.85rem" }}>
                      {renderInlineMarkdown(col, `${key}-th-${idx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row, rIdx) => (
                  <tr key={`tr-${rIdx}`}>
                    {row.map((cell, cIdx) => (
                      <td key={`td-${cIdx}`} style={{ padding: "8px 12px", fontSize: "0.85rem", verticalAlign: "top" }}>
                        {renderInlineMarkdown(cell, `${key}-td-${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableBuffer = [];
        return;
      }
    }
    textBuffer.push(...tableBuffer);
    tableBuffer = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const isTableLine = trimmed.startsWith("|") && trimmed.endsWith("|");
    const isBulletLine = /^[-*]\s+/.test(trimmed);

    if (isTableLine) {
      flushText(`text-${idx}`);
      flushList(`list-${idx}`);
      tableBuffer.push(line);
    } else if (isBulletLine) {
      flushText(`text-${idx}`);
      flushTable(`table-${idx}`);
      listBuffer.push(trimmed.replace(/^[-*]\s+/, ""));
    } else {
      flushTable(`table-${idx}`);
      flushList(`list-${idx}`);
      textBuffer.push(line);
    }
  });

  if (tableBuffer.length > 0) flushTable("table-end");
  if (listBuffer.length > 0) flushList("list-end");
  flushText("text-end");

  return <React.Fragment key={keyPrefix}>{elements}</React.Fragment>;
}

export function DocumentEditor({
  document: doc,
  projectId,
}: {
  document: Document;
  projectId: string;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReq, setChatReq] = useState<Requirement | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showVersions, setShowVersions] = useState<string | null>(null);
  const [previewReq, setPreviewReq] = useState<{ uniqueId: string; title: string; content: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [showReport, setShowReport] = useState(false);

  let parsedMeta: any = null;
  try {
    if (doc.generationMeta) parsedMeta = JSON.parse(doc.generationMeta);
  } catch {}

  const isEditable = doc.status !== "PUBLISHED";

  const filteredRequirements = doc.requirements.filter((req) => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      (req.title && req.title.toLowerCase().includes(lowerQuery)) ||
      (req.content && req.content.toLowerCase().includes(lowerQuery)) ||
      (req.itemNumber && req.itemNumber.toLowerCase().includes(lowerQuery)) ||
      (req.uniqueId && req.uniqueId.toLowerCase().includes(lowerQuery))
    );
  });

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

  function handleExportHtml() {
    const htmlContent = generateExportDocumentHtml({
      title: doc.title,
      docCategory: doc.docCategory,
      status: doc.status,
      majorVersion: doc.majorVersion,
      minorVersion: doc.minorVersion,
      requirements: doc.requirements || [],
    });
    const fileName = `${doc.title.replace(/[^a-zA-Z0-9]/g, "_")}.html`;
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleRepairStructure() {
    if (!confirm("Re-order and re-number document structure into sequential tree order?")) return;
    const res = await repairDocumentStructure(doc.id, projectId);
    if (res?.error) alert(res.error);
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: "var(--space-6)" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "var(--space-4)" }}>
          <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-2" style={{ marginLeft: "var(--space-2)" }}>
              <span className={statusBadge[doc.status]}>{doc.status}</span>
              {doc.docCategory !== "CUSTOM" && (
                <span className="badge badge-requirement">{doc.docCategory}</span>
              )}
            </div>
          </div>

          {/* Status & Export & Repair actions */}
          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRepairStructure}
              title="Fix / Re-order Document Structure & Numbering"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Fix Structure & Numbering
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleExportHtml}
              title="Export HTML / Print to PDF"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export HTML / PDF
            </button>
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
                  onClick={() => updateDocumentStatus(doc.id, "PUBLISHED", projectId)}
                >
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

      {/* Generation Quality Report Banner */}
      {parsedMeta?.validation && (
        <div
          className="card"
          style={{ marginBottom: "var(--space-5)", padding: "var(--space-3) var(--space-5)" }}
        >
          <div
            className="flex items-center justify-between"
            style={{ cursor: "pointer" }}
            onClick={() => setShowReport(!showReport)}
          >
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-accent)" }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span className="font-semibold" style={{ fontSize: "var(--font-size-sm)" }}>Generation Quality Report</span>
              <span
                className="badge"
                style={{
                  fontSize: "10px",
                  background: parsedMeta.validation.score >= 80 ? "rgba(16,185,129,0.15)" : parsedMeta.validation.score >= 60 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                  color: parsedMeta.validation.score >= 80 ? "#10b981" : parsedMeta.validation.score >= 60 ? "#f59e0b" : "#ef4444",
                  fontWeight: 600,
                }}
              >
                Score: {parsedMeta.validation.score}/100
              </span>
              {parsedMeta.validation.stats?.requiresReviewCount > 0 && (
                <span className="badge badge-note" style={{ fontSize: "10px" }}>
                  ⚠️ {parsedMeta.validation.stats.requiresReviewCount} flagged for review
                </span>
              )}
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showReport ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "var(--color-text-tertiary)" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {showReport && (
            <div style={{ marginTop: "var(--space-3)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
              <div className="flex gap-4 flex-wrap" style={{ marginBottom: "var(--space-2)" }}>
                <div><strong>Language:</strong> {parsedMeta.analysis?.language?.toUpperCase() || "EN"}</div>
                <div><strong>Glossary terms used:</strong> {parsedMeta.analysis?.glossaryCount || 0}</div>
                <div><strong>Warnings total:</strong> {parsedMeta.validation.warningCount || 0}</div>
              </div>
              {parsedMeta.analysis?.themes && parsedMeta.analysis.themes.length > 0 && (
                <div style={{ marginTop: "var(--space-2)" }}>
                  <strong>Cross-cutting themes:</strong> {parsedMeta.analysis.themes.join(" • ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* AI Prompt banner — shown for derivative docs that have a saved prompt */}
      {doc.type === "DERIVATIVE" && doc.aiPrompt && (
        <div
          className="card"
          style={{ marginBottom: "var(--space-5)", padding: "var(--space-3) var(--space-5)" }}
        >
          <div
            className="flex items-center justify-between"
            style={{ cursor: "pointer" }}
            onClick={() => setShowPrompt(!showPrompt)}
          >
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--color-accent)" }}>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              <span className="font-semibold" style={{ fontSize: "var(--font-size-sm)" }}>AI Generation Prompt</span>
            </div>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              style={{ transform: showPrompt ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", color: "var(--color-text-tertiary)" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
          {showPrompt && (
            <div
              style={{
                marginTop: "var(--space-3)",
                padding: "var(--space-4)",
                background: "var(--color-surface)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                fontSize: "var(--font-size-sm)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                color: "var(--color-text-secondary)",
                fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
              }}
            >
              {doc.aiPrompt}
            </div>
          )}
        </div>
      )}

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

      {/* Search and Action Bar */}
      <div className="flex items-center justify-between gap-4" style={{ marginBottom: "var(--space-4)" }}>
        <div className="input-group" style={{ flex: 1, maxWidth: "400px", margin: 0 }}>
          <div style={{ position: "relative" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-tertiary)" }}>
              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              className="input" 
              placeholder="Search requirements..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: "38px" }}
            />
          </div>
        </div>

        {isEditable && (
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
        )}
      </div>

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
          {filteredRequirements.map((req) => (
            <div key={req.id}>
              <div
                className={`req-row req-indent-${Math.min(req.indentLevel, 3)}`}
                style={req.requiresReview ? { borderLeft: "3px solid #f59e0b", background: "rgba(245, 158, 11, 0.03)" } : undefined}
              >
                <span className="req-item-number">{req.itemNumber}</span>
                <span className={`badge ${categoryColors[req.category] || "badge-paragraph"}`}>
                  {req.category === "REQUIREMENT" ? "REQ" : req.category.substring(0, 4)}
                </span>
                {req.requiresReview && (
                  <span
                    className="badge"
                    style={{
                      fontSize: "10px",
                      background: "rgba(245, 158, 11, 0.15)",
                      color: "#d97706",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    title={`${req.reviewReason || "Flagged for quality review"}. Click to dismiss flag.`}
                    onClick={async (e) => {
                      e.stopPropagation();
                      await dismissReviewFlag(req.id);
                      router.refresh();
                    }}
                  >
                    ⚠️ Review Needed
                  </span>
                )}

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
                    <div className="req-content-text">{renderFormattedContent(req.content)}</div>

                    {/* Traceability indicators */}
                    {(req.sourceLinks.length > 0 || req.targetLinks.length > 0) && (
                      <div className="flex items-center gap-2" style={{ marginTop: "var(--space-2)" }}>
                        {req.sourceLinks.map((link) => (
                          <span
                            key={link.id}
                            className={`badge ${link.isSuspect ? "badge-note" : "badge-requirement"}`}
                            title={`${link.linkType}: ${link.targetRequirement.uniqueId}`}
                            style={{ fontSize: "10px", cursor: "pointer", userSelect: "none" }}
                            onClick={() => setPreviewReq(link.targetRequirement)}
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
                            style={{ fontSize: "10px", cursor: "pointer", userSelect: "none" }}
                            onClick={() => setPreviewReq(link.sourceRequirement)}
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

      {/* Requirement Preview Modal */}
      {previewReq && (
        <div className="modal-overlay" onClick={() => setPreviewReq(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{previewReq.uniqueId}</h2>
              <p className="modal-description">Reference requirement</p>
            </div>
            <div className="modal-body">
              {previewReq.title && (
                <div style={{ fontWeight: 600, fontSize: "var(--font-size-md)", marginBottom: "var(--space-2)", color: "var(--color-text-primary)" }}>
                  {previewReq.title}
                </div>
              )}
              <div style={{ color: "var(--color-text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {previewReq.content}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPreviewReq(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
