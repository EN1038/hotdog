/**
 * Parse Thai quick-add menu commands, e.g.
 * "สินค้าขาย ชื่อ ลูกชิ้นปลาย เพิ่มทุกสาขา"
 * "ชื่อ ไข่ปลาหมึก ราคา 10 บาท ทุกสาขา"
 * "ลูกชิ้นปลาย 10 บาท เพิ่มสาขานี้"
 */

export type QuickAddMenuScope =
  | { type: "all" }
  | { type: "current" }
  | { type: "named"; names: string[] };

export type QuickAddMenuCommand = {
  name: string;
  price: number | null;
  categoryHint: string | null;
  scope: QuickAddMenuScope;
  raw: string;
};

const DEFAULT_PRICE = 10;

const NOISE =
  /^(?:สินค้าขาย|สินค้า|เมนูขาย|เมนู|เพิ่มเมนู|ขาย|รายการ)$/i;

const SCOPE_ALL =
  /(?:เพิ่ม)?ทุกสาขา|ทุกสาขา|สาขาทั้งหมด|all\s*branches?/i;
const SCOPE_CURRENT =
  /(?:เพิ่ม)?สาขานี้|สาขาปัจจุบัน|แค่สาขานี้|สาขานี้เท่านั้น/i;

const CATEGORY_HINTS: Array<{ re: RegExp; category: string }> = [
  { re: /ลูกชิ้น|ไส้กรอก|ปูอัด/, category: "ลูกชิ้น" },
  {
    re: /ปลาหมึก|กุ้ง|หอย|แมงกะพรุน|ปลาดอลลี่|ทะเล|ไข่ปลา/,
    category: "อาหารทะเล",
  },
  { re: /เต้าหู้|เห็ด|ผัก/, category: "เต้าหู้" },
  { re: /ชา|นม|น้ำ|เครื่องดื่ม/, category: "เครื่องดื่ม" },
];

function cleanSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function extractPrice(text: string): { price: number | null; rest: string } {
  const patterns = [
    /ราคา\s*[:＝=]?\s*(\d+(?:\.\d+)?)\s*(?:บาท|฿|บ\.?)?/i,
    /(\d+(?:\.\d+)?)\s*(?:บาท|฿)/i,
    /@\s*(\d+(?:\.\d+)?)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const price = Number(m[1]);
    if (!Number.isFinite(price) || price < 0) continue;
    return {
      price,
      rest: cleanSpaces(text.replace(m[0], " ")),
    };
  }
  return { price: null, rest: text };
}

function extractCategory(text: string): {
  categoryHint: string | null;
  rest: string;
} {
  const m = text.match(
    /(?:หมวด(?:หมู่)?|ประเภท)\s*[:＝=]?\s*([^\s,]+(?:\s+[^\s,]+)?)/i,
  );
  if (m) {
    return {
      categoryHint: cleanSpaces(m[1]),
      rest: cleanSpaces(text.replace(m[0], " ")),
    };
  }
  return { categoryHint: null, rest: text };
}

function extractNamedBranches(text: string): {
  names: string[];
  rest: string;
} {
  const names: string[] = [];
  let rest = text;
  const re =
    /เพิ่ม(?:ที่)?สาขา\s+([^,]+?)(?=\s+(?:และ|กับ|ราคา|ชื่อ|หมวด|เพิ่ม|ทุก)|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) != null) {
    const chunk = cleanSpaces(m[1]);
    if (chunk && !/^(นี้|ปัจจุบัน|ทั้งหมด)$/.test(chunk)) {
      names.push(chunk);
      rest = rest.replace(m[0], " ");
    }
  }
  return { names, rest: cleanSpaces(rest) };
}

function extractName(text: string): { name: string | null; rest: string } {
  const named = text.match(
    /ชื่อ\s*[:＝=]?\s*(.+?)(?=\s+(?:ราคา|หมวด|ประเภท|เพิ่ม|ทุกสาขา|สาขานี้|สาขา)|$)/i,
  );
  if (named) {
    return {
      name: cleanSpaces(named[1]),
      rest: cleanSpaces(text.replace(named[0], " ")),
    };
  }

  // Fallback: first meaningful chunk before scope/price leftovers
  const tokens = text.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const t of tokens) {
    if (NOISE.test(t)) continue;
    if (/^(ราคา|หมวด|ประเภท|เพิ่ม|ทุกสาขา|สาขานี้)$/i.test(t)) break;
    kept.push(t);
  }
  if (kept.length === 0) return { name: null, rest: text };
  return { name: kept.join(" "), rest: cleanSpaces(text) };
}

function inferCategoryFromName(name: string): string | null {
  for (const h of CATEGORY_HINTS) {
    if (h.re.test(name)) return h.category;
  }
  return null;
}

export function parseQuickAddMenuCommand(input: string): QuickAddMenuCommand | null {
  const raw = cleanSpaces(input);
  if (!raw) return null;

  let text = raw;
  let scope: QuickAddMenuScope = { type: "current" };

  if (SCOPE_ALL.test(text)) {
    scope = { type: "all" };
    text = cleanSpaces(text.replace(SCOPE_ALL, " "));
  } else if (SCOPE_CURRENT.test(text)) {
    scope = { type: "current" };
    text = cleanSpaces(text.replace(SCOPE_CURRENT, " "));
  } else {
    const named = extractNamedBranches(text);
    if (named.names.length > 0) {
      scope = { type: "named", names: named.names };
      text = named.rest;
    }
  }

  const pricePart = extractPrice(text);
  text = pricePart.rest;
  const catPart = extractCategory(text);
  text = catPart.rest;
  const namePart = extractName(text);

  const name = namePart.name;
  if (!name || name.length < 1 || name.length > 80) return null;

  const categoryHint =
    catPart.categoryHint ?? inferCategoryFromName(name);

  return {
    name,
    price: pricePart.price,
    categoryHint,
    scope,
    raw,
  };
}

export function defaultQuickAddPrice(cmd: QuickAddMenuCommand): number {
  return cmd.price != null && Number.isFinite(cmd.price)
    ? cmd.price
    : DEFAULT_PRICE;
}

export function describeQuickAddCommand(
  cmd: QuickAddMenuCommand,
  opts?: { currentBranchName?: string },
): string {
  const price = defaultQuickAddPrice(cmd);
  let where = "สาขานี้";
  if (cmd.scope.type === "all") where = "ทุกสาขา";
  else if (cmd.scope.type === "named") where = cmd.scope.names.join(", ");
  else if (opts?.currentBranchName) where = opts.currentBranchName;
  const cat = cmd.categoryHint ? ` · หมวด ${cmd.categoryHint}` : "";
  return `${cmd.name} @${price}฿ → ${where}${cat}`;
}

/** Example prompts shown in the UI */
export const QUICK_ADD_MENU_EXAMPLES = [
  "ชื่อ ลูกชิ้นปลาย เพิ่มทุกสาขา",
  "สินค้าขาย ชื่อ ไข่ปลาหมึก ราคา 10 ทุกสาขา",
  "ชื่อ กุ้งเสียบ เพิ่มสาขานี้",
];
