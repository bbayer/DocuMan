// ─── Types ───────────────────────────────────────────────────────

export interface ValidationDictionary {
  ambiguousTerms: string[];
  obligationShall: string[];
  obligationShould: string[];
  obligationMay: string[];
}

export interface ValidationWarning {
  requirementId: string;
  type:
    | 'AMBIGUOUS_TERM'
    | 'MISSING_OBLIGATION'
    | 'DUPLICATE_CONTENT'
    | 'TERM_INCONSISTENCY'
    | 'UNTESTABLE'
    | 'TOO_LONG'
    | 'MISSING_SECTION';
  message: string;
  suggestion?: string;
}

export interface ValidationResult {
  score: number; // 0-100 quality score
  warnings: ValidationWarning[];
  stats: {
    totalRequirements: number;
    glossaryCompliance: number; // percentage
    requiresReviewCount: number;
    sectionsPopulated: number;
    sectionsMissing: string[];
  };
}

export interface RequirementInput {
  id: string;
  uniqueId: string;
  title: string;
  content: string;
  category: string;
  itemNumber?: string;
}

export interface GlossaryEntry {
  term: string;
  aliases: string; // comma-separated
}

// ─── Hardcoded Defaults ──────────────────────────────────────────

const TURKISH_DEFAULTS: ValidationDictionary = {
  ambiguousTerms: [
    'uygun şekilde',
    'gerektiğinde',
    'yeterli',
    'uygun',
    'vb.',
    'vs.',
    'zamanında',
    'gerekli şekilde',
    'kullanıcı dostu',
    'mümkün olduğunca',
    'kabul edilebilir',
    'yeterince',
  ],
  obligationShall: ['yacaktır', 'yecektir'],
  obligationShould: ['malıdır', 'melidir'],
  obligationMay: ['bilir', 'abilir'],
};

const ENGLISH_DEFAULTS: ValidationDictionary = {
  ambiguousTerms: [
    'appropriate',
    'as needed',
    'etc.',
    'user-friendly',
    'adequate',
    'timely',
    'sufficient',
    'normal',
    'reasonable',
    'as applicable',
  ],
  obligationShall: ['shall'],
  obligationShould: ['should'],
  obligationMay: ['may'],
};

const DEFAULTS_BY_LANGUAGE: Record<string, ValidationDictionary> = {
  tr: TURKISH_DEFAULTS,
  en: ENGLISH_DEFAULTS,
};

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Tokenizes two strings by whitespace, lowercases them, and computes
 * |intersection| / |union| (Jaccard similarity coefficient).
 */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (setA.size === 0 && setB.size === 0) return 1;

  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  if (unionSize === 0) return 1;

  return intersectionSize / unionSize;
}

/**
 * Merges an LLM-generated (partial) dictionary with hardcoded defaults
 * for known languages (en, tr). For unknown languages the LLM dict is
 * used as-is, falling back to empty arrays for missing fields.
 */
export function mergeWithDefaults(
  language: string,
  llmDict: Partial<ValidationDictionary>,
): ValidationDictionary {
  const lang = language.toLowerCase();
  const defaults = DEFAULTS_BY_LANGUAGE[lang];

  if (!defaults) {
    // Unknown language – use whatever the LLM provided
    return {
      ambiguousTerms: llmDict.ambiguousTerms ?? [],
      obligationShall: llmDict.obligationShall ?? [],
      obligationShould: llmDict.obligationShould ?? [],
      obligationMay: llmDict.obligationMay ?? [],
    };
  }

  // Deduplicate by lowercasing
  const dedup = (base: string[], extra: string[]): string[] => {
    const seen = new Set(base.map((t) => t.toLowerCase()));
    const merged = [...base];
    for (const item of extra) {
      if (!seen.has(item.toLowerCase())) {
        seen.add(item.toLowerCase());
        merged.push(item);
      }
    }
    return merged;
  };

  return {
    ambiguousTerms: dedup(defaults.ambiguousTerms, llmDict.ambiguousTerms ?? []),
    obligationShall: dedup(defaults.obligationShall, llmDict.obligationShall ?? []),
    obligationShould: dedup(defaults.obligationShould, llmDict.obligationShould ?? []),
    obligationMay: dedup(defaults.obligationMay, llmDict.obligationMay ?? []),
  };
}

// ─── Escape helper for RegExp ────────────────────────────────────

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Main Validator ──────────────────────────────────────────────

