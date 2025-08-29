import { Guest, Table, SeatingPlan, ValidationError } from '../types';

type Id = string;
type SolverGuest = { id: Id; name: string; count: number };
type SolverTable = { id: Id; capacity: number };
type ConstraintKind = 'MUST' | 'CANT';
type ConstraintsMap = Record<Id, Record<Id, ConstraintKind>>;
type SolverSeatingPlan = {
  assignments: Record<Id, Id[]>;
  solved: boolean;
};

class DSU {
  private parent: Map<Id, Id> = new Map();
  find(x: Id): Id {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p !== x) this.parent.set(x, this.find(p));
    return this.parent.get(x)!;
  }
  union(a: Id, b: Id) {
    let ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

function buildMustGroups(guests: SolverGuest[], cm: ConstraintsMap) {
  const dsu = new DSU();
  guests.forEach(g => dsu.find(g.id));
  for (const g1 of guests) {
    for (const g2 of guests) {
      if (g1.id < g2.id && cm[g1.id]?.[g2.id] === 'MUST') {
        dsu.union(g1.id, g2.id);
      }
    }
  }
  const groups = new Map<Id, { members: SolverGuest[]; count: number }>();
  for (const g of guests) {
    const root = dsu.find(g.id);
    if (!groups.has(root)) groups.set(root, { members: [], count: 0 });
    const group = groups.get(root)!;
    group.members.push(g);
    group.count += g.count;
  }
  return Array.from(groups.values());
}

function canPlace(groupIds: Id[], tableGuestIds: Id[], cm: ConstraintsMap): boolean {
  for (const a of groupIds) {
    for (const b of tableGuestIds) {
      if (cm[a]?.[b] === 'CANT') return false;
    }
  }
  return true;
}

function calculateAssignments(
  guests: SolverGuest[],
  tables: SolverTable[],
  constraints: ConstraintsMap
): SolverSeatingPlan {
  const groups = buildMustGroups(guests, constraints);
  groups.sort((a, b) => b.count - a.count);

  const remainingCapacity = new Map<Id, number>();
  tables.forEach(t => remainingCapacity.set(t.id, t.capacity));
  
  const assignment: Record<Id, Id[]> = {};
  tables.forEach(t => assignment[t.id] = []);

  let attempts = 0;
  const maxAttempts = 7500;

  function tryPlace(groupIndex: number): boolean {
    if (groupIndex >= groups.length) return true;
    if (attempts++ > maxAttempts) return false;

    const group = groups[groupIndex];
    const groupIds = group.members.map(m => m.id);
    const shuffledTables = [...tables].sort(() => Math.random() - 0.5);

    for (const table of shuffledTables) {
      if ((remainingCapacity.get(table.id) ?? 0) >= group.count) {
        if (canPlace(groupIds, assignment[table.id], constraints)) {
          assignment[table.id].push(...groupIds);
          remainingCapacity.set(table.id, remainingCapacity.get(table.id)! - group.count);

          if (tryPlace(groupIndex + 1)) return true;

          remainingCapacity.set(table.id, remainingCapacity.get(table.id)! + group.count);
          assignment[table.id].splice(assignment[table.id].length - groupIds.length, groupIds.length);
        }
      }
    }
    return false;
  }

  const solved = tryPlace(0);
  return { assignments: assignment, solved };
}

export async function generateSeatingPlans(
  appGuests: Guest[],
  appTables: Table[],
  appConstraints: Record<string, Record<string, 'must' | 'cannot' | ''>>,
  _appAdjacents: Record<string, string[]>,
  _appAssignments: Record<string, string>,
  isPremium: boolean = false
): Promise<{ plans: SeatingPlan[], errors: ValidationError[] }> {

  const solverGuests: SolverGuest[] = appGuests.map(g => ({ id: g.name, name: g.name, count: g.count }));
  const solverTables: SolverTable[] = appTables.map(t => ({ id: String(t.id), capacity: t.seats }));
  const solverConstraints: ConstraintsMap = {};

  for (const [g1Name, constraints] of Object.entries(appConstraints)) {
    if (!solverConstraints[g1Name]) solverConstraints[g1Name] = {};
    for (const [g2Name, value] of Object.entries(constraints)) {
      if (value === 'must') solverConstraints[g1Name][g2Name] = 'MUST';
      if (value === 'cannot') solverConstraints[g1Name][g2Name] = 'CANT';
    }
  }

  const plans: SeatingPlan[] = [];
  const planHashes = new Set<string>();
  const targetPlans = isPremium ? 30 : 10;
  const maxSolverRuns = targetPlans * 3; 

  for (let i = 0; i < maxSolverRuns && plans.length < targetPlans; i++) {
    const shuffledGuests = [...solverGuests].sort(() => Math.random() - 0.5);
    const solverResult = calculateAssignments(shuffledGuests, solverTables, solverConstraints);
    
    if (solverResult.solved) {
      const guestMap = new Map(appGuests.map(g => [g.name, g]));
      const finalTables = appTables.map(appTable => {
        const tableIdStr = String(appTable.id);
        const assignedGuestNames = solverResult.assignments[tableIdStr] ?? [];
        const seats: { name: string; count: number; partyIndex: number }[] = [];

        assignedGuestNames.forEach(guestName => {
          const guest = guestMap.get(guestName);
          if (guest) {
            for (let k = 0; k < guest.count; k++) {
              seats.push({ name: guest.name, count: 1, partyIndex: k });
            }
          }
        });

        return { id: appTable.id, capacity: appTable.seats, seats };
      });

      const planHash = finalTables.map(t => `${t.id}:${t.seats.map(s=>s.name).sort().join(',')}`).sort().join(';');
      if (!planHashes.has(planHash)) {
        plans.push({ id: Date.now() + i, tables: finalTables });
        planHashes.add(planHash);
      }
    }
  }
  
  if (plans.length === 0) {
    return { plans: [], errors: [{ type: 'error', message: "Could not find a valid seating arrangement. Please try relaxing some constraints." }] };
  }

  return { plans, errors: [] };
}

// Add the missing detectConstraintConflicts function
export function detectConstraintConflicts(
  guests: Guest[],
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>,
  tables: Table[],
  checkAdjacents: boolean = false,
  adjacents: Record<string, string[]> = {}
): any[] {
  const conflicts: any[] = [];
  if (guests.length === 0 || tables.length === 0) return [];

  const guestMap = new Map(guests.map(g => [g.name, g]));

  // Circular dependencies
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const detectCycle = (guestKey: string, path: string[]): void => {
    visited.add(guestKey);
    recursionStack.add(guestKey);

    const guestConstraints = constraints[guestKey] || {};
    for (const [otherGuestKey, constraint] of Object.entries(guestConstraints)) {
      if (constraint === 'must' && guestMap.has(otherGuestKey)) {
        if (recursionStack.has(otherGuestKey)) {
          const cycleStart = path.indexOf(otherGuestKey);
          const cycle = [...path.slice(cycleStart), otherGuestKey];
          if (!conflicts.some(c => c.type === 'circular' && c.affectedGuests.join() === cycle.join())) {
            conflicts.push({
              id: Date.now().toString(),
              type: 'circular',
              severity: 'high',
              description: `Circular dependency: ${cycle.map(key => guestMap.get(key)?.name || key).join(' → ')}`,
              affectedGuests: cycle,
            });
          }
        } else if (!visited.has(otherGuestKey)) {
          detectCycle(otherGuestKey, [...path, guestKey]);
        }
      }
    }
    recursionStack.delete(guestKey);
  };

  for (const guest of guestMap.keys()) {
    if (!visited.has(guest)) {
      detectCycle(guest, [guest]);
    }
  }

  // Contradictory constraints
  const checkedPairs = new Set<string>();
  for (const [guest1, guestConstraints] of Object.entries(constraints)) {
    for (const [guest2, constraint1] of Object.entries(guestConstraints)) {
      const pairKey = [guest1, guest2].sort().join('--');
      if (checkedPairs.has(pairKey)) continue;

      const reverseConstraint = constraints[guest2]?.[guest1];
      if ((constraint1 === 'must' && reverseConstraint === 'cannot') || 
          (constraint1 === 'cannot' && reverseConstraint === 'must')) {
        conflicts.push({
          id: Date.now().toString(),
          type: 'impossible',
          severity: 'critical',
          description: `Contradictory constraints between ${guestMap.get(guest1)?.name} and ${guestMap.get(guest2)?.name}.`,
          affectedGuests: [guest1, guest2],
        });
      }
      checkedPairs.add(pairKey);
    }
  }

  // Capacity violations
  const dsu = new DSU();
  guests.forEach(g => dsu.find(g.name));
  for (const [guest1, guestConstraints] of Object.entries(constraints)) {
    for (const [guest2, constraint] of Object.entries(guestConstraints)) {
      if (constraint === 'must') {
        dsu.union(guest1, guest2);
      }
    }
  }
  
  // Get groups from DSU
  const groups = new Map<string, string[]>();
  for (const guest of guests) {
    const root = dsu.find(guest.name);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(guest.name);
  }
  
  const maxTableCapacity = Math.max(...tables.map(t => t.seats), 0);
  for (const group of groups.values()) {
    const totalSize = group.reduce((sum, key) => sum + (guestMap.get(key)?.count || 0), 0);
    if (totalSize > maxTableCapacity) {
      conflicts.push({
        id: Date.now().toString(),
        type: 'capacity_violation',
        severity: 'critical',
        description: `Group of ${totalSize} (${group.map(key => guestMap.get(key)?.name).join(', ')}) exceeds largest table capacity of ${maxTableCapacity}.`,
        affectedGuests: group,
      });
    }
  }

  // Adjacency conflicts
  if (checkAdjacents && Object.keys(adjacents).length > 0) {
    const adjacencyConflicts = new Set<string>();
    for (const [guest1, adjacentList] of Object.entries(adjacents)) {
      const guest1Count = guestMap.get(guest1)?.count || 0;
      const totalAdjacentSeats = adjacentList.reduce((sum, adj) => sum + (guestMap.get(adj)?.count || 0), 0);
      if (totalAdjacentSeats + guest1Count > maxTableCapacity) {
        const conflictKey = [guest1, ...adjacentList].sort().join('--');
        if (!adjacencyConflicts.has(conflictKey)) {
          conflicts.push({
            id: Date.now().toString(),
            type: 'adjacency_violation',
            severity: 'high',
            description: `Adjacency preferences for ${guestMap.get(guest1)?.name} (${totalAdjacentSeats + guest1Count} seats) exceed largest table capacity of ${maxTableCapacity}.`,
            affectedGuests: [guest1, ...adjacentList],
          });
          adjacencyConflicts.add(conflictKey);
        }
      }
    }
  }

  return conflicts;
}




