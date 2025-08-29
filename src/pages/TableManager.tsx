import React, { useState, useEffect, useMemo } from 'react';
import { Table as TableIcon, Plus, Trash2, MapPin, ChevronDown, ChevronUp, X } from 'lucide-react';
import Card from '../components/Card';
import { useApp } from '../context/AppContext';
import { isPremiumSubscription } from '../utils/premium';
import SavedSettingsAccordion from '../components/SavedSettingsAccordion';

const useDebounce = (value: string, delay: number): string => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

const ConstraintChipsInput: React.FC<{
  tone: 'must' | 'cannot';
  ownerName: string;
  value: string[];
  onChange: (names: string[]) => void;
  allGuests: { name: string; count: number }[];
  activeFieldKey: string | null;
  setActiveFieldKey: (key: string | null) => void;
}> = ({ tone, ownerName, value, onChange, allGuests, activeFieldKey, setActiveFieldKey }) => {
  const inputKey = `${tone}:${ownerName}`;
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebounce(query, 300);

  const suggestions = useMemo(() => {
    const raw = debouncedQuery.trim().toLowerCase();
    if (!raw) return [];
    const ignore = /(?:\b(?:and|plus|with|guest|guests?)\b|[&+]|[0-9]+)/gi;
    const norm = (s: string) => s.toLowerCase().replace(ignore, '').replace(/\s+/g, ' ').trim();
    return allGuests.map(g => g.name).filter(n => norm(n).includes(raw) && !value.includes(n) && n !== ownerName).slice(0, 8);
  }, [debouncedQuery, value, ownerName, allGuests]);

  const addChip = (name: string) => {
    const trimmedName = name.trim();
    if (trimmedName && !value.includes(trimmedName)) onChange([...value, trimmedName]);
    setQuery('');
    setActiveIndex(-1);
  };

  const removeChip = (name: string) => {
    onChange(value.filter(v => v !== name));
  };

  const chipClass = tone === 'must' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
  const placeholderText = `Type to add "${tone} sit with"...`;

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1 mb-1 min-h-[24px]">
        {value.map(v => (
          <span key={v} className={`inline-flex items-center rounded-full px-2 py-0.5 text-sm ${chipClass} border`}>
            {v}
            <button type="button" className="ml-1.5 text-xs hover:text-red-700" onClick={() => removeChip(v)} aria-label={`Remove ${v}`}>✕</button>
          </span>
        ))}
      </div>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setActiveIndex(-1); }}
        onFocus={() => setActiveFieldKey(inputKey)}
        onBlur={() => setTimeout(() => setActiveFieldKey(null), 150)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (suggestions[activeIndex]) { addChip(suggestions[activeIndex]); } else if (query.trim()) { addChip(query.trim()); } }
        }}
        role="combobox"
        aria-expanded={activeFieldKey === inputKey && suggestions.length > 0}
        className="w-full border rounded px-2 py-1 text-sm"
        placeholder={placeholderText}
      />
      {activeFieldKey === inputKey && suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-10 mt-1 w-full bg-white border rounded shadow max-h-48 overflow-auto">
          {suggestions.map((s, i) => (
            <li key={s} role="option" aria-selected={i === activeIndex} onMouseDown={() => addChip(s)} className={`px-2 py-1 text-sm cursor-pointer ${i === activeIndex ? 'bg-gray-100' : ''}`}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

const TableManager: React.FC = () => {
  const { state, dispatch } = useApp();
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [isTablesOpen, setIsTablesOpen] = useState(false);
  const [isAssignmentsOpen, setIsAssignmentsOpen] = useState(true);
  const [sortOption, setSortOption] = useState<'as-entered' | 'first-name' | 'last-name' | 'current-table'>('as-entered');
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(null);
  const isPremium = isPremiumSubscription(state.subscription);

  const purgePlans = () => {
    dispatch({ type: 'SET_SEATING_PLANS', payload: [] });
    dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: 0 });
    localStorage.setItem('seatyr_current_setting_name', 'Unsaved');
    dispatch({ type: 'SET_LOADED_SAVED_SETTING', payload: false });
  };
  
  const totalSeatsNeeded = useMemo(() => state.guests.reduce((s, g) => s + Math.max(1, g.count), 0), [state.guests]);
  useEffect(() => {
    dispatch({ type: 'AUTO_RECONCILE_TABLES' });
    purgePlans();
  }, [totalSeatsNeeded, state.assignments, dispatch]);

  const handleAddTable = () => {
    if (state.tables.length >= 100) return;
    dispatch({ type: 'ADD_TABLE', payload: {} });
    purgePlans();
  };

  const handleRemoveTable = (id: number) => {
    if (window.confirm('Are you sure?')) {
      dispatch({ type: 'REMOVE_TABLE', payload: id });
      purgePlans();
    }
  };

  const handleUpdateSeats = (id: number, value: string) => {
    const seats = parseInt(value, 10);
    if (Number.isFinite(seats) && seats >= 1 && seats <= 20) {
      dispatch({ type: 'UPDATE_TABLE_SEATS', payload: { id, seats } });
      purgePlans();
    }
  };

  const saveTableName = () => {
    if (editingTableId === null) return;
    const trimmedName = editingName.trim();
    if (!trimmedName) { setEditingTableId(null); return; }
    const nameExists = state.tables.some(t => t.id !== editingTableId && t.name?.toLowerCase() === trimmedName.toLowerCase());
    if (nameExists) { setNameError('That name is already in use.'); return; }
    dispatch({ type: 'UPDATE_TABLE_NAME', payload: { id: editingTableId, name: trimmedName === `Table ${editingTableId}` ? '' : trimmedName } });
    setEditingTableId(null);
    purgePlans();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') saveTableName();
    if (e.key === 'Escape') setEditingTableId(null);
  };
  
  const handleUpdateAssignment = (name: string, value: string) => {
    dispatch({ type: 'UPDATE_ASSIGNMENT', payload: { name, tables: value } });
    purgePlans();
  };

  const updateConstraints = (guestName: string, newNames: string[], type: 'must' | 'cannot') => {
    const oldConstraints = Object.entries(state.constraints[guestName] ?? {}).filter(([, v]) => v === type).map(([k]) => k);
    const added = newNames.filter(n => !oldConstraints.includes(n));
    const removed = oldConstraints.filter(n => !newNames.includes(n));
    added.forEach(name => dispatch({ type: 'SET_CONSTRAINT', payload: { guest1: guestName, guest2: name, value: type } }));
    removed.forEach(name => dispatch({ type: 'SET_CONSTRAINT', payload: { guest1: guestName, guest2: name, value: '' } }));
    if (added.length || removed.length) purgePlans();
  };

  const getTableList = () => state.tables.map(t => (t.name ? `${t.id} (${t.name})` : t.id)).join(', ');

  const currentTableKey = (name: string, plan: { tables: { id: number; seats: any[] }[] } | null) => {
    if (plan?.tables) {
      if (plan.tables.some(t => t.seats.some(s => s.name === name))) {
        return plan.tables.find(t => t.seats.some(s => s.name === name))!.id;
      }
    }
    const raw = state.assignments[name];
    if (raw) {
      const ids = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
      if (ids.length) return ids[0];
    }
    return Number.POSITIVE_INFINITY;
  };

  const getSortedGuests = () => {
    const guests = [...state.guests];
    const plan = state.seatingPlans[state.currentPlanIndex] ?? null;
    switch (sortOption) {
      case 'first-name': return guests.sort((a, b) => a.name.localeCompare(b.name));
      case 'last-name': return guests.sort((a, b) => (a.name.split(' ').pop() ?? a.name).localeCompare(b.name.split(' ').pop() ?? b.name));
      case 'current-table': return guests.sort((a, b) => currentTableKey(a.name, plan) - currentTableKey(b.name, plan));
      default: return guests;
    }
  };
  
  const accordionHeaderStyles = "flex justify-between items-center p-3 rounded-md bg-[#D7E5E5] cursor-pointer";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#586D78] flex items-center"><TableIcon className="mr-2" /> Tables</h1>
      
      <section>
        <div className={accordionHeaderStyles} onClick={() => setIsTablesOpen(o => !o)}>
          <h2 className="text-lg font-semibold text-[#586D78]">Table Management</h2>
          {isTablesOpen ? <ChevronUp /> : <ChevronDown />}
        </div>
        {isTablesOpen && <div className="mt-4"><Card>{/* Table CRUD UI */}</Card></div>}
      </section>

      <section>
        <div className={accordionHeaderStyles} onClick={() => setIsAssignmentsOpen(o => !o)}>
          <h2 className="text-lg font-semibold text-[#586D78] flex items-center"><MapPin className="mr-2 h-5 w-5" /> Guest Assignments</h2>
          {isAssignmentsOpen ? <ChevronUp /> : <ChevronDown />}
        </div>
        {isAssignmentsOpen && (
          <div className="mt-4 space-y-4">
            <Card><div className="text-sm text-[#586D78] space-y-1">{/* Intro Copy */}</div></Card>
            <div className="flex flex-wrap gap-2 items-center">{/* Sort Buttons */}</div>
            <div className="space-y-4">
              {getSortedGuests().map(guest => {
                const adjacent = state.adjacents[guest.name] ?? [];
                const must = Object.entries(state.constraints[guest.name] ?? {}).filter(([,v]) => v === 'must').map(([k]) => k).filter(n => !adjacent.includes(n));
                const cannot = Object.entries(state.constraints[guest.name] ?? {}).filter(([,v]) => v === 'cannot').map(([k]) => k);
                return (
                  <div key={guest.name} className="rounded-2xl border-[3px] border-white bg-white/90 shadow-sm p-3">
                    <div className="flex flex-col space-y-2">
                      <div className="flex items-center">
                        <span className="font-medium text-[#586D78]">{guest.name}</span>
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full border border-gray-300">Party size: {guest.count}</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Table Assignment</label>
                          <input type="text" value={state.assignments[guest.name] || ''} onChange={e => handleUpdateAssignment(guest.name, e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="e.g., 1, 3, 5" />
                          {state.tables.length > 0 && <p className="text-xs text-gray-500 mt-1">Available: {getTableList()}</p>}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-green-700 mb-1">Must Sit With</label>
                          {adjacent.length > 0 && <div className="flex flex-wrap gap-1 mb-1">{adjacent.map(n => <span key={`adj-${n}`} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border bg-yellow-50 border-yellow-200 text-yellow-900" title="Adjacent preference">⭐ {n}</span>)}</div>}
                          <ConstraintChipsInput tone="must" ownerName={guest.name} value={must} onChange={names => updateConstraints(guest.name, names, 'must')} allGuests={state.guests} activeFieldKey={activeFieldKey} setActiveFieldKey={setActiveFieldKey} />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-red-700 mb-1">Cannot Sit With</label>
                          <ConstraintChipsInput tone="cannot" ownerName={guest.name} value={cannot} onChange={names => updateConstraints(guest.name, names, 'cannot')} allGuests={state.guests} activeFieldKey={activeFieldKey} setActiveFieldKey={setActiveFieldKey} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
      <SavedSettingsAccordion isDefaultOpen={false} />
    </div>
  );
};
export default TableManager;