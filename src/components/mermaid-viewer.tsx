"use client";

import React, { useEffect, useRef, useState } from "react";

export function MermaidViewer({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function renderChart() {
      if (!chart || !chart.trim()) return;

      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
          fontFamily: "Inter, system-ui, sans-serif",
        });

        // Clean code and replace raw <br/> in labels if needed
        const cleanChart = chart.replace(/<br\s*\/?>/gi, "<br/>");
        const id = `mermaid-svg-${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, cleanChart);

        if (isMounted) {
          setSvgHtml(svg);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Mermaid rendering error:", err);
          setError(err?.message || "Failed to render Mermaid diagram.");
        }
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  return (
    <div style={{ margin: "14px 0", border: "1px solid var(--color-border, #cbd5e1)", borderRadius: "8px", overflow: "hidden", background: "#f8fafc" }}>
      {/* Header Bar */}
      <div style={{ padding: "8px 14px", background: "#e2e8f0", fontSize: "0.78rem", fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span>📊 Architectural Diagram</span>
        </div>
        <button
          type="button"
          onClick={() => setShowCode(!showCode)}
          style={{ background: "white", border: "1px solid #cbd5e1", borderRadius: "4px", padding: "2px 8px", fontSize: "0.7rem", cursor: "pointer", color: "#475569" }}
        >
          {showCode ? "Hide Mermaid Code" : "Show Mermaid Code"}
        </button>
      </div>

      {/* Rendered Visual Diagram */}
      <div style={{ padding: "16px", display: "flex", justifyContent: "center", overflowX: "auto", background: "#ffffff" }}>
        {svgHtml ? (
          <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svgHtml }} style={{ width: "100%", maxWidth: "100%", display: "flex", justifyContent: "center" }} />
        ) : error ? (
          <div style={{ color: "#dc2626", fontSize: "0.85rem" }}>
            ⚠️ Diagram syntax error. Click <strong>Show Mermaid Code</strong> to view source.
          </div>
        ) : (
          <div style={{ color: "#64748b", fontSize: "0.85rem" }}>⏳ Rendering architectural diagram...</div>
        )}
      </div>

      {/* Optional Source Code Toggle */}
      {showCode && (
        <pre style={{ padding: "12px", margin: 0, fontSize: "0.8rem", fontFamily: "monospace", overflowX: "auto", background: "#0f172a", color: "#38bdf8", borderTop: "1px solid #cbd5e1" }}>
          {chart}
        </pre>
      )}
    </div>
  );
}
