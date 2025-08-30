import React from 'react';

interface FormatGuestNameProps {
  name: string;
  className?: string;
}

/**
 * Renders a guest name with special styling for percentage markers.
 * If the name contains a '%' character, the single word immediately following it
 * is rendered in italic gray. The '%' itself is not shown.
 * 
 * Examples:
 * - "John %Smith" → "John <styled>Smith</styled>"
 * - "Alice %Jones & Bob" → "Alice <styled>Jones</styled> & Bob"
 * - "Test%" → "Test" (handles edge case)
 */
export const FormatGuestName: React.FC<FormatGuestNameProps> = ({ name, className = '' }) => {
  // Early return for invalid or non-special names
  if (!name || typeof name !== 'string' || !name.includes('%')) {
    return <span className={className}>{name}</span>;
  }

  // Split on % and handle multiple % characters gracefully
  const [prefix, ...restParts] = name.split('%');
  const rest = restParts.join('%');

  // Handle edge case where % is at the end
  if (!rest.trim()) {
    return <span className={className}>{prefix.replace('%', '')}</span>;
  }

  // Extract the first word after % for styling using robust regex
  const match = rest.match(/(\s*)(\S+)(.*)/);
  if (!match) {
    return <span className={className}>{prefix}{rest}</span>;
  }

  const [, leadingSpace, styledWord, suffix] = match;

  return (
    <span className={className}>
      {prefix.trim()}
      {leadingSpace}
      <span style={{ color: '#959595', fontStyle: 'italic' }}>
        {styledWord}
      </span>
      {suffix}
    </span>
  );
};

/**
 * Format guest name for seat display with party member highlighting.
 * Used in SeatingPlanViewer to highlight specific party members.
 */
interface FormatSeatNameProps {
  name: string;
  partyIndex: number;
  className?: string;
}

export const FormatSeatName: React.FC<FormatSeatNameProps> = ({ 
  name, 
  partyIndex, 
  className = '' 
}) => {
  if (!name) return <span className={className}>Empty</span>;
  
  // Handle party member highlighting for names with connectors
  const parts = name.split(/((?:\s*(?:&|\+|and|plus)\s*)+)/i);
  
  if (parts.length === 1) {
    // Single guest - always bold if partyIndex 0
    return (
      <span className={className}>
        {partyIndex === 0 ? <strong>{name}</strong> : name}
      </span>
    );
  }
  
  // Multiple party members - highlight the one at partyIndex
  let memberIndex = 0;
  
  return (
    <span className={className}>
      {parts.map((part, index) => {
        // Check if this part is a delimiter (connector)
        if (/(?:\s*(?:&|\+|and|plus)\s*)+/i.test(part)) {
          return <span key={index}>{part}</span>;
        }
        
        // This is a name part
        const isTargetMember = memberIndex === partyIndex;
        memberIndex++;
        
        return isTargetMember ? 
          <strong key={index}>{part}</strong> : 
          <span key={index}>{part}</span>;
      })}
    </span>
  );
};

/**
 * Format constraint display with icons and colors.
 */
interface FormatConstraintProps {
  type: 'must' | 'cannot' | 'adjacent';
  guestName: string;
  className?: string;
}

export const FormatConstraint: React.FC<FormatConstraintProps> = ({ 
  type, 
  guestName, 
  className = '' 
}) => {
  const getIcon = () => {
    switch (type) {
      case 'must': return '&'; // Changed from ✓ to & for consistency
      case 'cannot': return '✕';
      case 'adjacent': return '⭐';
      default: return '';
    }
  };

  const getColorClass = () => {
    switch (type) {
      case 'must': return 'text-green-600';
      case 'cannot': return 'text-red-600';
      case 'adjacent': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <span className={`inline-flex items-center ${getColorClass()} ${className}`}>
      <span className="mr-1">{getIcon()}</span>
      <FormatGuestName name={guestName} />
    </span>
  );
};

/**
 * Format table name with ID and optional custom name.
 */
interface FormatTableNameProps {
  id: number;
  name?: string;
  position?: number; // 1-based position for display
  className?: string;
}

export const FormatTableName: React.FC<FormatTableNameProps> = ({ 
  id, 
  name, 
  position, 
  className = '' 
}) => {
  const displayNumber = position ?? id;
  const baseLabel = `Table #${displayNumber}`;
  
  if (!name || name.trim() === '' || name.trim().toLowerCase() === `table ${displayNumber}`) {
    return <span className={className}>{baseLabel}</span>;
  }
  
  return (
    <span className={className}>
      {baseLabel} ({name.trim()})
    </span>
  );
};

export default FormatGuestName;
