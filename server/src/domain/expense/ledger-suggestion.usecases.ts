import type { EntryType, JsonValue } from "@typesafe-ai/sdk";
import { config } from "../../lib/config.js";
import {
  askChoice,
  isTypeSafeConfigured,
  type ChoicePrediction,
} from "../../lib/typesafe.js";
import { familyRepository } from "../family/family.repository.js";
import { ledgerRepository } from "../ledger/ledger.repository.js";
import { expenseRepository } from "./expense.repository.js";

/**
 * Ledger prediction for a new expense.
 *
 * The capture flow no longer assumes the active ledger: given the expense
 * text and everything the user already logs, TypeSafe's System One model
 * picks the ledger the expense most likely belongs to, or `unknown` when no
 * ledger is a clear fit. Once the ledger is chosen, the existing category
 * suggestion endpoint runs against that ledger.
 *
 *  - confident ledger     → pre-select
 *  - plausible ledger     → ranked suggestion for the user
 *  - `unknown` / no match → the user picks a ledger manually
 *  - TypeSafe unavailable → local token-overlap heuristic, suggestions only
 */

// ---------- public shapes ----------

export interface LedgerSuggestion {
  ledgerId: string;
  name: string;
  familyId: string;
  familyName: string;
  description: string | null;
  /** Model probability for this ledger (0–1). */
  probability: number;
}

export interface LedgerSuggestionResult {
  /** Ranked alternatives, best first. Empty when `unknown` is true. */
  suggestions: LedgerSuggestion[];
  /** The model judged that no ledger is a reasonable fit. */
  unknown: boolean;
  /** Ledger the server is confident enough to pre-select, else null. */
  autoAssignLedgerId: string | null;
  /** Confidence of the winning answer (distribution concentration, 0–1). */
  confidence: number;
  /** Probability of the winning answer (ledger or unknown), 0–1. */
  probability: number;
  /** True when TypeSafe was unconfigured/failed and the heuristic answered. */
  degraded: boolean;
  /** Model that produced the answer, or null in degraded mode. */
  model: string | null;
}

export interface SuggestLedgerInput {
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

/** A ledger plus the evidence used to describe it to the model. */
interface Candidate {
  id: string;
  name: string;
  familyId: string;
  familyName: string;
  description: string | null;
  expensesLogged: number;
  examples: string[];
}

/** Choice accepts up to 255 options; keep headroom for the unknown option. */
const MAX_CANDIDATES = 250;
/** Ledgers inspected per suggestion request (one bounded example query each). */
const MAX_LEDGER_CANDIDATES = 50;
/** Recent expense descriptions scanned per ledger. */
const EXAMPLE_SCAN_PER_LEDGER = 8;
/** Example descriptions kept per ledger. */
const EXAMPLES_PER_LEDGER = 4;
/** Trim example/note/description text so the request stays small. */
const EXAMPLE_MAX_CHARS = 90;
const NOTE_MAX_CHARS = 300;
const LEDGER_DESCRIPTION_MAX_CHARS = 200;
/** Criterion key reserved for "no ledger is a reasonable fit". */
const UNKNOWN_KEY = "unknown";

const STOP_WORDS = new Set(["a", "an", "the", "for", "and", "at", "in", "of"]);

const CHOICE_INSTRUCTIONS =
  "Which ledger should this new expense be recorded in? " +
  "Use the ledger name, its description, how much it is used, and the example " +
  "expenses already recorded in it as evidence of what belongs there. " +
  `Choose "${UNKNOWN_KEY}" when the description is too vague or no ledger is a ` +
  "reasonable fit. " +
  `Prefer "${UNKNOWN_KEY}" over a weak guess.`;

/**
 * Suggest (and possibly pre-select) the ledger a new expense belongs to,
 * based only on its text and the ledgers the user already keeps.
 */
export async function suggestExpenseLedger(
  userId: string,
  input: SuggestLedgerInput,
  logger?: SuggestionLogger,
): Promise<LedgerSuggestionResult> {
  const description = input.description.trim();
  if (!description) return unknownResult();

  const candidates = await loadCandidates(userId);
  if (candidates.length === 0) return unknownResult();

  // A single ledger is deterministic — pre-select it without a model call.
  if (candidates.length === 1) {
    const onlyLedger = candidates[0];
    if (onlyLedger) return singleCandidateResult(onlyLedger);
  }

  // A user with this many ledgers would overflow one Choice question; the
  // heuristic still matches on names/descriptions, so degrade instead.
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
      "TypeSafe ledger prediction failed; falling back to heuristic",
    );
    return heuristicResult(candidates, description);
  }
}

// ---------- candidate construction ----------

