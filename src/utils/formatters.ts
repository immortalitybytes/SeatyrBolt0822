// utils/formatters.ts — canonical helper for "Table #X" display
export type Table = { id: number; seats: number; name?: string };

export function formatTableAssignment(
  assignments: Record<string,string>,
  tables: Table[],
  guestName: string
): string {
  const raw = assignments[guestName];
  if (!raw) return "";
  const first = String(raw).split(",")[0].trim();
  if (!first) return "";

  // If the assignment looks like a number, resolve by id
  const asNum = Number(first);
  if (!Number.isNaN(asNum)) {
    const t = tables.find(t => t.id === asNum);
    if (t) {
      const label = (t.name && /^\d+$/.test(String(t.name))) ? `#${t.name}`
                  : (t.name ? t.name : `#${t.id}`);
      return `Table ${label}`;
    }
    return `Table #${asNum}`;
  }

  // Otherwise try to match by table name (case-insensitive)
  const byName = tables.find(t => String(t.name ?? '').toLowerCase() === first.toLowerCase());
  if (byName) {
    const label = (/^\d+$/.test(String(byName.name))) ? `#${byName.name}` : String(byName.name);
    return `Table ${label}`;
  }
  return `Table ${first}`;
}

/**
 * For last name sorting, return the word after the % symbol if present.
 * Enhanced to handle percentage symbol for custom sorting as specified
 * E.g., "Carlos De la %Cruz" => "Cruz", "Tatiana %Sokolov Boyko" => "Sokolov"
 * If no %, return the last word in the name.
 */
export const getLastNameForSorting = (fullName: string): string => {
  if (!fullName || typeof fullName !== 'string') return '';
  
  const firstPersonName = fullName.trim();
  
  // Enhanced percentage symbol support for multi-word surnames
  if (firstPersonName.includes('%')) {
    const afterPercent = firstPersonName.split('%')[1];
    if (afterPercent) {
      // Get the word immediately after the % symbol
      const lastNamePart = afterPercent.trim().split(/\s+/)[0];
      // Filter out numerals and special characters, keep only letters
      return lastNamePart.replace(/[^a-zA-Z]/g, '').toLowerCase();
    }
  }
  
  // Default behavior: return the last word, filtering out numerals and special characters
  const words = firstPersonName.split(/\s+/).filter(word => word.trim());
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    // Filter out numerals and special characters (&, +), keep only letters
    return lastWord.replace(/[^a-zA-Z]/g, '').toLowerCase();
  }
  return '';
};