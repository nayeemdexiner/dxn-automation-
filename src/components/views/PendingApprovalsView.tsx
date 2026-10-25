import React, { useState } from 'react';
import {
  CheckSquare,
  Check,
  X,
  Edit3,
  RefreshCw,
  Send,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { PendingReply } from '../../types/index.ts';

interface PendingApprovalsViewProps {
  pendingReplies: PendingReply[];
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  onEditAndSend: (id: string, text: string) => Promise<void>;
  onRegenerate: (id: string, guidance?: string) => Promise<void>;
}

export const PendingApprovalsView: React.FC<PendingApprovalsViewProps> = ({
  pendingReplies,
  onApprove,
  onReject,
  onEditAndSend,
  onRegenerate,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string>('');
  const [rejectReasonId, setRejectReasonId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

  const filteredList =
    activeTab === 'pending'
      ? pendingReplies.filter((p) => p.status === 'pending')
      : pendingReplies;

  const handleStartEdit = (item: PendingReply) => {
    setEditingId(item.id);
    setEditedText(item.editedText || item.proposedText);
  };

  const handleSaveEdit = async (id: string) => {
    await onEditAndSend(id, editedText);
    setEditingId(null);
  };

  const handleConfirmReject = async (id: string) => {
    await onReject(id, rejectReason || 'Manual rejection by admin');
    setRejectReasonId(null);
    setRejectReason('');
  };

  const handleTriggerRegenerate = async (id: string) => {
    await onRegenerate(id, guidance);
    setRegeneratingId(null);
    setGuidance('');
  };

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-zinc-200">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <CheckSquare className="w-4 h-4 text-zinc-700" />
            <span>AI Reply Approval & Moderation Deck</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Personal, romantic, sensitive, and high-impact drafts held safely for Muhammad Nayeem's personal authorization.
          </p>
        </div>

        <div className="flex items-center space-x-1 bg-zinc-100 p-0.5 rounded border border-zinc-200">
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'pending'
                ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Pending ({pendingReplies.filter((p) => p.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
              activeTab === 'all'
                ? 'bg-white text-zinc-900 shadow-2xs font-semibold'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            All History ({pendingReplies.length})
          </button>
        </div>
      </div>

      {/* Cards List */}
      {filteredList.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-lg p-12 text-center space-y-2">
          <CheckSquare className="w-8 h-8 text-zinc-300 mx-auto" />
          <h3 className="text-xs font-semibold text-zinc-800">No Drafts Requiring Approval</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto">
            All pending replies have been cleared. Inbound low-risk business inquiries are handled automatically according to policy rules.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredList.map((item) => {
            const isEditing = editingId === item.id;
            const isRejecting = rejectReasonId === item.id;
            const isRegenerating = regeneratingId === item.id;

            return (
              <div
                key={item.id}
                className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3.5 shadow-2xs transition-shadow hover:shadow-xs"
              >
                {/* Meta Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2.5">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-zinc-900">{item.contactName}</span>
                    <span className="text-zinc-400 font-mono text-xs">({item.contactPhone})</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-zinc-100 text-zinc-700 border border-zinc-200">
                      Category: {item.category.replace('_', ' ')}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-zinc-50 text-zinc-500 border border-zinc-200">
                      Conf: {(item.confidenceScore * 100).toFixed(0)}%
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                        item.status === 'pending'
                          ? 'bg-amber-50 text-amber-900 border border-amber-200'
                          : item.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>

                {/* Inbound Context */}
                <div className="bg-zinc-50 p-3 rounded border border-zinc-200 text-xs">
                  <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1 flex items-center space-x-1">
                    <span>Inbound Sender Message</span>
                    <span className="text-zinc-300">·</span>
                    <span className="font-mono">{new Date(item.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-zinc-900 italic font-serif text-[13px]">
                    "{item.inboundText}"
                  </div>
                </div>

                {/* Proposed Text or Editor */}
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
                    <span>Proposed AI Response (Draft)</span>
                    {item.status === 'pending' && !isEditing && (
                      <button
                        onClick={() => handleStartEdit(item)}
                        className="text-[11px] text-zinc-600 hover:text-zinc-950 flex items-center space-x-1 font-normal"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit text</span>
                      </button>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        rows={3}
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        className="w-full text-xs p-2.5 border border-zinc-900 rounded focus:outline-hidden font-sans bg-white leading-relaxed"
                      />
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2.5 py-1 text-xs border border-zinc-200 text-zinc-600 rounded hover:bg-zinc-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(item.id)}
                          className="px-3 py-1 text-xs bg-zinc-950 text-white rounded font-medium hover:bg-zinc-800 flex items-center space-x-1"
                        >
                          <Send className="w-3 h-3" />
                          <span>Approve & Send Edited</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-zinc-100/60 p-3 rounded border border-zinc-200 text-xs text-zinc-900 font-sans leading-relaxed">
                      {item.editedText || item.proposedText}
                    </div>
                  )}
                </div>

                {/* Policy Decision Reason */}
                <div className="text-[11px] text-zinc-500 bg-zinc-50/80 p-2 rounded border border-zinc-200/80 flex items-start space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                  <span><strong>Reason Held:</strong> {item.decisionReason || 'Requires personal admin approval by safety policy.'}</span>
                </div>

                {/* Regenerate with Guidance Panel */}
                {isRegenerating && (
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded space-y-2">
                    <div className="text-xs font-semibold text-zinc-800 flex items-center space-x-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Regenerate Draft with Custom Prompt Guidance</span>
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Make it warmer and offer next Monday afternoon for a brief call..."
                      value={guidance}
                      onChange={(e) => setGuidance(e.target.value)}
                      className="w-full text-xs p-2 border border-zinc-300 rounded bg-white"
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => setRegeneratingId(null)}
                        className="px-2.5 py-1 text-xs border border-zinc-200 text-zinc-600 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleTriggerRegenerate(item.id)}
                        className="px-3 py-1 text-xs bg-zinc-900 text-white rounded font-medium"
                      >
                        Regenerate Now
                      </button>
                    </div>
                  </div>
                )}

                {/* Reject Reason Panel */}
                {isRejecting && (
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded space-y-2">
                    <div className="text-xs font-semibold text-zinc-800">
                      Reason for Rejection (Recorded in Audit Log)
                    </div>
                    <input
                      type="text"
                      placeholder="e.g. Unsolicited advertisement, personal boundaries respected."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full text-xs p-2 border border-zinc-300 rounded bg-white"
                    />
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => setRejectReasonId(null)}
                        className="px-2.5 py-1 text-xs border border-zinc-200 text-zinc-600 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleConfirmReject(item.id)}
                        className="px-3 py-1 text-xs bg-zinc-950 text-white rounded font-medium"
                      >
                        Confirm Rejection
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Toolbar */}
                {item.status === 'pending' && !isEditing && !isRejecting && !isRegenerating && (
                  <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-zinc-100">
                    <button
                      onClick={() => setRegeneratingId(item.id)}
                      className="px-2.5 py-1.5 text-xs text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 rounded border border-zinc-200 transition-colors flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Regenerate</span>
                    </button>
                    <button
                      onClick={() => setRejectReasonId(item.id)}
                      className="px-2.5 py-1.5 text-xs text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100 rounded border border-zinc-200 transition-colors flex items-center space-x-1"
                    >
                      <X className="w-3 h-3" />
                      <span>Reject</span>
                    </button>
                    <button
                      onClick={() => handleStartEdit(item)}
                      className="px-2.5 py-1.5 text-xs text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 rounded border border-zinc-200 transition-colors flex items-center space-x-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit & Send</span>
                    </button>
                    <button
                      onClick={() => onApprove(item.id)}
                      className="px-3.5 py-1.5 text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded font-medium transition-colors flex items-center space-x-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve & Send</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
