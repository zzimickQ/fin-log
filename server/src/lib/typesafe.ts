import {
  TypeSafeClient,
  choice,
  type EntryType,
  type JsonValue,
} from "@typesafe-ai/sdk";
import { config } from "./config.js";

/**
 * Server-side TypeSafe (System One) client.
 *
 * The API key lives only in server env. `isTypeSafeConfigured()` lets callers
 * degrade to a local heuristic instead of failing when no key is present, so
 * expense logging never depends on a third-party service being reachable.
 */

let cached: TypeSafeClient | null = null;

/** True when a TypeSafe API key is configured. */
export function isTypeSafeConfigured(): boolean {
  return config.TYPESAFE_API_KEY.trim().length > 0;
}

/** Lazily construct the SDK client (it throws when the key is missing). */
function client(): TypeSafeClient {
  if (!cached) {
    cached = new TypeSafeClient({
      apiKey: config.TYPESAFE_API_KEY,
      defaultModel: config.TYPESAFE_MODEL,
      // Keep SDK chatter out of normal logs; the SDK redacts credentials but
      // never logs bodies unless explicitly asked to.
      logLevel: config.NODE_ENV === "development" ? "warn" : "off",
    });
  }
  return cached;
}

/** A single Choice answer, decoupled from the SDK's generic criteria types. */
export interface ChoicePrediction {
  /** The criterion key the model selected. */
  choice: string;
  /** Confidence derived from the probability distribution (0–1). */
  confidence: number;
  /** Full distribution keyed by criterion key (sums to 1). */
  probabilities: Record<string, number>;
  /** Model that produced the answer. */
  model: string;
}

/**
 * Ask one Choice question about a JSON state and return the selected key plus
 * its probability distribution. Throws on any transport/API error; callers
 * own the fallback policy.
 */
export async function askChoice(
  state: Record<string, JsonValue>,
  instructions: string,
  criteria: Record<string, EntryType>,
): Promise<ChoicePrediction> {
  const response = await client().systemOne({
    state,
    questions: {
      answer: choice(instructions, criteria),
    },
  });

  const answer = response.answers.answer;
  return {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: { ...answer.probabilities },
    model: response.model,
  };
}
