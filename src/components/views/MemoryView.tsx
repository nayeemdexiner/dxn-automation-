import React, { useState } from 'react';
import {
  BrainCircuit,
  Download,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  User,
  Plus,
} from 'lucide-react';
import { Contact, ContactMemory } from '../../types/index.ts';

interface MemoryViewProps {
  contacts: Contact[];
  memories: ContactMemory[];
  onAddMemory: (contactId: string, memoryType: string, memoryText: string) => Promise<void>;
  onUpdateMemory: (id: string, text: string, verified: boolean) => Promise<void>;
  onDeleteMemory: (id: string) => Promise<void>;
  onClearContactMemories: (contactId: string) => Promise<void>;
}

export const MemoryView: React.FC<MemoryViewProps> = ({
  contacts,
  memories,
  onAddMemory,
  onUpdateMemory,
  onDeleteMemory,
  onClearContactMemories,
}) => {
  const [selectedContactId, setSelectedContactId] = useState<string>('all');
  const [editingMemory, setEditingMemory] = useState<ContactMemory | null>(null);
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState<'user_stated' | 'inferred_preference'>('user_stated');
  const [isAdding, setIsAdding] = useState(false);
  const [targetContactId, setTargetContactId] = useState(contacts[0]?.id || '');

  const filteredMemories = memories.filter((m) =>
    selectedContactId === 'all' ? true : m.contactId === selectedContactId
  );

  const getContact = (contactId: string) => contacts.find((c) => c.id === contactId);

  const handleExport = (contactId?: string) => {
    const target = contactId && contactId !== 'all' ? contactId : contacts[0]?.id;
    if (!target) return;
    window.location.href = `/api/contacts/${target}/memories/export`;
  };

  const handleSaveEdit = async () => {
    if (!editingMemory) return;
    await onUpdateMemory(editingMemory.id, editingMemory.memoryText, editingMemory.verified);
    setEditingMemory(null);
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim() || !targetContactId) return;
    await onAddMemory(targetContactId, newType, newText);
    setNewText('');
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <BrainCircuit className="w-4 h-4 text-zinc-700" />
            <span>Isolated Long-Term Contact Memory Management</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Strict per-contact memory isolation. Distinguishes verified user-stated facts from AI inferences. Never mixes contact records.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {selectedContactId !== 'all' && (
            <button
              onClick={() => handleExport(selectedContactId)}
              className="px-2.5 py-1.5 text-xs border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded flex items-center space-x-1 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Contact Memory (JSON)</span>
            </button>
          )}

          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-3 py-1.5 text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Manual Fact</span>
          </button>
        </div>
      </div>

      {/* Contact Filter Pill Row */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedContactId('all')}
          className={`px-3 py-1 rounded text-xs transition-colors whitespace-nowrap ${
            selectedContactId === 'all'
              ? 'bg-zinc-950 text-white font-medium'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
          }`}
        >
          All Contacts ({memories.length})
        </button>
        {contacts.map((c) => {
          const count = memories.filter((m) => m.contactId === c.id).length;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedContactId(c.id)}
              className={`px-3 py-1 rounded text-xs transition-colors whitespace-nowrap flex items-center space-x-1.5 ${
                selectedContactId === c.id
                  ? 'bg-zinc-950 text-white font-medium'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
              }`}
            >
              <span>{c.name}</span>
              <span className="text-[10px] opacity-75 font-mono">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Add Memory Modal / Box */}
      {isAdding && (
        <form onSubmit={handleCreateMemory} className="p-4 bg-zinc-50 border border-zinc-200 rounded-lg space-y-3">
          <div className="text-xs font-semibold text-zinc-900">Add Verified Contact Fact</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-600 mb-1">Target Contact</label>
              <select
                value={targetContactId}
                onChange={(e) => setTargetContactId(e.target.value)}
                className="w-full text-xs p-2 border border-zinc-300 rounded bg-white"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phoneNumber})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-zinc-600 mb-1">Memory Nature</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
                className="w-full text-xs p-2 border border-zinc-300 rounded bg-white"
              >
                <option value="user_stated">User-Stated (Explicitly told by user)</option>
                <option value="inferred_preference">Inferred Preference (AI hypothesis)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-zinc-600 mb-1">Memory Content</label>
            <input
              type="text"
              placeholder="e.g. Prefers inquiries in Banglish, requires 3D relief door carving in teak wood..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              className="w-full text-xs p-2 border border-zinc-300 rounded bg-white"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-2.5 py-1 text-xs border border-zinc-200 text-zinc-600 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1 text-xs bg-zinc-950 text-white rounded font-medium"
            >
              Save Memory
            </button>
          </div>
        </form>
      )}

      {/* Memories Table / Grid */}
      {filteredMemories.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-lg p-10 text-center text-xs text-zinc-400">
          No long-term memories found for the selected filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredMemories.map((mem) => {
            const contact = getContact(mem.contactId);
            const isEditing = editingMemory?.id === mem.id;

            return (
              <div
                key={mem.id}
                className="bg-white border border-zinc-200 rounded-lg p-4 space-y-2.5 shadow-2xs flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-1.5 font-medium text-zinc-900 truncate">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="truncate">{contact?.name || 'Unknown Contact'}</span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                          mem.memoryType === 'user_stated'
                            ? 'bg-zinc-100 text-zinc-900 border border-zinc-200'
                            : 'bg-zinc-50 text-zinc-600 italic border border-zinc-200'
                        }`}
                      >
                        {mem.memoryType.replace('_', ' ')}
                      </span>
                      {mem.verified && (
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded">
                          Verified
                        </span>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2 pt-1">
                      <textarea
                        rows={3}
                        value={editingMemory.memoryText}
                        onChange={(e) =>
                          setEditingMemory({ ...editingMemory, memoryText: e.target.value })
                        }
                        className="w-full text-xs p-2 border border-zinc-900 rounded bg-white"
                      />
                      <div className="flex items-center justify-between">
                        <label className="flex items-center space-x-1.5 text-xs text-zinc-700">
                          <input
                            type="checkbox"
                            checked={editingMemory.verified}
                            onChange={(e) =>
                              setEditingMemory({
                                ...editingMemory,
                                verified: e.target.checked,
                              })
                            }
                            className="rounded border-zinc-300 text-zinc-900"
                          />
                          <span>Verified by Admin</span>
                        </label>
                        <div className="space-x-1.5">
                          <button
                            onClick={() => setEditingMemory(null)}
                            className="px-2 py-0.5 text-xs border border-zinc-200 rounded text-zinc-600"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            className="px-2.5 py-0.5 text-xs bg-zinc-950 text-white rounded font-medium"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-800 bg-zinc-50/60 p-2.5 rounded border border-zinc-100 leading-relaxed font-sans">
                      {mem.memoryText}
                    </p>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-[11px] text-zinc-400">
                    <span className="font-mono text-[10px]">
                      Confidence: {(mem.confidence * 100).toFixed(0)}%
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setEditingMemory({ ...mem })}
                        className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded"
                        title="Edit memory"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteMemory(mem.id)}
                        className="p-1 text-zinc-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                        title="Delete memory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedContactId !== 'all' && (
        <div className="pt-4 border-t border-zinc-200 flex justify-end">
          <button
            onClick={() => {
              if (confirm('Permanently delete all stored memories for this contact?')) {
                onClearContactMemories(selectedContactId);
              }
            }}
            className="text-xs text-rose-700 hover:text-rose-900 hover:bg-rose-50 px-3 py-1.5 rounded border border-rose-200 flex items-center space-x-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wipe All Memories for Selected Contact</span>
          </button>
        </div>
      )}
    </div>
  );
};
