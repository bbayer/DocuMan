"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface ExtractedReq {
  itemNumber: string;
  category: string;
  title: string;
  content: string;
  indentLevel: number;
  sortOrder: number;
  uniqueId: string;
}

type UploadStep = "upload" | "processing" | "review" | "saving";

export default function UploadPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const router = useRouter();

  const [step, setStep] = useState<UploadStep>("upload");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [uploadData, setUploadData] = useState<{
    fileId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
    storagePath: string;
    documentTitle: string;
    requirements: ExtractedReq[];
  } | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError("");
      setStep("processing");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", projectId);

      try {
        const res = await fetch("/api/documents/upload", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Upload failed");
        }

        setUploadData(data);
        setEditTitle(data.documentTitle);
        setStep("review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setStep("upload");
      }
    },
    [projectId]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleConfirm = async () => {
    if (!uploadData) return;
    setStep("saving");

    try {
      const res = await fetch("/api/documents/upload", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...uploadData,
          documentTitle: editTitle,
          projectId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Save failed");
      }

      router.push(
        `/dashboard/projects/${projectId}/documents/${data.documentId}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStep("review");
    }
  };

  const categoryColors: Record<string, string> = {
    TITLE: "badge-title",
    REQUIREMENT: "badge-requirement",
    PARAGRAPH: "badge-paragraph",
    NOTE: "badge-note",
  };

  return (
    <>
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
        <h1 className="page-title">Upload Document</h1>
        <p className="page-subtitle">
          Upload a PDF, DOCX, TXT, CSV, or TSV file to extract and structure requirements using AI
        </p>
      </div>

      {error && (
        <div
          className="card"
          style={{
            borderLeft: "3px solid var(--color-error)",
            marginBottom: "var(--space-5)",
            padding: "var(--space-4) var(--space-5)",
          }}
        >
          <div style={{ color: "var(--color-error)", fontWeight: 600, fontSize: "var(--font-size-sm)" }}>
            {error}
          </div>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div
          className={`drop-zone ${dragActive ? "active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          id="file-drop-zone"
        >
          <svg className="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <div className="drop-zone-title">
            Drop your document here or click to browse
          </div>
          <div className="drop-zone-subtitle">
            Supports PDF, DOCX, TXT, CSV, and TSV files
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,.csv,.tsv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,text/tab-separated-values,text/tsv"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            id="file-input"
          />
        </div>
      )}

      {/* Step 2: Processing */}
      {step === "processing" && (
        <div className="card" style={{ textAlign: "center", padding: "var(--space-16)" }}>
          <div className="spinner spinner-lg" style={{ margin: "0 auto var(--space-5)" }} />
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
            Processing Document
          </div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
            Parsing file and extracting requirements with AI...
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === "review" && uploadData && (
        <div className="animate-in">
          {/* Document title */}
          <div className="card" style={{ marginBottom: "var(--space-5)" }}>
            <div className="input-group">
              <label className="input-label" htmlFor="doc-title">
                Document Title
              </label>
              <input
                className="input"
                id="doc-title"
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="card-meta" style={{ marginTop: "var(--space-3)" }}>
              <span>{uploadData.fileName}</span>
              <span>·</span>
              <span>{(uploadData.fileSize / 1024).toFixed(1)} KB</span>
              <span>·</span>
              <span>{uploadData.requirements.length} items extracted</span>
            </div>
          </div>

          {/* Extracted requirements preview */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--space-4)",
            }}
          >
            <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>
              Extracted Requirements
            </h2>
            <div className="flex items-center gap-2">
              <span className="badge badge-title">Title</span>
              <span className="badge badge-requirement">Requirement</span>
              <span className="badge badge-paragraph">Paragraph</span>
              <span className="badge badge-note">Note</span>
            </div>
          </div>

          <div className="card" style={{ padding: 0, maxHeight: "500px", overflow: "auto" }}>
            <div className="req-list">
              {uploadData.requirements.map((req, i) => (
                <div
                  key={i}
                  className={`req-row req-indent-${Math.min(req.indentLevel, 3)}`}
                >
                  <span className="req-item-number">{req.itemNumber}</span>
                  <span className={`badge ${categoryColors[req.category] || "badge-paragraph"}`}>
                    {req.category}
                  </span>
                  <div className="req-content" style={{ marginLeft: "var(--space-3)" }}>
                    {req.title && (
                      <div className="req-content-title">{req.title}</div>
                    )}
                    <div className="req-content-text">
                      {req.content.substring(0, 300)}
                      {req.content.length > 300 && "..."}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Confirm buttons */}
          <div
            className="flex items-center justify-between"
            style={{ marginTop: "var(--space-6)" }}
          >
            <button
              className="btn btn-secondary"
              onClick={() => {
                setStep("upload");
                setUploadData(null);
              }}
            >
              Upload Different File
            </button>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleConfirm}
              id="confirm-save-btn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Confirm & Save
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Saving */}
      {step === "saving" && (
        <div className="card" style={{ textAlign: "center", padding: "var(--space-16)" }}>
          <div className="spinner spinner-lg" style={{ margin: "0 auto var(--space-5)" }} />
          <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600 }}>
            Saving Document
          </div>
        </div>
      )}
    </>
  );
}