export function validateRequirements(
  requirements: RequirementInput[],
  dictionary: ValidationDictionary,
  glossary?: GlossaryEntry[],
  expectedSections?: { section: string; title: string }[],
): ValidationResult {
  const warnings: ValidationWarning[] = [];

  // Filter to actual requirements for content-level checks
  const reqs = requirements.filter((r) => r.category === 'REQUIREMENT');

  // ── 1. AMBIGUOUS_TERM ────────────────────────────────────────
  for (const req of reqs) {
    const contentLower = req.content.toLowerCase();
    for (const term of dictionary.ambiguousTerms) {
      const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`, 'i');
      if (pattern.test(contentLower)) {
        warnings.push({
          requirementId: req.uniqueId,
          type: 'AMBIGUOUS_TERM',
          message: `Contains ambiguous term: "${term}"`,
          suggestion: `Replace "${term}" with a precise, measurable expression.`,
        });
      }
    }
  }

  // ── 2. MISSING_OBLIGATION ────────────────────────────────────
  const allObligations = [
    ...dictionary.obligationShall,
    ...dictionary.obligationShould,
    ...dictionary.obligationMay,
  ];

  for (const req of reqs) {
    const contentTrimmed = req.content.trim().toLowerCase();
    const hasObligation = allObligations.some((suffix) =>
      contentTrimmed.endsWith(suffix.toLowerCase()),
    );
    if (!hasObligation) {
      warnings.push({
        requirementId: req.uniqueId,
        type: 'MISSING_OBLIGATION',
        message: 'Requirement does not end with an obligation keyword (shall/should/may).',
        suggestion:
          'End the requirement with an obligation verb to clarify its binding level.',
      });
    }
  }

  // ── 3. DUPLICATE_CONTENT ─────────────────────────────────────
  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const sim = jaccardSimilarity(reqs[i].content, reqs[j].content);
      if (sim > 0.8) {
        warnings.push({
          requirementId: reqs[i].uniqueId,
          type: 'DUPLICATE_CONTENT',
          message: `Near-duplicate of ${reqs[j].uniqueId} (similarity: ${(sim * 100).toFixed(0)}%).`,
          suggestion: 'Consider merging or differentiating these requirements.',
        });
        warnings.push({
          requirementId: reqs[j].uniqueId,
          type: 'DUPLICATE_CONTENT',
          message: `Near-duplicate of ${reqs[i].uniqueId} (similarity: ${(sim * 100).toFixed(0)}%).`,
          suggestion: 'Consider merging or differentiating these requirements.',
        });
      }
    }
  }

  // ── 4. TERM_INCONSISTENCY ────────────────────────────────────
  let glossaryViolationCount = 0;
  let glossaryCheckCount = 0;

  if (glossary && glossary.length > 0) {
    for (const req of reqs) {
      const contentLower = req.content.toLowerCase();
      let reqHasViolation = false;

      for (const entry of glossary) {
        const aliases = entry.aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean);

        if (aliases.length === 0) continue;

        const canonicalLower = entry.term.toLowerCase();
        const hasCanonical = contentLower.includes(canonicalLower);

        for (const alias of aliases) {
          const aliasLower = alias.toLowerCase();
          if (aliasLower === canonicalLower) continue;

          if (contentLower.includes(aliasLower) && !hasCanonical) {
            reqHasViolation = true;
            warnings.push({
              requirementId: req.uniqueId,
              type: 'TERM_INCONSISTENCY',
              message: `Uses alias "${alias}" instead of canonical term "${entry.term}".`,
              suggestion: `Replace "${alias}" with "${entry.term}" for consistency.`,
            });
          }
        }
      }

      glossaryCheckCount++;
      if (reqHasViolation) glossaryViolationCount++;
    }
  }

  // ── 5. TOO_LONG ─────────────────────────────────────────────
  for (const req of reqs) {
    const wordCount = req.content.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 300) {
      warnings.push({
        requirementId: req.uniqueId,
        type: 'TOO_LONG',
        message: `Requirement is ${wordCount} words long (max recommended: 300).`,
        suggestion: 'Break this into smaller, more focused requirements.',
      });
    }
  }

  // ── 6. UNTESTABLE ───────────────────────────────────────────
  for (const req of reqs) {
    if (!/\d/.test(req.content)) {
      warnings.push({
        requirementId: req.uniqueId,
        type: 'UNTESTABLE',
        message: 'Requirement contains no numeric value, which may make it hard to test.',
        suggestion: 'Add measurable criteria (numbers, thresholds, percentages).',
      });
    }
  }

  // ── 7. MISSING_SECTION ──────────────────────────────────────
  const sectionsMissing: string[] = [];
  let sectionsPopulated = 0;

  if (expectedSections && expectedSections.length > 0) {
    for (const section of expectedSections) {
      const hasReq = requirements.some((r) =>
        (r.itemNumber && (r.itemNumber === section.section || r.itemNumber.startsWith(section.section + "."))) ||
        (r.uniqueId && r.uniqueId.startsWith(section.section)) ||
        r.id.startsWith(section.section)
      );
      if (hasReq) {
        sectionsPopulated++;
      } else {
        sectionsMissing.push(section.title);
        warnings.push({
          requirementId: section.section,
          type: 'MISSING_SECTION',
          message: `Section "${section.title}" (${section.section}) has no requirements.`,
          suggestion: 'Add requirements for this section or remove it from the template.',
        });
      }
    }
  } else {
    // If no expected sections, count unique section prefixes from requirements
    const uniqueSections = new Set(
      requirements.map((r) => r.id.split('.').slice(0, 1).join('.')),
    );
    sectionsPopulated = uniqueSections.size;
  }

  // ── Compute quality score ───────────────────────────────────
  const penaltyMap: Record<ValidationWarning['type'], number> = {
    AMBIGUOUS_TERM: 2,
    MISSING_OBLIGATION: 3,
    DUPLICATE_CONTENT: 5,
    TERM_INCONSISTENCY: 2,
    TOO_LONG: 1,
    UNTESTABLE: 1,
    MISSING_SECTION: 0, // Not counted in score penalties per spec
  };

  let score = 100;
  for (const warning of warnings) {
    score -= penaltyMap[warning.type];
  }
  score = Math.max(0, Math.min(100, score));

  // ── Compute glossary compliance ─────────────────────────────
  const glossaryCompliance =
    glossaryCheckCount > 0
      ? Math.round(
          ((glossaryCheckCount - glossaryViolationCount) / glossaryCheckCount) * 100,
        )
      : 100;

  return {
    score,
    warnings,
    stats: {
      totalRequirements: reqs.length,
      glossaryCompliance,
      requiresReviewCount: warnings.length,
      sectionsPopulated,
      sectionsMissing,
    },
  };
}
