import React, { useState } from 'react';
import { History, Shield, Filter, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { AuditLog } from '../../types/index.ts';

interface AuditLogsViewProps {
  logs: AuditLog[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs }) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesFilter = filterType === 'all' || log.eventType.includes(filterType);
    const matchesSearch =
      log.actor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.eventType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      JSON.stringify(log.details).toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <History className="w-4 h-4 text-zinc-700" />
            <span>Security & Governance Audit Trail</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Immutable timeline of automation decisions, approvals, webhook deliveries, rejections, and system authentication events.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-1 rounded">
            Total Records: {logs.length}
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-zinc-950 text-white font-medium'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
            }`}
          >
            All Events
          </button>
          <button
            onClick={() => setFilterType('auto_reply')}
            className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
              filterType === 'auto_reply'
                ? 'bg-zinc-950 text-white font-medium'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
            }`}
          >
            Auto Replies
          </button>
          <button
            onClick={() => setFilterType('pending')}
            className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
              filterType === 'pending'
                ? 'bg-zinc-950 text-white font-medium'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
            }`}
          >
            Approvals & Moderation
          </button>
          <button
            onClick={() => setFilterType('login')}
            className={`px-2.5 py-1 rounded text-xs transition-colors whitespace-nowrap ${
              filterType === 'login'
                ? 'bg-zinc-950 text-white font-medium'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
            }`}
          >
            Auth & Security
          </button>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search audit trail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-zinc-200 rounded focus:outline-hidden focus:ring-1 focus:ring-zinc-950"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden shadow-2xs divide-y divide-zinc-100">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-xs text-zinc-400">
            No audit records found matching criteria.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedId === log.id;
            return (
              <div key={log.id} className="p-3.5 hover:bg-zinc-50/50 transition-colors space-y-2">
                <div
                  className="flex items-start justify-between cursor-pointer select-none"
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                >
                  <div className="flex items-start space-x-3">
                    <button className="text-zinc-400 hover:text-zinc-900 mt-0.5">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold font-mono text-zinc-900">
                          {log.eventType}
                        </span>
                        <span className="text-[10px] font-mono bg-zinc-100 text-zinc-600 px-1.5 py-0.2 rounded border border-zinc-200">
                          actor: {log.actor}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 truncate max-w-xl">
                        {String(
                          (log.details as any)?.message ||
                          (log.details as any)?.reason ||
                          JSON.stringify(log.details)
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-[10px] font-mono text-zinc-400 shrink-0 ml-2">
                    <div>{new Date(log.createdAt).toLocaleDateString()}</div>
                    <div>{new Date(log.createdAt).toLocaleTimeString()}</div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pl-7 pt-1">
                    <pre className="p-2.5 bg-zinc-900 text-zinc-100 rounded text-[11px] font-mono overflow-x-auto">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
