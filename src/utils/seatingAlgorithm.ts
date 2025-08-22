import { Guest, Table, SeatingPlan, ValidationError } from '../types';

// Enhanced algorithm with multiple strategies and conflict detection
interface SeatingResult {
  plans: SeatingPlan[];
  errors: ValidationError[];
  conflicts: ConstraintConflict[];
}

interface ConstraintConflict {
  id: string;
  type: 'circular' | 'impossible' | 'capacity_violation' | 'adjacency_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedGuests: string[];
}

interface AtomicGroup {
  units: Guest[];
  totalCount: number;
  priority: number;
  constraintCount: number;
}

type DiversityStrategy = 'shuffle' | 'reverse' | 'size-first' | 'size-last' | 'random-pairs' | 'priority-first' | 'constraint-heavy-first';

// Fisher-Yates Shuffle with optional seed support
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Optimized Union-Find for grouping guests with must constraints
class OptimizedUnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(key: string): string {
    if (!this.parent.has(key)) {
      this.parent.set(key, key);
      this.rank.set(key, 0);
    }
    if (this.parent.get(key) !== key) {
      this.parent.set(key, this.find(this.parent.get(key)!));
    }
    return this.parent.get(key)!;
  }

  union(key1: string, key2: string): boolean {
    const root1 = this.find(key1);
    const root2 = this.find(key2);
    if (root1 === root2) return false;

    const rank1 = this.rank.get(root1) || 0;
    const rank2 = this.rank.get(root2) || 0;

    if (rank1 < rank2) {
      this.parent.set(root1, root2);
    } else if (rank1 > rank2) {
      this.parent.set(root2, root1);
    } else {
      this.parent.set(root2, root1);
      this.rank.set(root1, rank1 + 1);
    }
    return true;
  }

  getGroups(): string[][] {
    const groups = new Map<string, string[]>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(key);
    }
    return Array.from(groups.values());
  }
}

// Enhanced conflict detection
export function detectConstraintConflicts(
  guests: Guest[],
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>,
  tables: Table[],
  checkAdjacents: boolean = false,
  adjacents: Record<string, string[]> = {}
): ConstraintConflict[] {
  const conflicts: ConstraintConflict[] = [];
  if (guests.length === 0 || tables.length === 0) return [];

  const guestMap = new Map(guests.map(g => [g.name, g]));

  // Detect circular dependencies in must constraints
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const detectCycle = (guestName: string, path: string[]): void => {
    visited.add(guestName);
    recursionStack.add(guestName);

    const guestConstraints = constraints[guestName] || {};
    for (const [otherGuestName, constraint] of Object.entries(guestConstraints)) {
      if (constraint === 'must' && guestMap.has(otherGuestName)) {
        if (recursionStack.has(otherGuestName)) {
          const cycleStart = path.indexOf(otherGuestName);
          const cycle = [...path.slice(cycleStart), otherGuestName];
          conflicts.push({
            id: `circular-${Date.now()}-${Math.random()}`,
            type: 'circular',
            severity: 'high',
            description: `Circular dependency: ${cycle.join(' → ')}`,
            affectedGuests: cycle,
          });
        } else if (!visited.has(otherGuestName)) {
          detectCycle(otherGuestName, [...path, guestName]);
        }
      }
    }
    recursionStack.delete(guestName);
  };

  for (const guest of guestMap.keys()) {
    if (!visited.has(guest)) {
      detectCycle(guest, [guest]);
    }
  }

  // Detect contradictory constraints
  const checkedPairs = new Set<string>();
  for (const [guest1, guestConstraints] of Object.entries(constraints)) {
    for (const [guest2, constraint1] of Object.entries(guestConstraints)) {
      const pairKey = [guest1, guest2].sort().join('--');
      if (checkedPairs.has(pairKey)) continue;

      const reverseConstraint = constraints[guest2]?.[guest1];
      if ((constraint1 === 'must' && reverseConstraint === 'cannot') || 
          (constraint1 === 'cannot' && reverseConstraint === 'must')) {
        conflicts.push({
          id: `contradictory-${Date.now()}-${Math.random()}`,
          type: 'impossible',
          severity: 'critical',
          description: `Contradictory constraints between ${guest1} and ${guest2}`,
          affectedGuests: [guest1, guest2],
        });
      }
      checkedPairs.add(pairKey);
    }
  }

  // Detect capacity violations in must groups
  const uf = new OptimizedUnionFind();
  guests.forEach(g => uf.find(g.name));
  for (const [guest1, guestConstraints] of Object.entries(constraints)) {
    for (const [guest2, constraint] of Object.entries(guestConstraints)) {
      if (constraint === 'must') {
        uf.union(guest1, guest2);
      }
    }
  }
  
  const groups = uf.getGroups();
  const maxTableCapacity = Math.max(...tables.map(t => t.seats), 0);
  
  for (const group of groups) {
    const totalSize = group.reduce((sum, name) => sum + (guestMap.get(name)?.count || 0), 0);
    if (totalSize > maxTableCapacity) {
      conflicts.push({
        id: `capacity-${Date.now()}-${Math.random()}`,
        type: 'capacity_violation',
        severity: 'critical',
        description: `Group of ${totalSize} guests (${group.join(', ')}) exceeds largest table capacity of ${maxTableCapacity}`,
        affectedGuests: group,
      });
    }
  }

  return conflicts;
}

