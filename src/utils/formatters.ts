/**
 * Split a guest's name by the % symbol for display or sorting.
 * E.g., "Carlos De la %Cruz" => ["Carlos De la ", "Cruz"]
 */
export const splitNameByPercentSymbol = (name: string): string[] => {
  if (!name.includes('%')) return [name];
  return name.split('%');
};

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
      return lastNamePart.toLowerCase();
    }
  }
  
  // Default behavior: return the last word
  const words = firstPersonName.split(/\s+/).filter(word => word.trim());
  return words.length > 0 ? words[words.length - 1].toLowerCase() : '';
};

/**
 * Format a guest name with % symbol for display.
 * Returns the name as a string, with no special formatting.
 * Formatting of the % symbol is handled in the component where this is used.
 */
export const formatGuestNameWithPercent = (name: string): string => {
  return name; // Simply return the name string, formatting will be handled in UI components
};