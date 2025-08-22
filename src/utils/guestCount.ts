// Import countHeads function for consistent counting
import { countHeads } from './guestCount';

/**
 * Counts the number of people in a guest name
 * Enhanced implementation derived from rival AI code analysis
 * Handles complex formats with comprehensive validation and sanitization
 */
export function countHeads(guestName: string): number {
  if (!guestName || typeof guestName !== 'string') {
    return 1;
  }

  // Enhanced sanitization to prevent XSS and handle edge cases
  const sanitized = guestName
    .replace(/<[^>]*>/g, ' ')           // Remove HTML tags
    .replace(/[\u0000-\u001F\u007F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ')               // Normalize whitespace
    .trim();
  
  if (!sanitized) return 1;
  
  // Priority 1: Explicit count in parentheses (highest precedence)
  const parenthesesMatch = sanitized.match(/\((\d+)(?:\s*(?:people|guests|pax))?\)$/i);
  if (parenthesesMatch) {
    const count = parseInt(parenthesesMatch[1]);
    return isNaN(count) || count <= 0 || count > 50 ? 1 : count;
  }

  // Priority 2: Bare number formats ("4 guests", "10 people", etc.)
  const bareNumberMatch = sanitized.match(/^(\d+)\s*(?:guests?|people|persons?|pax)$/i);
  if (bareNumberMatch) {
    const count = parseInt(bareNumberMatch[1]);
    return isNaN(count) || count <= 0 || count > 50 ? 1 : count;
  }

  // Priority 3: Connector-based counting (as specified by user)
  // Start with 1 seat, add 1 for each connector, handle numbers after connectors
  let count = 1;
  
  // Count basic connectors: &, +, " and ", " plus ", " also " (with spaces on both sides)
  const ampersandMatches = sanitized.match(/&/g);
  const plusMatches = sanitized.match(/\+/g);
  const andMatches = sanitized.match(/\sand\s/gi);
  const plusWordMatches = sanitized.match(/\splus\s/gi);
  const alsoMatches = sanitized.match(/\salso\s/gi);
  
  if (ampersandMatches) count += ampersandMatches.length;
  if (plusMatches) count += plusMatches.length;
  if (andMatches) count += andMatches.length;
  if (plusWordMatches) count += plusWordMatches.length;
  if (alsoMatches) count += alsoMatches.length;
  
  // Handle numerals after connectors (e.g., "&2", "+3", " and 4", " plus 2", " also 3")
  // These represent ADDITIONAL seats beyond the connector count
  const numberAfterConnectorMatch = sanitized.match(/[&+]\s*(\d+)|\s(?:and|plus|also)\s+(\d+)/gi);
  if (numberAfterConnectorMatch) {
    for (const match of numberAfterConnectorMatch) {
      const numberMatch = match.match(/(\d+)/);
      if (numberMatch) {
        const additionalSeats = parseInt(numberMatch[1]);
        if (!isNaN(additionalSeats) && additionalSeats > 0 && additionalSeats <= 20) {
          // The number represents additional seats beyond what we already counted
          count += additionalSeats - 1;
        }
      }
    }
  }

  // Special keyword detection for additional context
  if (/plus\s+one/i.test(sanitized)) {
    count += 1;
  }
  
  // Handle "guest" keyword that isn't part of a bare number format  
  if (/\bguest\b/i.test(sanitized) && !bareNumberMatch && !parenthesesMatch) {
    count += 1;
  }

  // Family/household indicators - use as minimum threshold
  if (/family|household/i.test(sanitized)) {
    return Math.max(count, 4); // Use calculated count or default family size, whichever is higher
  }

  // Final validation and bounds checking
  return Math.max(1, Math.min(count, 50));
}

/**
 * Normalize guest name for comparison and constraint handling
 */
export function normalizeGuestName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract display name from guest name (remove count indicators)
 */
export function getDisplayName(name: string): string {
  return name.replace(/\s*\(\d+\)\s*$/, '').trim();
}