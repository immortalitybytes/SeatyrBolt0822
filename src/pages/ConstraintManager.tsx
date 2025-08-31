import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ClipboardList,
  Info,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ArrowDownAZ,
  ChevronDown,
  X,
  Download,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import Card from '../components/Card';
import { useApp } from '../context/AppContext';
import { isPremiumSubscription } from '../utils/premium';
import { getLastNameForSorting, formatTableAssignment } from '../utils/formatters';
import { detectConstraintConflicts } from '../utils/seatingAlgorithm';
import SavedSettingsAccordion from '../components/SavedSettingsAccordion';
import { Guest, ConstraintConflict } from '../types';
import { FormatGuestName } from '../components/FormatGuestName';

// ───────────────────────────────────────────────────────────────────────────────
// Config & Types
// ───────────────────────────────────────────────────────────────────────────────
type SortOption = 'as-entered' | 'first-name' | 'last-name' | 'current-table';

const GUEST_THRESHOLD = 120; // Threshold for pagination
const GUESTS_PER_PAGE = 10; // Show 10 guests per page when paginating

// ───────────────────────────────────────────────────────────────────────────────
// Debounce helper (preserves CursorAI UX behavior)
// ───────────────────────────────────────────────────────────────────────────────
function useDebouncedCallback<T extends (...args: any[]) => any>(callback: T, delay: number) {
  const timeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);
  return React.useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => callback(...args), delay);
    },
    [callback, delay]
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Adjacency graph helpers — IDs only (resolves circular/self/degree issues)
// ───────────────────────────────────────────────────────────────────────────────
function buildAdjacencyGraph(guests: Guest[], adj: Record<string, string[] | undefined>) {
  const byId = new Map(guests.map((g) => [g.id, g]));
  const edges = new Map<string, Set<string>>(guests.map((g) => [g.id, new Set<string>()]));
  for (const [a, list] of Object.entries(adj || {})) {
    if (!byId.has(a)) continue;
    for (const b of list || []) {
      if (!byId.has(b) || a === b) continue; // ignore unknown/self
      edges.get(a)!.add(b);
      edges.get(b)!.add(a);
    }
  }
  return { byId, edges };
}

function getComponent(startId: string, edges: Map<string, Set<string>>) {
  const seen = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const v = stack.pop()!;
    if (seen.has(v)) continue;
    seen.add(v);
    for (const neighbor of edges.get(v) || new Set()) {
      if (!seen.has(neighbor)) stack.push(neighbor);
    }
  }
  return Array.from(seen);
}

/** Would adding edge (a,b) close a loop? */
function wouldCloseLoop(a: string, b: string, edges: Map<string, Set<string>>) {
  // If b already reachable from a, adding (a,b) creates a cycle
  const compA = getComponent(a, edges);
  return compA.includes(b);
}

