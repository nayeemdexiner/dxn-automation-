import React, { useState, useEffect } from 'react';
import { Search, Globe, Copy, Check, ExternalLink, ShieldCheck, HelpCircle, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { Contact } from '../../types/index.ts';

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ResearchResult {
  id: string;
  query: string;
  targetUrl?: string;
  summary: string;
  facts: string[];
  inferences: string[];
  sources: ResearchSource[];
  draftReply: string;
  conductedAt: string;
}

interface ResearchViewProps {
  contacts: Contact[];
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export const ResearchView: React.FC<ResearchViewProps> = ({ contacts, authFetch }) => {
  const [query, setQuery] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [selectedContactPhone, setSelectedContactPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<ResearchResult | null>(null);
  const [history, setHistory] = useState<ResearchResult[]>([]);
  const [copiedDraft, setCopiedDraft] = useState(false);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const res = await authFetch('/api/research/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
        if (data.length > 0 && !currentResult) {
          setCurrentResult(data[0]);
        }
      }
    } catch (err) {
      console.warn('History load notice:', err);
    }
  };

  const handleRunResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() && !targetUrl.trim()) {
      setError('Please provide a research query topic or target URL.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const selectedContact = contacts.find((c) => c.phoneNumber === selectedContactPhone);

    try {
      const res = await authFetch('/api/research', {
        method: 'POST',
        body: JSON.stringify({
          query: query.trim(),
          targetUrl: targetUrl.trim() || undefined,
          senderName: selectedContact?.name,
          senderPhone: selectedContact?.phoneNumber,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Research request failed (${res.status})`);
      }

      const result: ResearchResult = await res.json();
      setCurrentResult(result);
      setHistory((prev) => [result, ...prev.filter((item) => item.id !== result.id)]);
      setQuery('');
      setTargetUrl('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyDraft = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-200 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-950 tracking-tight">Web Guide & Research</h1>
            <p className="text-xs text-zinc-500 mt-1">
              SSRF-protected web research engine with verified fact extraction, contextual inferences, and draft synthesis.
            </p>
          </div>
          <button
            onClick={loadHistory}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs font-mono font-medium border border-zinc-300 rounded hover:bg-zinc-100 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-600" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Query Form */}
      <div className="bg-white border border-zinc-200 rounded p-4 shadow-xs">
        <form onSubmit={handleRunResearch} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
                Research Topic or Question
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. CNC ArtCAM 3D relief toolpath rates or CNC spindle parameters"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-zinc-300 rounded focus:outline-hidden focus:border-zinc-900 font-sans"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">
                Target Web Page URL (Optional - Protected against SSRF)
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com/specs"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-zinc-300 rounded focus:outline-hidden focus:border-zinc-900 font-mono text-zinc-800"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono text-zinc-500">Target Contact Context:</span>
              <select
                value={selectedContactPhone}
                onChange={(e) => setSelectedContactPhone(e.target.value)}
                className="text-xs border border-zinc-300 rounded px-2 py-1 bg-white focus:outline-hidden focus:border-zinc-900"
              >
                <option value="">General (No specific contact)</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.phoneNumber}>
                    {c.name} ({c.phoneNumber})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={isLoading || (!query.trim() && !targetUrl.trim())}
              className="flex items-center justify-center space-x-2 px-4 py-2 bg-zinc-950 text-white text-xs font-medium rounded hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Research...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Execute Research</span>
                </>
              )}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Main Layout: Results & History */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Current Research Report */}
        <div className="lg:col-span-2 space-y-4">
          {currentResult ? (
            <div className="bg-white border border-zinc-200 rounded divide-y divide-zinc-200 shadow-xs">
              {/* Report Header */}
              <div className="p-4 bg-zinc-50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                    Research Report #{currentResult.id}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    {new Date(currentResult.conductedAt).toLocaleString()}
                  </span>
                </div>
                <h2 className="text-sm font-bold text-zinc-900 mt-1">
                  Query: &ldquo;{currentResult.query}&rdquo;
                </h2>
                {currentResult.targetUrl && (
                  <div className="mt-1 flex items-center space-x-1 text-xs text-zinc-600 font-mono">
                    <Globe className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{currentResult.targetUrl}</span>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="p-4 space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                  Executive Summary
                </div>
                <p className="text-xs text-zinc-800 leading-relaxed font-sans bg-zinc-50/60 p-3 rounded border border-zinc-100">
                  {currentResult.summary}
                </p>
              </div>

              {/* Facts vs Inferences Grid */}
              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Verified Facts */}
                <div className="border border-zinc-200 rounded p-3 bg-zinc-50/30">
                  <div className="flex items-center space-x-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-900 font-semibold mb-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-zinc-900" />
                    <span>Verified Facts</span>
                  </div>
                  <ul className="space-y-1.5">
                    {currentResult.facts.length === 0 ? (
                      <li className="text-xs text-zinc-400 italic">No explicit verified facts extracted.</li>
                    ) : (
                      currentResult.facts.map((fact, idx) => (
                        <li key={idx} className="text-xs text-zinc-700 flex items-start space-x-2">
                          <span className="text-zinc-400 font-mono text-[10px] mt-0.5">•</span>
                          <span>{fact}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                {/* Inferences */}
                <div className="border border-zinc-200 rounded p-3 bg-zinc-50/30">
                  <div className="flex items-center space-x-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-900 font-semibold mb-2">
                    <HelpCircle className="w-3.5 h-3.5 text-zinc-700" />
                    <span>Inferences & Logic</span>
                  </div>
                  <ul className="space-y-1.5">
                    {currentResult.inferences.length === 0 ? (
                      <li className="text-xs text-zinc-400 italic">No contextual inferences drawn.</li>
                    ) : (
                      currentResult.inferences.map((inf, idx) => (
                        <li key={idx} className="text-xs text-zinc-700 flex items-start space-x-2">
                          <span className="text-zinc-400 font-mono text-[10px] mt-0.5">•</span>
                          <span>{inf}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>

              {/* Ready-to-Send WhatsApp Draft */}
              <div className="p-4 space-y-2 bg-zinc-50/80">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-700 font-semibold">
                    Synthesized WhatsApp Draft Reply
                  </div>
                  <button
                    onClick={() => handleCopyDraft(currentResult.draftReply)}
                    className="flex items-center space-x-1 text-xs px-2.5 py-1 bg-white border border-zinc-300 rounded hover:bg-zinc-100 transition-colors font-mono"
                  >
                    {copiedDraft ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-zinc-900" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-zinc-600" />
                        <span>Copy Draft</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="p-3 bg-white border border-zinc-300 rounded text-xs text-zinc-900 font-sans leading-relaxed">
                  {currentResult.draftReply}
                </div>
              </div>

              {/* Sources & Citations */}
              <div className="p-4 space-y-2">
                <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                  Citations & Sources ({currentResult.sources.length})
                </div>
                <div className="space-y-2">
                  {currentResult.sources.map((src, idx) => (
                    <div key={idx} className="p-2.5 border border-zinc-200 rounded text-xs bg-zinc-50/30">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-900">{src.title}</span>
                        {src.url.startsWith('http') && (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-zinc-500 hover:text-zinc-950 flex items-center space-x-1"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">{src.url}</div>
                      <p className="text-[11px] text-zinc-600 mt-1 line-clamp-2">{src.snippet}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center border border-dashed border-zinc-300 rounded bg-zinc-50/50">
              <Search className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-xs text-zinc-500 font-medium">No research query conducted yet.</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Enter a topic, question, or public URL above to extract verified facts and synthesize a WhatsApp draft.
              </p>
            </div>
          )}
        </div>

        {/* Right Col: Recent Research History */}
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded p-4 shadow-xs">
            <h3 className="text-xs font-bold text-zinc-950 tracking-tight uppercase font-mono mb-3">
              Research History ({history.length})
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No past sessions recorded.</p>
            ) : (
              <div className="space-y-2">
                {history.map((item) => {
                  const isSelected = currentResult?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setCurrentResult(item)}
                      className={`w-full text-left p-2.5 rounded border transition-colors ${
                        isSelected
                          ? 'border-zinc-950 bg-zinc-50'
                          : 'border-zinc-200 hover:border-zinc-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-zinc-400">
                          {new Date(item.conductedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <ArrowRight className="w-3 h-3 text-zinc-400" />
                      </div>
                      <div className="text-xs font-medium text-zinc-900 truncate mt-1">{item.query}</div>
                      <div className="text-[10px] text-zinc-500 truncate mt-0.5">{item.summary}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Tip Box */}
          <div className="border border-zinc-200 rounded p-3 bg-zinc-50 text-[11px] text-zinc-600 space-y-1">
            <div className="font-mono uppercase font-semibold text-zinc-800">Security & SSRF Guard</div>
            <p>
              External web fetch requests are strictly filtered against loopback, private IPv4/IPv6, and internal subnets.
              All research output clearly differentiates verified statements from inferences.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
