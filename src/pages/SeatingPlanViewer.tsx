import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, ArrowLeft, ArrowRight, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import Card from '../components/Card';
import { useApp } from '../context/AppContext';
import { generateSeatingPlans } from '../utils/seatingAlgorithm';
import { ValidationError } from '../types';
import SavedSettingsAccordion from '../components/SavedSettingsAccordion';
import { isPremiumSubscription } from '../utils/premium';
import { seatingTokensFromGuestUnit, nOfNTokensFromSuffix } from '../utils/formatters';

const formatGuestNameForSeat = (rawName: string, seatIndex: number): React.ReactNode => {
    if (!rawName) return '';
    
    // Compute base tokens and extra tokens using helper functions
    const baseTokens = seatingTokensFromGuestUnit(rawName);
    const extraTokens = nOfNTokensFromSuffix(rawName);
    const finalTokens = baseTokens.concat(extraTokens);
    
    // Reconstruct the original name with connectors preserved
    const originalName = rawName.trim();
    
    // Find which token to bold based on seat index
    const tokenToBold = finalTokens[seatIndex % finalTokens.length];
    
    // Split the original name to preserve connectors
    const parts = originalName.split(/(\s*(?:and|&|\+|plus|also)\s*)/i);
    const result: React.ReactNode[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (/\s*(?:and|&|\+|plus|also)\s*/i.test(part)) {
        // This is a connector - render as-is
        result.push(<span key={`conn-${i}`}>{part}</span>);
      } else {
        // This is a name part
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;
        
        // Check if this part should be bolded
        if (trimmedPart === tokenToBold) {
          result.push(<strong key={`bold-${i}`}>{trimmedPart}</strong>);
        } else {
          result.push(<span key={`norm-${i}`}>{trimmedPart}</span>);
        }
      }
    }
    
    // Add extra tokens (Nth of N) at the end if they exist
    if (extraTokens.length > 0) {
      const extraTokenToBold = extraTokens[seatIndex % extraTokens.length];
      result.push(<span key="extra-sep"> + </span>);
      
      extraTokens.forEach((token, index) => {
        if (token === extraTokenToBold) {
          result.push(<strong key={`extra-bold-${index}`}>{token}</strong>);
        } else {
          result.push(<span key={`extra-norm-${index}`}>{token}</span>);
        }
        if (index < extraTokens.length - 1) {
          result.push(<span key={`extra-conn-${index}`}> + </span>);
        }
      });
    }
    
    return <>{result}</>;
};

const displayTableLabel = (table: { id: number; name?: string | null }, index: number): string => {
    const displayNumber = index + 1;
    const baseLabel = `Table #${displayNumber}`;
    if (!table.name || table.name.trim() === '' || table.name.trim().toLowerCase() === `table ${displayNumber}`) {
      return baseLabel;
    }
    return `Table #${displayNumber} (${table.name.trim()})`;
};


// Constants for guest pagination (matching Constraints page)
const GUEST_THRESHOLD = 120; // pagination threshold
const GUESTS_PER_PAGE = 10;

