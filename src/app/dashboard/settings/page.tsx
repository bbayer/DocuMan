export default function SettingsPage() {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your DocuMan instance</p>
      </div>

      <div className="flex flex-col gap-5">
        {/* AI Configuration */}
        <div className="card">
          <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, marginBottom: "var(--space-4)" }}>
            AI Configuration
          </h2>
          <div className="flex flex-col gap-4">
            <div className="input-group">
              <label className="input-label">API Base URL</label>
              <input
                className="input"
                type="text"
                placeholder="https://api.openai.com/v1"
                defaultValue={process.env.NEXT_PUBLIC_AI_API_BASE_URL || ""}
                disabled
              />
              <span className="text-xs text-tertiary">
                Set via AI_API_BASE_URL environment variable
              </span>
            </div>
            <div className="input-group">
              <label className="input-label">Model</label>
              <input
                className="input"
                type="text"
                placeholder="gpt-4o"
                defaultValue={process.env.NEXT_PUBLIC_AI_MODEL || ""}
                disabled
              />
              <span className="text-xs text-tertiary">
                Set via AI_MODEL environment variable
              </span>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, marginBottom: "var(--space-4)" }}>
            About DocuMan
          </h2>
          <div className="text-sm text-secondary" style={{ lineHeight: "var(--line-height-relaxed)" }}>
            <p>
              DocuMan is an AI-powered requirements management system supporting
              MIL-STD-498 document types (SRS, SDD, STP, IRS).
            </p>
            <p style={{ marginTop: "var(--space-3)" }}>
              Features: document upload &amp; AI parsing, structured editing,
              derivative document generation, requirement-level traceability,
              version control, and PDF export.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
