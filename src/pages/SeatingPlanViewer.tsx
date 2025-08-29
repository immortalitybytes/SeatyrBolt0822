import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, ArrowLeft, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import Card from '../components/Card';
import { useApp } from '../context/AppContext';
import { generateSeatingPlans } from '../utils/seatingAlgorithm';
import { ValidationError } from '../types';
import SavedSettingsAccordion from '../components/SavedSettingsAccordion';
import { isPremiumSubscription } from '../utils/premium';

const formatGuestNameForSeat = (rawName: string, seatIndex: number): React.ReactNode => {
    if (!rawName) return '';
    const parts = rawName.split(/(\s*(?:&|\+|and|plus)\s*)/i);
    const finalTokens: (string | { type: 'delimiter'; value: string })[] = [];
  
    for (const part of parts) {
      if (/\s*(?:&|\+|and|plus)\s*/i.test(part)) {
        finalTokens.push({ type: 'delimiter', value: part });
      } else {
        const numericMatch = part.match(/([+])\s*(\d+)$/);
        if (numericMatch) {
          const baseName = part.substring(0, numericMatch.index).trim();
          const num = parseInt(numericMatch[2], 10);
          if (baseName) finalTokens.push(baseName);
          for (let i = 0; i < num; i++) {
            if (i > 0 || baseName) finalTokens.push({ type: 'delimiter', value: ` ${numericMatch[1]} ` });
            const suffix = i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th';
            finalTokens.push(`'${i + 1}${suffix} of ${num}'`);
          }
        } else {
          finalTokens.push(part);
        }
      }
    }
  
    let nameIndex = 0;
    return (
      <>
        {finalTokens.map((token, index) => {
          if (typeof token === 'object') return <span key={`del-${index}`}>{token.value}</span>;
          const isTarget = nameIndex === seatIndex;
          nameIndex++;
          return isTarget ? <strong key={`tok-${index}`}>{token}</strong> : <span key={`tok-${index}`}>{token}</span>;
        })}
      </>
    );
};

const displayTableLabel = (table: { id: number; name?: string | null }, index: number): string => {
    const displayNumber = index + 1;
    const baseLabel = `Table #${displayNumber}`;
    if (!table.name || table.name.trim() === '' || table.name.trim().toLowerCase() === `table ${displayNumber}`) {
      return baseLabel;
    }
    return `Table #${displayNumber} (${table.name.trim()})`;
};


const SeatingPlanViewer: React.FC = () => {
  const { state, dispatch } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  
  // Get premium status from subscription
  const isPremium = isPremiumSubscription(state.subscription);

  const plan = state.seatingPlans[state.currentPlanIndex] ?? null;

  const capacityById = useMemo(() => {
    const map = new Map<number, number>();
    state.tables.forEach(t => map.set(t.id, t.seats));
    return map;
  }, [state.tables]);

  const tablesNormalized = useMemo(() => {
    if (!plan) return [];
    return [...plan.tables].sort((a, b) => a.id - b.id);
  }, [plan]);

  const handleGenerateSeatingPlan = async () => {
      setIsGenerating(true);
      setErrors([]);
      try {
          const { plans, errors: validationErrors } = await generateSeatingPlans(
              state.guests, state.tables, state.constraints, state.adjacents, state.assignments, isPremium
          );
          if (validationErrors.length > 0) setErrors(validationErrors);
          if (plans.length > 0) {
              dispatch({ type: 'SET_SEATING_PLANS', payload: plans });
              dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: 0 });
          } else if (validationErrors.length === 0) {
              setErrors([{ type: 'error', message: 'No valid seating plans could be generated. Try relaxing constraints.' }]);
          }
      } catch (e) {
          setErrors([{ type: 'error', message: 'An unexpected error occurred during plan generation.' }]);
      } finally {
          setIsGenerating(false);
      }
  };

  const handleNavigatePlan = (delta: number) => {
    const newIndex = state.currentPlanIndex + delta;
    if (newIndex >= 0 && newIndex < state.seatingPlans.length) {
      dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: newIndex });
    }
  };

  const renderCurrentPlan = () => {
    if (!plan) {
      return <div className="text-center py-8 text-gray-500">No seating plan available.</div>;
    }
    
    const maxCapacity = Math.max(0, ...Array.from(capacityById.values()));

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              {tablesNormalized.map((table, index) => {
                const capacity = capacityById.get(table.id) ?? 0;
                const occupied = table.seats.length;
                const tableInfo = state.tables.find(t => t.id === table.id);
                return (
                  <th key={table.id} className="bg-indigo-100 text-[#586D78] font-medium p-2 border border-indigo-200">
                    {displayTableLabel({id: table.id, name: tableInfo?.name }, index)}
                    <span className="text-xs block text-gray-600">{occupied}/{capacity} seats</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: maxCapacity }).map((_, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {tablesNormalized.map(table => {
                  const capacity = capacityById.get(table.id) ?? 0;
                  if (rowIndex >= capacity) {
                    return <td key={`cell-blackout-${table.id}-${rowIndex}`} className="p-2 border border-gray-700 bg-black" aria-hidden="true" style={{ pointerEvents: 'none' }} />;
                  }
                  
                  const guestData = table.seats[rowIndex];
                  if (!guestData) {
                    return <td key={`cell-empty-${table.id}-${rowIndex}`} className="p-2 border border-gray-200 bg-gray-50"><div className="text-xs text-gray-400 text-center">Empty</div></td>;
                  }

                  // Safe type validation (Grok feature)
                  const safeName = (typeof guestData.name === 'string' && guestData.name.trim()) ? guestData.name.trim() : '';
                  const safePartyIndex = Number.isFinite((guestData as any).partyIndex) ? (guestData as any).partyIndex : -1;

                  return (
                    <td key={`cell-guest-${table.id}-${rowIndex}`} className="p-2 border border-indigo-200 align-top">
                      <div className="font-medium text-[#586D78] text-sm">
                        {formatGuestNameForSeat(safeName, safePartyIndex)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#586D78] flex items-center">
        <MapPin className="mr-2" />
        Seating Plan
      </h1>
      <Card>
          <p className="text-gray-700">Generate and review seating plans based on your guests, tables, and constraints.</p>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="danstyle1c-btn" onClick={handleGenerateSeatingPlan} disabled={isGenerating}>
              {isGenerating && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
              {isGenerating ? 'Generating...' : 'Generate Seating Plan'}
            </button>
          </div>
          {errors.length > 0 && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3">
                  <h3 className="flex items-center text-red-800 font-medium mb-2"><AlertCircle className="w-4 h-4 mr-1" /> Errors</h3>
                  <ul className="list-disc pl-5 text-red-700 text-sm space-y-1">
                      {errors.map((error, index) => (<li key={index}>{error.message}</li>))}
                  </ul>
              </div>
          )}
      </Card>
      <Card title={`Current Plan (${state.currentPlanIndex + 1} of ${state.seatingPlans.length})`}>
        {renderCurrentPlan()}
        {plan && (
            <div className="mt-6 flex justify-center space-x-4">
                <button className="danstyle1c-btn" onClick={() => handleNavigatePlan(-1)} disabled={state.currentPlanIndex <= 0}><ArrowLeft className="w-4 h-4 mr-2" /> Previous</button>
                <button className="danstyle1c-btn" onClick={() => handleNavigatePlan(1)} disabled={state.currentPlanIndex >= state.seatingPlans.length - 1}>Next <ArrowRight className="w-4 h-4 ml-2" /></button>
            </div>
        )}
      </Card>
      <SavedSettingsAccordion isDefaultOpen={false} />
    </div>
  );
};

export default SeatingPlanViewer;