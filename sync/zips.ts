export const MAX_ZIP_BYTES = 1_900_000_000;

export function splitIntoParts<T extends { size: number }>(items: T[], maxBytes: number): T[][] {
  const parts: T[][] = [];
  let current: T[] = [];
  let total = 0;
  for (const item of items) {
    if (current.length > 0 && total + item.size > maxBytes) {
      parts.push(current);
      current = [];
      total = 0;
    }
    current.push(item);
    total += item.size;
  }
  if (current.length > 0) parts.push(current);
  return parts;
}

export function zipAssetName(baseName: string, part: number, totalParts: number): string {
  return totalParts === 1 ? `${baseName}.zip` : `${baseName}-parte-${part}.zip`;
}