// ───────────────────────────────────────────────────────────────────────────────
// Component
// ───────────────────────────────────────────────────────────────────────────────
const ConstraintManager: React.FC = () => {
  const { state, dispatch } = useApp();

  // Selection/highlight state
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [highlightedPair, setHighlightedPair] = useState<{ guest1: string; guest2: string } | null>(null);
  const [highlightTimeout, setHighlightTimeout] = useState<number | null>(null);

  // Conflicts
  const [conflicts, setConflicts] = useState<ConstraintConflict[]>([]);
  const [showConflicts, setShowConflicts] = useState(true);

  // Device & UI
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // Pagination (preserved)
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Sorting (preserved)
  const [sortOption, setSortOption] = useState<SortOption>('as-entered');

  // Warning banner state (preserved)
  const [isWarningExpanded, setIsWarningExpanded] = useState(false);
  const [initialWarningShown, setInitialWarningShown] = useState(false);
  const [userHasInteractedWithWarning, setUserHasInteractedWithWarning] = useState(false);

  const isPremium = isPremiumSubscription(state.subscription);

  // Detect touch device (preserved)
  useEffect(() => {
    const checkTouchDevice = () =>
      setIsTouchDevice('ontouchstart' in window || (navigator as any).maxTouchPoints > 0);
    checkTouchDevice();
    window.addEventListener('resize', checkTouchDevice);
    return () => window.removeEventListener('resize', checkTouchDevice);
  }, []);

  // Debounced conflict detection (preserved)
  const updateConflicts = useDebouncedCallback(async () => {
    if (state.guests.length < 2 || state.tables.length === 0) {
      setConflicts([]);
      return;
    }
    const result = detectConstraintConflicts(
      state.guests,
      state.constraints,
      state.tables,
      true,
      state.adjacents
    );
    setConflicts(result || []);
  }, 300);

  useEffect(() => {
    updateConflicts();
  }, [state.guests, state.constraints, state.tables, state.adjacents, updateConflicts]);

  // Smart suggestions (preserved)
  const smartSuggestions = useMemo((): string[] => {
    const suggestions: string[] = [];
    if (conflicts.length > 0) {
      suggestions.push(`Resolve ${conflicts.length} constraint conflicts to improve seating generation.`);
    }
    return suggestions;
  }, [conflicts]);

  // Export constraints (preserved)
  const exportJSON = React.useCallback(() => {
    const data = JSON.stringify(
      {
        guests: state.guests.length,
        constraints: state.constraints,
        adjacents: state.adjacents,
        exportedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seatyr-constraints-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state.guests, state.constraints, state.adjacents]);

  // Resolve conflict (IDs; preserved UX)
  const resolveConflict = React.useCallback(
    (key1: string, key2: string) => {
      const name1 = state.guests.find((g) => g.id === key1)?.name || key1;
      const name2 = state.guests.find((g) => g.id === key2)?.name || key2;

      if (window.confirm(`Remove constraint between ${name1} and ${name2}? This may clear existing seating plans.`)) {
        dispatch({ type: 'SET_CONSTRAINT', payload: { guest1: key1, guest2: key2, value: '' } });
        purgeSeatingPlans();
      }
    },
    [dispatch, state.guests]
  );

  // Warning expand/collapse behavior (preserved)
  useEffect(() => {
    setIsWarningExpanded(false);
    if (isPremium && state.guests.length > GUEST_THRESHOLD && !initialWarningShown) {
      setInitialWarningShown(true);
    }
    setUserHasInteractedWithWarning(false);
  }, []);

  useEffect(() => {
    const needsPagination = isPremium && state.guests.length > GUEST_THRESHOLD;
    if (needsPagination) {
      if (!userHasInteractedWithWarning && !initialWarningShown) {
        setIsWarningExpanded(true);
        setInitialWarningShown(true);
        const timer = window.setTimeout(() => {
          if (!userHasInteractedWithWarning) setIsWarningExpanded(false);
        }, 10000);
        return () => window.clearTimeout(timer);
      }
    } else {
      setInitialWarningShown(false);
    }
  }, [state.guests.length, isPremium, userHasInteractedWithWarning, initialWarningShown]);

  // Reset pagination when guest list changes (preserved)
  useEffect(() => {
    setCurrentPage(0);
    if (isPremium && state.guests.length > GUEST_THRESHOLD) {
      setTotalPages(Math.ceil(state.guests.length / GUESTS_PER_PAGE));
    } else {
      setTotalPages(1);
    }
  }, [state.guests.length, isPremium]);

  const handleToggleWarning = () => {
    setIsWarningExpanded((prev) => !prev);
    setUserHasInteractedWithWarning(true);
  };

  // Purge plans when rules change (preserved)
  const purgeSeatingPlans = () => {
    dispatch({ type: 'SET_SEATING_PLANS', payload: [] });
    dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: 0 });
    localStorage.setItem('seatyr_current_setting_name', 'Unsaved');
    dispatch({ type: 'SET_LOADED_SAVED_SETTING', payload: false });
  };

  // Helpers: stable name/id maps
  const nameById = useMemo(() => new Map(state.guests.map((g) => [g.id, g.name])), [state.guests]);
  const idByName = useMemo(() => new Map(state.guests.map((g) => [g.name, g.id])), [state.guests]);

  // Sorting helpers (IDs internally; names only for display)
  type Plan = { tables: { id: number; seats: any[] }[] } | null | undefined;
  function currentTableKey(guestId: string, plan: Plan, assigns?: Record<string, string>) {
    const guestName = nameById.get(guestId);
    if (guestName && plan?.tables) {
      for (const t of plan.tables) {
        const names = (t.seats ?? [])
          .map((s: any) => (typeof s === 'string' ? s : s?.name))
          .filter(Boolean);
        if (names.includes(guestName)) return t.id;
      }
    }
    const raw = assigns?.[guestId];
    if (raw) {
      const first = raw
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .find((n) => !Number.isNaN(n));
      if (typeof first === 'number') return first;
    }
    return Number.POSITIVE_INFINITY;
  }

  const getSortedGuests = () => {
    if (sortOption === 'as-entered') return [...state.guests];
    const arr = [...state.guests];
    switch (sortOption) {
      case 'first-name':
        return arr.sort((a, b) => a.name.localeCompare(b.name));
      case 'last-name':
        return arr.sort(
          (a, b) => getLastNameForSorting(a.name).localeCompare(getLastNameForSorting(b.name)) || a.name.localeCompare(b.name)
        );
      case 'current-table':
        return arr.sort(
          (a, b) =>
            currentTableKey(a.id, state.seatingPlans?.[state.currentPlanIndex], state.assignments) -
              currentTableKey(b.id, state.seatingPlans?.[state.currentPlanIndex], state.assignments) ||
            a.name.localeCompare(b.name)
        );
      default:
        return arr;
    }
  };

  // Pagination helpers (preserved)
  const shouldShowPagination = state.guests.length >= GUEST_THRESHOLD;
  const handleNavigatePlan = (delta: number) => {
    setCurrentPage((prev) => Math.max(0, Math.min(totalPages - 1, prev + delta)));
  };

  // Long-press (preserved UX)
  let longPressTimer: number | undefined;
  const handleLongPress = (e: React.TouchEvent, guestId: string) => {
    e.preventDefault();
    longPressTimer = window.setTimeout(() => {
      handleGuestSelect(guestId);
    }, 500);
  };
  const clearLongPressTimer = () => {
    if (longPressTimer) window.clearTimeout(longPressTimer);
  };

  // Toggle constraint cell (IDs only; preserved precedence cycling)
  const handleToggleConstraint = (guest1Id: string, guest2Id: string) => {
    if (guest1Id === guest2Id) return;
    setSelectedGuestId(null);
    setHighlightedPair(null);
    if (highlightTimeout) {
      window.clearTimeout(highlightTimeout);
      setHighlightTimeout(null);
    }

    const currentValue = state.constraints[guest1Id]?.[guest2Id] || '';
    const nextValue: 'must' | 'cannot' | '' = currentValue === '' ? 'must' : currentValue === 'must' ? 'cannot' : '';
    dispatch({ type: 'SET_CONSTRAINT', payload: { guest1: guest1Id, guest2: guest2Id, value: nextValue } });
    purgeSeatingPlans();
  };

  // Get adjacency count for a guestId (preserved indicator)
  const getAdjacentCount = (guestId: string) => {
    return state.adjacents[guestId]?.length || 0;
  };

  // Select two guests to set adjacency (IDs only) with rule enforcement
  const handleGuestSelect = (guestId: string) => {
    if (selectedGuestId === null) {
      setSelectedGuestId(guestId);
      return;
    }
    if (selectedGuestId === guestId) {
      setSelectedGuestId(null);
      return;
    }

    const a = selectedGuestId;
    const b = guestId;

    // Degree cap: each node ≤ 2
    const degA = getAdjacentCount(a);
    const degB = getAdjacentCount(b);
    if (degA >= 2 || degB >= 2) {
      alert('Error: That would exceed the limit of 2 adjacent-pairings.');
      setSelectedGuestId(null);
      return;
    }

    // Graph checks
    const { byId, edges } = buildAdjacencyGraph(state.guests, state.adjacents);

    // Closed-loop capacity rule: if adding (a,b) closes a loop, the component size must match an existing table capacity
    if (wouldCloseLoop(a, b, edges)) {
      const componentNodes = getComponent(a, edges);
      const totalSeats = componentNodes.reduce((sum, id) => sum + (byId.get(id)?.count || 0), 0);
      const hasExactCapacity = state.tables.some((t) => t.seats === totalSeats);
      if (!hasExactCapacity) {
        alert(
          `Error: Closing this loop would create a chain of ${totalSeats} seats, but no table has exactly that capacity.`
        );
        setSelectedGuestId(null);
        return;
      }
    }

    // Create adjacency
    dispatch({ type: 'SET_ADJACENT', payload: { guest1: a, guest2: b } });

    // Clear 'cannot' if present (precedence rule)
    if (state.constraints[a]?.[b] === 'cannot' || state.constraints[b]?.[a] === 'cannot') {
      dispatch({ type: 'SET_CONSTRAINT', payload: { guest1: a, guest2: b, value: '' } });
    }

    // Highlight pair
    setHighlightedPair({ guest1: a, guest2: b });
    if (highlightTimeout) window.clearTimeout(highlightTimeout);
    const timeoutId = window.setTimeout(() => setHighlightedPair(null), 3000);
    setHighlightTimeout(timeoutId);

    purgeSeatingPlans();
    setSelectedGuestId(null);
  };

  // Constraint grid (preserved layout; switched internals to IDs)
  const constraintGrid = useMemo(() => {
    const guests = getSortedGuests();
    
    // Validate constraint and adjacency state
    if (!guests || guests.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          No guests added yet. Add guests to create constraints.
        </div>
      );
    }

    // Ensure constraints and adjacents are valid objects with comprehensive validation
    const constraints = state.constraints || {};
    const adjacents = state.adjacents || {};
    
    // Comprehensive validation with detailed error reporting
    if (typeof constraints !== 'object' || constraints === null || Array.isArray(constraints)) {
      console.error('Invalid constraints state:', constraints, 'Type:', typeof constraints);
      return (
        <div className="text-center py-8 text-red-500">
          <div className="font-bold mb-2">Constraint Data Error</div>
          <div className="text-sm">Invalid constraint data structure detected.</div>
          <div className="text-sm mt-1">Type: {typeof constraints}</div>
          <button 
            className="danstyle1c-btn mt-3" 
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }
    
    if (typeof adjacents !== 'object' || adjacents === null || Array.isArray(adjacents)) {
      console.error('Invalid adjacents state:', adjacents, 'Type:', typeof adjacents);
      return (
        <div className="text-center py-8 text-red-500">
          <div className="font-bold mb-2">Adjacency Data Error</div>
          <div className="text-sm">Invalid adjacency data structure detected.</div>
          <div className="text-sm mt-1">Type: {typeof adjacents}</div>
          <button 
            className="danstyle1c-btn mt-3" 
            onClick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      );
    }

    // Pagination slice (columns)
    const needsPagination = isPremium && guests.length > GUEST_THRESHOLD;
    const totalPagesCalc = needsPagination ? Math.ceil(guests.length / GUESTS_PER_PAGE) : 1;
    const startIndex = needsPagination ? currentPage * GUESTS_PER_PAGE : 0;
    const endIndex = needsPagination ? Math.min(startIndex + GUESTS_PER_PAGE, guests.length) : guests.length;
    const displayGuests = guests.slice(startIndex, endIndex);

    // Header row
    const headerRow: React.ReactNode[] = [
      <th
        key="corner"
        className="bg-indigo-50 font-medium p-2 border border-[#586D78] border-2 sticky top-0 left-0 z-30"
      >
        Guest Names
      </th>,
    ];

    displayGuests.forEach((guest) => {
      const adjacentCount = getAdjacentCount(guest.id);
      const isSelected = selectedGuestId === guest.id;
      const isHighlighted =
        !!highlightedPair && (highlightedPair.guest1 === guest.id || highlightedPair.guest2 === guest.id);

      const adjacentIndicator =
        adjacentCount > 0 ? (
          <span
            className="text-[#b3b508] font-bold ml-1"
            title={`Adjacent to: ${(adjacents[guest.id] || [])
              .map((id) => nameById.get(id) || id)
              .join(', ')}`}
            style={{ fontSize: '0.7em' }}
          >
            {adjacentCount === 1 ? '⭐' : '⭐⭐'}
          </span>
        ) : null;

      headerRow.push(
        <th
          key={`col-${guest.id}`}
          className={`p-2 font-medium sticky top-0 z-20 min-w-[100px] cursor-pointer transition-colors duration-200 border border-[#586D78] border-2 ${
            isHighlighted ? 'bg-[#88abc6]' : isSelected ? 'bg-[#586D78] text-white' : 'bg-indigo-50 text-[#586D78] hover:bg-indigo-100'
          }`}
          onDoubleClick={() => handleGuestSelect(guest.id)}
          onTouchStart={(e) => handleLongPress(e, guest.id)}
          onTouchEnd={clearLongPressTimer}
          data-id={guest.id}
        >
          <div
            className="max-w-[100px] leading-snug"
            style={{ minHeight: '4.5rem', wordWrap: 'break-word', whiteSpace: 'normal', lineHeight: '1.3' }}
          >
            <FormatGuestName name={guest.name} />
            {adjacentIndicator}
          </div>
        </th>
      );
    });

    const grid: React.ReactNode[] = [<tr key="header">{headerRow}</tr>];

    // Rows
    guests.forEach((g1, rowIndex) => {
      const isRowSelected = selectedGuestId === g1.id;
      const isRowHighlighted =
        !!highlightedPair && (highlightedPair.guest1 === g1.id || highlightedPair.guest2 === g1.id);
      const row: React.ReactNode[] = [];

      // Left sticky cell (name, party size, table assignment)
      const adjacentCount = getAdjacentCount(g1.id);
      const adjacentIndicator =
        adjacentCount > 0 ? (
          <span
            className="text-[#b3b508] font-bold ml-1"
            title={`Adjacent to: ${(state.adjacents[g1.id] || [])
              .map((id) => nameById.get(id) || id)
              .join(', ')}`}
            style={{ fontSize: '0.7em' }}
          >
            {adjacentCount === 1 ? '⭐' : '⭐⭐'}
          </span>
        ) : null;

      row.push(
        <td
          key={`row-${rowIndex}`}
          className={`p-2 font-medium sticky left-0 z-10 min-w-[280px] cursor-pointer transition-colors duration-200 border-r border-[#586D78] border border-[#586D78] border-2 ${
            isRowHighlighted ? 'bg-[#88abc6]' : isRowSelected ? 'bg-[#586D78] text-white' : 'bg-indigo-50 text-[#586D78] hover:bg-indigo-100'
          }`}
          onDoubleClick={() => handleGuestSelect(g1.id)}
          onTouchStart={(e) => handleLongPress(e, g1.id)}
          onTouchEnd={clearLongPressTimer}
          data-id={g1.id}
        >
          <div>
            <div className="truncate max-w-[280px]">
              <FormatGuestName name={g1.name} />
              {adjacentIndicator}
            </div>
            {/* Party size display */}
            <div className="text-xs text-[#586D78] mt-1">
              Party size: {g1.count} {g1.count === 1 ? 'person' : 'people'}
            </div>
            {/* Table assignment line (centralized formatter; ID-based) */}
            <div className="text-xs text-[#586D78] mt-1">
              {formatTableAssignment(state.assignments, state.tables, g1.id)}
            </div>
          </div>
        </td>
      );

      // Data cells (only for visible column slice)
      displayGuests.forEach((g2) => {
        if (g1.id === g2.id) {
          row.push(
            <td key={`cell-${g1.id}-${g2.id}`} className="p-2 border border-[#586D78] border-2 bg-gray-800" />
          );
          return;
        }

        // Safe constraint and adjacency checks with validation
        const constraints = state.constraints || {};
        const adjacents = state.adjacents || {};
        
        // Ensure we have valid objects and safe access
        const constraintValue = (typeof constraints === 'object' && constraints !== null && !Array.isArray(constraints)) 
          ? (constraints[g1.id]?.[g2.id] || '') 
          : '';
          
        const isAdjacent = (typeof adjacents === 'object' && adjacents !== null && !Array.isArray(adjacents))
          ? ((adjacents[g1.id] || []).includes(g2.id) || (adjacents[g2.id] || []).includes(g1.id))
          : false;

        // Precedence: cannot > adjacency > must > empty
        let cellContent: React.ReactNode = null;
        let bgColor = '';

        if (constraintValue === 'cannot') {
          bgColor = 'bg-[#e6130b]';
          cellContent = <span className="text-black font-bold">X</span>;
        } else if (isAdjacent) {
          bgColor = 'bg-[#22cf04]';
          cellContent = (
            <div className="flex items-center justify-center space-x-1">
              <span className="text-[#b3b508] font-bold" style={{ fontSize: '0.7em' }}>
                ⭐
              </span>
              <span className="text-black font-bold">&</span>
              <span className="text-[#b3b508] font-bold" style={{ fontSize: '0.7em' }}>
                ⭐
              </span>
            </div>
          );
        } else if (constraintValue === 'must') {
          bgColor = 'bg-[#22cf04]';
          cellContent = <span className="text-black font-bold">&</span>;
        }

        const isCellHighlighted =
          !!highlightedPair &&
          ((highlightedPair.guest1 === g1.id && highlightedPair.guest2 === g2.id) ||
            (highlightedPair.guest1 === g2.id && highlightedPair.guest2 === g1.id));
        if (isCellHighlighted) bgColor = 'bg-[#88abc6]';

        row.push(
          <td
            key={`cell-${g1.id}-${g2.id}`}
            className={`p-2 border border-[#586D78] border-2 cursor-pointer transition-colors duration-200 text-center ${bgColor}`}
            onClick={() => handleToggleConstraint(g1.id, g2.id)}
            data-guest1={g1.id}
            data-guest2={g2.id}
          >
            {cellContent}
          </td>
        );
      });

      grid.push(<tr key={`row-${g1.id}`}>{row}</tr>);
    });

    // Page number controls (preserved)
    const renderPageNumbers = () => {
      if (totalPagesCalc <= 9) {
        return Array.from({ length: totalPagesCalc }, (_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i)}
            className={currentPage === i ? 'danstyle1c-btn selected mx-1 w-8' : 'danstyle1c-btn mx-1 w-8'}
          >
            {i + 1}
          </button>
        ));
      }

      const pageButtons: React.ReactNode[] = [];
      for (let i = 0; i < 3; i++) {
        if (i < totalPagesCalc) {
          pageButtons.push(
            <button
              key={i}
              onClick={() => setCurrentPage(i)}
              className={currentPage === i ? 'danstyle1c-btn selected mx-1 w-8' : 'danstyle1c-btn mx-1 w-8'}
            >
              {i + 1}
            </button>
          );
        }
      }
      if (currentPage > 2) {
        pageButtons.push(<span key="ellipsis1" className="mx-1">...</span>);
        if (currentPage < totalPagesCalc - 3) {
          pageButtons.push(
            <button
              key={currentPage}
              onClick={() => setCurrentPage(currentPage)}
              className="danstyle1c-btn selected mx-1 w-8"
            >
              {currentPage + 1}
            </button>
          );
        }
      }
      if (currentPage < totalPagesCalc - 3) {
        pageButtons.push(<span key="ellipsis2" className="mx-1">...</span>);
      }
      for (let i = Math.max(3, totalPagesCalc - 3); i < totalPagesCalc; i++) {
        pageButtons.push(
          <button
            key={i}
            onClick={() => setCurrentPage(i)}
            className={currentPage === i ? 'danstyle1c-btn selected mx-1 w-8' : 'danstyle1c-btn mx-1 w-8'}
          >
            {i + 1}
          </button>
        );
      }
      return pageButtons;
    };

    // Performance notice + pagination controls (preserved)
    const paginationControls =
      needsPagination && (
        <div className="flex flex-col md:flex-row items-center justify-between py-4 border-t mt-4">
          <div className="flex items-center w-full justify-between">
            <div className="pl-[280px]">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                disabled={currentPage === 0}
                className="danstyle1c-btn w-24 mx-1"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </button>
            </div>
            <div className="flex flex-wrap justify-center">{renderPageNumbers()}</div>
            <div className="pr-[10px]">
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPagesCalc - 1, prev + 1))}
                disabled={currentPage >= totalPagesCalc - 1}
                className="danstyle1c-btn w-24 mx-1"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          </div>
        </div>
      );

    const showPerformanceWarning = !isPremium && state.guests.length > 100 && state.guests.length <= GUEST_THRESHOLD;

    return (
      <div className="flex flex-col space-y-4">
        {showPerformanceWarning && (
          <div className="bg-[#88abc6] border border-[#586D78] rounded-md p-4 flex items-start">
            <AlertCircle className="text-white mr-2 flex-shrink-0 mt-1" />
            <div className="text-sm text-white">
              <p className="font-medium">Performance Notice</p>
              <p>
                You have {state.guests.length} guests, which may cause the constraint grid to be slow to render and
                interact with.
              </p>
              <p className="mt-1">For better performance, consider working with smaller groups of guests.</p>
            </div>
          </div>
        )}



        <div className="overflow-auto max-h-[60vh] border border-[#586D78] rounded-md relative">
          <table className="w-full border-collapse bg-white">
            <tbody>{grid}</tbody>
          </table>
        </div>

        {needsPagination && paginationControls}
      </div>
    );
  }, [
    state.guests,
    state.constraints,
    state.adjacents,
    state.seatingPlans,
    state.assignments,
    state.tables,
    state.currentPlanIndex,
    isPremium,
    selectedGuestId,
    highlightedPair,
    currentPage,
    isWarningExpanded,
    initialWarningShown,
    sortOption,
    nameById,
  ]);

  return (
    <div className="space-y-14">
      <h2 className="text-2xl font-semibold text-[#586D78] mb-0">Rules Management</h2>



      <Card>
        <div className="space-y-14">
          {/* Header with Hide/Show Conflicts button */}
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {showConflicts && conflicts.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4" style={{ width: '60%' }}>
                  <h3 className="flex items-center text-red-800 font-medium mb-2">
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    Detected Conflicts ({conflicts.length})
                  </h3>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {conflicts.map((conflict) => (
                      <div key={conflict.id} className="text-sm">
                        <p className="text-red-700">{conflict.description}</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {conflict.affectedGuests.map((idA, idx) => {
                            if (idx < conflict.affectedGuests.length - 1) {
                              const idB = conflict.affectedGuests[idx + 1];
                              const aName = nameById.get(idA) || idA;
                              const bName = nameById.get(idB) || idB;
                              return (
                                <button
                                  key={`${idA}-${idB}`}
                                  onClick={() => resolveConflict(idA, idB)}
                                  className="text-xs text-indigo-600 hover:underline"
                                >
                                  Resolve ({aName} & {bName})
                                </button>
                              );
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Hide/Show Conflicts button in upper right - only show when conflicts exist */}
            {conflicts.length > 0 && (
              <button
                onClick={() => setShowConflicts((prev) => !prev)}
                className="danstyle1c-btn"
                title={showConflicts ? 'Hide conflicts' : 'Show conflicts'}
              >
                {showConflicts ? 'Hide Conflicts' : 'Show Conflicts'}
              </button>
            )}
          </div>



          <div className="flex flex-col justify-center h-24">
            <h3 className="text-lg font-semibold text-[#586D78] mb-0">How to use constraints:</h3>
            
            <ul className="list-disc pl-5 space-y-2 text-gray-600 text-[17px]">
              <li>
                Click a cell to cycle between constraints:
                <div className="mt-1 flex space-x-4">
                  <span className="flex items-center">
                    <span className="inline-block w-3 h-3 bg-[#22cf04] border border-[#586D78] mr-1"></span>
                    Must sit at the same table
                  </span>
                  <span className="flex items-center">
                    <span className="inline-block w-3 h-3 bg-[#e6130b] border border-[#586D78] mr-1"></span>
                    Cannot sit at the same table
                  </span>
                  <span className="flex items-center">
                    <span className="inline-block w-3 h-3 bg-white border border-[#586D78] mr-1"></span>
                    No constraint
                  </span>
                </div>
              </li>
              
              <div>
                {/* Adjacent-Pairing Accordion repositioned here */}
                <details className="mt-2">
                  <summary className="cursor-pointer text-[17px] font-medium text-gray-600">To set "Adjacent Seating" (guests sit right next to each other):</summary>
                  <div className="mt-2 text-sm text-[#586D78] space-y-1">
                    <p>Double-click a guest name to select it.</p>
                    <p>Click another guest and the adjacency will be set automatically.</p>
                    <p>Guests with adjacent constraints are marked with ⭐ (star emoji).</p>
                  </div>
                </details>
              </div>
            </ul>
          </div>
        </div>
      </Card>

      <Card title="Constraint Grid">
        <div className="flex flex-col lg:flex-row justify-between items-center mb-4 space-y-2 lg:space-y-0">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-gray-700 font-medium flex items-center">
                <ArrowDownAZ className="w-5 h-5 mr-2" />
                Sort by:
              </span>
              <div className="flex space-x-2">
                <button
                  className={sortOption === 'as-entered' ? 'danstyle1c-btn selected' : 'danstyle1c-btn'}
                  onClick={() => setSortOption('as-entered')}
                >
                  As Entered
                </button>
                <button
                  className={sortOption === 'first-name' ? 'danstyle1c-btn selected' : 'danstyle1c-btn'}
                  onClick={() => setSortOption('first-name')}
                >
                  First Name
                </button>
                <button
                  className={sortOption === 'last-name' ? 'danstyle1c-btn selected' : 'danstyle1c-btn'}
                  onClick={() => setSortOption('last-name')}
                >
                  Last Name
                </button>
                <button
                  className={`danstyle1c-btn ${sortOption === 'current-table' ? 'selected' : ''} ${
                    state.seatingPlans.length === 0 ? 'opacity-50' : ''
                  }`}
                  onClick={() => setSortOption('current-table')}
                  disabled={state.seatingPlans.length === 0}
                >
                  Current Table
                </button>
              </div>
            </div>
          </div>

          {/* Export button moved to top-right */}
          <div className="flex items-center">
            <button onClick={exportJSON} className="danstyle1c-btn" title="Export constraints as JSON">
              <Download className="w-4 h-4 mr-1" />
              Export
            </button>
          </div>

          {/* Navigation buttons above the grid - only shown for 120+ guests (preserved) */}
          {shouldShowPagination && state.guests.length > 0 && (
            <div className="flex space-x-2">
              <button
                className="danstyle1c-btn w-24 mx-1"
                onClick={() => handleNavigatePlan(-1)}
                disabled={currentPage === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </button>

              <button
                className="danstyle1c-btn w-24 mx-1"
                onClick={() => handleNavigatePlan(1)}
                disabled={currentPage >= totalPages - 1}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </button>
            </div>
          )}
        </div>

        <div ref={gridRef}>
          {state.guests.length === 0 ? (
            <p className="text-gray-500 text-center py-4">
              No guests added yet. Add guests to create constraints.
            </p>
          ) : (
            constraintGrid
          )}
        </div>
      </Card>

      <SavedSettingsAccordion isDefaultOpen={false} />
    </div>
  );
};

export default ConstraintManager;