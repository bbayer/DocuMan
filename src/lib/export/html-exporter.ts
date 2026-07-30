export function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatInlineMarkdown(str: string): string {
  if (!str) return "";
  let s = escapeHtml(str);
  s = s.replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:2px 5px;border-radius:4px;font-family:monospace;font-size:0.85em;color:#0f172a;">$1</code>');
  s = s.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.*?)__/g, '<strong>$1</strong>');
  s = s.replace(/\*(.*?)\*/g, '<em>$1</em>');
  s = s.replace(/_(.*?)_/g, '<em>$1</em>');
  s = s.replace(/(?:^|&lt;br\s*\/?&gt;|\n)\s*[-*]\s+/gi, '<br/><span style="color:#2563eb;font-weight:bold;">&bull; </span>');
  return s;
}

export function renderMarkdownToHtml(text: string): string {
  if (!text) return "";

  if (text.includes("```mermaid")) {
    const parts = text.split(/(```mermaid[\s\S]*?```)/g);
    return parts
      .map((part) => {
        if (part.startsWith("```mermaid")) {
          const code = part.replace(/^```mermaid\s*/, "").replace(/```$/, "").trim();
          return `<div style="margin:16px 0;padding:16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;" class="mermaid-box"><div style="font-size:0.75rem;font-weight:600;color:#64748b;margin-bottom:8px;" class="no-print">ARCHITECTURAL DIAGRAM (MERMAID)</div><pre class="mermaid" style="background:transparent;border:none;margin:0;padding:0;">${escapeHtml(code)}</pre></div>`;
        }
        return renderMarkdownToHtml(part);
      })
      .join("");
  }

  const lines = text.split("\n");
  const htmlParts: string[] = [];
  let tableBuffer: string[] = [];
  let textBuffer: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length > 0) {
      const itemsHtml = listItems
        .map((item) => `<li style="margin-bottom:3px;">${formatInlineMarkdown(item)}</li>`)
        .join("");
      htmlParts.push(`<ul style="margin:6px 0;padding-left:20px;line-height:1.5;">${itemsHtml}</ul>`);
      listItems = [];
    }
  };

  const flushTextBuffer = () => {
    flushList();
    if (textBuffer.length > 0) {
      const rawText = textBuffer.join("\n").trim();
      if (rawText) {
        const formatted = formatInlineMarkdown(rawText).replace(/\n/g, "<br/>");
        htmlParts.push(`<div style="line-height:1.6;margin-bottom:8px;">${formatted}</div>`);
      }
      textBuffer = [];
    }
  };

  const flushTableBuffer = () => {
    flushList();
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

        let tableHtml = `<div style="overflow-x:auto;margin:12px 0;"><table style="width:100%;border-collapse:collapse;margin:4px 0;font-size:0.85rem;border:1px solid #cbd5e1;background:#fff;border-radius:4px;"><thead><tr style="background:#f1f5f9;border-bottom:2px solid #94a3b8;">`;
        header.forEach((col) => {
          tableHtml += `<th style="padding:8px 12px;text-align:left;font-weight:600;color:#1e293b;border-right:1px solid #cbd5e1;">${formatInlineMarkdown(col)}</th>`;
        });
        tableHtml += `</tr></thead><tbody>`;

        dataRows.forEach((row, rIdx) => {
          const bg = rIdx % 2 === 1 ? 'background:#f8fafc;' : '';
          tableHtml += `<tr style="${bg}border-bottom:1px solid #e2e8f0;">`;
          row.forEach((cell) => {
            tableHtml += `<td style="padding:8px 12px;color:#334155;border-right:1px solid #e2e8f0;">${formatInlineMarkdown(cell)}</td>`;
          });
          tableHtml += `</tr>`;
        });

        tableHtml += `</tbody></table></div>`;
        htmlParts.push(tableHtml);
        tableBuffer = [];
        return;
      }
    }
    textBuffer.push(...tableBuffer);
    tableBuffer = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const isTableLine = trimmed.startsWith("|") && trimmed.endsWith("|");
    const isBulletLine = /^[-*]\s+/.test(trimmed);

    if (isTableLine) {
      flushTextBuffer();
      tableBuffer.push(line);
    } else if (isBulletLine) {
      if (tableBuffer.length > 0) flushTableBuffer();
      if (textBuffer.length > 0) flushTextBuffer();
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
    } else {
      if (tableBuffer.length > 0) flushTableBuffer();
      if (listItems.length > 0) flushList();
      textBuffer.push(line);
    }
  });

  if (tableBuffer.length > 0) flushTableBuffer();
  flushTextBuffer();

  return htmlParts.join("\n") || "—";
}

