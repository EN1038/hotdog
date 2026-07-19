/**
 * Parse pasted stock text (e.g. LINE checklist) and match sold-out menu names.
 * Sold-out lines end with "หมด".
 */

export type ParsedSoldOutLine = {
  raw: string;
  name: string;
};

export type MenuMatchCandidate = {
  id: string;
  name: string;
  isHidden: boolean;
};

export type StockPasteMatchResult = {
  /** Menu ids to hide (not already hidden) */
  toHide: { id: string; name: string; matchedFrom: string }[];
  /** Already hidden — skipped */
  alreadyHidden: { id: string; name: string; matchedFrom: string }[];
  /** Sold-out lines we could not match to any menu */
  notFound: { raw: string; name: string }[];
  /** All sold-out names parsed from text */
  soldOutParsed: ParsedSoldOutLine[];
};

const SOLD_OUT_RE = /หมด\s*$/u;

/** Collapse for fuzzy compare: Thai/Latin/digits only, no spaces. */
export function normalizeMenuKey(input: string): string {
  return input
    .normalize("NFC")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/^[0-9]+[\.\)\-:\s]*/u, "")
    .replace(/\s+/g, "")
    .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/gu, "")
    .toLowerCase();
}

/**
 * Extract display name from a stock line (strip leading number / trailing stock / หมด).
 */
export function extractMenuNameFromStockLine(line: string): string {
  let s = line.trim();
  if (!s) return "";
  s = s.replace(/^[\s]*[0-9]+[\.\)\-:\s]*/u, "");
  s = s.replace(/หมด\s*$/u, "");
  // trailing quantity like " 11" or "    26"
  s = s.replace(/\s+[0-9]+\s*$/u, "");
  // collapse whitespace
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function parseSoldOutLines(text: string): ParsedSoldOutLine[] {
  const lines = text.split(/\r?\n/);
  const out: ParsedSoldOutLine[] = [];
  const seen = new Set<string>();

  for (const rawLine of lines) {
    const raw = rawLine.trim();
    if (!raw) continue;
    // Skip headers / section titles without a menu number-ish line
    if (!SOLD_OUT_RE.test(raw)) continue;

    const name = extractMenuNameFromStockLine(raw);
    if (!name) continue;
    const key = normalizeMenuKey(name);
    if (!key || key === "หมด") continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ raw, name });
  }

  return out;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return shorter / longer;
  }
  // Dice coefficient on bigrams
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [k, v] of A) {
    const w = B.get(k);
    if (w) overlap += Math.min(v, w);
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

type Scored = {
  menu: MenuMatchCandidate;
  score: number;
  from: string;
};

/**
 * Match sold-out paste names to branch menu items. Aggressive but prefers best score.
 */
export function matchSoldOutMenus(
  soldOut: ParsedSoldOutLine[],
  menus: MenuMatchCandidate[],
): StockPasteMatchResult {
  const menusWithKey = menus.map((m) => ({
    ...m,
    key: normalizeMenuKey(m.name),
  }));

  const usedMenuIds = new Set<string>();
  const toHide: StockPasteMatchResult["toHide"] = [];
  const alreadyHidden: StockPasteMatchResult["alreadyHidden"] = [];
  const notFound: StockPasteMatchResult["notFound"] = [];

  for (const line of soldOut) {
    const needle = normalizeMenuKey(line.name);
    if (!needle) {
      notFound.push(line);
      continue;
    }

    const scored: Scored[] = [];
    for (const menu of menusWithKey) {
      if (!menu.key || usedMenuIds.has(menu.id)) continue;
      let score = similarity(needle, menu.key);

      // Boost exact / near-exact
      if (menu.key === needle) score = 1;
      else if (menu.key.includes(needle) && needle.length >= 3) {
        score = Math.max(score, 0.92);
      } else if (needle.includes(menu.key) && menu.key.length >= 3) {
        score = Math.max(score, 0.9);
      }

      // Common typos / short aliases: if last 4+ chars match
      if (needle.length >= 4 && menu.key.length >= 4) {
        if (
          needle.slice(-4) === menu.key.slice(-4) ||
          needle.slice(0, 4) === menu.key.slice(0, 4)
        ) {
          score = Math.max(score, 0.75);
        }
      }

      if (score >= 0.72) {
        scored.push({ menu, score, from: line.name });
      }
    }

    scored.sort(
      (a, b) =>
        b.score - a.score || a.menu.name.length - b.menu.name.length,
    );
    const best = scored[0];
    if (!best) {
      notFound.push(line);
      continue;
    }

    usedMenuIds.add(best.menu.id);
    const entry = {
      id: best.menu.id,
      name: best.menu.name,
      matchedFrom: line.name,
    };
    if (best.menu.isHidden) {
      alreadyHidden.push(entry);
    } else {
      toHide.push(entry);
    }
  }

  return { toHide, alreadyHidden, notFound, soldOutParsed: soldOut };
}
