import type { EntryType, JsonValue } from "@typesafe-ai/sdk";
import { config } from "../../lib/config.js";
import { askChoice, isTypeSafeConfigured, type ChoicePrediction } from "../../lib/typesafe.js";
import { requireLedgerAccess } from "../../lib/guards.js";
import { categoryRepository } from "../category/category.repository.js";
import { expenseRepository } from "./expense.repository.js";

/**
 * Category prediction for a new expense.
 *
 * Given only the expense text (plus amount/date/note) and everything the
 * ledger already knows — its category hierarchy, how often each category is
 * used, and the descriptions of recently categorized expenses — TypeSafe's
 * System One model picks the best-fitting category or an explicit `unknown`
 * outcome. Code decides what to do with the answer:
 *
 *  - confident category     → auto-assign
 *  - plausible category     → ranked suggestion for the user
 *  - `unknown` / no match   → expense stays uncategorized (null category)
 *  - TypeSafe unavailable   → local token-overlap heuristic, suggestions only
 */

// ---------- public shapes ----------

export interface CategorySuggestion {
  categoryId: string;
  name: string;
  path: string;
  description: string | null;
  /** Model probability for this category (0–1). */
  probability: number;
}

export interface CategorySuggestionResult {
  /** Ranked alternatives, best first. Empty when `unknown` is true. */
  suggestions: CategorySuggestion[];
  /** The model judged that no existing category fits; leave uncategorized. */
  unknown: boolean;
  /** Category the server is confident enough to assign, else null. */
  autoAssignCategoryId: string | null;
  /** Confidence of the winning answer (distribution concentration, 0–1). */
  confidence: number;
  /** Probability of the winning answer (category or unknown), 0–1. */
  probability: number;
  /** True when TypeSafe was unconfigured/failed and the heuristic answered. */
  degraded: boolean;
  /** Model that produced the answer, or null in degraded mode. */
  model: string | null;
}

export interface SuggestCategoryInput {
  description: string;
  amount?: number;
  currency?: string;
  note?: string;
  occurredAt?: string;
}

/** Minimal logger so the HTTP layer can record a degraded fallback. */
export interface SuggestionLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

// ---------- internals ----------

/** A category plus the ledger evidence used to describe it to the model. */
interface Candidate {
  id: string;
  name: string;
  path: string;
  description: string | null;
  expensesLogged: number;
  examples: string[];
}

/** Choice accepts up to 255 options; keep headroom for the unknown option. */
const MAX_CANDIDATES = 250;
/** Recent categorized expenses scanned for per-category examples. */
const EXAMPLE_SCAN = 300;
/** Example descriptions kept per category. */
const EXAMPLES_PER_CATEGORY = 4;
/** Global cap on example descriptions across all candidates (token budget). */
const MAX_EXAMPLES_TOTAL = 160;
/** Trim example/note/description text so the request stays small. */
const EXAMPLE_MAX_CHARS = 90;
const NOTE_MAX_CHARS = 300;
const CATEGORY_DESCRIPTION_MAX_CHARS = 200;
/** Criterion key reserved for "no existing category fits". */
const UNKNOWN_KEY = "unknown";

const STOP_WORDS = new Set(["a", "an", "the", "for", "and", "at", "in", "of"]);

const CHOICE_INSTRUCTIONS =
  "Which category from this ledger is the best fit for the new expense? " +
  "Read the category path to understand where it sits in the hierarchy. " +
  "Use the example expenses already filed under a category as evidence of what belongs there. " +
  `Choose "${UNKNOWN_KEY}" when no existing category is a reasonable fit — for example when the ` +
  "description is too vague, or describes something the ledger has no category for. " +
  `Prefer "${UNKNOWN_KEY}" over a weak guess.`;

/**
 * Suggest (and possibly auto-assign) a category for an expense described only
 * by its text and the ledger's existing data.
 */
export async function suggestExpenseCategory(
  userId: string,
  ledgerId: string,
  input: SuggestCategoryInput,
  logger?: SuggestionLogger,
): Promise<CategorySuggestionResult> {
  await requireLedgerAccess(userId, ledgerId);

  const description = input.description.trim();
  if (!description) return unknownResult();

  const [categories, recent] = await Promise.all([
    categoryRepository.findByLedger(ledgerId),
    expenseRepository.recentCategorized(ledgerId, EXAMPLE_SCAN),
  ]);

  const candidates = buildCandidates(categories, recent);
  if (candidates.length === 0) return unknownResult();

  // A ledger this large would overflow one Choice question; the heuristic
  // still matches on names/paths, so degrade instead of truncating.
  if (!isTypeSafeConfigured() || candidates.length > MAX_CANDIDATES) {
    return heuristicResult(candidates, description);
  }

  try {
    return await typeSafeResult(candidates, input, description);
  } catch (err) {
    // A third-party outage must never block logging an expense. Log it so a
    // misconfigured key or quota issue is visible in the server logs.
    logger?.warn(
      { err },
      "TypeSafe category prediction failed; falling back to heuristic",
    );
    return heuristicResult(candidates, description);
  }
}

// ---------- candidate construction ----------

type CategoryRow = Awaited<ReturnType<typeof categoryRepository.findByLedger>>[number];
type CategorizedRow = { description: string | null; categoryId: string | null };

