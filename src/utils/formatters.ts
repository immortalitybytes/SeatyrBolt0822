// src/utils/formatters.ts
// Best of All: Unified formatters utility combining GEMINI's robustness, ChatGPT's performance, and enhanced error handling
// Production-ready, stable, and secure code that integrates seamlessly with the existing codebase

import type { Assignments, Table } from '../types';

/**
 * Extracts the effective last name for sorting purposes.
 * If a name contains a '%' symbol, it returns the single word immediately
 * following it. Otherwise, it returns the last word of the name.
 * 
 * This function handles edge cases gracefully and provides consistent sorting
 * behavior for guest lists.
 *
 * @param fullName The full name string of the guest.
 * @returns The name to be used for sorting, or empty string if invalid.
 * 
 * @example
 * getLastNameForSorting("John Smith") // "Smith"
 * getLastNameForSorting("Jane%Doe") // "Doe"
 * getLastNameForSorting("") // ""
 */
export function getLastNameForSorting(fullName: string): string {
  // Robust input validation
  if (!fullName || typeof fullName !== 'string') {
    return '';
  }
  
  const trimmedName = fullName.trim();
  if (!trimmedName) {
    return '';
  }
  
  // Handle special '%' delimiter for custom sorting
  if (trimmedName.includes('%')) {
    const parts = trimmedName.split('%');
    const afterDelimiter = (parts[1] || '').trim();
    
    if (afterDelimiter) {
      const firstWord = afterDelimiter.split(/\s+/)[0];
      return firstWord || trimmedName.split(/\s+/).pop() || trimmedName;
    }
  }
  
  // Default: return last word of the name
  const words = trimmedName.split(/\s+/).filter(word => word.length > 0);
  return words.length > 0 ? words[words.length - 1] : trimmedName;
}

/**
 * Formats a guest's table assignments into a human-readable string.
 * Provides clear, user-friendly labels for table assignments with proper
 * handling of named and unnamed tables.
 *
 * @param assignments The application's assignments map (ID-CSV format).
 * @param tables The application's list of tables with IDs and names.
 * @param guestId The stable ID of the guest.
 * @returns A formatted string of assigned tables, or a default message.
 * 
 * @example
 * formatTableAssignment(assignments, tables, "guest123")
 * // Returns: "Table #1 (Main Hall) • Table #3 • Table #5 (Sweetheart)"
 */
export function formatTableAssignment(
  assignments: Assignments | undefined,
  tables: Pick<Table, 'id' | 'name'>[],
  guestId: string
): string {
  // Input validation
  if (!assignments || !tables || !guestId) {
    return 'Table: unassigned';
  }
  
  const rawIdCsv = assignments[guestId];
  if (!rawIdCsv || typeof rawIdCsv !== 'string') {
    return 'Table: unassigned';
  }
  
  // Create efficient lookup map for table data
  const tableById = new Map<number, Pick<Table, 'id' | 'name'>>();
  tables.forEach(table => {
    if (table && typeof table.id === 'number' && table.id > 0) {
      tableById.set(table.id, table);
    }
  });
  
  // Parse and format each table assignment
  const parts = rawIdCsv
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0);
  
  if (parts.length === 0) {
    return 'Table: unassigned';
  }
  
  const labels: string[] = [];
  
  for (const token of parts) {
    const tableId = Number(token);
    
    // Validate table ID
    if (!Number.isFinite(tableId) || tableId <= 0) {
      labels.push(`Table #${token}`); // Show invalid token as-is
      continue;
    }
    
    const table = tableById.get(tableId);
    
    if (!table) {
      labels.push(`Table #${token}`); // Show unknown table as-is
      continue;
    }
    
    // Format table label with name if available
    const baseLabel = `Table #${table.id}`;
    const hasCustomName = table.name && typeof table.name === 'string' && table.name.trim().length > 0;
    
    if (hasCustomName) {
      labels.push(`${baseLabel} (${table.name.trim()})`);
    } else {
      labels.push(baseLabel);
    }
  }
  
  // Return formatted string or fallback
  return labels.length > 0 ? labels.join(' • ') : 'Table: unassigned';
}

/**
 * Formats a guest's name with optional party size information.
 * Provides consistent name formatting across the application.
 *
 * @param name The guest's name.
 * @param count The party size (optional).
 * @returns A formatted name string.
 * 
 * @example
 * formatGuestName("John Smith", 3) // "John Smith (Party of 3)"
 * formatGuestName("Jane Doe") // "Jane Doe"
 */
export function formatGuestName(name: string, count?: number): string {
  if (!name || typeof name !== 'string') {
    return 'Unknown Guest';
  }
  
  const trimmedName = name.trim();
  if (!trimmedName) {
    return 'Unknown Guest';
  }
  
  if (count && typeof count === 'number' && count > 1) {
    return `${trimmedName} (Party of ${count})`;
  }
  
  return trimmedName;
}

/**
 * Formats table information for display purposes.
 * Provides consistent table labeling across the application.
 *
 * @param table The table object with ID and optional name.
 * @returns A formatted table string.
 * 
 * @example
 * formatTableName({ id: 1, name: "Main Hall" }) // "Table #1 (Main Hall)"
 * formatTableName({ id: 2 }) // "Table #2"
 */
export function formatTableName(table: Pick<Table, 'id' | 'name'>): string {
  if (!table || typeof table.id !== 'number' || table.id <= 0) {
    return 'Invalid Table';
  }
  
  const baseLabel = `Table #${table.id}`;
  const hasCustomName = table.name && typeof table.name === 'string' && table.name.trim().length > 0;
  
  if (hasCustomName) {
    return `${baseLabel} (${table.name.trim()})`;
  }
  
  return baseLabel;
}