async function loadCandidates(userId: string): Promise<Candidate[]> {
  const memberships = await familyRepository.findMembershipsByUser(userId);
  const familyIds = memberships.map((m) => m.familyId);
  if (familyIds.length === 0) return [];

  const familyNameById = new Map(
    memberships.map((m) => [m.familyId, m.family.name]),
  );

  const [ledgers, totals] = await Promise.all([
    ledgerRepository.findByFamilies(familyIds),
    expenseRepository.groupTotalsForFamilies(familyIds),
  ]);

  const capped = ledgers.slice(0, MAX_LEDGER_CANDIDATES);
  const examples = await expenseRepository.recentDescriptionsByLedgers(
    capped.map((l) => l.id),
    EXAMPLE_SCAN_PER_LEDGER,
  );

  // Keep only a few recent example descriptions per ledger (token budget).
  const examplesByLedger = new Map<string, string[]>();
  for (const row of examples) {
    if (!row.description) continue;
    const list = examplesByLedger.get(row.ledgerId) ?? [];
    if (list.length >= EXAMPLES_PER_LEDGER) continue;
    list.push(truncate(row.description.trim(), EXAMPLE_MAX_CHARS));
    examplesByLedger.set(row.ledgerId, list);
  }

  return capped.map((ledger) => ({
    id: ledger.id,
    name: ledger.name,
    familyId: ledger.familyId,
    familyName: familyNameById.get(ledger.familyId) ?? "",
    description: ledger.description,
    expensesLogged: totals.get(ledger.id)?.count ?? 0,
    examples: examplesByLedger.get(ledger.id) ?? [],
  }));
}

// ---------- TypeSafe path ----------

async function typeSafeResult(
  candidates: Candidate[],
  input: SuggestLedgerInput,
  description: string,
): Promise<LedgerSuggestionResult> {
  const criteria: Record<string, EntryType> = {};
  for (const candidate of candidates) {
    criteria[candidate.id] = {
      ledger: candidate.name,
      ...(candidate.familyName ? { family: candidate.familyName } : {}),
      ...(candidate.description
        ? {
            description: truncate(
              candidate.description,
              LEDGER_DESCRIPTION_MAX_CHARS,
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
    what: "No ledger is a reasonable fit for this expense",
    when_to_use:
      "The description is too vague or unrelated to every ledger the user keeps",
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

/** Turn a model answer (ledger id or `unknown`) into the API result. */
function interpret(
  prediction: ChoicePrediction,
  candidates: Candidate[],
  degraded: boolean,
): LedgerSuggestionResult {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const chosen = byId.get(prediction.choice);
  const chosenProbability = prediction.probabilities[prediction.choice] ?? 0;

  // The model chose `unknown` (or an id we did not offer): no viable ledger.
  if (!chosen) {
    return {
      suggestions: [],
      unknown: true,
      autoAssignLedgerId: null,
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
    .slice(0, config.LEDGER_SUGGESTION_LIMIT)
    .map(({ candidate, probability }) => toSuggestion(candidate, probability));

  const autoAssignLedgerId =
    !degraded &&
    chosenProbability >= config.LEDGER_AUTO_ASSIGN_THRESHOLD
      ? chosen.id
      : null;

  return {
    suggestions,
    unknown: false,
    autoAssignLedgerId,
    confidence: prediction.confidence,
    probability: chosenProbability,
    degraded,
    model: prediction.model,
  };
}

// ---------- heuristic fallback ----------

/**
 * Local fallback when TypeSafe is unavailable: token overlap against ledger
 * names, family names, descriptions, and recent example expenses. Returns
 * suggestions only — never pre-selects, because the signal is weak.
 */
function heuristicResult(
  candidates: Candidate[],
  description: string,
): LedgerSuggestionResult {
  const tokens = tokenize(description);

  const scored = candidates
    .map((candidate) => {
      const haystack = [
        candidate.name,
        candidate.familyName,
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
    .slice(0, config.LEDGER_SUGGESTION_LIMIT)
    .map(({ candidate, score }) => toSuggestion(candidate, score / total));

  const top = suggestions.at(0)?.probability ?? 0;
  return {
    suggestions,
    unknown: false,
    autoAssignLedgerId: null,
    confidence: top,
    probability: top,
    degraded: true,
    model: null,
  };
}

// ---------- helpers ----------

function toSuggestion(
  candidate: Candidate,
  probability: number,
): LedgerSuggestion {
  return {
    ledgerId: candidate.id,
    name: candidate.name,
    familyId: candidate.familyId,
    familyName: candidate.familyName,
    description: candidate.description,
    probability,
  };
}

function singleCandidateResult(candidate: Candidate): LedgerSuggestionResult {
  return {
    suggestions: [toSuggestion(candidate, 1)],
    unknown: false,
    autoAssignLedgerId: candidate.id,
    confidence: 1,
    probability: 1,
    degraded: false,
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

function unknownResult(): LedgerSuggestionResult {
  return {
    suggestions: [],
    unknown: true,
    autoAssignLedgerId: null,
    confidence: 0,
    probability: 0,
    degraded: false,
    model: null,
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
