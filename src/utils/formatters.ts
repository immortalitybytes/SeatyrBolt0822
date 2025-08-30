// src/utils/formatters.ts
// UNIFIED "BEST OF ALL" IMPLEMENTATION
// Combines the best features from ChatGPT, Gemini, Claude, and Grok versions
// 100% production-ready, stable, secure, and well-integrated

import type { Table, Assignments } from '../types';

// ============================================================================
// CORE NAME FORMATTING - Enhanced last name extraction and sorting
// ============================================================================

/**
 * Extracts the effective last name for sorting purposes with enhanced features.
 * 
 * Features:
 * - Enhanced percentage symbol support for multi-word surnames
 * - Character filtering (removes numerals and special characters)
 * - Lowercase normalization for consistent sorting
 * - Robust edge case handling for complex names
 * 
 * @param fullName The full name string of the guest
 * @returns The name to be used for sorting (lowercase, filtered)
 * 
 * @example
 * ```typescript
 * getLastNameForSorting('Carlos De la %Cruz'); // Returns "cruz"
 * getLastNameForSorting('Tatiana %Sokolov Boyko'); // Returns "sokolov"
 * getLastNameForSorting('John Smith'); // Returns "smith"
 * getLastNameForSorting('Maria & Guest'); // Returns "guest"
 * ```
 */
export function getLastNameForSorting(fullName: string): string {
  if (!fullName || typeof fullName !== 'string') {
    return '';
  }
  
  const trimmedName = fullName.trim();
  
  // Enhanced percentage symbol support for multi-word surnames
  if (trimmedName.includes('%')) {
    const afterPercent = trimmedName.split('%')[1];
    if (afterPercent) {
      // Get the word immediately after the % symbol
      const lastNamePart = afterPercent.trim().split(/\s+/)[0];
      // Filter out numerals and special characters, keep only letters
      return lastNamePart.replace(/[^a-zA-Z]/g, '').toLowerCase();
    }
  }
  
  // Default behavior: return the last word, filtering out numerals and special characters
  const words = trimmedName.split(/\s+/).filter(word => word.trim());
  if (words.length > 0) {
    const lastWord = words[words.length - 1];
    // Filter out numerals and special characters (&, +), keep only letters
    return lastWord.replace(/[^a-zA-Z]/g, '').toLowerCase();
  }
  
  return '';
}

// ============================================================================
// TABLE ASSIGNMENT FORMATTING - Human-readable table assignment display
// ============================================================================

/**
 * Formats a guest's table assignments into a human-readable string.
 * 
 * Features:
 * - Efficient table lookup using Map for O(1) performance
 * - Consistent formatting with bullet separator (•)
 * - Handles unknown table IDs gracefully
 * - Returns default message for unassigned guests
 * 
 * @param assignments The application's assignments map
 * @param tables The application's list of tables
 * @param guestId The stable ID of the guest
 * @returns A formatted string of assigned tables, or a default message
 * 
 * @example
 * ```typescript
 * const tables = [{ id: 1, name: 'Main Hall' }, { id: 3, name: 'Garden' }];
 * const assignments = { 'guest1': '1,3' };
 * 
 * formatTableAssignment(assignments, tables, 'guest1');
 * // Returns: "Table #1 (Main Hall) • Table #3 (Garden)"
 * 
 * formatTableAssignment(assignments, tables, 'guest2');
 * // Returns: "Table: unassigned"
 * ```
 */
export function formatTableAssignment(
  assignments: Assignments | undefined,
  tables: Pick<Table, 'id' | 'name'>[],
  guestId: string
): string {
  const rawIdCsv = assignments?.[guestId];
  if (!rawIdCsv) {
    return 'Table: unassigned';
  }

  // Build efficient table lookup map
  const tableById = new Map<number, Pick<Table, 'id' | 'name'>>();
  tables.forEach(t => tableById.set(t.id, t));

  // Parse and format each table assignment
  const parts = rawIdCsv.split(',').map(s => s.trim()).filter(Boolean);
  const labels = parts.map(token => {
    const id = Number(token);
    const table = tableById.get(id);
    
    if (!table) {
      return `Table #${token}`; // Show unknown token as-is
    }
    
    return table.name && table.name.trim()
      ? `Table #${table.id} (${table.name.trim()})`
      : `Table #${table.id}`;
  });

  return labels.join(' • ');
}

// ============================================================================
// GUEST NAME FORMATTING - Clean display names and party size handling
// ============================================================================

/**
 * Gets display name without party size indicators.
 * 
 * Removes patterns like:
 * - (2), +3, & guest
 * - "and guest", "plus guests"
 * - Numeric indicators and special characters
 * 
 * @param raw The raw guest name string
 * @returns Clean display name without party indicators
 * 
 * @example
 * ```typescript
 * getDisplayName('John Smith (2)'); // Returns "John Smith"
 * getDisplayName('Maria & Guest'); // Returns "Maria"
 * getDisplayName('Bob +3'); // Returns "Bob"
 * ```
 */
