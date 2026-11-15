import {
  REQUEST_CATEGORIES,
  type RequestCategory,
  type RequestPriority,
} from "shared";

/**
 * All triage behaviour lives in this one exported table: category terms,
 * priority terms, thresholds, and tie-break order. The eval harness and the
 * unit tests reason about the exact same data the runtime uses.
 */

export interface WeightedTerm {
  term: string;
  weight: number;
}

export interface CategoryRule {
  category: RequestCategory;
  terms: WeightedTerm[];
}

export interface PriorityRule {
  priority: RequestPriority;
  terms: WeightedTerm[];
}

export interface TriageThresholds {
  /** Below this category score, everything falls back to `other`. */
  minimumCategoryScore: number;
  /** Top-two gap below this (for weak matches) is treated as ambiguous. */
  ambiguousMargin: number;
  /** A score at or above this is strong enough to survive a close tie. */
  confidentScore: number;
}

export interface TriageMatch {
  term: string;
  weight: number;
  count: number;
  score: number;
}

export interface CategoryClassification {
  category: RequestCategory;
  scores: Record<RequestCategory, number>;
  matches: TriageMatch[];
  fallback: boolean;
  topScore: number;
  secondScore: number;
  margin: number;
  runnerUp: RequestCategory | null;
}

export interface PriorityClassification {
  priority: RequestPriority;
  scores: Record<RequestPriority, number>;
  matches: TriageMatch[];
}

export interface TriageSignals {
  categoryScores: Record<RequestCategory, number>;
  priorityScores: Record<RequestPriority, number>;
  categoryMatches: TriageMatch[];
  priorityMatches: TriageMatch[];
  runnerUp: RequestCategory | null;
  margin: number;
  fallback: boolean;
}

export interface TriageResult {
  category: RequestCategory;
  priority: RequestPriority;
  confidence: number;
  signals: TriageSignals;
}