// Build atomic groups that must sit together
function buildAtomicGroups(
  guests: Guest[],
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>,
  adjacents: Record<string, string[]>
): AtomicGroup[] {
  const uf = new OptimizedUnionFind();
  const guestMap = new Map(guests.map(g => [g.name, g]));
  guests.forEach(g => uf.find(g.name));

  // Union guests that must sit together
  for (const [key1, guestConstraints] of Object.entries(constraints)) {
    for (const [key2, constraint] of Object.entries(guestConstraints)) {
      if (constraint === 'must') uf.union(key1, key2);
    }
  }

  // Union guests that must be adjacent
  for (const [key1, adjacentGuests] of Object.entries(adjacents)) {
    for (const key2 of adjacentGuests) {
      uf.union(key1, key2);
    }
  }

  return uf.getGroups().map(groupNames => {
    const units = groupNames.map(name => guestMap.get(name)).filter((g): g is Guest => !!g);
    const totalCount = units.reduce((sum, u) => sum + u.count, 0);
    const priority = units.some(u => /bride|groom/i.test(u.name)) ? 25 : 0;
    const constraintCount = units.reduce((count, unit) => {
      const guestConstraints = constraints[unit.name] || {};
      return count + Object.keys(guestConstraints).length;
    }, 0);
    
    return { units, totalCount, priority, constraintCount };
  }).sort((a, b) => (b.priority - a.priority) || (b.totalCount - a.totalCount));
}

// Apply diversity strategy to group ordering
function applyDiversityStrategy(
  groups: AtomicGroup[],
  strategy: DiversityStrategy
): AtomicGroup[] {
  switch (strategy) {
    case 'shuffle':
      return shuffleArray(groups);
    case 'reverse':
      return [...groups].reverse();
    case 'size-first':
      return [...groups].sort((a, b) => b.totalCount - a.totalCount);
    case 'size-last':
      return [...groups].sort((a, b) => a.totalCount - b.totalCount);
    case 'random-pairs':
      const paired = [];
      const shuffled = shuffleArray(groups);
      for (let i = 0; i < shuffled.length; i += 2) {
        paired.push(shuffled[i]);
        if (i + 1 < shuffled.length) paired.push(shuffled[i + 1]);
      }
      return paired;
    case 'priority-first':
      return [...groups].sort((a, b) => b.priority - a.priority || b.totalCount - a.totalCount);
    case 'constraint-heavy-first':
      return [...groups].sort((a, b) => b.constraintCount - a.constraintCount);
    default:
      return groups;
  }
}

// Check if a group can be placed on a table
function canPlaceGroupOnTable(
  group: Guest[],
  tableSeats: Guest[],
  tableCapacity: number,
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>
): boolean {
  const currentOccupancy = tableSeats.reduce((sum, g) => sum + g.count, 0);
  const groupSize = group.reduce((sum, g) => sum + g.count, 0);
  
  if (currentOccupancy + groupSize > tableCapacity) {
    return false;
  }

  for (const newGuest of group) {
    for (const existingGuest of tableSeats) {
      if (
        constraints[newGuest.name]?.[existingGuest.name] === 'cannot' ||
        constraints[existingGuest.name]?.[newGuest.name] === 'cannot'
      ) {
        return false;
      }
    }
  }
  return true;
}

// Score a seating plan based on constraints and preferences
function scorePlan(
  plan: SeatingPlan,
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>,
  adjacents: Record<string, string[]>
): number {
  let score = 0;
  const totalGuests = plan.tables.flatMap(t => t.seats).length;

  // Seat utilization score
  if (totalGuests > 0) {
    score += totalGuests * 10;
  }

  // Must constraints satisfaction
  plan.tables.forEach(table => {
    for (let i = 0; i < table.seats.length; i++) {
      for (let j = i + 1; j < table.seats.length; j++) {
        const g1 = table.seats[i].name;
        const g2 = table.seats[j].name;
        if (constraints[g1]?.[g2] === 'must' || constraints[g2]?.[g1] === 'must') {
          score += 100;
        }
      }
    }
  });

  // Cannot constraints violations
  let violatedCannot = 0;
  plan.tables.forEach(table => {
    for (let i = 0; i < table.seats.length; i++) {
      for (let j = i + 1; j < table.seats.length; j++) {
        const g1 = table.seats[i].name;
        const g2 = table.seats[j].name;
        if (constraints[g1]?.[g2] === 'cannot' || constraints[g2]?.[g1] === 'cannot') {
          violatedCannot++;
        }
      }
    }
  });
  score -= violatedCannot * 200;

  // Adjacency preferences
  plan.tables.forEach(table => {
    const seatedNames = table.seats.map(g => g.name);
    for (const guest of table.seats) {
      const desiredAdjacents = adjacents[guest.name] || [];
      const satisfied = desiredAdjacents.filter(adj => seatedNames.includes(adj)).length;
      score += satisfied * 50;
    }
  });

  return Math.max(0, score);
}

