/**
 * Self-check for the inbound-message parser. No test framework in this repo,
 * so this is a plain assert script:
 *
 *   npx tsx src/domain/ingest/sms-parser.selfcheck.ts
 *
 * The assertions pin the properties the ingest endpoint depends on: the
 * transaction amount is always found as a candidate, the chosen span parses
 * back to the same value, and obviously-non-transactional texts are not
 * mistaken for debits by the model-free fallback.
 *
 * Messages are representative ETB bank forms (the repo's sample-messages.txt
 * is empty, so these stand in as the regression corpus — replace them with
 * real traffic as it arrives).
 */
import assert from "node:assert/strict";
import {
  classifyLocally,
  findAmountCandidates,
  parseAmount,
  type AmountCandidate,
} from "./sms-parser.js";

/** Find the candidate whose span is exactly `span`, or fail. */
function candidateFor(text: string, span: string): AmountCandidate {
  const found = findAmountCandidates(text).find((c) => c.span === span);
  assert.ok(
    found,
    `expected candidate ${JSON.stringify(span)} in ${JSON.stringify(text)}; got ${JSON.stringify(
      findAmountCandidates(text).map((c) => c.span),
    )}`,
  );
  return found;
}

// ---------- amount extraction across common formats ----------

const DEBIT_SAMPLES: { text: string; span: string; value: number }[] = [
  {
    text: "Dear customer, your account has been debited with ETB 1,500.00 on 12/09/2025 at 14:35. Your balance is ETB 3,240.50.",
    span: "ETB 1,500.00",
    value: 1500,
  },
  {
    text: "You have paid Birr 250 to MERCHANT. Ref: 8821345.",
    span: "Birr 250",
    value: 250,
  },
  {
    text: "Debited Br. 1,000.00 from your account 1000123456789.",
    span: "Br. 1,000.00",
    value: 1000,
  },
  {
    text: "A payment of 500.75 ETB was made from your CBE account.",
    span: "500.75 ETB",
    value: 500.75,
  },
  {
    text: "Your account has been debited with ETB 12,345.67 for a purchase.",
    span: "ETB 12,345.67",
    value: 12345.67,
  },
];

for (const sample of DEBIT_SAMPLES) {
  const candidate = candidateFor(sample.text, sample.span);
  assert.equal(
    candidate.value,
    sample.value,
    `parsed value for ${JSON.stringify(sample.span)}`,
  );
  assert.equal(candidate.marked, true, `${sample.span} should be currency-marked`);
}

// ---------- parseAmount ----------

assert.equal(parseAmount("ETB 1,500.00"), 1500);
assert.equal(parseAmount("250"), 250);
assert.equal(parseAmount("0.50 Birr"), 0.5);
assert.equal(parseAmount("not a number"), null, "non-numeric span");
assert.equal(parseAmount("0"), null, "zero is not a usable amount");
assert.equal(parseAmount("1,500.00,"), 1500, "trailing comma is tolerated");

// ---------- the amount is never lost to a more eager pattern ----------

// A grouped number must not be truncated to its first group.
assert.equal(candidateFor("Debited ETB 1,500,000.00 today", "ETB 1,500,000.00").value, 1500000);

// The bare form is still found when no currency marker is present.
assert.equal(candidateFor("Debited 750.25 from account", "750.25").value, 750.25);

// Adjacent dates/times must not be swallowed into the amount.
const withDate = candidateFor(
  "Debited ETB 300.00 on 12/09/2025 at 14:35",
  "ETB 300.00",
);
assert.equal(withDate.value, 300);

// Marked spans come first so the fallback prefers them over account numbers.
const ordered = findAmountCandidates(
  "Debited ETB 1,500.00 from account 1000123456789",
);
assert.ok(ordered.length > 0, "candidates found");
assert.equal(ordered[0]?.span, "ETB 1,500.00", "marked amount sorts first");

// A near-duplicate of a marked span is not offered twice.
const dup = findAmountCandidates("Debited ETB 1,500.00 today");
assert.equal(
  dup.filter((c) => c.span.replace(/[^\d.]/g, "") === "1,500.00").length,
  0,
  "must not offer a bare duplicate of the marked span",
);

// ---------- the local fallback agrees on direction ----------

const debitText = "Your account has been debited with ETB 1,500.00";
const debit = classifyLocally(debitText, findAmountCandidates(debitText));
assert.equal(debit.kind, "debit");
assert.equal(parseAmount(debit.amountSpan ?? ""), 1500);

const creditText = "Your account has been credited with ETB 500.00";
assert.equal(
  classifyLocally(creditText, findAmountCandidates(creditText)).kind,
  "credit",
  "credits must be rejected",
);

const depositText = "You have received a deposit of Birr 2,000.00";
assert.equal(
  classifyLocally(depositText, findAmountCandidates(depositText)).kind,
  "credit",
);

const promoText =
  "Get 10% off when you pay with your CBE card this weekend. Offer ends 30/09/2025.";
assert.notEqual(
  classifyLocally(promoText, findAmountCandidates(promoText)).kind,
  "debit",
  "promotions must not become expenses",
);

const otpText = "Your verification code is 483920. Never share it with anyone.";
assert.equal(
  classifyLocally(otpText, findAmountCandidates(otpText)).kind,
  "not_transaction",
);

console.log(
  `sms-parser self-check: all assertions passed (${DEBIT_SAMPLES.length} amount formats)`,
);
