/**
 * J-STD-016 Section Templates
 *
 * Canonical English reference for document section structures.
 * The LLM translates these at runtime into the target language.
 */

export interface SectionTemplate {
  section: string;
  title: string;
}

// ---------------------------------------------------------------------------
// SRS — Software Requirements Specification (DI-IPSC-81433)
// ---------------------------------------------------------------------------
export const SRS_SECTIONS: SectionTemplate[] = [
  { section: "1", title: "Scope" },
  { section: "1.1", title: "Identification" },
  { section: "1.2", title: "System overview" },
  { section: "1.3", title: "Document overview" },
  { section: "2", title: "Referenced documents" },
  { section: "3", title: "Requirements" },
  { section: "3.1", title: "Required states and modes" },
  { section: "3.2", title: "CSCI capability requirements" },
  { section: "3.3", title: "CSCI external interface requirements" },
  { section: "3.4", title: "CSCI internal interface requirements" },
  { section: "3.5", title: "CSCI internal data requirements" },
  { section: "3.6", title: "Adaptation requirements" },
  { section: "3.7", title: "Safety requirements" },
  { section: "3.8", title: "Security and privacy requirements" },
  { section: "3.9", title: "CSCI environment requirements" },
  { section: "3.10", title: "Computer resource requirements" },
  { section: "3.11", title: "Software quality factors" },
  { section: "3.12", title: "Design and implementation constraints" },
  { section: "3.13", title: "Personnel-related requirements" },
  { section: "3.14", title: "Training-related requirements" },
  { section: "3.15", title: "Logistics-related requirements" },
  { section: "3.16", title: "Other requirements" },
  { section: "3.17", title: "Packaging requirements" },
  { section: "3.18", title: "Precedence and criticality of requirements" },
  { section: "4", title: "Qualification requirements" },
  { section: "5", title: "Requirements traceability" },
  { section: "6", title: "Notes" },
];

// ---------------------------------------------------------------------------
// SSS — System/Subsystem Specification
// ---------------------------------------------------------------------------
export const SSS_SECTIONS: SectionTemplate[] = [
  { section: "1", title: "Scope" },
  { section: "1.1", title: "Identification" },
  { section: "1.2", title: "System overview" },
  { section: "1.3", title: "Document overview" },
  { section: "2", title: "Referenced documents" },
  { section: "3", title: "Requirements" },
  { section: "3.1", title: "Required states and modes" },
  { section: "3.2", title: "System capability requirements" },
  { section: "3.3", title: "System external interface requirements" },
  { section: "3.4", title: "System internal interface requirements" },
  { section: "3.5", title: "System internal data requirements" },
  { section: "3.6", title: "Adaptation requirements" },
  { section: "3.7", title: "Safety requirements" },
  { section: "3.8", title: "Security and privacy requirements" },
  { section: "3.9", title: "System environment requirements" },
  { section: "3.10", title: "Computer resource requirements" },
  { section: "3.11", title: "System quality factors" },
  { section: "3.12", title: "Design and implementation constraints" },
  { section: "3.13", title: "Personnel-related requirements" },
  { section: "3.14", title: "Training-related requirements" },
  { section: "3.15", title: "Logistics-related requirements" },
  { section: "3.16", title: "Other requirements" },
  { section: "3.17", title: "Packaging requirements" },
  { section: "3.18", title: "Precedence and criticality of requirements" },
  { section: "4", title: "Qualification provisions" },
  { section: "5", title: "Requirements traceability" },
  { section: "6", title: "Notes" },
];

// ---------------------------------------------------------------------------
// SDD — Software Design Description
// ---------------------------------------------------------------------------
export const SDD_SECTIONS: SectionTemplate[] = [
  { section: "1", title: "Scope" },
  { section: "1.1", title: "Identification" },
  { section: "1.2", title: "System overview" },
  { section: "1.3", title: "Document overview" },
  { section: "2", title: "Referenced documents" },
  { section: "3", title: "CSCI-wide design decisions" },
  { section: "3.1", title: "Design decisions on software architecture" },
  { section: "3.2", title: "Design decisions on data processing & storage" },
  { section: "3.3", title: "Design decisions on safety and error handling" },
  { section: "4", title: "CSCI architectural design" },
  { section: "4.1", title: "CSCI components & module breakdown" },
  { section: "4.2", title: "Concept of execution & execution control" },
  { section: "4.3", title: "Interface design & data flows" },
  { section: "5", title: "CSCI detailed design" },
  { section: "5.1", title: "Software units & function specifications" },
  { section: "5.2", title: "Data dictionary & data structures" },
  { section: "5.3", title: "Internal interface specifications" },
  { section: "6", title: "Requirements traceability" },
  { section: "7", title: "Notes" },
];