const SeatingPlanViewer: React.FC = () => {
  const { state, dispatch } = useApp();
  const [isGenerating, setIsGenerating] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  
  // Guest pagination state (matching Constraints page)
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Get premium status from subscription
  const isPremium = isPremiumSubscription(state.subscription);

  const plan = state.seatingPlans[state.currentPlanIndex] ?? null;

  // Auto-generate seating plan if none exists
  useEffect(() => {
    if (state.seatingPlans.length === 0 && state.guests.length > 0 && state.tables.length > 0) {
      setIsGenerating(true);
      generateSeatingPlans(state.guests, state.tables, state.constraints, state.adjacents, {}, isPremium)
        .then(result => {
          if (result.plans.length > 0) {
            dispatch({ type: 'SET_SEATING_PLANS', payload: result.plans });
          }
        })
        .catch(error => {
          console.error('Auto-generation failed:', error);
        })
        .finally(() => {
          setIsGenerating(false);
        });
    }
  }, [state.guests, state.tables, state.constraints, state.adjacents, state.seatingPlans.length, isPremium, dispatch]);

  // Guest pagination logic (matching Constraints page)
  useEffect(() => {
    setCurrentPage(0);
    if (isPremium && state.user && state.guests.length > GUEST_THRESHOLD) {
      setTotalPages(Math.ceil(state.guests.length / GUESTS_PER_PAGE));
    } else {
      setTotalPages(1);
    }
  }, [state.guests, isPremium, state.user]);

  const capacityById = useMemo(() => {
    const map = new Map<number, number>();
    state.tables.forEach(t => map.set(t.id, t.seats));
    return map;
  }, [state.tables]);

  const tablesNormalized = useMemo(() => {
    if (!plan) return [];
    return [...plan.tables].sort((a, b) => a.id - b.id);
  }, [plan]);

  // Navigation functions (matching Constraints page)
  const needsPagination = isPremium && state.user && state.guests.length > GUEST_THRESHOLD;
  const shouldShowPagination = state.guests.length >= GUEST_THRESHOLD;
  const handleNavigatePage = (delta: number) => setCurrentPage(p => Math.max(0, Math.min(totalPages - 1, p + delta)));

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

  // Render page numbers function (matching Constraints page)
  const renderPageNumbers = () => {
    if (totalPages <= 9) {
      return Array.from({ length: totalPages }, (_, i) => (
        <button key={i} onClick={() => setCurrentPage(i)} className={currentPage === i ? 'danstyle1c-btn selected mx-1 w-4' : 'danstyle1c-btn mx-1 w-4'}>
          {i + 1}
        </button>
      ));
    }
    const buttons: JSX.Element[] = [];
    for (let i = 0; i < 3; i++) if (i < totalPages) buttons.push(
      <button key={i} onClick={() => setCurrentPage(i)} className={currentPage === i ? 'danstyle1c-btn selected mx-1 w-4' : 'danstyle1c-btn mx-1 w-4'}>{i + 1}</button>
    );
    if (currentPage > 2) {
      buttons.push(<span key="ellipsis1" className="mx-1">...</span>);
      if (currentPage < totalPages - 3) buttons.push(
        <button key={currentPage} onClick={() => setCurrentPage(currentPage)} className="danstyle1c-btn selected mx-1 w-4">{currentPage + 1}</button>
      );
    }
    if (currentPage < totalPages - 3) buttons.push(<span key="ellipsis2" className="mx-1">...</span>);
    for (let i = Math.max(3, totalPages - 3); i < totalPages; i++) buttons.push(
      <button key={i} onClick={() => setCurrentPage(i)} className={currentPage === i ? 'danstyle1c-btn selected mx-1 w-4' : 'danstyle1c-btn mx-1 w-4'}>{i + 1}</button>
    );
    return buttons;
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
        {/* Navigation buttons above the grid - same layout as ConstraintManager */}
        {state.seatingPlans.length > 1 && (
          <div className="flex justify-center space-x-2 mb-4">
            <button
              className="danstyle1c-btn w-24 mx-1"
              onClick={() => handleNavigatePlan(-1)}
              disabled={state.currentPlanIndex <= 0}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Previous
            </button>

            {/* Page number buttons */}
            {state.seatingPlans.length <= 7 ? (
              // Show all page numbers if 7 or fewer
              Array.from({ length: state.seatingPlans.length }, (_, i) => (
                <button
                  key={i}
                  className={`danstyle1c-btn w-8 mx-1 ${state.currentPlanIndex === i ? 'selected' : ''}`}
                  onClick={() => dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: i })}
                >
                  {i + 1}
                </button>
              ))
            ) : (
              // Show pagination with ellipsis for many pages
              <>
                {/* First page */}
                <button
                  className={`danstyle1c-btn w-8 mx-1 ${state.currentPlanIndex === 0 ? 'selected' : ''}`}
                  onClick={() => dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: 0 })}
                >
                  1
                </button>

                {/* Ellipsis if needed */}
                {state.currentPlanIndex > 2 && (
                  <span className="mx-2 text-gray-500">...</span>
                )}

                {/* Current page and neighbors */}
                {state.currentPlanIndex > 0 && (
                  <button
                    className="danstyle1c-btn w-8 mx-1"
                    onClick={() => dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: state.currentPlanIndex - 1 })}
                  >
                    {state.currentPlanIndex}
                  </button>
                )}

                <button className="danstyle1c-btn w-8 mx-1 selected">
                  {state.currentPlanIndex + 1}
                </button>

                {state.currentPlanIndex < state.seatingPlans.length - 1 && (
                  <button
                    className="danstyle1c-btn w-8 mx-1"
                    onClick={() => dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: state.currentPlanIndex + 1 })}
                  >
                    {state.currentPlanIndex + 2}
                  </button>
                )}

                {/* Ellipsis if needed */}
                {state.currentPlanIndex < state.seatingPlans.length - 3 && (
                  <span className="mx-2 text-gray-500">...</span>
                )}

                {/* Last page */}
                {state.currentPlanIndex < state.seatingPlans.length - 1 && (
                  <button
                    className={`danstyle1c-btn w-8 mx-1 ${state.currentPlanIndex === state.seatingPlans.length - 1 ? 'selected' : ''}`}
                    onClick={() => dispatch({ type: 'SET_CURRENT_PLAN_INDEX', payload: state.seatingPlans.length - 1 })}
                  >
                    {state.seatingPlans.length}
                  </button>
                )}
              </>
            )}

            <button
              className="danstyle1c-btn w-24 mx-1"
              onClick={() => handleNavigatePlan(1)}
              disabled={state.currentPlanIndex >= state.seatingPlans.length - 1}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          </div>
        )}

        {/* Guest pagination controls - top (matching Constraints page) */}
        {shouldShowPagination && state.user && state.guests.length > 0 && (
          <div className="flex space-x-2 mb-4">
            <button className="danstyle1c-btn w-24 mx-1" onClick={() => handleNavigatePage(-1)} disabled={currentPage === 0}><ChevronLeft className="w-4 h-4 mr-1" /> Previous</button>
            <button className="danstyle1c-btn w-24 mx-1" onClick={() => handleNavigatePage(1)} disabled={currentPage >= totalPages - 1}>Next <ChevronRight className="w-4 h-4 ml-1" /></button>
          </div>
        )}

        {renderCurrentPlan()}
        
        {/* Guest pagination controls - bottom (matching Constraints page) */}
        {needsPagination && (
          <div className="flex flex-col md:flex-row items-center justify-between py-4 border-t mt-4">
            <div className="flex items-center w-full justify-between">
              <div className="pl-[140px]">
                <button onClick={() => handleNavigatePage(-1)} disabled={currentPage === 0} className="danstyle1c-btn w-24 mx-1">
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </button>
              </div>
                <div className="flex flex-wrap justify-center">{renderPageNumbers()}</div>
                <div className="pr-[10px]">
                <button onClick={() => handleNavigatePage(1)} disabled={currentPage >= totalPages - 1} className="danstyle1c-btn w-24 mx-1">
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Bottom navigation buttons - preserved */}
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