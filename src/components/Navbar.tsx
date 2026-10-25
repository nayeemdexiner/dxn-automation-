import React from 'react';
import { ShieldCheck, LogOut, Activity, RefreshCw } from 'lucide-react';

interface NavbarProps {
  user: { username: string; name: string; role: string } | null;
  onLogout: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeErrorsCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onRefresh,
  isRefreshing,
  activeErrorsCount,
}) => {
  return (
    <header className="h-14 border-b border-zinc-200 bg-white px-4 md:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-zinc-950 text-white rounded flex items-center justify-center font-mono font-semibold text-xs tracking-wider">
          ND
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-semibold text-zinc-900 text-sm tracking-tight">
              NAYEEM AI DESK
            </h1>
            <span className="text-[10px] font-mono uppercase bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200">
              v1.0-prod
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 hidden sm:block">
            Smart Personal AI Admin Panel · Muhammad Nayeem
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {activeErrorsCount > 0 ? (
          <div className="flex items-center space-x-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            <span className="font-medium font-mono">{activeErrorsCount} Alerts</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span className="font-medium">Operational</span>
          </div>
        )}

        <div className="hidden sm:flex items-center space-x-1.5 text-[11px] text-zinc-600 bg-zinc-50 border border-zinc-200 px-2 py-1 rounded">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-pulse"></span>
          <span className="font-mono">Live Sync</span>
        </div>

        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded border border-zinc-200 transition-colors"
          title="Refresh Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {user && (
          <div className="flex items-center space-x-2 pl-2 border-l border-zinc-200">
            <div className="hidden md:block text-right">
              <div className="text-xs font-medium text-zinc-900">{user.name}</div>
              <div className="text-[10px] text-zinc-500 font-mono">@{user.username}</div>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center space-x-1 text-xs text-zinc-600 hover:text-zinc-900 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 px-2.5 py-1.5 rounded transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
