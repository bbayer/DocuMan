# DocuMan 🚀

**DocuMan** is a next-generation, AI-powered systems engineering workspace designed to automate the extraction, management, derivation, versioning, and traceability of technical documentation. Built for systems architects and requirements engineers, DocuMan translates high-level specifications into MIL-STD-498 / PPI PPA-003461-5 compliant derivatives, visualizes architectural Mermaid diagrams live in the browser, and manages suspect traceability links.

---

## 🌟 Key Features

### 1. Automated AI Document Parsing & Extraction
* **Multi-Format Support**: Upload source files in **PDF**, **DOCX**, or **TXT** formats.
* **Intelligent Chunked Extraction**: Parses documents of any length without static token truncation.
* **Structured Categorization**: Groups elements into `TITLE` (headings), `REQUIREMENT` (specifications/shall-statements), `PARAGRAPH` (descriptive text), and `NOTE` (remarks).
* **Automatic Item Numbering**: Detects and structures hierarchically nested item numbers (e.g., `3.2.1`).

### 2. 3-Pass High-Precision AI Derivation Engine
* **Pass 1 — Global Document & Functional Analysis**: Analyzes the entire source document to extract executive summaries, canonical terminology glossaries, cross-cutting themes, and a **System Functions Registry** grouping related parent requirements (`SSS-001`, `SSS-002`, `SSS-005`) into granular System Functions (`Fn-001`, `Fn-002`...).
* **Pass 2 — Architectural Pre-Pass Synthesis**: Synthesizes Section 1 (`1.1 Identification`, `1.2 System overview`, `1.3 Document overview`), Section 2 (`Referenced documents`), and Section 3 (`3.1 Architectural`, `3.2 Operational`, `3.3 Safety & Security decisions`) FIRST, establishing the global architectural blueprint before chunk processing.
* **Pass 3 — Chunk Breakdown & Section 5.2 Functional Tables**: Generates Section 5.2 Functional Architecture tables with exact 4-row formats (Function Name, Description, bulleted Inputs & Outputs with data subfields/structures, and parent Requirement Reference IDs).

### 3. Live Visual Mermaid Diagram Rendering
* **Interactive Browser Rendering**: Client-side responsive SVG Mermaid rendering (`<MermaidViewer />`) with a **Show / Hide Mermaid Code** toggle in the Document Editor UI.
* **Architectural & Data Flow Diagrams**: Generates visual system component breakdown diagrams (Section 4.1) and data flow diagrams (Section 4.3).
* **PDF & HTML Export Integration**: Embedded Mermaid JS library for 1-click **Export HTML / Print to PDF**.

### 4. Mandatory Interface & Signal Specification Tables
* **Section 4.3 System Interface Summary Tables**: Renders subsystem interface summary tables (`Interface ID`, `Source Subsystem / HWCI`, `Target Subsystem / CSCI`, `Protocol / Transport`, `Data Exchanged`).
* **Section 5.3 Signal & Data Dictionary Tables**: Renders detailed signal specifications (`Signal ID`, `Name`, `Data Type & Range`, `Subfields / Payload Structure`, `Rate / Latency`, `Upstream SSS Reqs`).

### 5. Leaf Section Mapping & Scoped Item Numbering
* **Strict Leaf Section Mapping**: Maps derived items ONLY to leaf sub-sections (`1.1`, `1.2`, `1.3`, `2`, `3.1`, `3.2`, `3.3`, `4.1`, `4.2`, `4.3`, `5.1`, `5.2`, `5.3`, `5.4`, `6`, `7`).
* **Clean Scoped Numbering**: Assigns clean sub-section item numbers (`1.1.1`, `1.1.2`, `1.2.1`, `1.2.2`, `3.1.1`, `5.2.1`).
* **Human-Readable Tracing**: Replaces raw internal database UUIDs with human-readable Requirement Reference Numbers (`SSS-001`, `SSS-004`).

### 6. Multi-Pane Interactive Requirement Editor & Tree Repair
* **Inline Editing & Live Search**: Modify requirements directly within the structured document view with real-time text search.
* **Granular Versioning & Approval**: Tracks edits at both document and requirement levels (`DRAFT` ➔ `REVIEW` ➔ `PUBLISHED`).
* **Sequential Tree Repair**: Built-in `repairDocumentStructure` server action for physical depth-first re-numbering of document requirement trees.

### 7. Traceability & Suspect Link Management
* **Requirement-Level Linking**: Link derived requirements to original source documents (`DERIVED_FROM`, `SATISFIES`, `RELATED_TO`).
* **Suspect Link Flags**: Automatically flags downstream links as "suspect" when parent requirements are modified.

### 8. Modal Window Protection
* **Backdrop Click Lock**: Prevents accidental modal closing during AI document derivation (`loading` state lock).
* **Real-time Progress Banner**: Displays live percentage (`%`) and active synthesis step inside the modal.