// Check if a plan is sufficiently unique
function isPlanSufficientlyUnique(
  newPlan: SeatingPlan,
  existingPlans: SeatingPlan[],
  threshold: number = 0.7
): boolean {
  for (const plan of existingPlans) {
    let matchingGuests = 0;
    const totalGuests = newPlan.tables.flatMap(t => t.seats).length;
    
    for (const newTable of newPlan.tables) {
      const matchingTable = plan.tables.find(t => t.id === newTable.id);
      if (matchingTable) {
        const newGuests = new Set(newTable.seats.map(g => g.name));
        const existingGuests = new Set(matchingTable.seats.map(g => g.name));
        const intersection = [...newGuests].filter(g => existingGuests.has(g)).length;
        matchingGuests += intersection;
      }
    }
    
    if (totalGuests > 0 && matchingGuests / totalGuests > threshold) {
      return false;
    }
  }
  return true;
}

// Generate a single seating plan using a specific strategy
function generateSinglePlan(
  atomicGroups: AtomicGroup[],
  tables: Table[],
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>,
  adjacents: Record<string, string[]>,
  assignments: Record<string, string>,
  strategy: DiversityStrategy = 'shuffle'
): SeatingPlan | null {
  const diversifiedGroups = applyDiversityStrategy(atomicGroups, strategy);
  
  // Create empty tables
  const plan: {
    id: number;
    seats: Guest[];
    capacity: number;
  }[] = tables.map(table => ({
    id: table.id,
    seats: [],
    capacity: table.seats
  }));

  // Track assigned guests
  const assignedGuests = new Set<string>();

  // Place atomic groups
  for (const group of diversifiedGroups) {
    let placed = false;
    
    // Try to place in assigned tables first
    const assignedTableIds = group.units.some(u => assignments[u.name]) 
      ? group.units.flatMap(u => assignments[u.name]?.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) || [])
      : [];
    
    if (assignedTableIds.length > 0) {
      for (const tableId of assignedTableIds) {
        const table = plan.find(t => t.id === tableId);
        if (table && canPlaceGroupOnTable(group.units, table.seats, table.capacity, constraints)) {
          table.seats.push(...group.units);
          group.units.forEach(u => assignedGuests.add(u.name));
          placed = true;
          break;
        }
      }
    }
    
    // If not placed in assigned tables, try any available table
    if (!placed) {
      const shuffledTables = shuffleArray(plan);
      for (const table of shuffledTables) {
        if (canPlaceGroupOnTable(group.units, table.seats, table.capacity, constraints)) {
          table.seats.push(...group.units);
          group.units.forEach(u => assignedGuests.add(u.name));
          placed = true;
          break;
        }
      }
    }
    
    if (!placed) {
      return null; // Cannot place this group
    }
  }

  // Optimize seating order within tables for adjacency
  for (const table of plan) {
    if (table.seats.length > 1) {
      table.seats = optimizeSeatingOrder(table.seats, adjacents);
    }
  }

  const seatingPlan: SeatingPlan = {
    id: Math.floor(Math.random() * 10000),
    tables: plan.map(t => ({
      id: t.id,
      seats: t.seats,
      capacity: t.capacity
    }))
  };
  
  return seatingPlan;
}

// Optimize seating order within a table for adjacency
function optimizeSeatingOrder(
  tableGuests: Guest[],
  adjacents: Record<string, string[]>
): Guest[] {
  if (tableGuests.length <= 1) return tableGuests;
  
  const orderedSeats: Guest[] = [];
  const availableGuests = new Set(tableGuests.map(g => g.name));
  const guestMap = new Map(tableGuests.map(g => [g.name, g]));

  // Start with a priority guest (bride/groom) or first guest
  let currentGuest = tableGuests.find(g => /bride|groom/i.test(g.name)) || tableGuests[0];
  
  orderedSeats.push(currentGuest);
  availableGuests.delete(currentGuest.name);

  // Build the seating order by following adjacency preferences
  while (availableGuests.size > 0) {
    const desiredAdjacents = adjacents[currentGuest.name] || [];
    const nextGuestName = desiredAdjacents.find(adj => availableGuests.has(adj));
    
    if (nextGuestName && guestMap.has(nextGuestName)) {
      currentGuest = guestMap.get(nextGuestName)!;
    } else {
      // Pick any remaining guest
      const next = availableGuests.values().next().value;
      if (!next) break;
      currentGuest = guestMap.get(next)!;
    }
    
    orderedSeats.push(currentGuest);
    availableGuests.delete(currentGuest.name);
  }

  return orderedSeats;
}

