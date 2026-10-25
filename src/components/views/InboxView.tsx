import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Send,
  User,
  Clock,
  Phone,
  Tag,
  Brain,
  ShieldCheck,
  ShieldAlert,
  PauseCircle,
  PlayCircle,
  Sparkles,
  RefreshCw,
  Check,
  CheckCheck,
  AlertCircle,
  Info,
  ChevronRight,
  Plus,
  X,
  MessageSquare,
  Sliders,
} from 'lucide-react';
import {
  Contact,
  ContactMode,
  Message,
  ContactMemory,
  ConversationInsights,
} from '../../types/index.ts';

interface InboxViewProps {
  contacts: Contact[];
  messages: Message[];
  memories: ContactMemory[];
  token?: string | null;
  onSendMessage: (contactId: string, text: string) => Promise<any>;
  onUpdateContactMode?: (contactId: string, mode: ContactMode) => Promise<void>;
  onMarkContactRead?: (contactId: string) => Promise<void>;
  onAddMemory: (contactId: string, text: string) => Promise<void>;
}

type FilterTab = 'all' | 'unread' | 'takeover' | 'approval';

export const InboxView: React.FC<InboxViewProps> = ({
  contacts,
  messages,
  memories,
  token,
  onSendMessage,
  onUpdateContactMode,
  onMarkContactRead,
  onAddMemory,
}) => {
  const [selectedContactId, setSelectedContactId] = useState<string>(() => contacts[0]?.id || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccessInfo, setSendSuccessInfo] = useState<string | null>(null);

  // Insights State
  const [insights, setInsights] = useState<ConversationInsights | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [showInsightsDrawer, setShowInsightsDrawer] = useState(false);

  // Memory adding state
  const [newMemoryText, setNewMemoryText] = useState('');
  const [isAddingMemory, setIsAddingMemory] = useState(false);

  // Auto-scroll chat bottom
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Update selected contact if list updates and selection is missing
  useEffect(() => {
    if (!selectedContactId && contacts.length > 0) {
      setSelectedContactId(contacts[0].id);
    }
  }, [contacts, selectedContactId]);

  const selectedContact = contacts.find((c) => c.id === selectedContactId) || contacts[0];

  // Scroll to bottom on new messages or contact switch
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [selectedContactId, messages]);

  // Mark contact as read when selected
  useEffect(() => {
    if (selectedContact && (selectedContact.unreadCount || 0) > 0 && onMarkContactRead) {
      onMarkContactRead(selectedContact.id).catch(console.error);
    }
  }, [selectedContact?.id, onMarkContactRead]);

  // Filter contacts
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        c.name.toLowerCase().includes(q) ||
        c.phoneNumber.includes(q) ||
        (c.notes && c.notes.toLowerCase().includes(q));

      if (!matchSearch) return false;

      if (filterTab === 'unread') {
        return (c.unreadCount || 0) > 0;
      }
      if (filterTab === 'takeover') {
        return c.mode === 'human_takeover';
      }
      if (filterTab === 'approval') {
        return c.mode === 'approval_required';
      }
      return true;
    });
  }, [contacts, searchTerm, filterTab]);

  const contactMessages = useMemo(() => {
    if (!selectedContact) return [];
    return messages
      .filter((m) => m.contactId === selectedContact.id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, selectedContact]);

  const contactMemories = useMemo(() => {
    if (!selectedContact) return [];
    return memories.filter((m) => m.contactId === selectedContact.id);
  }, [memories, selectedContact]);

  // WhatsApp 24-hour customer window calculation
  const windowStatus = useMemo(() => {
    if (!selectedContact?.lastInboundAt) {
      return { isWithin: true, remainingText: 'Session Open' };
    }
    const lastTime = new Date(selectedContact.lastInboundAt).getTime();
    const now = Date.now();
    const diffMs = now - lastTime;
    const windowMs = 24 * 60 * 60 * 1000;
    const isWithin = diffMs <= windowMs;

    if (!isWithin) {
      return { isWithin: false, remainingText: 'Window Expired' };
    }
    const remainingHours = Math.floor((windowMs - diffMs) / (60 * 60 * 1000));
    const remainingMinutes = Math.floor(((windowMs - diffMs) % (60 * 60 * 1000)) / (60 * 1000));
    return {
      isWithin: true,
      remainingText: `${remainingHours}h ${remainingMinutes}m remaining`,
    };
  }, [selectedContact?.lastInboundAt]);

  // Fetch Insights when requested
  const handleLoadInsights = async () => {
    if (!selectedContact) return;
    setIsLoadingInsights(true);
    try {
      const res = await fetch(`/api/contacts/${selectedContact.id}/insights`, {
        headers: {
          Authorization: `Bearer ${token || localStorage.getItem('nayeem_desk_token')}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setInsights(data);
        setShowInsightsDrawer(true);
      }
    } catch (err) {
      console.warn('Failed to load insights:', err);
    } finally {
      setIsLoadingInsights(false);
    }
  };

  // Generate context-aware draft and insert into composer
  const handleGenerateDraft = async () => {
    if (!selectedContact) return;
    setIsGeneratingDraft(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/contacts/${selectedContact.id}/draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('nayeem_desk_token')}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          setReplyText(data.draft);
        }
      }
    } catch (err) {
      console.warn('Failed to generate draft:', err);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  // Handle Mode Change (Auto, Approval, Takeover)
  const handleModeChange = async (newMode: ContactMode) => {
    if (!selectedContact || !onUpdateContactMode) return;
    try {
      await onUpdateContactMode(selectedContact.id, newMode);
    } catch (err) {
      console.error('Mode update error:', err);
    }
  };

  // Handle Manual Message Send
  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || !selectedContact || isSending) return;

    setIsSending(true);
    setSendError(null);
    setSendSuccessInfo(null);

    try {
      const result = await onSendMessage(selectedContact.id, replyText.trim());
      if (result?.sendResult?.success === false) {
        setSendError(result.sendResult.error || 'Meta WhatsApp Graph API rejected message');
      } else {
        setReplyText('');
        setSendSuccessInfo(
          result?.sendResult?.mode === 'simulated'
            ? 'Saved in simulated test mode (Live credentials not configured)'
            : 'Message accepted by Meta WhatsApp Cloud API'
        );
        setTimeout(() => setSendSuccessInfo(null), 4000);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSendError(`Failed to send: ${msg}`);
    } finally {
      setIsSending(false);
    }
  };

  // Save new contact factual memory
  const handleAddMemorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryText.trim() || !selectedContact) return;
    try {
      await onAddMemory(selectedContact.id, newMemoryText.trim());
      setNewMemoryText('');
      setIsAddingMemory(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Count unread contacts
  const totalUnreadCount = useMemo(() => {
    return contacts.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  }, [contacts]);

  return (
    <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden flex flex-col md:flex-row h-[calc(100vh-130px)] min-h-[580px] shadow-xs">
      {/* ==================================================== */}
      {/* 1. LEFT COLUMN: CONTACT DIRECTORY & REAL-TIME LIST */}
      {/* ==================================================== */}
      <div className="w-full md:w-80 lg:w-88 border-b md:border-b-0 md:border-r border-zinc-200 flex flex-col bg-zinc-50/50 shrink-0">
        {/* Search Header */}
        <div className="p-3 border-b border-zinc-200 bg-white space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search contacts or messages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded focus:outline-hidden focus:ring-1 focus:ring-zinc-900 focus:bg-white"
            />
          </div>

          {/* Filter Tabs */}
          <div className="grid grid-cols-4 gap-1 text-[11px] font-mono">
            <button
              onClick={() => setFilterTab('all')}
              className={`py-1 text-center rounded transition-colors ${
                filterTab === 'all'
                  ? 'bg-zinc-950 text-white font-medium'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              All ({contacts.length})
            </button>
            <button
              onClick={() => setFilterTab('unread')}
              className={`py-1 text-center rounded transition-colors relative ${
                filterTab === 'unread'
                  ? 'bg-zinc-950 text-white font-medium'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Unread
              {totalUnreadCount > 0 && (
                <span className="ml-1 px-1 bg-amber-500 text-white rounded-full text-[9px]">
                  {totalUnreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterTab('takeover')}
              className={`py-1 text-center rounded transition-colors ${
                filterTab === 'takeover'
                  ? 'bg-zinc-950 text-white font-medium'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Takeover
            </button>
            <button
              onClick={() => setFilterTab('approval')}
              className={`py-1 text-center rounded transition-colors ${
                filterTab === 'approval'
                  ? 'bg-zinc-950 text-white font-medium'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
              }`}
            >
              Approval
            </button>
          </div>
        </div>

        {/* Contact List */}
        <div className="overflow-y-auto flex-1 divide-y divide-zinc-100">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-zinc-400">
              No contacts found matching filter.
            </div>
          ) : (
            filteredContacts.map((c) => {
              const isSelected = c.id === selectedContact?.id;
              const contactMsgs = messages.filter((m) => m.contactId === c.id);
              const lastMsg = contactMsgs.slice(-1)[0];
              const mode = c.mode || 'auto_reply';
              const unread = c.unreadCount || 0;

              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedContactId(c.id)}
                  className={`w-full text-left p-3 transition-colors flex items-start justify-between relative ${
                    isSelected
                      ? 'bg-zinc-100/90 border-l-3 border-l-zinc-950'
                      : 'hover:bg-zinc-100/50'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-semibold text-zinc-900 truncate flex items-center space-x-1.5">
                        <span>{c.name}</span>
                        {unread > 0 && (
                          <span className="px-1.5 py-0.2 bg-red-600 text-white font-mono text-[9px] rounded-full">
                            {unread}
                          </span>
                        )}
                      </span>
                      {lastMsg && (
                        <span className="text-[10px] text-zinc-400 font-mono shrink-0 ml-1">
                          {new Date(lastMsg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-zinc-500 font-mono mb-1">
                      {c.phoneNumber}
                    </div>

                    {lastMsg ? (
                      <p className="text-[11px] text-zinc-600 truncate flex items-center space-x-1">
                        {lastMsg.direction === 'outbound' ? (
                          <span className="text-zinc-400 font-medium shrink-0">You: </span>
                        ) : null}
                        <span className="truncate">{lastMsg.content}</span>
                      </p>
                    ) : (
                      <p className="text-[11px] text-zinc-400 italic">No message history yet</p>
                    )}

                    <div className="flex items-center space-x-1.5 mt-1.5">
                      {/* Mode Badge */}
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                          mode === 'human_takeover'
                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : mode === 'approval_required'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {mode === 'human_takeover'
                          ? 'Takeover'
                          : mode === 'approval_required'
                          ? 'Approval'
                          : 'Auto AI'}
                      </span>

                      {c.tags.slice(0, 1).map((tag) => (
                        <span
                          key={tag}
                          className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-zinc-200/70 text-zinc-600 truncate max-w-[100px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* 2. CENTER & RIGHT: CHAT THREAD & DETAILS */}
      {/* ==================================================== */}
      {selectedContact ? (
        <div className="flex-1 flex flex-col lg:flex-row min-w-0 bg-white">
          {/* Main Chat Thread */}
          <div className="flex-1 flex flex-col min-w-0 border-b lg:border-b-0 lg:border-r border-zinc-200">
            {/* Header: Identity, Mode Switcher, and 24h Window Status */}
            <div className="p-3 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2 bg-zinc-50/70">
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  {selectedContact.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-zinc-900 truncate flex items-center space-x-2">
                    <span>{selectedContact.name}</span>
                    <span className="text-[10px] text-zinc-400 font-mono font-normal">
                      ({selectedContact.phoneNumber})
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] text-zinc-500 font-mono">
                    <span>Channel: {selectedContact.channel}</span>
                    <span>·</span>
                    <span
                      className={`inline-flex items-center space-x-1 ${
                        windowStatus.isWithin ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      <span>{windowStatus.remainingText}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Header Actions: Mode Selector & Insights Toggle */}
              <div className="flex items-center space-x-2">
                {/* Per-Contact Mode Switcher */}
                <div className="flex items-center bg-zinc-100 border border-zinc-200 rounded p-0.5 text-[10px] font-mono">
                  <button
                    onClick={() => handleModeChange('auto_reply')}
                    title="AI Auto-Reply: Low-risk FAQ and verified profile inquiries answered automatically"
                    className={`px-2 py-0.5 rounded transition-colors ${
                      (selectedContact.mode || 'auto_reply') === 'auto_reply'
                        ? 'bg-white shadow-2xs text-emerald-800 font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    ⚡ Auto
                  </button>
                  <button
                    onClick={() => handleModeChange('approval_required')}
                    title="Approval Required: AI drafts proposed responses but requires admin approval before sending"
                    className={`px-2 py-0.5 rounded transition-colors ${
                      selectedContact.mode === 'approval_required'
                        ? 'bg-white shadow-2xs text-amber-800 font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    🛡️ Approval
                  </button>
                  <button
                    onClick={() => handleModeChange('human_takeover')}
                    title="Human Takeover: AI auto-replies completely paused for this contact until resumed"
                    className={`px-2 py-0.5 rounded transition-colors ${
                      selectedContact.mode === 'human_takeover'
                        ? 'bg-white shadow-2xs text-rose-800 font-semibold'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    🛑 Takeover
                  </button>
                </div>

                {/* Insights Drawer Button */}
                <button
                  onClick={handleLoadInsights}
                  disabled={isLoadingInsights}
                  className="px-2.5 py-1 bg-white hover:bg-zinc-50 border border-zinc-200 text-zinc-700 text-[11px] font-mono rounded flex items-center space-x-1 transition-colors"
                >
                  <Sparkles className="w-3 h-3 text-zinc-600" />
                  <span className="hidden sm:inline">Insights & Draft</span>
                </button>
              </div>
            </div>

            {/* Messaging Window Notice if Outside 24h */}
            {!windowStatus.isWithin && (
              <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 text-[11px] text-amber-800 flex items-center space-x-1.5 font-sans">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>
                  <b>Meta 24-Hour Policy Notice:</b> Outside customer service window. Freeform
                  messages may be rejected by Meta unless an approved template is used or the customer
                  replies.
                </span>
              </div>
            )}

            {/* Takeover Active Banner */}
            {selectedContact.mode === 'human_takeover' && (
              <div className="bg-rose-50 border-b border-rose-200 px-3 py-1.5 text-[11px] text-rose-800 flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <PauseCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>
                    <b>Human Takeover Active:</b> AI auto-reply is paused for this contact.
                  </span>
                </span>
                <button
                  onClick={() => handleModeChange('auto_reply')}
                  className="underline text-[10px] font-mono hover:text-rose-950"
                >
                  Resume AI
                </button>
              </div>
            )}

            {/* Message Stream */}
            <div
              ref={chatScrollRef}
              className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-zinc-50/30"
            >
              {contactMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-zinc-400 text-xs space-y-1">
                  <MessageSquare className="w-6 h-6 text-zinc-300" />
                  <p>No conversation history yet with {selectedContact.name}.</p>
                  <p className="text-[11px]">Send a manual message below or simulate an inbound message.</p>
                </div>
              ) : (
                contactMessages.map((m) => {
                  const isInbound = m.direction === 'inbound';
                  const isFailed = m.status === 'failed' || m.deliveryStatus === 'failed';

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg p-3 text-xs shadow-2xs border ${
                          isInbound
                            ? 'bg-white border-zinc-200 text-zinc-900'
                            : isFailed
                            ? 'bg-rose-950 border-rose-900 text-white'
                            : 'bg-zinc-950 border-zinc-950 text-white'
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed select-text">{m.content}</p>

                        {/* Error info if failed */}
                        {isFailed && m.failureReason && (
                          <div className="mt-2 pt-1.5 border-t border-rose-800 text-[10px] text-rose-200 flex items-start space-x-1">
                            <AlertCircle className="w-3 h-3 text-rose-300 shrink-0 mt-0.5" />
                            <span>Delivery Error: {m.failureReason}</span>
                          </div>
                        )}
                      </div>

                      {/* Metadata bar below message */}
                      <div className="flex items-center space-x-1.5 mt-1 text-[10px] font-mono text-zinc-400 px-1">
                        <span>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>

                        {/* Source label */}
                        {m.source && (
                          <>
                            <span>·</span>
                            <span className="capitalize">
                              {m.source === 'manual_web'
                                ? 'Manual (Web)'
                                : m.source === 'manual_telegram'
                                ? 'Manual (Telegram)'
                                : m.source === 'ai_auto_reply'
                                ? 'AI Auto-Reply'
                                : m.source === 'pending_approval'
                                ? 'Approved Draft'
                                : 'Inbound'}
                            </span>
                          </>
                        )}

                        {/* Category label */}
                        {m.category && (
                          <>
                            <span>·</span>
                            <span className="uppercase text-[9px]">
                              {m.category.replace('_', ' ')}
                            </span>
                          </>
                        )}

                        {/* Outbound Delivery Status Ticks */}
                        {!isInbound && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center space-x-0.5">
                              {m.deliveryStatus === 'read' ? (
                                <span className="text-emerald-600 flex items-center space-x-0.5 font-bold" title="Read by recipient">
                                  <CheckCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Read</span>
                                </span>
                              ) : m.deliveryStatus === 'delivered' ? (
                                <span className="text-zinc-600 flex items-center space-x-0.5" title="Delivered to recipient device">
                                  <CheckCheck className="w-3 h-3 text-zinc-600" />
                                  <span>Delivered</span>
                                </span>
                              ) : m.deliveryStatus === 'sent' || m.status === 'sent' ? (
                                <span className="text-zinc-500 flex items-center space-x-0.5" title="Accepted by Meta WhatsApp Server">
                                  <Check className="w-3 h-3 text-zinc-500" />
                                  <span>Sent</span>
                                </span>
                              ) : (
                                <span className="text-rose-600 flex items-center space-x-0.5 font-semibold" title="Send Failed">
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  <span>Failed</span>
                                </span>
                              )}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Error or Success notification banner above composer */}
            {sendError && (
              <div className="bg-rose-50 border-t border-rose-200 p-2 text-xs text-rose-800 flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{sendError}</span>
                </div>
                <button onClick={() => setSendError(null)} className="text-rose-500 hover:text-rose-800">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {sendSuccessInfo && (
              <div className="bg-emerald-50 border-t border-emerald-200 p-2 text-xs text-emerald-800 flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{sendSuccessInfo}</span>
                </div>
              </div>
            )}

            {/* WhatsApp Manual Reply Composer */}
            <form
              onSubmit={handleSend}
              className="p-3 border-t border-zinc-200 bg-white flex flex-col space-y-2"
            >
              <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                <span className="flex items-center space-x-1">
                  <span>Send WhatsApp message to</span>
                  <b className="text-zinc-800">{selectedContact.name}</b>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={isGeneratingDraft}
                    className="text-zinc-700 hover:text-zinc-950 font-medium flex items-center space-x-1 transition-colors"
                  >
                    <Sparkles className="w-3 h-3 text-zinc-500" />
                    <span>{isGeneratingDraft ? 'Drafting...' : 'AI Draft'}</span>
                  </button>
                  {replyText && (
                    <button
                      type="button"
                      onClick={() => setReplyText('')}
                      className="text-zinc-400 hover:text-zinc-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-end space-x-2">
                <textarea
                  rows={2}
                  placeholder={`Type custom reply to ${selectedContact.name} (Press Cmd+Enter or click Send)...`}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="flex-1 text-xs px-3 py-2 border border-zinc-300 rounded focus:outline-hidden focus:ring-1 focus:ring-zinc-900 resize-none font-sans"
                />
                <button
                  type="submit"
                  disabled={isSending || !replyText.trim()}
                  className="px-4 py-2.5 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-40 text-white text-xs font-semibold rounded flex items-center space-x-1.5 transition-colors shrink-0"
                >
                  {isSending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right Inspector: Details, Conversation Insights & Memory */}
          <div className="w-full lg:w-80 p-4 bg-zinc-50/50 overflow-y-auto space-y-4 shrink-0">
            {/* Conversation Insights Drawer / Card */}
            {showInsightsDrawer && insights && (
              <div className="bg-white border border-zinc-300 rounded-lg p-3 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-zinc-100">
                  <div className="text-[11px] font-bold text-zinc-900 flex items-center space-x-1">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-700" />
                    <span>Conversation Insights</span>
                  </div>
                  <button
                    onClick={() => setShowInsightsDrawer(false)}
                    className="text-zinc-400 hover:text-zinc-700"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-zinc-400">
                    Current Topic
                  </span>
                  <div className="text-xs font-medium text-zinc-800 bg-zinc-50 p-1.5 rounded border border-zinc-200 mt-0.5">
                    {insights.currentTopic}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-zinc-400">
                    User Intent
                  </span>
                  <p className="text-[11px] text-zinc-700 mt-0.5">{insights.userIntent}</p>
                </div>

                {insights.unansweredQuestions.length > 0 && (
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-amber-700">
                      Unresolved Inquiries ({insights.unansweredQuestions.length})
                    </span>
                    <ul className="list-disc list-inside text-[11px] text-zinc-700 mt-0.5 space-y-0.5">
                      {insights.unansweredQuestions.map((q, idx) => (
                        <li key={idx} className="truncate">{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-zinc-400">
                    Context Summary
                  </span>
                  <p className="text-[11px] text-zinc-600 italic mt-0.5">
                    {insights.previousContextSummary}
                  </p>
                </div>

                {insights.suggestedDraftReply && (
                  <div className="pt-2 border-t border-zinc-100">
                    <span className="text-[10px] uppercase font-mono tracking-wider font-semibold text-zinc-700">
                      Proposed Context Reply
                    </span>
                    <div className="bg-zinc-100 p-2 rounded text-[11px] text-zinc-800 my-1 leading-relaxed">
                      "{insights.suggestedDraftReply}"
                    </div>
                    <button
                      onClick={() => setReplyText(insights.suggestedDraftReply)}
                      className="w-full text-center py-1 bg-zinc-950 text-white rounded text-[10px] font-mono hover:bg-zinc-800 transition-colors"
                    >
                      Insert into Reply Box
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Contact Profile & Metadata */}
            <div>
              <div className="text-[10px] uppercase font-mono tracking-wider font-semibold text-zinc-400 mb-2">
                Contact Profile & Context
              </div>
              <div className="bg-white p-3 rounded border border-zinc-200 space-y-2 text-xs">
                <div>
                  <span className="text-zinc-500 text-[11px]">Notes: </span>
                  <span className="text-zinc-800">{selectedContact.notes || 'No notes added'}</span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[11px]">Language: </span>
                  <span className="text-zinc-800 font-mono text-[11px]">
                    {selectedContact.preferredLanguage.toUpperCase()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 text-[11px]">Tags: </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedContact.tags.map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 text-zinc-700 border border-zinc-200"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Long-Term Memory Section */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase font-mono tracking-wider font-semibold text-zinc-400 flex items-center space-x-1">
                  <Brain className="w-3 h-3 text-zinc-600" />
                  <span>Stored Memory ({contactMemories.length})</span>
                </div>
                <button
                  onClick={() => setIsAddingMemory(!isAddingMemory)}
                  className="text-[10px] text-zinc-600 hover:text-zinc-950 flex items-center space-x-0.5 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              </div>

              {isAddingMemory && (
                <form onSubmit={handleAddMemorySubmit} className="mb-2 space-y-1.5">
                  <input
                    type="text"
                    placeholder="Enter factual preference..."
                    value={newMemoryText}
                    onChange={(e) => setNewMemoryText(e.target.value)}
                    className="w-full text-xs p-1.5 border border-zinc-300 rounded bg-white font-sans"
                  />
                  <div className="flex justify-end space-x-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingMemory(false)}
                      className="text-[10px] px-2 py-0.5 border border-zinc-200 rounded text-zinc-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="text-[10px] px-2 py-0.5 bg-zinc-950 text-white rounded font-medium"
                    >
                      Save Memory
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-2">
                {contactMemories.length === 0 ? (
                  <div className="p-3 bg-white border border-zinc-200 rounded text-[11px] text-zinc-400 text-center">
                    No memories recorded for this contact yet.
                  </div>
                ) : (
                  contactMemories.map((mem) => (
                    <div
                      key={mem.id}
                      className="p-2.5 bg-white border border-zinc-200 rounded text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span
                          className={`px-1 rounded uppercase ${
                            mem.memoryType === 'user_stated'
                              ? 'bg-zinc-100 text-zinc-800'
                              : 'bg-zinc-50 text-zinc-600 italic'
                          }`}
                        >
                          {mem.memoryType.replace('_', ' ')}
                        </span>
                        <span className="text-zinc-400">
                          {(mem.confidence * 100).toFixed(0)}% conf
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-700 leading-snug">
                        {mem.memoryText}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-8 text-zinc-400 text-xs">
          Select a contact to view conversation history.
        </div>
      )}
    </div>
  );
};