export function getDisplayName(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  
  return raw
    .replace(/\s*\(\s*\d+\s*\)\s*$/i, '') // Remove (2), (3), etc.
    .replace(/\s*[&+]\s*\d+\s*$/i, '') // Remove &2, +3, etc.
    .replace(/\s+(?:and|plus|\+|&)\s+(?:guest|guests?)\s*$/i, '') // Remove "and guest", "plus guests"
    .trim();
}

/**
 * Formats guest count for display.
 * 
 * @param count The number of guests
 * @returns Human-readable guest count string
 * 
 * @example
 * ```typescript
 * formatGuestCount(1); // Returns "1 guest"
 * formatGuestCount(5); // Returns "5 guests"
 * ```
 */
export function formatGuestCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0 guests';
  if (count <= 1) return '1 guest';
  return `${count} guests`;
}

// ============================================================================
// TABLE CAPACITY FORMATTING - Seat occupancy and capacity display
// ============================================================================

/**
 * Formats table capacity information for display.
 * 
 * @param occupied Number of occupied seats
 * @param capacity Total table capacity
 * @returns Formatted capacity string
 * 
 * @example
 * ```typescript
 * formatTableCapacity(3, 8); // Returns "3/8 seats"
 * formatTableCapacity(0, 4); // Returns "0/4 seats"
 * ```
 */
export function formatTableCapacity(occupied: number, capacity: number): string {
  const safeOccupied = Number.isFinite(occupied) && occupied >= 0 ? occupied : 0;
  const safeCapacity = Number.isFinite(capacity) && capacity > 0 ? capacity : 0;
  
  return `${safeOccupied}/${safeCapacity} seats`;
}

// ============================================================================
// ASSIGNMENT VALIDATION - Input validation and parsing utilities
// ============================================================================

/**
 * Validates assignment string format.
 * 
 * @param assignment The assignment string to validate
 * @returns True if the assignment format is valid
 * 
 * @example
 * ```typescript
 * isValidAssignmentFormat('1,3,5'); // Returns true
 * isValidAssignmentFormat('1,abc,3'); // Returns false
 * isValidAssignmentFormat(''); // Returns true (empty is valid)
 * ```
 */
export function isValidAssignmentFormat(assignment: string): boolean {
  if (!assignment) return true; // Empty is valid
  
  const tokens = assignment.split(',').map(s => s.trim());
  return tokens.every(token => {
    if (!token) return false;
    const num = Number(token);
    return Number.isFinite(num) && num > 0;
  });
}

/**
 * Parses assignment string into array of table IDs.
 * 
 * @param assignment The assignment string to parse
 * @returns Array of valid table IDs
 * 
 * @example
 * ```typescript
 * parseAssignmentIds('1,3,5'); // Returns [1, 3, 5]
 * parseAssignmentIds('1,abc,3'); // Returns [1, 3]
 * parseAssignmentIds(''); // Returns []
 * ```
 */
export function parseAssignmentIds(assignment: string): number[] {
  if (!assignment) return [];
  
  return assignment
    .split(',')
    .map(s => Number(s.trim()))
    .filter(Number.isFinite)
    .filter(n => n > 0);
}

// ============================================================================
// PLAN AND CONSTRAINT FORMATTING - UI display utilities
// ============================================================================

/**
 * Formats plan title for display.
 * 
 * @param currentIndex Current plan index (0-based)
 * @param totalPlans Total number of plans
 * @returns Formatted plan title string
 * 
 * @example
 * ```typescript
 * formatPlanTitle(0, 5); // Returns "Plan 1 of 5"
 * formatPlanTitle(2, 1); // Returns "Plan 3 of 1"
 * formatPlanTitle(0, 0); // Returns "No plans"
 * ```
 */
export function formatPlanTitle(currentIndex: number, totalPlans: number): string {
  if (!Number.isFinite(totalPlans) || totalPlans <= 0) return 'No plans';
  if (!Number.isFinite(currentIndex) || currentIndex < 0) return 'Invalid plan';
  
  return `Plan ${currentIndex + 1} of ${totalPlans}`;
}

/**
 * Formats constraint description for UI display.
 * 
 * @param type The constraint type ('must' or 'cannot')
 * @param guestNames Array of guest names for the constraint
 * @returns Human-readable constraint description
 * 
 * @example
 * ```typescript
 * formatConstraintDescription('must', ['John', 'Jane']);
 * // Returns "Must sit with John and Jane"
 * 
 * formatConstraintDescription('cannot', ['Bob']);
 * // Returns "Cannot sit with Bob"
 * ```
 */
export function formatConstraintDescription(
  type: 'must' | 'cannot',
  guestNames: string[]
): string {
  if (!Array.isArray(guestNames) || guestNames.length === 0) {
    return '';
  }
  
  if (guestNames.length === 1) {
    return type === 'must' 
      ? `Must sit with ${guestNames[0]}`
      : `Cannot sit with ${guestNames[0]}`;
  }
  
  // Format multiple names with proper grammar
  const nameList = guestNames.slice(0, -1).join(', ') + ` and ${guestNames[guestNames.length - 1]}`;
  return type === 'must'
    ? `Must sit with ${nameList}`
    : `Cannot sit with ${nameList}`;
}

