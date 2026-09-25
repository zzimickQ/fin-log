/**
 * Self-check for the API key security primitives (key minting + hashing).
 * This repo has no test framework, so this is a plain assert script:
 *
 *   npx tsx src/domain/apikey/apikey.selfcheck.ts
 *
 * It pins the properties an ingest endpoint will later rely on: keys are
 * high-entropy, the stored hash is deterministic, and the display prefix is a
 * leading slice of the real key.
 */
import assert from "node:assert/strict";
import { generateApiKey, hashApiKey } from "./apikey.usecases.js";

// ---------- format ----------

const { key, prefix } = generateApiKey();
assert.match(key, /^fl_[A-Za-z0-9_-]{43}$/, `unexpected key format: ${key}`);
assert.equal(prefix.length, 11, "display prefix length changed");
assert.ok(key.startsWith(prefix), "prefix must be a leading slice of the key");

// The prefix is shown in lists, so it must never be the whole secret.
assert.ok(prefix.length < key.length, "prefix must not leak the entire key");

// ---------- entropy ----------

const minted = new Set<string>();
for (let i = 0; i < 1000; i++) minted.add(generateApiKey().key);
assert.equal(minted.size, 1000, "1000 freshly minted keys must all differ");

// ---------- hashing ----------

assert.match(hashApiKey(key), /^[0-9a-f]{64}$/, "hash must be sha256 hex");
assert.equal(hashApiKey(key), hashApiKey(key), "hash must be deterministic");
assert.notEqual(
  hashApiKey(key),
  hashApiKey(generateApiKey().key),
  "different keys must hash differently",
);

// Known-answer test: pins the digest algorithm, so a silent swap to another
// algorithm or an encoding change fails loudly instead of breaking every
// already-issued key.
assert.equal(
  hashApiKey("fl_test"),
  "84bd166d6d75b8b374609533ebedc30b8353771bea01ab5f6ab8f116ae5ef059",
  "hash algorithm/encoding changed — existing keys would stop verifying",
);

console.log("apikey self-check: all assertions passed");
