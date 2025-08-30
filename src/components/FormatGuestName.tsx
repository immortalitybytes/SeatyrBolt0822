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
      case 'must': return '&'; // Using ampersand as requested
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
