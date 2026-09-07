export function isLeetCode(raw: string): boolean {
  try { const u = new URL(raw); return u.protocol === 'https:' && u.hostname === 'leetcode.com' && !u.port && !u.username && !u.password; }
  catch { return false; }
}

export function navigationAllowed(raw: string): boolean {
  if (isLeetCode(raw)) return true;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && !u.port && !u.username && !u.password &&
      ['accounts.google.com', 'github.com', 'www.facebook.com', 'www.linkedin.com', 'appleid.apple.com'].includes(u.hostname);
  } catch { return false; }
}

export function endpoint(raw: string): { kind: 'submit' | 'check'; id?: string } | null {
  if (!isLeetCode(raw)) return null;
  const path = new URL(raw).pathname;
  if (/^\/problems\/[a-z0-9-]+\/submit\/$/.test(path)) return { kind: 'submit' };
  const match = path.match(/^\/submissions\/detail\/(\d+)\/check\/$/);
  return match ? { kind: 'check', id: match[1] } : null;
}

// A result only counts if this practice session observed the matching submission.
export class AcceptanceTracker {
  private ids = new Set<string>();
  private acceptedIds = new Set<string>();
  private completedIds = new Set<string>();
  epoch = 0;
  reset() { this.ids.clear(); this.acceptedIds.clear(); this.completedIds.clear(); this.epoch++; }
  observe(raw: string, data: unknown, epoch: number): boolean {
    if (epoch !== this.epoch || !data || typeof data !== 'object') return false;
    const route = endpoint(raw);
    const body = data as Record<string, unknown>;
    if (route?.kind === 'submit') {
      const id = String(body.submission_id ?? '');
      if (this.completedIds.has(id)) return false;
      if (/^\d+$/.test(id)) {
        if (this.acceptedIds.delete(id)) { this.completedIds.add(id); return true; }
        this.ids.add(id);
      }
    }
    if (route?.kind === 'check' && route.id && body.state === 'SUCCESS' && body.status_code === 10) {
      if (this.completedIds.has(route.id)) return false;
      if (this.ids.delete(route.id)) { this.completedIds.add(route.id); return true; }
      // CDP response-body promises may finish in a different order from the requests.
      if (this.acceptedIds.size < 1000) this.acceptedIds.add(route.id);
    }
    return false;
  }
}

export const starterProblems = [
  'two-sum', 'valid-parentheses', 'merge-two-sorted-lists', 'best-time-to-buy-and-sell-stock',
  'valid-palindrome', 'invert-binary-tree', 'binary-search', 'flood-fill', 'climbing-stairs',
  'maximum-depth-of-binary-tree', 'contains-duplicate', 'reverse-linked-list', 'majority-element',
  'move-zeroes', 'missing-number', 'linked-list-cycle', 'single-number', 'symmetric-tree',
  'longest-substring-without-repeating-characters', 'group-anagrams', 'product-of-array-except-self',
  'top-k-frequent-elements', 'number-of-islands', 'coin-change', 'house-robber', '3sum',
  'container-with-most-water', 'merge-intervals', 'search-in-rotated-sorted-array', 'decode-string'
];

export function chooseProblem(pool: string[], previous?: string): string {
  const candidates = pool.filter(p => p !== previous);
  const available = candidates.length ? candidates : pool;
  if (!available.length) throw new Error('No problems available');
  return available[Math.floor(Math.random() * available.length)];
}
