import React, { useState, useEffect, useRef } from 'react';
import { Battery, Zap, Thermometer, Activity, Percent, Power, ArrowUpCircle, ArrowDownCircle, PauseCircle, LogIn } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { db, auth } from './firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type CellMode = 'idle' | 'charging' | 'discharging';

export default function App() {
  const [mode, setMode] = useState<CellMode>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // Current live state of the cell
  const [cell, setCell] = useState({
    voltage: 3.20,
    current: 0,
    temperature: 25.0,
    soc: 65.0,
    state_code: 0
  });

  // --- Authentication ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  // --- Firebase Live Data ---
  useEffect(() => {
    if (!isAuthReady || !user) return;

    const docRef = doc(db, 'telemetry', 'esp32_node_1');
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCell({
          voltage: data.voltage ?? 3.20,
          current: data.current ?? 0,
          temperature: data.temp ?? 25.0,
          soc: data.soc ?? 65.0,
          state_code: data.state_code ?? 0
        });
        
        // Derive mode from relay states
        if (data.chg_relay_state === 1) {
          setMode('charging');
        } else if (data.discharge_relay_state === 1) {
          setMode('discharging');
        } else {
          setMode('idle');
        }
      }
    }, (error) => {
      console.error("Firestore Error: ", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // --- Control Relays (Write to Firebase) ---
  const handleSetMode = async (newMode: CellMode) => {
    if (!user) return;
    
    // Optimistic UI update
    setMode(newMode);
    
    try {
      const docRef = doc(db, 'telemetry', 'esp32_node_1');
      await setDoc(docRef, {
        chg_relay_state: newMode === 'charging' ? 1 : 0,
        discharge_relay_state: newMode === 'discharging' ? 1 : 0,
        state_code: newMode === 'charging' ? 1 : (newMode === 'discharging' ? 2 : 0),
        // Include current values to prevent validation errors if the document is empty
        time: Date.now(),
        voltage: cell.voltage,
        current: cell.current,
        soc: cell.soc,
        temp: cell.temperature
      }, { merge: true });
    } catch (error) {
      console.error("Error updating mode:", error);
    }
  };

  // --- Derived State ---
  const getModeColor = (currentMode: CellMode) => {
    switch (currentMode) {
      case 'charging': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
      case 'discharging': return 'text-amber-700 bg-amber-50 border-amber-200';
      default: return 'text-slate-600 bg-slate-50 border-slate-200';
    }
  };

  const getModeLabel = (currentMode: CellMode) => {
    switch (currentMode) {
      case 'charging': return 'Charging Active';
      case 'discharging': return 'Discharging Active';
      default: return 'System Idle';
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 p-4 sm:p-8 md:p-12 flex flex-col items-center font-sans selection:bg-indigo-100">
      <div className="w-full max-w-6xl flex flex-col gap-6 md:gap-10">
      
      {/* Header (Fixed Height) */}
      <header className="shrink-0 bg-white rounded-3xl shadow-sm border border-slate-200 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow-md">
            <Battery className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">Cell Telemetry</h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-0.5">Live Monitoring System</p>
          </div>
        </div>

        <div className={cn("px-4 py-2 rounded-xl border-2 font-bold flex items-center gap-2 text-sm uppercase tracking-wide", getModeColor(mode))}>
          {mode === 'charging' && <ArrowUpCircle className="w-5 h-5" />}
          {mode === 'discharging' && <ArrowDownCircle className="w-5 h-5" />}
          {mode === 'idle' && <PauseCircle className="w-5 h-5" />}
          <span className="hidden sm:inline">{getModeLabel(mode)}</span>
        </div>
      </header>

      {!user ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl shadow-sm border border-slate-200 p-12 text-center">
          <Battery className="w-16 h-16 text-slate-300 mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Authentication Required</h2>
          <p className="text-slate-500 mb-8 max-w-md">Please sign in to view live telemetry data and control the cell relays securely.</p>
          <button 
            onClick={handleLogin}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-bold transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
        </div>
      ) : (
        <>
          {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-10">
        <KPICard
          title="Voltage"
          value={cell.voltage}
          unit="V"
          icon={<Zap className="w-6 h-6" />}
          colorClass="text-violet-600 bg-violet-50"
          barColor="bg-violet-500"
          min={2.5}
          max={3.65}
          minLabel="2.5V"
          maxLabel="3.65V"
          decimals={2}
        />
        <KPICard
          title="Current"
          value={cell.current}
          unit="A"
          icon={<Activity className="w-6 h-6" />}
          colorClass="text-sky-600 bg-sky-50"
          barColor="bg-sky-500"
          min={-5}
          max={5}
          minLabel="-5A"
          maxLabel="+5A"
          decimals={2}
          centerZero={true}
        />
        <KPICard
          title="Temperature"
          value={cell.temperature}
          unit="°C"
          icon={<Thermometer className="w-6 h-6" />}
          colorClass={cell.temperature > 45 ? "text-rose-600 bg-rose-50" : "text-orange-500 bg-orange-50"}
          barColor={cell.temperature > 45 ? "bg-rose-500" : "bg-orange-500"}
          min={20}
          max={60}
          minLabel="20°C"
          maxLabel="60°C"
          decimals={1}
        />
        <KPICard
          title="State of Charge"
          value={cell.soc}
          unit="%"
          icon={<Percent className="w-6 h-6" />}
          colorClass="text-emerald-600 bg-emerald-50"
          barColor="bg-emerald-500"
          min={0}
          max={100}
          minLabel="0%"
          maxLabel="100%"
          decimals={1}
        />
      </div>

      {/* Bottom Control Panel (Fixed Height) */}
      <div className="shrink-0 bg-white rounded-3xl shadow-sm border border-slate-200 p-5 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="hidden md:block">
          <h3 className="font-bold text-slate-900 text-xl">System Controls</h3>
          <p className="text-slate-500 font-medium mt-1">Override active cell state</p>
          <div className="mt-2 inline-block px-3 py-1 bg-slate-100 text-slate-600 text-xs font-mono rounded-lg border border-slate-200">
            DB State Code: {cell.state_code}
          </div>
        </div>
        
        <div className="flex items-center justify-center gap-4 w-full md:w-auto">
          <button
            onClick={() => handleSetMode('charging')}
            className={cn(
              "flex-1 md:w-48 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base uppercase tracking-wide transition-all active:scale-95",
              mode === 'charging' 
                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 ring-4 ring-emerald-600/30" 
                : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-200"
            )}
          >
            <ArrowUpCircle className="w-6 h-6" />
            Charge
          </button>
          
          <button
            onClick={() => handleSetMode('idle')}
            className={cn(
              "flex-1 md:w-48 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base uppercase tracking-wide transition-all active:scale-95",
              mode === 'idle' 
                ? "bg-slate-800 text-white shadow-lg shadow-slate-200 ring-4 ring-slate-800/30" 
                : "bg-slate-200 text-slate-800 hover:bg-slate-300 border border-slate-300"
            )}
          >
            <Power className="w-6 h-6" />
            Idle
          </button>
          
          <button
            onClick={() => handleSetMode('discharging')}
            className={cn(
              "flex-1 md:w-48 flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-base uppercase tracking-wide transition-all active:scale-95",
              mode === 'discharging' 
                ? "bg-amber-500 text-white shadow-lg shadow-amber-200 ring-4 ring-amber-500/30" 
                : "bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200"
            )}
          >
            <ArrowDownCircle className="w-6 h-6" />
            Discharge
          </button>
        </div>
      </div>
        </>
      )}

      </div>
    </div>
  );
}

// --- Subcomponents ---

function KPICard({ 
  title, value, unit, icon, colorClass, barColor, min, max, minLabel, maxLabel, decimals, centerZero = false 
}: {
  title: string; value: number; unit: string; icon: React.ReactNode; colorClass: string; barColor: string;
  min: number; max: number; minLabel: string; maxLabel: string; decimals: number; centerZero?: boolean;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8 lg:p-10 flex flex-col justify-between hover:shadow-md transition-shadow relative overflow-hidden group">
      
      {/* Top row: Title and Icon */}
      <div className="flex justify-between items-center">
        <span className="text-slate-500 font-bold uppercase tracking-wider text-sm">{title}</span>
        <div className={cn("p-2.5 rounded-xl transition-transform group-hover:scale-110", colorClass)}>
          {icon}
        </div>
      </div>
      
      {/* Middle: Value (Safe sizing to prevent overflow) */}
      <div className="flex-1 flex flex-col justify-center my-2">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl sm:text-6xl lg:text-7xl font-mono font-bold text-slate-900 tracking-tighter tabular-nums leading-none">
            {value.toFixed(decimals)}
          </span>
          <span className="text-xl sm:text-2xl lg:text-3xl font-bold text-slate-400">{unit}</span>
        </div>
      </div>
      
      {/* Bottom: Progress Bar Gauge */}
      <div className="mt-auto pt-2">
        <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
        <ProgressBar value={value} min={min} max={max} colorClass={barColor} centerZero={centerZero} />
      </div>
      
    </div>
  );
}

function ProgressBar({ value, min, max, colorClass, centerZero }: { value: number, min: number, max: number, colorClass: string, centerZero: boolean }) {
  const percent = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  
  if (centerZero) {
    const zeroPoint = 50;
    const width = Math.abs(percent - zeroPoint);
    const left = percent > zeroPoint ? zeroPoint : percent;
    return (
      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-300 left-1/2 -translate-x-1/2 z-10" />
        <div 
          className={cn("absolute top-0 bottom-0 rounded-full transition-all duration-500 ease-out", colorClass)} 
          style={{ left: `${left}%`, width: `${width}%` }} 
        />
      </div>
    );
  }

  return (
    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
      <div 
        className={cn("h-full rounded-full transition-all duration-500 ease-out", colorClass)} 
        style={{ width: `${percent}%` }} 
      />
    </div>
  );
}

