import type { EntryType, JsonValue } from "@typesafe-ai/sdk";
import {
  askChoices,
  isTypeSafeConfigured,
  type ChoiceSpec,
} from "../../lib/typesafe.js";
import { unprocessable } from "../../lib/errors.js";
import { incomingRepository, toIncomingDto } from "./incoming.repository.js";
import {
  classifyLocally,
  findAmountCandidates,
  isSmsKind,
  parseAmount,
  type AmountCandidate,
  type SmsKind,
} from "./sms-parser.js";

/**
 * Inbound-message ingestion: a phone automation forwards a bank SMS, and this
 * turns it into a staged transaction for review.
 *
 * The judgment is split into two independent questions asked in one round
 * trip — what the message reports, and which of the amounts found in code is
 * the one that moved. Because the amount options ARE the spans found by
 * `findAmountCandidates`, the answer is always one of those spans, copied
 * verbatim: the model selects, it never produces digits. Code then normalizes.
 */

/** Option on the amount question meaning "no candidate is the amount". */
const NO_AMOUNT = "none";

/** Minimal logger so the HTTP layer can record a degraded fallback. */
export interface IngestLogger {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

const KIND_INSTRUCTIONS =
  "A bank or financial service sent this message to its own customer about the customer's account. " +
  "Decide what it reports about the customer's money: money paid out of the account, money arriving into the account, or no movement of money at all. " +
  'The customer is always the account holder, so "you have paid" is money out even though the customer did the paying.';

const KIND_CRITERIA: Record<string, EntryType> = {
  debit:
    "Money left the account: the account holder paid, sent, transferred out, withdrew, bought something, or was charged a fee, tax, or levy.",
  credit:
    "Money arrived in the account: a deposit, salary, refund, reversal, or a transfer received.",
  not_transaction:
    "No money moved: an advertisement, an offer, a balance or available-limit notice, an OTP or verification code, a PIN or statement notice, or any other message that does not report a transaction.",
};

const AMOUNT_INSTRUCTIONS =
  "Which of the candidate amounts is the amount of money that this message says moved? " +
  `Choose "${NO_AMOUNT}" when the message reports no transaction, or when none of the candidates is the amount that moved. ` +
  "An account balance, an available limit, a fee merely quoted as an example, a reference number, a date, or a time is not the amount that moved.";

/** What a message was judged to be, and the amount read from it. */
export interface SmsClassification {
  kind: SmsKind;
  /** The span selected (or taken by the fallback), verbatim. */
  amountSpan: string | null;
  /** `amountSpan` normalized, or null when it is not a usable amount. */
  amount: number | null;
  /** Confidence of the direction judgment (0 in degraded mode). */
  confidence: number;
  model: string | null;
  /** True when the local keyword fallback answered instead of TypeSafe. */
  degraded: boolean;
}

/**
 * Judge an inbound message. Degrades to keyword matching when TypeSafe is
 * unconfigured or fails, so a phone automation never silently loses a bank
 * transaction because a third party was unreachable.
 */
export async function classifySmsMessage(
  text: string,
  source: string | null,
  logger?: IngestLogger,
): Promise<SmsClassification> {
  const candidates = findAmountCandidates(text);

  if (!isTypeSafeConfigured()) {
    return degradedClassification(text, candidates);
  }

  try {
    return await typeSafeClassification(text, source, candidates);
  } catch (err) {
    logger?.warn(
      { err },
      "TypeSafe SMS classification failed; falling back to keyword matching",
    );
    return degradedClassification(text, candidates);
  }
}

/** One request, two independent judgments. */
async function typeSafeClassification(
  text: string,
  source: string | null,
  candidates: AmountCandidate[],
): Promise<SmsClassification> {
  const state: Record<string, JsonValue> = {
    message: { sender: source, text },
    amount_candidates: candidates.map((candidate) => candidate.span),
    default_currency: "ETB",
  };

  const questions: Record<string, ChoiceSpec> = {
    kind: { instructions: KIND_INSTRUCTIONS, criteria: KIND_CRITERIA },
  };

  // Without any amount there is nothing to select from; the direction question
  // still answers, which is what distinguishes a promotion from a transaction.
  if (candidates.length > 0) {
    const criteria: Record<string, EntryType> = {};
    for (const candidate of candidates) criteria[candidate.span] = null;
    criteria[NO_AMOUNT] =
      "None of these candidate amounts is the amount that moved.";
    questions.amount = { instructions: AMOUNT_INSTRUCTIONS, criteria };
  }

  const answers = await askChoices(state, questions);

  const kindAnswer = answers.kind;
  const rawKind = kindAnswer?.choice ?? "";
  // Fail closed: an unrecognised label must never become a recorded expense.
  const kind: SmsKind = isSmsKind(rawKind) ? rawKind : "not_transaction";

  const chosen = answers.amount?.choice ?? null;
  const amountSpan = chosen === null || chosen === NO_AMOUNT ? null : chosen;

  return {
    kind,
    amountSpan,
    // Trust the span only if it is one we actually offered, then normalize it.
    amount:
      amountSpan !== null && candidates.some((c) => c.span === amountSpan)
        ? parseAmount(amountSpan)
        : null,
    confidence: kindAnswer?.confidence ?? 0,
    model: kindAnswer?.model ?? null,
    degraded: false,
  };
}

function degradedClassification(
  text: string,
  candidates: AmountCandidate[],
): SmsClassification {
  const local = classifyLocally(text, candidates);
  return {
    kind: local.kind,
    amountSpan: local.amountSpan,
    amount:
      local.amountSpan === null ? null : parseAmount(local.amountSpan),
    confidence: 0,
    model: null,
    degraded: true,
  };
}

// ---------- ingest ----------

export interface IngestSmsInput {
  text: string;
  /** The SMS sender, kept as the temporary label until review. */
  source?: string | null;
  /** When the phone received the message; defaults to server receipt time. */
  receivedAt?: Date | null;
}

/**
 * Stage a forwarded bank message as a pending transaction.
 *
 * Only debits are accepted: money arriving in the account is not an expense,
 * and anything that is not a transaction at all (offers, OTPs, balance
 * notices) is not one either. Both are rejected with 422 and the reason, so a
 * phone automation's log shows why a message was not recorded.
 */
export async function ingestSmsMessage(
  userId: string,
  input: IngestSmsInput,
  logger?: IngestLogger,
) {
  const classification = await classifySmsMessage(
    input.text,
    input.source ?? null,
    logger,
  );

  if (classification.kind !== "debit") {
    throw unprocessable(
      `Not a debit transaction (classified as "${classification.kind}")`,
      {
        kind: classification.kind,
        model: classification.model,
        confidence: classification.confidence,
        degraded: classification.degraded,
      },
    );
  }

  if (classification.amount === null) {
    throw unprocessable(
      "Could not read the transaction amount from this message",
      {
        kind: classification.kind,
        amountCandidates: findAmountCandidates(input.text).map((c) => c.span),
        model: classification.model,
        degraded: classification.degraded,
      },
    );
  }

  const row = await incomingRepository.create({
    userId,
    source: input.source ?? null,
    text: input.text,
    amount: classification.amount,
    currency: "ETB",
    // "The date the message was received" — the phone knows it, so a supplied
    // timestamp wins; server receipt time is the fallback.
    occurredAt: input.receivedAt ?? new Date(),
  });

  return {
    transaction: toIncomingDto(row),
    classification: {
      kind: classification.kind,
      amountSpan: classification.amountSpan,
      confidence: classification.confidence,
      model: classification.model,
      degraded: classification.degraded,
    },
  };
}