// ---------------------------------------------------------------------------
// STP — Software Test Plan
// ---------------------------------------------------------------------------
export const STP_SECTIONS: SectionTemplate[] = [
  { section: "1", title: "Scope" },
  { section: "2", title: "Referenced documents" },
  { section: "3", title: "Software test environment" },
  { section: "3.1", title: "Software items" },
  { section: "3.2", title: "Test sites" },
  { section: "3.3", title: "Test support" },
  { section: "4", title: "Test identification" },
  { section: "4.1", title: "General information" },
  { section: "4.2", title: "Planned tests" },
  { section: "5", title: "Test schedules" },
  { section: "6", title: "Requirements traceability" },
  { section: "7", title: "Notes" },
];

// ---------------------------------------------------------------------------
// IRS — Interface Requirements Specification
// ---------------------------------------------------------------------------
export const IRS_SECTIONS: SectionTemplate[] = [
  { section: "1", title: "Scope" },
  { section: "2", title: "Referenced documents" },
  { section: "3", title: "Requirements" },
  { section: "3.1", title: "Interface identification" },
  { section: "3.2", title: "Interface requirements" },
  { section: "4", title: "Qualification requirements" },
  { section: "5", title: "Requirements traceability" },
  { section: "6", title: "Notes" },
];

// ---------------------------------------------------------------------------
// SSDD — System/Subsystem Design Description (DI-IPSC-81432)
// ---------------------------------------------------------------------------
export const SSDD_SECTIONS: SectionTemplate[] = [
  { section: "1", title: "Scope" },
  { section: "1.1", title: "Identification" },
  { section: "1.2", title: "System overview" },
  { section: "1.3", title: "Document overview" },
  { section: "2", title: "Referenced documents" },
  { section: "3", title: "System-wide design decisions" },
  { section: "3.1", title: "System architectural decisions & constraints" },
  { section: "3.2", title: "Design decisions on operational concept & behavior" },
  { section: "3.3", title: "Design decisions on safety, security, privacy & fault tolerance" },
  { section: "4", title: "System architectural design" },
  { section: "4.1", title: "System component breakdown (Subsystems, HWCIs, CSCIs, Manual Operations)" },
  { section: "4.2", title: "Concept of execution & operational scenarios" },
  { section: "4.3", title: "System interface design & data flow architecture" },
  { section: "5", title: "System detailed design" },
  { section: "5.1", title: "Detailed design of system components (Subsystems/HW/SW)" },
  { section: "5.2", title: "System interface detailed specifications & message schemas" },
  { section: "5.3", title: "System element allocations & resource budgets (memory, processing, bandwidth)" },
  { section: "6", title: "Requirements traceability" },
  { section: "7", title: "Notes" },
];

// ---------------------------------------------------------------------------
// IDD — Interface Design Description (DI-IPSC-81436)
// ---------------------------------------------------------------------------
export const IDD_SECTIONS: SectionTemplate[] = [
  { section: "1", title: "Scope" },
  { section: "1.1", title: "Identification" },
  { section: "1.2", title: "System overview" },
  { section: "1.3", title: "Document overview" },
  { section: "2", title: "Referenced documents" },
  { section: "3", title: "Interface design" },
  { section: "3.1", title: "Interface identification and diagrams" },
  { section: "3.2", title: "Interface detailed design specifications" },
  { section: "4", title: "Requirements traceability" },
  { section: "5", title: "Notes" },
];

// ---------------------------------------------------------------------------
// Lookup helper
// ---------------------------------------------------------------------------
const CATEGORY_MAP: Record<string, SectionTemplate[]> = {
  SRS: SRS_SECTIONS,
  SSS: SSS_SECTIONS,
  SSDD: SSDD_SECTIONS,
  SDD: SDD_SECTIONS,
  STP: STP_SECTIONS,
  IRS: IRS_SECTIONS,
  IDD: IDD_SECTIONS,
};

export function getSectionsForCategory(
  docCategory: string,
): SectionTemplate[] {
  return CATEGORY_MAP[docCategory.toUpperCase()] ?? [];
}

