import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  useMemo,
  ReactNode,
} from 'react';
import {
  Guest,
  Table,
  Constraint,
  SeatingPlan,
  UserSubscription,
} from '../types';
import { getMaxGuestLimit, isPremiumSubscription } from '../utils/premium';
import { supabase, supabaseConfigured, testSupabaseConnection } from '../lib/supabase';
import {
  loadRecentSessionSettings,
  clearRecentSessionSettings,
} from '../lib/sessionSettings';
import {
  getMostRecentState,
  clearMostRecentState,
  saveMostRecentState
} from '../lib/mostRecentState';
import MostRecentChoiceModal from '../components/MostRecentChoiceModal';

const STORAGE_KEY = 'seatyr_app_state';

const defaultTables: Table[] = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1,
  seats: 8,
}));

interface AppState {
  guests: Guest[];
  tables: Table[];
  constraints: Record<string, Record<string, 'must' | 'cannot' | ''>>;
  adjacents: Record<string, string[]>;
  assignments: Record<string, string>;
  seatingPlans: SeatingPlan[];
  currentPlanIndex: number;
  subscription: UserSubscription | null;
  user: any | null;
  userSetTables: boolean;
  loadedSavedSetting: boolean;
  isSupabaseConnected?: boolean;
}
type AppAction =
  | { type: 'ADD_GUESTS'; payload: Guest[] }
  | { type: 'REMOVE_GUEST'; payload: number }
  | { type: 'RENAME_GUEST'; payload: { index: number; name: string } }
  | { type: 'CLEAR_GUESTS' }
  | { type: 'SET_GUESTS'; payload: Guest[] }
  | { type: 'SET_CONSTRAINT'; payload: { guest1: string; guest2: string; value: 'must' | 'cannot' | '' } }
  | { type: 'SET_ADJACENT'; payload: { guest1: string; guest2: string } }
  | { type: 'REMOVE_ADJACENT'; payload: { guest1: string; guest2: string } }
  | { type: 'ADD_TABLE'; payload: Partial<Table> }
  | { type: 'REMOVE_TABLE'; payload: number }
  | { type: 'UPDATE_TABLE_SEATS'; payload: { id: number; seats: number } }
  | { type: 'UPDATE_TABLE_NAME'; payload: { id: number; name?: string } }
  | { type: 'UPDATE_ASSIGNMENT'; payload: { name: string; tables: string[] } }
  | { type: 'SET_SEATING_PLANS'; payload: SeatingPlan[] }
  | { type: 'SET_CURRENT_PLAN_INDEX'; payload: number }
  | { type: 'SET_SUBSCRIPTION'; payload: UserSubscription | null }
  | { type: 'SET_USER'; payload: any }
  | { type: 'SET_USER_SET_TABLES'; payload: boolean }
  | { type: 'SET_LOADED_SAVED_SETTING'; payload: boolean }
  | { type: 'UPDATE_DEFAULT_TABLES'; payload: Table[] }
  | { type: 'IMPORT_STATE'; payload: Partial<AppState> }
  | { type: 'RESET'; payload?: { skipTrimForPremium?: boolean } }
  | { type: 'LOAD_MOST_RECENT'; payload: AppState }
  | { type: 'SET_SUPABASE_CONNECTED'; payload: boolean };

const initialState: AppState = {
  guests: [],
  tables: defaultTables,
  constraints: {},
  adjacents: {},
  assignments: {},
  seatingPlans: [],
  currentPlanIndex: 0,
  subscription: null,
  user: null,
  userSetTables: false,
  loadedSavedSetting: false,
  isSupabaseConnected: false,
};

const loadSavedState = (): AppState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      delete parsed.subscription;
      delete parsed.user;
      delete parsed.isSupabaseConnected;
      return { ...initialState, ...parsed };
    }
  } catch (err) {
    console.error('Error loading saved state:', err);
  }
  return initialState;
};