export const TRIAGE_RULES = {
  categories: [
    {
      category: "equipment",
      terms: [
        { term: "laptop*", weight: 5 },
        { term: "macbook*", weight: 5 },
        { term: "thinkpad*", weight: 5 },
        { term: "monitor*", weight: 4 },
        { term: "second monitor", weight: 6 },
        { term: "keyboard*", weight: 4 },
        { term: "mouse", weight: 4 },
        { term: "headset*", weight: 4 },
        { term: "dock*", weight: 3 },
        { term: "docking station", weight: 6 },
        { term: "charger*", weight: 4 },
        { term: "webcam*", weight: 4 },
        { term: "desk", weight: 3 },
        { term: "standing desk", weight: 6 },
        { term: "chair*", weight: 3 },
        { term: "hardware", weight: 3 },
        { term: "equipment", weight: 4 },
        { term: "device*", weight: 3 },
        { term: "peripheral*", weight: 3 },
        { term: "replacement battery", weight: 6 },
        { term: "battery", weight: 2 },
        { term: "loaner", weight: 3 },
        { term: "printer*", weight: 3 },
        { term: "usb c", weight: 2 },
        { term: "stolen", weight: 3 },
        { term: "shipping", weight: 1 },
      ],
    },
    {
      category: "onboarding",
      terms: [
        { term: "onboard*", weight: 6 },
        { term: "new hire", weight: 7 },
        { term: "new teammate", weight: 5 },
        { term: "first day", weight: 6 },
        { term: "day one", weight: 5 },
        { term: "orientation", weight: 4 },
        { term: "buddy", weight: 3 },
        { term: "start date", weight: 4 },
        { term: "welcome kit", weight: 5 },
        { term: "intern*", weight: 4 },
        { term: "new engineer", weight: 4 },
        { term: "new designer", weight: 4 },
        { term: "new sales", weight: 3 },
        { term: "joining", weight: 3 },
        { term: "checklist", weight: 2 },
        { term: "ramp*", weight: 3 },
        { term: "week one", weight: 3 },
        { term: "first week", weight: 4 },
        { term: "contractor", weight: 2 },
        { term: "paperwork", weight: 2 },
        { term: "swag", weight: 2 },
      ],
    },
    {
      category: "policy",
      terms: [
        { term: "policy", weight: 5 },
        { term: "policies", weight: 5 },
        { term: "handbook", weight: 5 },
        { term: "pto", weight: 5 },
        { term: "vacation", weight: 4 },
        { term: "time off", weight: 4 },
        { term: "leave", weight: 3 },
        { term: "parental leave", weight: 6 },
        { term: "bereavement", weight: 5 },
        { term: "sick leave", weight: 6 },
        { term: "sick", weight: 3 },
        { term: "remote work", weight: 6 },
        { term: "work remotely", weight: 5 },
        { term: "international", weight: 3 },
        { term: "relocat*", weight: 3 },
        { term: "travel", weight: 4 },
        { term: "expense", weight: 3 },
        { term: "reimbursement", weight: 3 },
        { term: "code of conduct", weight: 6 },
        { term: "training", weight: 2 },
        { term: "holiday", weight: 4 },
        { term: "allowed", weight: 2 },
        { term: "entitled", weight: 3 },
        { term: "entitlement", weight: 3 },
        { term: "permitted", weight: 3 },
        { term: "guideline*", weight: 3 },
        { term: "notice period", weight: 4 },
        { term: "mandatory", weight: 3 },
        { term: "accommodation", weight: 3 },
      ],
    },
    {
      category: "access",
      terms: [
        { term: "access", weight: 4 },
        { term: "permission*", weight: 5 },
        { term: "login", weight: 4 },
        { term: "log in", weight: 4 },
        { term: "locked out", weight: 6 },
        { term: "sso", weight: 6 },
        { term: "vpn", weight: 5 },
        { term: "password", weight: 5 },
        { term: "reset", weight: 2 },
        { term: "mfa", weight: 4 },
        { term: "2fa", weight: 4 },
        { term: "account*", weight: 3 },
        { term: "admin rights", weight: 6 },
        { term: "admin access", weight: 6 },
        { term: "github", weight: 4 },
        { term: "jira", weight: 4 },
        { term: "repository", weight: 3 },
        { term: "repo", weight: 3 },
        { term: "deploy permission", weight: 6 },
        { term: "credentials", weight: 3 },
        { term: "shared mailbox", weight: 5 },
        { term: "badge", weight: 3 },
        { term: "read only", weight: 3 },
      ],
    },
    {
      category: "payroll",
      terms: [
        { term: "payroll", weight: 6 },
        { term: "salary", weight: 6 },
        { term: "payslip", weight: 6 },
        { term: "pay slip", weight: 5 },
        { term: "compensation", weight: 4 },
        { term: "bonus", weight: 4 },
        { term: "tax", weight: 4 },
        { term: "w 4", weight: 5 },
        { term: "w4", weight: 5 },
        { term: "withholding", weight: 5 },
        { term: "direct deposit", weight: 6 },
        { term: "401k", weight: 5 },
        { term: "benefits", weight: 3 },
        { term: "overtime", weight: 5 },
        { term: "paycheck", weight: 5 },
        { term: "payday", weight: 5 },
        { term: "equity", weight: 3 },
        { term: "stock options", weight: 3 },
        { term: "invoice", weight: 2 },
        { term: "advance", weight: 2 },
        { term: "not paid", weight: 4 },
        { term: "reimbursement", weight: 4 },
        { term: "expense report", weight: 5 },
        { term: "stipend", weight: 4 },
      ],
    },
    {
      category: "other",
      terms: [
        { term: "not sure", weight: 5 },
        { term: "not certain", weight: 5 },
        { term: "don t know", weight: 4 },
        { term: "who should i", weight: 5 },
        { term: "who owns", weight: 4 },
        { term: "general question", weight: 5 },
        { term: "does not fit", weight: 5 },
        { term: "miscellaneous", weight: 5 },
        { term: "something else", weight: 4 },
        { term: "other", weight: 3 },
        { term: "random", weight: 3 },
        { term: "plant", weight: 4 },
        { term: "office plant", weight: 6 },
        { term: "personal mail", weight: 6 },
        { term: "personal package", weight: 5 },
        { term: "desk move", weight: 5 },
        { term: "offsite", weight: 4 },
        { term: "recognition award", weight: 5 },
        { term: "conference ticket", weight: 4 },
        { term: "facilities", weight: 4 },
        { term: "hoodie", weight: 4 },
        { term: "lost badge", weight: 5 },
        { term: "quiet workspace", weight: 4 },
      ],
    },
  ] as CategoryRule[],

  priorities: [
    {
      priority: "p0",
      terms: [
        { term: "stolen", weight: 6 },
        { term: "locked out", weight: 5 },
        { term: "cannot log in", weight: 4 },
        { term: "can t log in", weight: 4 },
        { term: "production down", weight: 6 },
        { term: "release blocked", weight: 5 },
        { term: "blocking", weight: 3 },
        { term: "salary not paid", weight: 6 },
        { term: "not paid", weight: 5 },
        { term: "no laptop", weight: 5 },
        { term: "today", weight: 2 },
        { term: "asap", weight: 2 },
        { term: "urgent", weight: 4 },
        { term: "critical", weight: 4 },
        { term: "outage", weight: 6 },
        { term: "security incident", weight: 6 },
        { term: "demo in", weight: 4 },
        { term: "one hour", weight: 4 },
        { term: "immediately", weight: 3 },
        { term: "tomorrow", weight: 2 },
      ],
    },
    {
      priority: "p1",
      terms: [
        { term: "blocking", weight: 2 },
        { term: "this week", weight: 2 },
        { term: "before monday", weight: 3 },
        { term: "soon", weight: 2 },
        { term: "customer", weight: 1 },
        { term: "deadline", weight: 2 },
        { term: "medical", weight: 2 },
        { term: "bereavement", weight: 2 },
        { term: "cannot work", weight: 4 },
        { term: "failing", weight: 2 },
        { term: "missing overtime", weight: 2 },
        { term: "missing", weight: 1 },
        { term: "unable to", weight: 2 },
        { term: "not working", weight: 2 },
      ],
    },
    {
      priority: "p3",
      terms: [
        { term: "no urgency", weight: 5 },
        { term: "not urgent", weight: 5 },
        { term: "whenever", weight: 4 },
        { term: "eventually", weight: 3 },
        { term: "low priority", weight: 5 },
        { term: "nice to have", weight: 3 },
        { term: "curious", weight: 2 },
        { term: "question", weight: 1 },
        { term: "sometime", weight: 2 },
        { term: "no rush", weight: 4 },
        { term: "fyi", weight: 3 },
        { term: "not blocking", weight: 4 },
      ],
    },
  ] as PriorityRule[],

  thresholds: {
    minimumCategoryScore: 3.5,
    ambiguousMargin: 1,
    confidentScore: 6,
  } satisfies TriageThresholds,

  tieBreakOrder: ["equipment", "onboarding", "access", "payroll", "policy", "other"] as RequestCategory[],

  priorityTieBreakOrder: ["p0", "p1", "p2", "p3"] as RequestPriority[],
} as const;