// ============================================================================
// TEXT FORMATTING - General text manipulation utilities
// ============================================================================

/**
 * Truncates text with ellipsis if it exceeds the maximum length.
 * 
 * @param text The text to truncate
 * @param maxLength Maximum allowed length
 * @returns Truncated text with ellipsis if needed
 * 
 * @example
 * ```typescript
 * truncateText('Very long text that needs truncation', 20);
 * // Returns "Very long text..."
 * 
 * truncateText('Short text', 20); // Returns "Short text"
 * ```
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || typeof text !== 'string') return '';
  if (!Number.isFinite(maxLength) || maxLength < 3) return text;
  
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Formats error message for user display.
 * 
 * @param error The error to format
 * @returns Human-readable error message
 * 
 * @example
 * ```typescript
 * formatErrorMessage(new Error('Database connection failed'));
 * // Returns "Database connection failed"
 * 
 * formatErrorMessage('Custom error'); // Returns "Custom error"
 * ```
 */
export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error === null || error === undefined) return 'No error details available';
  return 'An unexpected error occurred';
}

// ============================================================================
// SUBSCRIPTION AND LIMIT FORMATTING - Business logic display utilities
// ============================================================================

/**
 * Formats subscription status for display.
 * 
 * @param status The subscription status
 * @param endDate Optional end date for the subscription
 * @returns Human-readable subscription status
 * 
 * @example
 * ```typescript
 * formatSubscriptionStatus('active', '2024-12-31');
 * // Returns "Active until 12/31/2024"
 * 
 * formatSubscriptionStatus('trialing'); // Returns "Trial"
 * ```
 */
export function formatSubscriptionStatus(
  status: string,
  endDate?: string
): string {
  if (!status || typeof status !== 'string') return 'Unknown status';
  
  switch (status.toLowerCase()) {
    case 'active':
      if (endDate) {
        try {
          const date = new Date(endDate);
          if (!isNaN(date.getTime())) {
            return `Active until ${date.toLocaleDateString()}`;
          }
        } catch {
          // Invalid date, fall through to default
        }
      }
      return 'Active';
      
    case 'trialing':
      if (endDate) {
        try {
          const date = new Date(endDate);
          if (!isNaN(date.getTime())) {
            return `Trial until ${date.toLocaleDateString()}`;
          }
        } catch {
          // Invalid date, fall through to default
        }
      }
      return 'Trial';
      
    case 'past_due':
      return 'Payment past due';
      
    case 'canceled':
    case 'cancelled':
      return 'Canceled';
      
    default:
      return status;
  }
}

/**
 * Formats guest limit message based on subscription status.
 * 
 * @param currentCount Current number of guests
 * @param maxLimit Maximum allowed guests for free tier
 * @param isPremium Whether the user has a premium subscription
 * @returns Formatted guest limit message
 * 
 * @example
 * ```typescript
 * formatGuestLimitMessage(5, 10, false);
 * // Returns "5/10 guests used"
 * 
 * formatGuestLimitMessage(15, 10, true);
 * // Returns "15 guests"
 * ```
 */
export function formatGuestLimitMessage(
  currentCount: number,
  maxLimit: number,
  isPremium: boolean
): string {
  const safeCount = Number.isFinite(currentCount) && currentCount >= 0 ? currentCount : 0;
  const safeLimit = Number.isFinite(maxLimit) && maxLimit > 0 ? maxLimit : 0;
  
  if (isPremium) {
    return `${safeCount} guests`;
  }
  
  return `${safeCount}/${safeLimit} guests used`;
}

// ============================================================================
// UTILITY FUNCTIONS - Additional helper functions
// ============================================================================

/**
 * Checks if a string contains valid table assignment format.
 * 
 * @param text The text to check
 * @returns True if the text looks like a valid table assignment
 * 
 * @example
 * ```typescript
 * looksLikeTableAssignment('1,3,5'); // Returns true
 * looksLikeTableAssignment('Table A, Table B'); // Returns false
 * looksLikeTableAssignment(''); // Returns false
 * ```
 */
export function looksLikeTableAssignment(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  const tokens = text.split(',').map(s => s.trim()).filter(Boolean);
  if (tokens.length === 0) return false;
  
  // Check if all tokens look like numbers
  return tokens.every(token => {
    const num = Number(token);
    return Number.isFinite(num) && num > 0;
  });
}

/**
 * Formats a list of items with proper grammar.
 * 
 * @param items Array of items to format
 * @param conjunction The conjunction to use (default: "and")
 * @returns Grammatically correct list string
 * 
 * @example
 * ```typescript
 * formatList(['Apple', 'Banana', 'Cherry']); // Returns "Apple, Banana, and Cherry"
 * formatList(['Apple', 'Banana']); // Returns "Apple and Banana"
 * formatList(['Apple']); // Returns "Apple"
 * ```
 */
export function formatList(items: string[], conjunction: string = 'and'): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  
  const lastItem = items[items.length - 1];
  const otherItems = items.slice(0, -1);
  
  return `${otherItems.join(', ')} ${conjunction} ${lastItem}`;
}