function buildCandidates(
  categories: CategoryRow[],
  recent: CategorizedRow[],
): Candidate[] {
  const nodeById = new Map(categories.map((c) => [c.id, c]));

  // Group the most recent example descriptions by category, bounded globally
  // so a large ledger cannot blow up the request size.
  const examplesByCategory = new Map<string, string[]>();
  let exampleCount = 0;
  for (const row of recent) {
    if (!row.categoryId || !row.description) continue;
    if (exampleCount >= MAX_EXAMPLES_TOTAL) break;
    const list = examplesByCategory.get(row.categoryId) ?? [];
    if (list.length >= EXAMPLES_PER_CATEGORY) continue;
    list.push(truncate(row.description.trim(), EXAMPLE_MAX_CHARS));
    examplesByCategory.set(row.categoryId, list);
    exampleCount += 1;
  }

  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    path: categoryPath(category, nodeById),
    description: category.description,
    expensesLogged: category._count.expenses,
    examples: examplesByCategory.get(category.id) ?? [],
  }));
}

/** "Groceries" under "Food" → "Food › Groceries"; cycle-safe. */
function categoryPath(
  category: CategoryRow,
  nodeById: Map<string, CategoryRow>,
): string {
  const names = [category.name];
  const seen = new Set([category.id]);
  let parentId = category.parentId;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = nodeById.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(" › ");
}

// ---------- TypeSafe path ----------

async function typeSafeResult(
  candidates: Candidate[],
  input: SuggestCategoryInput,
  description: string,
): Promise<CategorySuggestionResult> {
  const criteria: Record<string, EntryType> = {};
  for (const candidate of candidates) {
    criteria[candidate.id] = {
      path: candidate.path,
      ...(candidate.description
        ? {
            description: truncate(
              candidate.description,
              CATEGORY_DESCRIPTION_MAX_CHARS,
            ),
          }
        : {}),
      ...(candidate.expensesLogged > 0
        ? { expenses_logged: candidate.expensesLogged }
        : {}),
      ...(candidate.examples.length > 0
        ? { example_expenses: candidate.examples }
        : {}),
    };
  }
  criteria[UNKNOWN_KEY] = {
    what: "No existing category is a reasonable fit for this expense",
    when_to_use:
      "The description is too vague, unrelated, or describes something no category covers",
  };

  const state: Record<string, JsonValue> = {
    expense: {
      description,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
      ...(input.note ? { note: truncate(input.note.trim(), NOTE_MAX_CHARS) } : {}),
    },
  };

  const prediction = await askChoice(state, CHOICE_INSTRUCTIONS, criteria);
  return interpret(prediction, candidates, false);
}

/** Turn a model answer (category id or `unknown`) into the API result. */
function interpret(
  prediction: ChoicePrediction,
  candidates: Candidate[],
  degraded: boolean,
): CategorySuggestionResult {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const chosen = byId.get(prediction.choice);
  const chosenProbability = prediction.probabilities[prediction.choice] ?? 0;

  // The model chose `unknown` (or an id we did not offer): no viable category.
  if (!chosen) {
    return {
      suggestions: [],
      unknown: true,
      autoAssignCategoryId: null,
      confidence: prediction.confidence,
      probability: chosenProbability,
      degraded,
      model: prediction.model,
    };
  }

  const suggestions = candidates
    .map((candidate) => ({
      candidate,
      probability: prediction.probabilities[candidate.id] ?? 0,
    }))
    .filter((entry) => entry.probability > 0)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, config.CATEGORY_SUGGESTION_LIMIT)
    .map(({ candidate, probability }) => ({
      categoryId: candidate.id,
      name: candidate.name,
      path: candidate.path,
      description: candidate.description,
      probability,
    }));

  const autoAssignCategoryId =
    !degraded &&
    chosenProbability >= config.CATEGORY_AUTO_ASSIGN_THRESHOLD
      ? chosen.id
      : null;

  return {
    suggestions,
    unknown: false,
    autoAssignCategoryId,
    confidence: prediction.confidence,
    probability: chosenProbability,
    degraded,
    model: prediction.model,
  };
}

// ---------- heuristic fallback ----------

/**
 * Local fallback when TypeSafe is unavailable: token overlap against category
 * names, paths, descriptions, and already-filed example descriptions. Returns
 * suggestions only — never auto-assigns, because the signal is weak.
 */
function heuristicResult(
  candidates: Candidate[],
  description: string,
): CategorySuggestionResult {
  const tokens = tokenize(description);

  const scored = candidates
    .map((candidate) => {
      const haystack = [
        candidate.name,
        candidate.path,
        candidate.description ?? "",
        ...candidate.examples,
      ]
        .join(" ")
        .toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1;
      }
      return { candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  const total = scored.reduce((acc, entry) => acc + entry.score, 0);
  if (scored.length === 0 || total === 0) {
    return { ...unknownResult(), degraded: true };
  }

  const suggestions = scored
    .slice(0, config.CATEGORY_SUGGESTION_LIMIT)
    .map(({ candidate, score }) => ({
      categoryId: candidate.id,
      name: candidate.name,
      path: candidate.path,
      description: candidate.description,
      probability: score / total,
    }));

  const top = suggestions[0]!.probability;
  return {
    suggestions,
    unknown: false,
    autoAssignCategoryId: null,
    confidence: top,
    probability: top,
    degraded: true,
    model: null,
  };
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

// ---------- helpers ----------

function unknownResult(): CategorySuggestionResult {
  return {
    suggestions: [],
    unknown: true,
    autoAssignCategoryId: null,
    confidence: 0,
    probability: 0,
    degraded: false,
    model: null,
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