/* ------------------------------------------------------------------ */
/* Lexical matching                                                    */
/* ------------------------------------------------------------------ */

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function countOccurrences(tokens: string[], pattern: string[]): number {
  if (pattern.length === 0) return 0;
  let count = 0;
  for (let i = 0; i <= tokens.length - pattern.length; i += 1) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      const token = tokens[i + j] ?? "";
      const patternToken = pattern[j] ?? "";
      if (patternToken.endsWith("*")) {
        if (!token.startsWith(patternToken.slice(0, -1))) matched = false;
      } else if (token !== patternToken) {
        matched = false;
      }
      if (!matched) break;
    }
    if (matched) count += 1;
  }
  return count;
}

/** Counts each term at most twice so keyword stuffing cannot dominate. */
function scoreTerms(
  tokens: string[],
  terms: readonly WeightedTerm[],
): { score: number; matches: TriageMatch[] } {
  let score = 0;
  const matches: TriageMatch[] = [];
  for (const rule of terms) {
    const pattern = tokenize(rule.term);
    const rawCount = countOccurrences(tokens, pattern);
    if (rawCount === 0) continue;
    const count = Math.min(rawCount, 2);
    const termScore = rule.weight * count;
    score += termScore;
    matches.push({ term: rule.term, weight: rule.weight, count, score: termScore });
  }
  matches.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
  return { score, matches };
}

