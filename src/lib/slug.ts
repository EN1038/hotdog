/** Basic Thai → Latin (approximate) for URL codes */
const THAI_MAP: Record<string, string> = {
  ก: "k",
  ข: "kh",
  ฃ: "kh",
  ค: "kh",
  ฅ: "kh",
  ฆ: "kh",
  ง: "ng",
  จ: "ch",
  ฉ: "ch",
  ช: "ch",
  ซ: "s",
  ฌ: "ch",
  ญ: "y",
  ฎ: "d",
  ฏ: "t",
  ฐ: "th",
  ฑ: "th",
  ฒ: "th",
  ณ: "n",
  ด: "d",
  ต: "t",
  ถ: "th",
  ท: "th",
  ธ: "th",
  น: "n",
  บ: "b",
  ป: "p",
  ผ: "ph",
  ฝ: "f",
  พ: "ph",
  ฟ: "f",
  ภ: "ph",
  ม: "m",
  ย: "y",
  ร: "r",
  ฤ: "rue",
  ล: "l",
  ฦ: "lue",
  ว: "w",
  ศ: "s",
  ษ: "s",
  ส: "s",
  ห: "h",
  ฬ: "l",
  อ: "o",
  ฮ: "h",
  ะ: "a",
  "\u0E31": "a", // ั
  า: "a",
  ำ: "am",
  "\u0E34": "i", // ิ
  "\u0E35": "i", // ี
  "\u0E36": "ue", // ึ
  "\u0E37": "ue", // ื
  "\u0E38": "u", // ุ
  "\u0E39": "u", // ู
  เ: "e",
  แ: "ae",
  โ: "o",
  ใ: "ai",
  ไ: "ai",
  "\u0E47": "", // ็
  "\u0E48": "", // ่
  "\u0E49": "", // ้
  "\u0E4A": "", // ๊
  "\u0E4B": "", // ๋
  "\u0E4C": "", // ์
  ๆ: "2",
  ฯ: "",
  " ": "-",
};

/**
 * Turn a display name into a URL-safe branch/brand code.
 * Example: "สาขาคลอง 6" → "khlong-6"
 */
export function slugifyCode(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return "";

  // drop common store prefix
  const withoutPrefix = trimmed.replace(/^(สาขา|branch)\s*/u, "");

  let out = "";
  for (const ch of withoutPrefix) {
    if (/[a-z0-9]/.test(ch)) {
      out += ch;
      continue;
    }
    if (ch === "-" || ch === "_" || ch === ".") {
      out += "-";
      continue;
    }
    if (THAI_MAP[ch] !== undefined) {
      out += THAI_MAP[ch];
      continue;
    }
    if (/\s/.test(ch)) {
      out += "-";
    }
  }

  return out
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export function withUniqueSuffix(base: string, taken: Set<string>): string {
  const root = base || "branch";
  if (!taken.has(root)) return root;
  let n = 2;
  while (taken.has(`${root}-${n}`)) n += 1;
  return `${root}-${n}`;
}
