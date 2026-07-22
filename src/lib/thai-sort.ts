/** Thai-aware string compare (dictionary order). */
export function compareThaiText(a: string, b: string): number {
  return a.localeCompare(b, "th", { sensitivity: "base", numeric: true });
}

export function sortByThaiName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => compareThaiText(a.name, b.name));
}
