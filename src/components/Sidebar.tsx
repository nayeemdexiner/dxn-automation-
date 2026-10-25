import React from 'react';
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  BookOpen,
  Sliders,
  BrainCircuit,
  Cpu,
  History,
  FlaskConical,
  Compass,
} from 'lucide-react';

export type ActiveTab =
  | 'overview'
  | 'inbox'
  | 'pending'
  | 'simulator'
  | 'research'
  | 'knowledge'
  | 'settings'
  | 'memory'
  | 'integrations'
  | 'audit';

interface SidebarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  pendingCount: number;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  pendingCount,
}) => {
  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'inbox', label: 'Inbox & History', icon: Inbox },
    {
      id: 'pending',
      label: 'Pending Approvals',
      icon: CheckSquare,
      badge: pendingCount > 0 ? pendingCount : null,
    },
    { id: 'simulator', label: 'Inbound Simulator', icon: FlaskConical },
    { id: 'research', label: 'Web Guide & Research', icon: Compass },
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'settings', label: 'AI Settings & Rules', icon: Sliders },
    { id: 'memory', label: 'Memory & Context', icon: BrainCircuit },
    { id: 'integrations', label: 'Integrations', icon: Cpu },
    { id: 'audit', label: 'Audit Logs', icon: History },
  ];

  return (
    <aside className="w-full md:w-60 border-b md:border-b-0 md:border-r border-zinc-200 bg-zinc-50 p-3 flex flex-row md:flex-col justify-between shrink-0 overflow-x-auto md:overflow-visible">
      <div className="flex flex-row md:flex-col space-x-1 md:space-x-0 md:space-y-1 w-full">
        <div className="hidden md:block px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
          Management
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as ActiveTab)}
              className={`flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-zinc-950 text-white shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-zinc-500'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== null && item.badge !== undefined && (
                <span
                  className={`ml-2 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-semibold ${
                    isActive ? 'bg-white text-zinc-950' : 'bg-zinc-900 text-white'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="hidden md:block pt-4 border-t border-zinc-200 px-3">
        <div className="text-[11px] text-zinc-400">Owner</div>
        <div className="text-xs font-medium text-zinc-800 truncate">Muhammad Nayeem</div>
        <div className="text-[10px] text-zinc-500 truncate">Chittagong Door · Hajiganj</div>
      </div>
    </aside>
  );
};