function emptyScores<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

export function classifyCategory(text: string): CategoryClassification {
  const tokens = tokenize(text);
  const scores = emptyScores(REQUEST_CATEGORIES);
  const allMatches: TriageMatch[] = [];

  for (const rule of TRIAGE_RULES.categories) {
    const { score, matches } = scoreTerms(tokens, rule.terms);
    scores[rule.category] = score;
    for (const match of matches) allMatches.push(match);
  }
  allMatches.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));

  const ranked = TRIAGE_RULES.tieBreakOrder
    .map((category) => ({ category, score: scores[category] }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0] ?? { category: "other" as RequestCategory, score: 0 };
  const second = ranked[1] ?? { category: "other" as RequestCategory, score: 0 };
  const margin = top.score - second.score;

  const thresholds = TRIAGE_RULES.thresholds;
  let category = top.category;
  let fallback = false;

  if (top.score < thresholds.minimumCategoryScore) {
    category = "other";
    fallback = true;
  } else if (
    top.score < thresholds.confidentScore &&
    margin < thresholds.ambiguousMargin &&
    top.category !== "other"
  ) {
    category = "other";
    fallback = true;
  }

  return {
    category,
    scores,
    matches: allMatches,
    fallback,
    topScore: top.score,
    secondScore: second.score,
    margin,
    runnerUp: second.score > 0 && second.category !== top.category ? second.category : null,
  };
}

export function classifyPriority(text: string): PriorityClassification {
  const tokens = tokenize(text);
  const scores = emptyScores(["p0", "p1", "p2", "p3"] as const);
  const allMatches: TriageMatch[] = [];

  for (const rule of TRIAGE_RULES.priorities) {
    const { score, matches } = scoreTerms(tokens, rule.terms);
    scores[rule.priority] = score;
    for (const match of matches) allMatches.push(match);
  }
  allMatches.sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));

  const ranked = TRIAGE_RULES.priorityTieBreakOrder
    .map((priority) => ({ priority, score: scores[priority] }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const priority = top && top.score > 0 ? top.priority : "p2";

  return { priority, scores, matches: allMatches };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic triage entry point. No randomness, no clock, no I/O: the same
 * string always yields the same category, priority, confidence, and signals.
 */
export function triage(text: string): TriageResult {
  const categoryResult = classifyCategory(text);
  const priorityResult = classifyPriority(text);

  const ratio =
    categoryResult.topScore > 0 ? categoryResult.margin / categoryResult.topScore : 0;
  const strength = Math.min(categoryResult.topScore, 12) / 12;
  const confidence = categoryResult.fallback
    ? round2(clamp(0.3 + strength * 0.25, 0.3, 0.55))
    : round2(clamp(0.55 + ratio * 0.3 + strength * 0.14, 0.55, 0.99));

  return {
    category: categoryResult.category,
    priority: priorityResult.priority,
    confidence,
    signals: {
      categoryScores: categoryResult.scores,
      priorityScores: priorityResult.scores,
      categoryMatches: categoryResult.matches,
      priorityMatches: priorityResult.matches,
      runnerUp: categoryResult.runnerUp,
      margin: categoryResult.margin,
      fallback: categoryResult.fallback,
    },
  };
}
