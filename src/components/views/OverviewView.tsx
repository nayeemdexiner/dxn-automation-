import React from 'react';
import {
  Users,
  MessageSquare,
  CheckSquare,
  Power,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Contact, Message, PendingReply, IntegrationStatus } from '../../types/index.ts';

interface OverviewViewProps {
  stats: {
    totalContacts: number;
    totalMessages: number;
    pendingApprovalsCount: number;
    autoReplyEnabled: boolean;
    recentInboundCount: number;
    activeErrorsCount: number;
  };
  integrations: IntegrationStatus[];
  pendingApprovals: PendingReply[];
  recentMessages: Message[];
  contacts: Contact[];
  onNavigateTab: (tab: any) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onToggleAutomation: () => Promise<void>;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  stats,
  integrations,
  pendingApprovals,
  recentMessages,
  contacts,
  onNavigateTab,
  onApprove,
  onReject,
  onToggleAutomation,
}) => {
  const getContact = (contactId: string) => contacts.find((c) => c.id === contactId);

  return (
    <div className="space-y-6">
      {/* Demo Data Banner */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs text-zinc-700">
          <div className="w-2 h-2 rounded-full bg-zinc-950"></div>
          <span className="font-semibold text-zinc-900">Demo Environment Active:</span>
          <span>Sample contacts, Chittagong Door toolpath FAQs, and approval items loaded. Real integrations stay safely isolated.</span>
        </div>
        <button
          onClick={() => onNavigateTab('simulator')}
          className="text-xs bg-white hover:bg-zinc-100 text-zinc-900 font-medium px-2.5 py-1 rounded border border-zinc-200 transition-colors"
        >
          Open Test Simulator
        </button>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">Total Contacts</span>
            <Users className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 tracking-tight">
            {stats.totalContacts}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">Stored with isolated context</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">Pending Approvals</span>
            <CheckSquare className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 tracking-tight">
            {stats.pendingApprovalsCount}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">Personal & high-risk drafts</div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-4">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">Total Messages</span>
            <MessageSquare className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-zinc-900 tracking-tight">
            {stats.totalMessages}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {stats.recentInboundCount} inbound processed
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-lg p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 mb-2">
            <span className="text-xs font-medium">Auto-Reply Policy</span>
            <Power className="w-4 h-4 text-zinc-400" />
          </div>
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-semibold font-mono ${
                stats.autoReplyEnabled ? 'text-zinc-900' : 'text-zinc-400'
              }`}
            >
              {stats.autoReplyEnabled ? 'ACTIVE (FAQ ONLY)' : 'PAUSED'}
            </span>
            <button
              onClick={onToggleAutomation}
              className={`text-xs px-2.5 py-1 rounded border font-medium transition-colors ${
                stats.autoReplyEnabled
                  ? 'bg-zinc-950 text-white border-zinc-950 hover:bg-zinc-800'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-300 hover:bg-zinc-200'
              }`}
            >
              {stats.autoReplyEnabled ? 'Disable' : 'Enable'}
            </button>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">FAQ/Business verified only</div>
        </div>
      </div>

      {/* External Integration Health Overview */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">
            Connected Systems Status
          </div>
          <button
            onClick={() => onNavigateTab('integrations')}
            className="text-xs text-zinc-600 hover:text-zinc-950 flex items-center space-x-1"
          >
            <span>Configure Integrations</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {integrations.map((item) => (
            <div
              key={item.service}
              className="p-3 bg-zinc-50 border border-zinc-200 rounded text-xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-zinc-800 uppercase font-mono text-[11px]">
                  {item.service}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-medium border ${
                    item.status === 'connected'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : item.status === 'configured'
                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                      : item.status === 'mock_mode'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-300'
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <p className="text-[11px] text-zinc-600 line-clamp-2">{item.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid: Pending Approvals & Recent Messages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals Card */}
        <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden flex flex-col">
          <div className="p-4 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckSquare className="w-4 h-4 text-zinc-700" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
                Pending Approval Queue
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('pending')}
              className="text-xs text-zinc-600 hover:text-zinc-950 flex items-center space-x-1"
            >
              <span>View All ({pendingApprovals.length})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-4 divide-y divide-zinc-100 flex-1">
            {pendingApprovals.length === 0 ? (
              <div className="py-8 text-center text-zinc-400 text-xs">
                Queue is clear. No personal or uncertain replies awaiting approval.
              </div>
            ) : (
              pendingApprovals.slice(0, 3).map((item) => (
                <div key={item.id} className="py-3 first:pt-0 last:pb-0 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-zinc-900">{item.contactName}</span>
                      <span className="text-zinc-400 font-mono text-[11px] ml-1.5">
                        {item.contactPhone}
                      </span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-100 text-zinc-800 border border-zinc-200">
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="bg-zinc-50 p-2.5 rounded border border-zinc-200 text-xs text-zinc-800">
                    <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1">
                      Inbound Message
                    </div>
                    <div className="italic">"{item.inboundText}"</div>
                  </div>

                  <div className="bg-zinc-100/60 p-2.5 rounded border border-zinc-200 text-xs text-zinc-900">
                    <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>Proposed Draft</span>
                      <span className="font-mono text-[10px] text-zinc-400">
                        Confidence: {(item.confidenceScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div>{item.proposedText}</div>
                  </div>

                  <div className="text-[11px] text-zinc-500 italic">
                    Reason: {item.decisionReason}
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      onClick={() => onReject(item.id)}
                      className="px-2.5 py-1 text-xs text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded border border-zinc-200 transition-colors flex items-center space-x-1"
                    >
                      <X className="w-3 h-3" />
                      <span>Reject</span>
                    </button>
                    <button
                      onClick={() => onApprove(item.id)}
                      className="px-2.5 py-1 text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded font-medium transition-colors flex items-center space-x-1"
                    >
                      <Check className="w-3 h-3" />
                      <span>Approve & Send</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Message Stream */}
        <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden flex flex-col">
          <div className="p-4 border-b border-zinc-200 bg-zinc-50/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MessageSquare className="w-4 h-4 text-zinc-700" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
                Recent Message Stream
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('inbox')}
              className="text-xs text-zinc-600 hover:text-zinc-950 flex items-center space-x-1"
            >
              <span>Open Inbox</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-4 divide-y divide-zinc-100 flex-1 overflow-y-auto max-h-[460px]">
            {recentMessages.length === 0 ? (
              <div className="py-8 text-center text-zinc-400 text-xs">
                No recent messages recorded.
              </div>
            ) : (
              recentMessages.map((msg) => {
                const contact = getContact(msg.contactId);
                const isInbound = msg.direction === 'inbound';
                return (
                  <div key={msg.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isInbound ? 'bg-zinc-900' : 'bg-zinc-400'
                          }`}
                        />
                        <span className="font-semibold text-zinc-900">
                          {isInbound ? contact?.name || 'Contact' : 'Nayeem AI Desk'}
                        </span>
                        <span className="text-zinc-400 text-[10px] uppercase font-mono">
                          ({msg.direction})
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-zinc-400 text-[10px] font-mono">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <div className="text-xs text-zinc-800 bg-zinc-50 p-2 rounded border border-zinc-200/80">
                      {msg.content}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-zinc-500 font-mono">
                      <span>Status: {msg.status}</span>
                      {msg.category && <span>Category: {msg.category}</span>}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
