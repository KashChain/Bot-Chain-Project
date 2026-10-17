/**
 * Shared agent-search helpers used by both the in-memory and Prisma
 * repositories so that matching, filtering and ranking stay consistent.
 *
 * Design goals:
 *  - Case-insensitive, partial-word matching across name, description,
 *    category and capabilities.
 *  - Ignore common English stop words ("the", "in", ...) so a natural-language
 *    query does not match every agent. If a query is *only* stop words we fall
 *    back to the raw tokens so behaviour never becomes surprising.
 *  - Rank results by the number of distinct query terms matched, then by a
 *    weighted score that favours name > category > capabilities > description.
 *
 * Callers apply relevance ordering *after* their chosen sort so the selected
 * sort option is preserved as the tie-breaker.
 */

export interface SearchableAgent {
  name: string;
  description: string;
  category: string;
  capabilities: string[];
}

/** Field weights: a hit in a more specific field contributes a larger score. */
export const SEARCH_FIELD_WEIGHTS = {
  name: 5,
  category: 4,
  capabilities: 3,
  description: 1,
} as const;

/**
 * Common English stop words plus a few filler words that would otherwise match
 * almost every agent. Kept deliberately small and lowercase.
 */
const SEARCH_STOPWORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am",
  "an", "and", "any", "are", "as", "at", "be", "because", "been", "before",
  "being", "below", "between", "both", "but", "by", "can", "did", "do",
  "does", "doing", "down", "during", "each", "else", "few", "for", "from",
  "further", "had", "has", "have", "he", "her", "here", "hers", "him", "his",
  "how", "i", "if", "in", "into", "is", "it", "its", "just", "me", "more",
  "most", "my", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
  "or", "other", "our", "ours", "out", "over", "own", "same", "she", "should",
  "so", "some", "such", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "too", "under",
  "until", "up", "very", "was", "we", "were", "what", "when", "where",
  "which", "while", "who", "whom", "why", "will", "with", "would", "you",
  "your", "yours",
]);

/**
 * Tokenize a search query into lowercase, de-duplicated terms. Splits on any
 * non-letter/number characters (including punctuation) and drops stop words
 * and single-character tokens. Falls back to the raw (>= 2 char) tokens when
 * the query consists solely of stop words.
 */
export function tokenizeSearch(raw: string): string[] {
  const all = raw
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2);
  const meaningful = all.filter((token) => !SEARCH_STOPWORDS.has(token));
  const tokens = meaningful.length > 0 ? meaningful : all;
  return Array.from(new Set(tokens));
}

export interface SearchScore {
  /** Weighted relevance score across all matched terms. */
  score: number;
  /** Number of distinct query terms that matched at least one field. */
  matched: number;
}

/** Score a single agent against the tokenised query terms. */
export function scoreAgent(
  agent: SearchableAgent,
  terms: string[],
): SearchScore {
  if (terms.length === 0) return { score: 0, matched: 0 };

  const name = agent.name.toLowerCase();
  const description = agent.description.toLowerCase();
  const category = agent.category.toLowerCase();
  const capabilities = agent.capabilities.map((cap) => cap.toLowerCase());

  let score = 0;
  let matched = 0;
  for (const term of terms) {
    let best = 0;
    if (name.includes(term)) best = SEARCH_FIELD_WEIGHTS.name;
    if (category.includes(term)) {
      best = Math.max(best, SEARCH_FIELD_WEIGHTS.category);
    }
    if (capabilities.some((cap) => cap.includes(term))) {
      best = Math.max(best, SEARCH_FIELD_WEIGHTS.capabilities);
    }
    if (description.includes(term)) {
      best = Math.max(best, SEARCH_FIELD_WEIGHTS.description);
    }
    if (best > 0) {
      matched += 1;
      score += best;
    }
  }
  return { score, matched };
}

/** True when the agent matches at least one of the query terms. */
export function matchesSearch(
  agent: SearchableAgent,
  terms: string[],
): boolean {
  return scoreAgent(agent, terms).matched > 0;
}

/**
 * Sort already-sorted agents by relevance (distinct terms matched, then score).
 * Relies on `Array.prototype.sort` being stable so the caller's chosen sort is
 * preserved as the tie-breaker. Returns a new array.
 */
export function rankByRelevance<T extends SearchableAgent>(
  agents: T[],
  terms: string[],
): T[] {
  if (terms.length === 0) return agents;
  const scored = agents.map((agent) => ({ agent, ...scoreAgent(agent, terms) }));
  scored.sort((a, b) => b.matched - a.matched || b.score - a.score);
  return scored.map((entry) => entry.agent);
}