const calculateRequiredTables = (guestCount: number, seatsPerTable: number = 8): Table[] => {
  const totalTablesNeeded = Math.ceil(guestCount / seatsPerTable);
  return Array.from({ length: totalTablesNeeded }, (_, i) => ({
    id: i + 1,
    seats: seatsPerTable,
  }));
};
const reducer = (state: AppState, action: AppAction): AppState => {
  let newState = state;

  switch (action.type) {
    case 'SET_GUESTS': {
      newState = {
        ...state,
        guests: action.payload,
        seatingPlans: [],
      };
      break;
    }

    case 'ADD_GUESTS': {
      const newGuests = [...state.guests, ...action.payload];
      const totalGuests = newGuests.length;
      const guestLimit = getMaxGuestLimit(state.subscription);

      if (totalGuests > guestLimit) {
        console.log(`Cannot add guests: limit of ${guestLimit} exceeded (total: ${totalGuests})`);
        alert(`You can only have up to ${guestLimit} guests with your current plan. Upgrade to Premium for unlimited guests.`);
        return state;
      }

      let newTables = state.tables;
      if (!state.userSetTables) {
        const totalGuestCount = newGuests.reduce((sum, guest) => sum + guest.count, 0);
        newTables = calculateRequiredTables(totalGuestCount);
      }

      newState = {
        ...state,
        guests: newGuests,
        tables: newTables,
        seatingPlans: [],
      };
      break;
    }
    case 'REMOVE_GUEST': {
      const newGuests = [...state.guests];
      if (action.payload < 0 || action.payload >= newGuests.length) {
        console.warn(`REMOVE_GUEST: invalid index ${action.payload}`);
        return state;
      }

      const removedGuest = newGuests.splice(action.payload, 1)[0];

      const newConstraints = { ...state.constraints };
      delete newConstraints[removedGuest.name];
      Object.keys(newConstraints).forEach(guest => {
        if (newConstraints[guest]?.[removedGuest.name]) {
          delete newConstraints[guest][removedGuest.name];
        }
      });

      const newAdjacents = { ...state.adjacents };
      delete newAdjacents[removedGuest.name];
      Object.keys(newAdjacents).forEach(guest => {
        newAdjacents[guest] = newAdjacents[guest]?.filter(name => name !== removedGuest.name);
      });

      const newAssignments = { ...state.assignments };
      delete newAssignments[removedGuest.name];

      let newTables = state.tables;
      if (!state.userSetTables) {
        const total = newGuests.reduce((sum, g) => sum + g.count, 0);
        newTables = calculateRequiredTables(total);
      }

      newState = {
        ...state,
        guests: newGuests,
        constraints: newConstraints,
        adjacents: newAdjacents,
        assignments: newAssignments,
        tables: newTables,
      };
      break;
    }
    case 'RENAME_GUEST': {
      const newGuests = [...state.guests];
      const { index, name } = action.payload;

      if (index < 0 || index >= newGuests.length) {
        console.warn(`RENAME_GUEST: invalid index ${index}`);
        return state;
      }

      const oldName = newGuests[index].name;
      newGuests[index] = { ...newGuests[index], name };

      const newConstraints = { ...state.constraints };
      if (newConstraints[oldName]) {
        newConstraints[name] = { ...newConstraints[oldName] };
        delete newConstraints[oldName];
      }
      Object.keys(newConstraints).forEach(guest => {
        if (newConstraints[guest]?.[oldName]) {
          newConstraints[guest][name] = newConstraints[guest][oldName];
          delete newConstraints[guest][oldName];
        }
      });

      const newAdjacents = { ...state.adjacents };
      if (newAdjacents[oldName]) {
        newAdjacents[name] = [...newAdjacents[oldName]];
        delete newAdjacents[oldName];
      }
      Object.keys(newAdjacents).forEach(guest => {
        newAdjacents[guest] = newAdjacents[guest]?.map(n => (n === oldName ? name : n));
      });

      const newAssignments = { ...state.assignments };
      if (newAssignments[oldName]) {
        newAssignments[name] = newAssignments[oldName];
        delete newAssignments[oldName];
      }

      newState = {
        ...state,
        guests: newGuests,
        constraints: newConstraints,
        adjacents: newAdjacents,
        assignments: newAssignments,
      };
      break;
    }
    case 'CLEAR_GUESTS': {
      newState = {
        ...state,
        guests: [],
        constraints: {},
        adjacents: {},
        assignments: {},
        seatingPlans: [],
      };
      break;
    }

    case 'SET_CONSTRAINT': {
      const { guest1, guest2, value } = action.payload;
      const newConstraints = { ...state.constraints };

      if (!newConstraints[guest1]) newConstraints[guest1] = {};
      if (!newConstraints[guest2]) newConstraints[guest2] = {};

      newConstraints[guest1][guest2] = value;
      newConstraints[guest2][guest1] = value;

      newState = {
        ...state,
        constraints: newConstraints,
      };
      break;
    }

    case 'SET_ADJACENT': {
      const { guest1, guest2 } = action.payload;
      const newAdjacents = { ...state.adjacents };

      newAdjacents[guest1] = newAdjacents[guest1] || [];
      if (!newAdjacents[guest1].includes(guest2)) {
        newAdjacents[guest1].push(guest2);
      }

      newAdjacents[guest2] = newAdjacents[guest2] || [];
      if (!newAdjacents[guest2].includes(guest1)) {
        newAdjacents[guest2].push(guest1);
      }

      newState = {
        ...state,
        adjacents: newAdjacents,
      };
      break;
    }
    case 'REMOVE_ADJACENT': {
      const { guest1, guest2 } = action.payload;
      const newAdjacents = { ...state.adjacents };

      newAdjacents[guest1] = (newAdjacents[guest1] || []).filter(g => g !== guest2);
      newAdjacents[guest2] = (newAdjacents[guest2] || []).filter(g => g !== guest1);

      newState = {
        ...state,
        adjacents: newAdjacents,
      };
      break;
    }

    case 'ADD_TABLE': {
      const newId = state.tables.length > 0
        ? Math.max(...state.tables.map(t => t.id)) + 1
        : 1;
      const newTable: Table = {
        id: newId,
        seats: 8,
        ...action.payload,
      };

      newState = {
        ...state,
        tables: [...state.tables, newTable],
      };
      break;
    }

    case 'REMOVE_TABLE': {
      const updated = state.tables.filter(t => t.id !== action.payload);
      newState = {
        ...state,
        tables: updated,
      };
      break;
    }

    case 'UPDATE_TABLE_SEATS': {
      const { id, seats } = action.payload;
      const updated = state.tables.map(t =>
        t.id === id ? { ...t, seats } : t
      );
      newState = {
        ...state,
        tables: updated,
      };
      break;
    }
    case 'UPDATE_TABLE_NAME': {
      const { id, name } = action.payload;
      const updated = state.tables.map(t =>
        t.id === id ? { ...t, name } : t
      );
      newState = {
        ...state,
        tables: updated,
      };
      break;
    }

    case 'UPDATE_ASSIGNMENT': {
      const newAssignments = { ...state.assignments };
      if (!action.payload.name) {
        console.warn('UPDATE_ASSIGNMENT: empty guest name');
        return state;
      }
      if (action.payload.tables) {
        newAssignments[action.payload.name] = action.payload.tables;
      } else {
        delete newAssignments[action.payload.name];
      }

      newState = {
        ...state,
        assignments: newAssignments,
      };
      break;
    }

    case 'SET_SEATING_PLANS': {
      newState = {
        ...state,
        seatingPlans: action.payload,
      };
      break;
    }

    case 'SET_CURRENT_PLAN_INDEX': {
      newState = {
        ...state,
        currentPlanIndex: action.payload,
      };
      break;
    }
    case 'SET_SUBSCRIPTION': {
      newState = {
        ...state,
        subscription: action.payload,
      };
      break;
    }

    case 'SET_USER': {
      newState = {
        ...state,
        user: action.payload,
      };
      break;
    }

    case 'SET_USER_SET_TABLES': {
      newState = {
        ...state,
        userSetTables: action.payload,
      };
      break;
    }

    case 'SET_LOADED_SAVED_SETTING': {
      newState = {
        ...state,
        loadedSavedSetting: action.payload,
      };
      break;
    }

    case 'SET_SUPABASE_CONNECTED': {
      newState = {
        ...state,
        isSupabaseConnected: action.payload,
      };
      break;
    }

    case 'UPDATE_DEFAULT_TABLES': {
      newState = {
        ...state,
        tables: action.payload,
        userSetTables: false,
      };
      break;
    }

    case 'IMPORT_STATE': {
      const importedState = action.payload;
      const stateToUse = {
        ...state,
        ...importedState,
      };
      newState = {
        ...stateToUse,
      };
      break;
    }
    case 'RESET': {
      const skipTrim = action.payload?.skipTrimForPremium;
      let trimmedGuests = state.guests;

      if (!skipTrim && !isPremiumSubscription(state.subscription)) {
        const limit = getMaxGuestLimit(state.subscription);
        trimmedGuests = state.guests.slice(0, limit);
      }

      newState = {
        ...initialState,
        subscription: state.subscription,
        user: state.user,
        isSupabaseConnected: state.isSupabaseConnected,
        guests: trimmedGuests,
      };

      if (state.user && isPremiumSubscription(state.subscription)) {
        clearRecentSessionSettings(state.user.id, true);
        clearMostRecentState(state.user.id);
      }

      break;
    }

    case 'LOAD_MOST_RECENT': {
      const fullState = action.payload;
      newState = {
        ...fullState,
        subscription: state.subscription,
        user: state.user,
        isSupabaseConnected: state.isSupabaseConnected,
        loadedSavedSetting: true,
      };
      break;
    }

    default:
      return state;
  }

  try {
    const stateToSave = { ...newState };
    delete stateToSave.subscription;
    delete stateToSave.user;
    delete stateToSave.isSupabaseConnected;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  } catch (error) {
    console.error('Error saving state:', error);
  }

  return newState;
};
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider = ({ children }: AppProviderProps) => {
  const [showRecentModal, setShowRecentModal] = useState(false);
  const [mostRecentState, setMostRecentState] = useState<AppState | null>(null);

  const [state, dispatch] = useReducer(reducer, undefined, loadSavedState);
  
  useEffect(() => {
    const init = async () => {
      if (!supabaseConfigured) {
        console.log('Supabase is not configured, skipping auth initialization');
        dispatch({ type: 'SET_USER', payload: null });
        dispatch({ type: 'SET_SUBSCRIPTION', payload: null });
        return;
      }

      try {
        // Test Supabase connection
        const isConnected = await testSupabaseConnection();
        dispatch({ type: 'SET_SUPABASE_CONNECTED', payload: isConnected });
        
        if (!isConnected) {
          console.error('Supabase connection test failed');
          return;
        }
        
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error fetching user:', error);
          return;
        }
        
        const user = data?.session?.user || null;
        
        if (user) {
          dispatch({ type: 'SET_USER', payload: user });
          
          try {
            // Only fetch subscription data if we have a valid session and user
            if (data.session) {
              const { data: subData, error: subError } = await supabase
                .from('subscriptions')
                .select('*')
                .eq('user_id', user.id)
                .order('current_period_end', { ascending: false })
                .limit(1);

              if (subError) {
                if (subError.status === 401) {
                  // Session is invalid/expired
                  console.error('Subscription fetch error (unauthorized):', subError);
                  dispatch({ type: 'SET_USER', payload: null });
                  return;
                }
                console.error('Subscription fetch error:', subError);
              } else if (subData && subData.length > 0) {
                dispatch({ type: 'SET_SUBSCRIPTION', payload: subData[0] });
              } else {
                // Check for trial subscription if no regular subscription found
                try {
                  const { data: trialData, error: trialError } = await supabase
                    .from('trial_subscriptions')
                    .select('*')
                    .eq('user_id', user.id)
                    .gt('expires_on', new Date().toISOString())
                    .limit(1);
                    
                  if (!trialError && trialData && trialData.length > 0) {
                    const trialSubscription = {
                      id: `trial-${trialData[0].id}`,
                      user_id: user.id,
                      status: 'active',
                      current_period_start: trialData[0].start_date,
                      current_period_end: trialData[0].expires_on,
                      cancel_at_period_end: true
                    };
                    dispatch({ type: 'SET_SUBSCRIPTION', payload: trialSubscription });
                  }
                } catch (trialErr) {
                  console.error('Error fetching trial subscription:', trialErr);
                }
              }
              
              // Check for most recent state
              try {
                const recent = await getMostRecentState(user.id);
                if (recent) {
                  setMostRecentState(recent);
                  setShowRecentModal(true);
                }
              } catch (recentErr) {
                console.error('Error fetching most recent state:', recentErr);
              }
            }
          } catch (err) {
            console.error('Error in subscription or recent state fetch:', err);
          }
        }
      } catch (err) {
        console.error('Error in auth initialization:', err);
      }
    };

    init();
  }, []);

  const handleKeepCurrent = async () => {
    setShowRecentModal(false);
    if (state.user) {
      await clearMostRecentState(state.user.id);
    }
  };

  const handleRestoreRecent = () => {
    setShowRecentModal(false);
    if (mostRecentState) {
      dispatch({ type: 'LOAD_MOST_RECENT', payload: mostRecentState });
    }
  };

  const value = useMemo(() => ({ state, dispatch }), [state, dispatch]);

  return (
    <AppContext.Provider value={value}>
      {children}
      {showRecentModal && mostRecentState && isPremiumSubscription(state.subscription) && (
        <MostRecentChoiceModal
          userId={state.user?.id || ''}
          isPremium={isPremiumSubscription(state.subscription)}
          recentTimestamp={mostRecentState.timestamp}
          onClose={() => setShowRecentModal(false)}
          onRestoreRecent={handleRestoreRecent}
          onKeepCurrent={handleKeepCurrent}
        />
      )}
    </AppContext.Provider>
  );
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
export { useAppContext as useApp };