export function generateExportDocumentHtml(opts: {
  title: string;
  docCategory: string;
  status: string;
  majorVersion: number;
  minorVersion: number;
  requirements: {
    itemNumber?: string | null;
    uniqueId: string;
    category: string;
    title?: string | null;
    content: string;
    indentLevel?: number;
  }[];
}): string {
  const { title, docCategory, status, majorVersion, minorVersion, requirements } = opts;

  let bodyHtml = "";

  for (const req of requirements) {
    const isTitle = req.category === "TITLE";
    const indent = req.indentLevel || 0;

    if (isTitle) {
      const headingTag = indent === 0 ? "h2" : indent === 1 ? "h3" : "h4";
      bodyHtml += `<div style="margin-top:24px;margin-bottom:12px;page-break-after:avoid;">
        <${headingTag} style="color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:0;font-size:${indent === 0 ? "1.25rem" : "1.1rem"}; font-weight: 700;">
          ${req.itemNumber ? `<span style="color:#64748b;margin-right:8px;">${escapeHtml(req.itemNumber)}</span>` : ""}
          ${escapeHtml(req.title || req.content)}
        </${headingTag}>
      </div>`;
    } else {
      const formattedContent = renderMarkdownToHtml(req.content);
      bodyHtml += `<div style="margin-bottom:16px;padding-left:${indent * 12}px;">
        ${req.title ? `<div style="font-weight:600;color:#1e293b;margin-bottom:4px;">${req.itemNumber ? `${escapeHtml(req.itemNumber)} ` : ""}${escapeHtml(req.title)}</div>` : ""}
        ${formattedContent}
      </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Export Document</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      mermaid.initialize({ startOnLoad: true, theme: 'neutral', securityLevel: 'loose' });
    });
  </script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 1100px; margin: 0 auto; padding: 40px; background: #ffffff; color: #1e293b; line-height: 1.6; }
    h1 { font-size: 1.75rem; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 8px; font-weight: 700; }
    .doc-meta { color: #64748b; font-size: 0.85rem; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .no-print { display: flex; gap: 12px; margin-bottom: 24px; justify-content: flex-end; }
    .btn-print { background: #0f172a; color: #ffffff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .btn-print:hover { background: #1e293b; }
    .mermaid { display: flex; justify-content: center; margin: 16px 0; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #94a3b8; text-align: center; }
    
    @media print {
      body { padding: 0; max-width: 100%; background: #fff; font-size: 10.5pt; }
      .no-print { display: none !important; }
      .mermaid-box { page-break-inside: avoid; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; }
      h1, h2, h3, h4 { page-break-after: avoid; }
      .footer { position: fixed; bottom: 0; width: 100%; background: #fff; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" class="btn-print">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Print / Save as PDF
    </button>
  </div>
  <h1>${escapeHtml(title)}</h1>
  <div class="doc-meta">
    <div><strong>Category:</strong> ${escapeHtml(docCategory)} &nbsp;|&nbsp; <strong>Status:</strong> ${escapeHtml(status)} &nbsp;|&nbsp; <strong>Version:</strong> v${majorVersion}.${minorVersion}</div>
    <div>Generated: ${new Date().toLocaleDateString()}</div>
  </div>
  <main>
    ${bodyHtml}
  </main>
  <div class="footer">Generated by DocuMan — Document Engineering & Traceability System</div>
</body>
</html>`;
}