// Enhanced validation with more comprehensive checks
export function validateConstraints(
  guests: Guest[],
  tables: Table[],
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>,
  assignments: Record<string, string>,
  adjacents: Record<string, string[]>
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Basic capacity check
  const totalGuests = guests.reduce((sum, g) => sum + g.count, 0);
  const totalSeats = tables.reduce((sum, t) => sum + t.seats, 0);
  if (totalGuests > totalSeats) {
    errors.push({
      message: `Not enough seats (${totalSeats}) for all guests (${totalGuests}).`,
      type: 'error',
    });
  }

  // Validate table assignments
  Object.keys(assignments).forEach((guestName) => {
    const tableIds = assignments[guestName]
      .split(',')
      .map((t) => parseInt(t.trim()))
      .filter((t) => !isNaN(t));
    tableIds.forEach((tableId) => {
      if (!tables.some((table) => table.id === tableId)) {
        errors.push({
          message: `Invalid table assignment for ${guestName}: Table ${tableId} does not exist.`,
          type: 'error',
        });
      }
    });
  });

  // Check for conflicting constraints in assignments
  Object.keys(constraints).forEach((guest1) => {
    Object.keys(constraints[guest1] || {}).forEach((guest2) => {
      if (
        constraints[guest1][guest2] === 'must' &&
        assignments[guest1] &&
        assignments[guest2]
      ) {
        const tables1 = assignments[guest1].split(',').map(Number);
        const tables2 = assignments[guest2].split(',').map(Number);
        if (!tables1.some((t) => tables2.includes(t))) {
          errors.push({
            message: `Constraint conflict: ${guest1} and ${guest2} must be at the same table but are assigned to non-overlapping tables.`,
            type: 'error',
          });
        }
      }
    });
  });

  return errors;
}

// Enhanced seating plan generation with multiple strategies
export async function generateSeatingPlans(
  guests: Guest[],
  tables: Table[],
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>,
  adjacents: Record<string, string[]>,
  assignments: Record<string, string>,
  isPremium: boolean = false
): Promise<{ plans: SeatingPlan[], errors: ValidationError[] }> {
  // Validate input first
  const errors = validateConstraints(guests, tables, constraints, assignments, adjacents);
  
  if (errors.some(error => error.type === 'error')) {
    return { plans: [], errors };
  }
  
  // Detect conflicts
  const conflicts = detectConstraintConflicts(guests, constraints, tables, true, adjacents);
  const criticalConflicts = conflicts.filter(c => c.severity === 'critical');
  
  if (criticalConflicts.length > 0) {
    errors.push({
      message: 'Critical constraint conflicts detected. Please resolve conflicts before generating plans.',
      type: 'error'
    });
    return { plans: [], errors };
  }
  
  // Build atomic groups
  const atomicGroups = buildAtomicGroups(guests, constraints, adjacents);
  
  const plans: SeatingPlan[] = [];
  const maxPlans = isPremium ? 30 : 10;
  const strategies: DiversityStrategy[] = ['shuffle', 'reverse', 'size-first', 'size-last', 'random-pairs', 'priority-first', 'constraint-heavy-first'];
  
  let attempts = 0;
  const maxAttempts = isPremium ? 500 : 200;
  
  // Generate plans using different strategies
  while (plans.length < maxPlans && attempts < maxAttempts) {
    attempts++;
    
    // Yield control every 50 attempts
    if (attempts % 50 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    const strategy = strategies[attempts % strategies.length];
    const plan = generateSinglePlan(atomicGroups, tables, constraints, adjacents, assignments, strategy);
    
    if (plan && isPlanSufficientlyUnique(plan, plans, 0.8 - (plans.length * 0.05))) {
      // Add score to plan
      (plan as any).score = scorePlan(plan, constraints, adjacents);
      plans.push(plan);
    }
  }
  
  // Sort plans by score
  plans.sort((a, b) => ((b as any).score || 0) - ((a as any).score || 0));
  
  if (plans.length === 0) {
    return { 
      plans: [], 
      errors: [
        ...errors,
        {
          message: 'No valid seating plans could be generated. Try relaxing constraints or reducing adjacency links.',
          type: 'error'
        }
      ]
    };
  }
  
  return { plans, errors };
}