---

## 🛠️ Tech Stack

* **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Actions)
* **Frontend**: React 19, TypeScript, Vanilla CSS, [Mermaid JS](https://mermaid.js.org/)
* **Database & ORM**: [Prisma ORM](https://www.prisma.io/) with SQLite (development) or PostgreSQL (production)
* **AI Integration**: [Vercel AI SDK](https://sdk.vercel.ai/docs) & `@ai-sdk/openai-compatible`
* **Parsing Utilities**: `pdf-parse`, `officeparser` (DOCX), standard text streams
* **Export Engine**: HTML Exporter with Mermaid JS & `@media print` PDF engine

---

## 📂 Project Structure

```bash
DocuMan/
├── prisma/                  # Prisma Database Schemas & Migrations
│   ├── dev.db               # SQLite Local Database (Auto-generated)
│   └── schema.prisma        # Database Models & Schema Definition
├── src/
│   ├── app/
│   │   ├── actions.ts       # Server Actions (CRUD, repairDocumentStructure)
│   │   ├── api/             # API Endpoints (Upload, Derive, Export)
│   │   ├── dashboard/       # Dashboard, projects, document editor, and traceability
│   │   ├── globals.css      # Core Design System
│   │   ├── layout.tsx       # Root layout
│   │   └── page.tsx         # Dashboard landing page
│   ├── components/
│   │   └── mermaid-viewer.tsx # Client-side visual SVG Mermaid diagram component
│   └── lib/
│       ├── ai/              # Derivative generator, document analyzer, quality validator
│       ├── export/          # HTML & PDF exporter engine with Mermaid JS
│       ├── parsers/         # PDF, DOCX, TXT parser modules
│       ├── standards/       # J-STD-016 & MIL-STD-498 outline templates
│       └── db.ts            # Prisma Database client initializer
├── uploads/                 # Local directory for storing original files
├── Dockerfile               # Production container config
└── package.json             # NPM dependencies & build scripts
```

---

## 📜 Supported MIL-STD-498 & Superseding Standards

DocuMan provides first-class support for MIL-STD-498 and modern superseding standards (EIA/IEEE J-STD-016, IEEE 1016-2009, ISO/IEC/IEEE 15288, and ISO/IEC/IEEE 42010):

| Category | Standard Document Type | MIL-STD-498 DID | IEEE / ISO Superseding Standard | Purpose & Focus |
| :--- | :--- | :--- | :--- | :--- |
| **SSS** | System/Subsystem Specification | DI-IPSC-81431 | ISO/IEC/IEEE 29148 | High-level system & subsystem requirements |
| **SSDD** | System/Subsystem Design Description | DI-IPSC-81432 | IEEE 1016 / ISO 42010 | System architecture, HW/SW component breakdown (HWCIs/CSCIs), operational concept, and 4-row functional tables |
| **SRS** | Software Requirements Specification | DI-IPSC-81433 | IEEE 830 / ISO 29148 | Detailed software requirements for Computer Software Configuration Items (CSCIs) |
| **SDD** | Software Design Description | DI-IPSC-81435 | IEEE 1016-2009 | CSCI software unit internal design, functions, data structures, and algorithms |
| **IRS** | Interface Requirements Specification | DI-IPSC-81434 | ISO/IEC/IEEE 29148 | External system interface requirements |
| **IDD** | Interface Design Description | DI-IPSC-81436 | IEEE 1016 | Detailed physical & logical interface message schemas and pinouts |
| **STP** | Software Test Plan | DI-IPSC-81438 | IEEE 829 / ISO 29119 | Verification procedures, test environments, and qualification provisions |

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** (v18.x or later)
* **npm** (v9.x or later)
* An API key for an OpenAI-compatible model endpoint (e.g., OpenAI, DeepSeek, or Anthropic proxy).

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/DocuMan.git
cd DocuMan
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

Review and update the variables:
* `DATABASE_URL`: Path to your database (defaults to local SQLite `file:./dev.db`).
* `AI_API_BASE_URL`: Base URL for OpenAI-compatible chat model API (e.g. `https://api.openai.com/v1`).
* `AI_API_KEY`: Your model API provider credential.
* `AI_MODEL`: Chat model to use (e.g., `gpt-4o`, `gpt-4-turbo`).
* `UPLOAD_DIR`: Path to the directory where uploads are stored (defaults to `./uploads`).

### 3. Initialize the Database
Run database migrations:
```bash
# Generate the Prisma client code
npm run db:generate

# Push schema directly to the database
npm run db:push
```

### 4. Start Development Server
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser to view the application.

---

## 🛠️ Build & Verification Commands

```bash
# Type check TypeScript files
npx tsc --noEmit

# Build production bundle
npm run build
```
