/**
 * Amount finding + local classification for inbound bank messages.
 *
 * This follows TypeSafe's "pre-parsed value extraction" recipe: code
 * over-finds money-shaped spans with regexes, and the model then *selects*
 * among them. Because the candidates are the options, the chosen answer is
 * always one of these exact spans — the model cannot invent or transpose a
 * digit — and `parseAmount` normalizes the copy.
 *
 * Everything here is pure so it can be checked without a database or a model
 * (see `sms-parser.selfcheck.ts`). The regexes are deliberately tuned to
 * over-find: a missed candidate is unrecoverable, a spurious one is just
 * another option the model ignores.
 */

/** What a message reports about the account holder's money. */
export type SmsKind = "debit" | "credit" | "not_transaction";

export function isSmsKind(value: string): value is SmsKind {
  return value === "debit" || value === "credit" || value === "not_transaction";
}

/** A money-shaped span found in a message. */
export interface AmountCandidate {
  /** The exact substring, used verbatim as a model option. */
  span: string;
  /** Parsed value, or null when the span is not a usable positive amount. */
  value: number | null;
  /** True when the span carried an explicit currency marker (ETB/Birr/Br). */
  marked: boolean;
}

/** Keep the question small; bank messages rarely state more than one amount. */
const MAX_CANDIDATES = 12;

/**
 * Static patterns, deliberately not built with `new RegExp`: interpolating a
 * fragment into a pattern reads as user-controlled construction to reviewers
 * and linters, and these are fixed. `\d[\d,]*(?:\.\d{1,2})?` is a single
 * star over one character class, so matching stays linear in message length.
 *
 * The message text itself is untrusted, hence the bounded, non-nested
 * quantifiers throughout.
 */

/** `ETB 1,500.00`, `Birr 250`, `Br. 1,000.00` — marker before the number. */
const MARKED_BEFORE = /(?<![A-Za-z0-9])(?:ETB|Birr|Br)\.?\s*\d[\d,]*(?:\.\d{1,2})?(?!\d)/gi;

/** `1,500.00 ETB`, `250 Birr` — marker after the number. */
const MARKED_AFTER = /\d[\d,]*(?:\.\d{1,2})?\s*(?:ETB|Birr|Br)(?![A-Za-z])/gi;

/** Bare decimals — `1,500.00`, `250.50` — a strong amount signal. */
const BARE_DECIMAL = /(?<![\d.,])\d[\d,]*\.\d{1,2}(?!\d)/g;

/** Bare integers — weak (dates, times, references), so collected last. */
const BARE_INTEGER = /(?<![\d.,])\d{1,7}(?![\d.,])/g;

/**
 * Every money-shaped span in `text`, currency-marked ones first, deduped, in
 * document order. Bare numbers already covered by a marked span are skipped
 * so the option list stays free of near-duplicates.
 */
export function findAmountCandidates(text: string): AmountCandidate[] {
  const candidates: AmountCandidate[] = [];
  const seen = new Set<string>();
  const markedSpans: string[] = [];

  const collect = (pattern: RegExp, marked: boolean) => {
    for (const match of text.matchAll(pattern)) {
      const span = match[0].trim();
      if (!span || seen.has(span)) continue;
      // A bare "1,500.00" inside a marked "ETB 1,500.00" is the same amount.
      if (!marked && markedSpans.some((s) => s.includes(span))) continue;
      seen.add(span);
      candidates.push({ span, value: parseAmount(span), marked });
      if (marked) markedSpans.push(span);
    }
  };

  collect(MARKED_BEFORE, true);
  collect(MARKED_AFTER, true);
  collect(BARE_DECIMAL, false);
  collect(BARE_INTEGER, false);

  return candidates.slice(0, MAX_CANDIDATES);
}

/**
 * Normalize a span to a positive number of at most two decimals, or null.
 *
 * The numeric part is extracted rather than the span being stripped, because a
 * span may carry currency punctuation that is not a decimal point — `Br.
 * 1,000.00` and `1,500.00 ETB` must both yield 1000 and 1500.
 *
 * Assumes comma groups thousands and the dot is the decimal separator (the
 * convention in ETB messages: `1,500.00`). A locale that inverts them would
 * need a different normalizer.
 */
export function parseAmount(span: string): number | null {
  const match = /(\d[\d,]*(?:\.\d+)?)/.exec(span);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

// ---------- local (model-free) fallback ----------

/**
 * Money arriving in the account. Checked before the debit words because these
 * phrases also contain debit-ish verbs ("transferred ... to your account").
 */
const CREDIT_WORDS =
  /\b(credited|credit|deposited|deposit|reversed|reversal|refund(?:ed)?|received|salary|incoming|transferred\s+(?:to|into)\s+your\s+account)\b/i;

/** Money leaving the account. */
const DEBIT_WORDS =
  /\b(debited|debit|paid|payment|withdrawn|withdrawal|purchased|purchase|transferred|transfer|sent|deducted|charged|charge|fee|airtime|bill|top(?:ped)?\s?up)\b/i;

/** A model-free guess at what a message reports, plus the amount to use. */
export interface LocalClassification {
  kind: SmsKind;
  amountSpan: string | null;
}

/**
 * Keyword fallback used when TypeSafe is unconfigured or unreachable, so the
 * ingest endpoint keeps working instead of rejecting every message.
 *
 * ponytail: keyword matching cannot resolve genuine ambiguity ("transferred"
 * in or out, a promo that mentions "paid"), so it is recall-oriented. The Jev
 * path is the default; this only covers an outage.
 */
export function classifyLocally(
  text: string,
  candidates: AmountCandidate[],
): LocalClassification {
  const amountSpan = pickFallbackAmount(candidates);

  if (CREDIT_WORDS.test(text)) return { kind: "credit", amountSpan };
  if (!DEBIT_WORDS.test(text)) return { kind: "not_transaction", amountSpan: null };
  return { kind: "debit", amountSpan };
}

/**
 * The first currency-marked amount, else the first amount. A bank message
 * almost always writes the transaction amount beside its currency, which is
 * why marked spans are found first.
 */
function pickFallbackAmount(candidates: AmountCandidate[]): string | null {
  const best =
    candidates.find((c) => c.marked && c.value !== null) ??
    candidates.find((c) => c.value !== null);
  return best?.span ?? null;
}
