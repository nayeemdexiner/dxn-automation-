import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Search,
  FileSpreadsheet,
  FileText,
  Globe,
  Upload,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Check,
  CheckCheck,
} from 'lucide-react';
import { KnowledgeItem, KnowledgeCategory, WebsitePageSource, WebsiteSyncStatus, FAQImportPreviewItem } from '../../types/index.ts';

interface KnowledgeBaseViewProps {
  items: KnowledgeItem[];
  onSaveItem: (item: Partial<KnowledgeItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onResetDefaults: () => Promise<void>;
  authFetch?: (url: string, options?: RequestInit) => Promise<Response>;
  onRefreshKnowledge?: () => Promise<void>;
}

type ActiveSection = 'repository' | 'sheets' | 'batch' | 'website';

export const KnowledgeBaseView: React.FC<KnowledgeBaseViewProps> = ({
  items,
  onSaveItem,
  onDeleteItem,
  onResetDefaults,
  authFetch,
  onRefreshKnowledge,
}) => {
  const [activeSection, setActiveSection] = useState<ActiveSection>('repository');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<Partial<KnowledgeItem> | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Google Sheets state
  const [sheetsUrl, setSheetsUrl] = useState('');
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsPreview, setSheetsPreview] = useState<FAQImportPreviewItem[] | null>(null);
  const [sheetsError, setSheetsError] = useState<string | null>(null);
  const [sheetsSuccess, setSheetsSuccess] = useState<string | null>(null);
  const [overwriteSheets, setOverwriteSheets] = useState(true);

  // Batch / File state
  const [batchText, setBatchText] = useState(
`Question: What CNC software and tools do you use?
Answer: I work with AutoCAD, ArtCAM, Vectric Aspire, VCarve, and Fusion 360 for precision 2D DXF blueprints and 3D relief toolpaths.
Category: Technical

Question: What are your rates for CNC 3D wood carving design?
Answer: Pricing depends on door dimensions, relief depth, and design complexity. Please share project specifications for an accurate quotation.
Category: Pricing`
  );
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchPreview, setBatchPreview] = useState<FAQImportPreviewItem[] | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSuccess, setBatchSuccess] = useState<string | null>(null);

  // Website Sync state
  const [syncStatus, setSyncStatus] = useState<WebsiteSyncStatus | null>(null);
  const [pageSources, setPageSources] = useState<WebsitePageSource[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  // Load Website Sync data when visiting that section
  useEffect(() => {
    if (activeSection === 'website') {
      loadWebsiteSyncData();
    }
  }, [activeSection]);

  const loadWebsiteSyncData = async () => {
    if (!authFetch) return;
    try {
      const [resStatus, resPages] = await Promise.all([
        authFetch('/api/website-sync/status'),
        authFetch('/api/website-sync/pages'),
      ]);
      if (resStatus.ok) {
        setSyncStatus(await resStatus.json());
      }
      if (resPages.ok) {
        setPageSources(await resPages.json());
      }
    } catch (err) {
      console.warn('Failed to load website sync data:', err);
    }
  };

  const handleRunWebsiteSync = async () => {
    if (!authFetch) return;
    setSyncLoading(true);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const res = await authFetch('/api/website-sync/run', {
        method: 'POST',
        body: JSON.stringify({ url: 'https://muhammadnayeem.qzz.io' }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Website synchronization failed');
      }
      setSyncSuccess(`Synchronization complete: ${data.result.scannedCount} pages checked, ${data.result.discoveredCount} new, ${data.result.changedCount} changed.`);
      await loadWebsiteSyncData();
      if (onRefreshKnowledge) await onRefreshKnowledge();
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncLoading(false);
    }
  };

  const handleApprovePage = async (pageId: string) => {
    if (!authFetch) return;
    try {
      const res = await authFetch('/api/website-sync/approve', {
        method: 'POST',
        body: JSON.stringify({ pageId, category: 'profile' }),
      });
      if (res.ok) {
        await loadWebsiteSyncData();
        if (onRefreshKnowledge) await onRefreshKnowledge();
      }
    } catch (err) {
      console.warn('Approve page error:', err);
    }
  };

  const handleRejectPage = async (pageId: string) => {
    if (!authFetch) return;
    try {
      const res = await authFetch('/api/website-sync/reject', {
        method: 'POST',
        body: JSON.stringify({ pageId }),
      });
      if (res.ok) {
        await loadWebsiteSyncData();
      }
    } catch (err) {
      console.warn('Reject page error:', err);
    }
  };

  // Google Sheets preview & import
  const handleSheetsPreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetsUrl.trim()) return;
    setSheetsLoading(true);
    setSheetsError(null);
    setSheetsSuccess(null);

    try {
      const res = await (authFetch || fetch)('/api/faq/import-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl: sheetsUrl.trim(), preview: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to preview Google Sheet');
      setSheetsPreview(data.items);
    } catch (err: unknown) {
      setSheetsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSheetsLoading(false);
    }
  };

  const handleCommitSheets = async () => {
    if (!sheetsPreview || sheetsPreview.length === 0) return;
    setSheetsLoading(true);
    setSheetsError(null);
    try {
      const res = await (authFetch || fetch)('/api/faq/commit-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: sheetsPreview, overwrite: overwriteSheets }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import FAQ items');
      setSheetsSuccess(`Imported ${data.importedCount} new entries, updated ${data.updatedCount} existing entries.`);
      setSheetsPreview(null);
      setSheetsUrl('');
      if (onRefreshKnowledge) await onRefreshKnowledge();
    } catch (err: unknown) {
      setSheetsError(err instanceof Error ? err.message : String(err));
    } finally {
      setSheetsLoading(false);
    }
  };

  // Batch text parsing & commit
  const handleParseBatchText = async () => {
    if (!batchText.trim()) return;
    setBatchLoading(true);
    setBatchError(null);
    try {
      const res = await (authFetch || fetch)('/api/faq/parse-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: batchText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse batch text');
      setBatchPreview(data.items);
    } catch (err: unknown) {
      setBatchError(err instanceof Error ? err.message : String(err));
    } finally {
      setBatchLoading(false);
    }
  };

  const handleCommitBatch = async () => {
    if (!batchPreview || batchPreview.length === 0) return;
    setBatchLoading(true);
    setBatchError(null);
    try {
      const res = await (authFetch || fetch)('/api/faq/commit-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: batchPreview, overwrite: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to commit batch FAQ items');
      setBatchSuccess(`Successfully saved ${data.importedCount + data.updatedCount} entries to Knowledge Base.`);
      setBatchPreview(null);
      if (onRefreshKnowledge) await onRefreshKnowledge();
    } catch (err: unknown) {
      setBatchError(err instanceof Error ? err.message : String(err));
    } finally {
      setBatchLoading(false);
    }
  };

  // File upload parser (CSV / JSON)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      if (file.name.endsWith('.json')) {
        try {
          const parsed = JSON.parse(content);
          const rawItems = Array.isArray(parsed) ? parsed : parsed.items || [];
          const normalized: FAQImportPreviewItem[] = rawItems.map((r: any) => ({
            key: r.key || `faq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            question: r.question || r.title || '',
            answer: r.answer || r.content || '',
            category: r.category || 'general',
            tags: r.tags || [],
            isDuplicate: items.some((i) => i.title.toLowerCase() === (r.question || r.title || '').toLowerCase()),
          }));
          setBatchPreview(normalized.filter((n) => n.question && n.answer));
        } catch {
          setBatchError('Invalid JSON format.');
        }
      } else {
        // Treat as CSV text
        try {
          const res = await (authFetch || fetch)('/api/faq/parse-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: content }),
          });
          const data = await res.json();
          if (res.ok && data.items) {
            setBatchPreview(data.items);
          }
        } catch (err: unknown) {
          setBatchError(err instanceof Error ? err.message : 'Failed to parse CSV file');
        }
      }
    };
    reader.readAsText(file);
  };

  // Primary categories
  const primaryCategories = [
    { id: 'all', label: 'All Items', description: 'Complete knowledge repository' },
    { id: 'general', label: 'General', description: 'Identity, bio, education, location, family & persona' },
    { id: 'technical', label: 'Technical', description: 'CNC programming, ArtCAM/CAD/CAM, 3D relief, Web dev & bots' },
    { id: 'pricing', label: 'Pricing', description: 'Wood carving rates, estimates, quotation rules & delivery SLAs' },
  ];

  const isItemInCategory = (item: KnowledgeItem, categoryId: string): boolean => {
    if (categoryId === 'all') return true;
    if (categoryId === 'general') {
      return (
        item.category === 'general' ||
        item.category === 'profile' ||
        item.category === 'education' ||
        item.category === 'social' ||
        item.category === 'policy'
      );
    }
    if (categoryId === 'technical') {
      return (
        item.category === 'technical' ||
        item.category === 'service' ||
        item.category === 'skill' ||
        item.category === 'project'
      );
    }
    if (categoryId === 'pricing') {
      return (
        item.category === 'pricing' ||
        item.key.includes('price') ||
        item.key.includes('rate') ||
        item.key.includes('cost') ||
        item.category === 'faq'
      );
    }
    return item.category === categoryId;
  };

  const getCategoryCount = (catId: string): number => {
    return items.filter((item) => isItemInCategory(item, catId)).length;
  };

  const filteredItems = items.filter((item) => {
    const matchesCat = isItemInCategory(item, selectedCategory);
    const matchesSearch =
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.key.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const handleEditClick = (item: KnowledgeItem) => {
    setEditingItem({ ...item });
  };

  const handleNewClick = () => {
    setEditingItem({
      key: `custom_${Date.now()}`,
      category: ['general', 'technical', 'pricing'].includes(selectedCategory)
        ? (selectedCategory as KnowledgeCategory)
        : 'general',
      title: '',
      content: '',
      verified: true,
    });
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.title || !editingItem.content) return;
    await onSaveItem(editingItem);
    setEditingItem(null);
  };

  const handleReset = async () => {
    if (confirm('Reset knowledge base to verified profile defaults for Muhammad Nayeem?')) {
      setIsResetting(true);
      try {
        await onResetDefaults();
      } finally {
        setIsResetting(false);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <BookOpen className="w-4 h-4 text-zinc-700" />
            <span>Muhammad Nayeem Verified Knowledge Base</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Strict factual boundary for AI generation. Synchronize from personal website, Google Sheets, or manual batches.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleReset}
            disabled={isResetting}
            className="px-2.5 py-1.5 text-xs text-zinc-600 hover:text-zinc-950 border border-zinc-200 rounded hover:bg-zinc-50 flex items-center space-x-1 transition-colors font-mono"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleNewClick}
            className="px-3 py-1.5 text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded font-medium flex items-center space-x-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Entry</span>
          </button>
        </div>
      </div>

      {/* Main Section Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-zinc-200 pb-2">
        <button
          onClick={() => setActiveSection('repository')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeSection === 'repository'
              ? 'bg-zinc-950 text-white'
              : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Knowledge Items ({items.length})</span>
        </button>

        <button
          onClick={() => setActiveSection('sheets')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeSection === 'sheets'
              ? 'bg-zinc-950 text-white'
              : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Google Sheets Import</span>
        </button>

        <button
          onClick={() => setActiveSection('batch')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeSection === 'batch'
              ? 'bg-zinc-950 text-white'
              : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Batch & File Import</span>
        </button>

        <button
          onClick={() => setActiveSection('website')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            activeSection === 'website'
              ? 'bg-zinc-950 text-white'
              : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Website Sync & Updates</span>
        </button>
      </div>

      {/* SECTION 1: KNOWLEDGE REPOSITORY & CATEGORY FILTERING */}
      {activeSection === 'repository' && (
        <div className="space-y-4">
          {/* Category Quick-Toggles: 'all' | 'general' | 'technical' | 'pricing' */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            <div className="flex items-center p-1 bg-zinc-100 border border-zinc-200 rounded-lg space-x-1 overflow-x-auto">
              {primaryCategories.map((cat) => {
                const count = getCategoryCount(cat.id);
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs transition-all whitespace-nowrap ${
                      isSelected
                        ? 'bg-zinc-950 text-white font-medium shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                    }`}
                    title={cat.description}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        isSelected
                          ? 'bg-white text-zinc-950 font-bold'
                          : 'bg-zinc-200 text-zinc-700 font-medium'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search within knowledge..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-white border border-zinc-300 rounded focus:outline-hidden focus:border-zinc-900"
              />
            </div>
          </div>

          {/* Grid of Knowledge Cards */}
          {filteredItems.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-zinc-200 rounded-lg bg-zinc-50/50">
              <BookOpen className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
              <p className="text-xs text-zinc-700 font-medium">
                No knowledge entries found in category &ldquo;{selectedCategory}&rdquo;.
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Switch category tabs above or click &ldquo;Add Entry&rdquo; to add verified facts.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-zinc-200 rounded-lg p-4 flex flex-col justify-between space-y-3 shadow-2xs hover:shadow-xs transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border ${
                          item.category === 'technical'
                            ? 'bg-zinc-950 text-white border-zinc-950'
                            : item.category === 'pricing'
                            ? 'bg-zinc-200 text-zinc-900 border-zinc-300 font-semibold'
                            : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        {item.category}
                      </span>
                      <div className="flex items-center space-x-1 text-emerald-700 text-[10px] font-mono">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Verified Fact</span>
                      </div>
                    </div>

                    <h3 className="text-xs font-semibold text-zinc-900 leading-snug">
                      {item.title}
                    </h3>

                    <p className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed line-clamp-6 bg-zinc-50/50 p-2.5 rounded border border-zinc-100 font-sans">
                      {item.content}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-[11px] text-zinc-400">
                    <span className="font-mono text-[10px] truncate max-w-[140px]">
                      key: {item.key}
                    </span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleEditClick(item)}
                        className="p-1 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded"
                        title="Edit entry"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteItem(item.id)}
                        className="p-1 text-zinc-500 hover:text-rose-700 hover:bg-rose-50 rounded"
                        title="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: GOOGLE SHEETS IMPORT */}
      {activeSection === 'sheets' && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded p-4 shadow-xs">
            <h3 className="text-xs font-bold text-zinc-950 uppercase font-mono mb-1">
              Google Sheets Live FAQ Synchronization
            </h3>
            <p className="text-xs text-zinc-500 mb-3">
              Paste the shareable link of any public or published Google Sheet. The system automatically fetches CSV exports, maps question/answer columns, checks for duplicates, and previews all rows before saving.
            </p>

            <form onSubmit={handleSheetsPreview} className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono uppercase text-zinc-600 mb-1">
                  Google Sheet URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={sheetsUrl}
                    onChange={(e) => setSheetsUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing"
                    className="flex-1 text-xs px-3 py-2 border border-zinc-300 rounded font-mono focus:border-zinc-900 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={sheetsLoading || !sheetsUrl.trim()}
                    className="px-4 py-2 bg-zinc-950 text-white text-xs font-medium rounded hover:bg-zinc-800 disabled:opacity-40 transition-colors flex items-center space-x-1.5"
                  >
                    {sheetsLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                    <span>Fetch & Preview</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="overwriteSheets"
                  checked={overwriteSheets}
                  onChange={(e) => setOverwriteSheets(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-0"
                />
                <label htmlFor="overwriteSheets" className="text-xs text-zinc-700">
                  Update existing items with matching titles or keys (Safe duplicate update)
                </label>
              </div>
            </form>

            {sheetsError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{sheetsError}</span>
              </div>
            )}

            {sheetsSuccess && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{sheetsSuccess}</span>
              </div>
            )}
          </div>

          {/* Sheets Preview Table */}
          {sheetsPreview && (
            <div className="bg-white border border-zinc-200 rounded p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-950 uppercase font-mono">
                  Preview Entries ({sheetsPreview.length})
                </h4>
                <button
                  onClick={handleCommitSheets}
                  disabled={sheetsLoading}
                  className="px-3 py-1.5 bg-zinc-950 text-white text-xs font-medium rounded hover:bg-zinc-800 transition-colors flex items-center space-x-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Commit to Knowledge Base</span>
                </button>
              </div>

              <div className="border border-zinc-200 rounded overflow-x-auto max-h-80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-mono uppercase text-zinc-500">
                    <tr>
                      <th className="p-2">Category</th>
                      <th className="p-2">Question / Title</th>
                      <th className="p-2">Answer / Content</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {sheetsPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50/60">
                        <td className="p-2 font-mono text-[11px] text-zinc-600 uppercase">{item.category}</td>
                        <td className="p-2 font-medium text-zinc-900">{item.question}</td>
                        <td className="p-2 text-zinc-600 max-w-xs truncate">{item.answer}</td>
                        <td className="p-2">
                          {item.isDuplicate ? (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-mono">
                              Update
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-mono">
                              New
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: BATCH & FILE IMPORT */}
      {activeSection === 'batch' && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded p-4 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-zinc-950 uppercase font-mono">
              Batch Text & File Import
            </h3>
            <p className="text-xs text-zinc-500">
              Paste multiple FAQ entries formatted as &ldquo;Question: ...\nAnswer: ...\nCategory: ...&rdquo; or upload a CSV / JSON file.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Textarea parser */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono uppercase text-zinc-600">
                  Structured Text Blocks
                </label>
                <textarea
                  rows={8}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  className="w-full text-xs p-3 border border-zinc-300 rounded font-mono bg-zinc-50 focus:bg-white focus:border-zinc-900 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleParseBatchText}
                  disabled={batchLoading || !batchText.trim()}
                  className="px-3 py-1.5 bg-zinc-950 text-white text-xs font-medium rounded hover:bg-zinc-800 transition-colors flex items-center space-x-1.5"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Parse Text Entries</span>
                </button>
              </div>

              {/* File Dropzone */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono uppercase text-zinc-600">
                  Upload CSV or JSON File
                </label>
                <div className="border-2 border-dashed border-zinc-300 rounded p-6 text-center hover:border-zinc-900 transition-colors bg-zinc-50/50">
                  <Upload className="w-6 h-6 text-zinc-400 mx-auto mb-2" />
                  <p className="text-xs text-zinc-700 font-medium">Click to select CSV or JSON file</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Supports Question, Answer, Category headers</p>
                  <input
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileUpload}
                    className="mt-3 text-xs text-zinc-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-mono file:bg-zinc-900 file:text-white"
                  />
                </div>
              </div>
            </div>

            {batchError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{batchError}</span>
              </div>
            )}

            {batchSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{batchSuccess}</span>
              </div>
            )}
          </div>

          {/* Batch Preview Table */}
          {batchPreview && (
            <div className="bg-white border border-zinc-200 rounded p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-950 uppercase font-mono">
                  Parsed FAQ Preview ({batchPreview.length} entries)
                </h4>
                <button
                  onClick={handleCommitBatch}
                  disabled={batchLoading}
                  className="px-3 py-1.5 bg-zinc-950 text-white text-xs font-medium rounded hover:bg-zinc-800 transition-colors flex items-center space-x-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Save All to Knowledge Base</span>
                </button>
              </div>

              <div className="border border-zinc-200 rounded overflow-x-auto max-h-80">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] font-mono uppercase text-zinc-500">
                    <tr>
                      <th className="p-2">Category</th>
                      <th className="p-2">Question / Key</th>
                      <th className="p-2">Answer Content</th>
                      <th className="p-2">Duplicate?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {batchPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-zinc-50/60">
                        <td className="p-2 font-mono text-[11px] text-zinc-600 uppercase">{item.category}</td>
                        <td className="p-2 font-medium text-zinc-900">{item.question}</td>
                        <td className="p-2 text-zinc-600 max-w-sm truncate">{item.answer}</td>
                        <td className="p-2">
                          {item.isDuplicate ? (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-mono">
                              Overwrites Existing
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-mono">
                              New
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: WEBSITE KNOWLEDGE SYNCHRONIZATION */}
      {activeSection === 'website' && (
        <div className="space-y-4">
          <div className="bg-white border border-zinc-200 rounded p-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-zinc-950 uppercase font-mono flex items-center space-x-2">
                  <Globe className="w-4 h-4 text-zinc-800" />
                  <span>Primary Website Source: https://muhammadnayeem.qzz.io</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Automated crawling & daily change detection. Discovered pages require your review before promotion to active knowledge.
                </p>
              </div>

              <button
                onClick={handleRunWebsiteSync}
                disabled={syncLoading}
                className="px-3.5 py-2 bg-zinc-950 text-white text-xs font-medium rounded hover:bg-zinc-800 disabled:opacity-40 transition-colors flex items-center space-x-1.5 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                <span>{syncLoading ? 'Scanning Website...' : 'Run Sync Now'}</span>
              </button>
            </div>

            {/* Sync Status Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-zinc-100">
              <div className="p-2.5 bg-zinc-50 rounded border border-zinc-100">
                <span className="text-[10px] font-mono uppercase text-zinc-400">Tracked Pages</span>
                <div className="text-base font-bold text-zinc-950 mt-0.5">
                  {syncStatus?.totalPagesDiscovered ?? pageSources.length}
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 rounded border border-zinc-100">
                <span className="text-[10px] font-mono uppercase text-zinc-400">Approved Facts</span>
                <div className="text-base font-bold text-emerald-700 mt-0.5">
                  {syncStatus?.totalApproved ?? pageSources.filter((p) => p.status === 'approved').length}
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 rounded border border-zinc-100">
                <span className="text-[10px] font-mono uppercase text-zinc-400">Pending Review</span>
                <div className="text-base font-bold text-amber-700 mt-0.5">
                  {syncStatus?.pendingReviewCount ?? pageSources.filter((p) => p.status === 'discovered' || p.status === 'changed').length}
                </div>
              </div>

              <div className="p-2.5 bg-zinc-50 rounded border border-zinc-100">
                <span className="text-[10px] font-mono uppercase text-zinc-400">Last Scanned</span>
                <div className="text-xs font-mono text-zinc-800 mt-1 truncate">
                  {syncStatus?.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not yet scanned'}
                </div>
              </div>
            </div>

            {syncError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{syncError}</span>
              </div>
            )}

            {syncSuccess && (
              <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-start space-x-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{syncSuccess}</span>
              </div>
            )}
          </div>

          {/* Tracked Pages List & Review Queue */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-zinc-950 uppercase font-mono">
              Tracked Website Pages & Review Queue ({pageSources.length})
            </h4>

            {pageSources.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-zinc-200 rounded bg-zinc-50/50">
                <Globe className="w-7 h-7 text-zinc-300 mx-auto mb-2" />
                <p className="text-xs text-zinc-600">No pages synchronized yet.</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Click &ldquo;Run Sync Now&rdquo; above to discover and crawl pages on https://muhammadnayeem.qzz.io.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pageSources.map((page) => (
                  <div
                    key={page.id}
                    className="bg-white border border-zinc-200 rounded p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="space-y-1 max-w-xl">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-mono uppercase ${
                            page.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : page.status === 'changed'
                              ? 'bg-amber-100 text-amber-800 font-semibold'
                              : page.status === 'rejected'
                              ? 'bg-zinc-100 text-zinc-500 line-through'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {page.status}
                        </span>
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-zinc-900 hover:underline flex items-center space-x-1"
                        >
                          <span>{page.title}</span>
                          <ExternalLink className="w-3 h-3 text-zinc-400" />
                        </a>
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400 truncate">{page.url}</div>
                      <p className="text-xs text-zinc-600 line-clamp-2">{page.excerpt}</p>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {page.status !== 'approved' ? (
                        <>
                          <button
                            onClick={() => handleApprovePage(page.id)}
                            className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-medium rounded transition-colors flex items-center space-x-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve Fact</span>
                          </button>
                          <button
                            onClick={() => handleRejectPage(page.id)}
                            className="px-2.5 py-1.5 border border-zinc-200 text-zinc-600 hover:text-zinc-950 text-xs rounded transition-colors"
                          >
                            Dismiss
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center space-x-1 text-xs text-emerald-700 font-mono">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Approved Fact</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit / Create Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-zinc-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-zinc-200 rounded-lg shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider">
                {editingItem.id ? 'Edit Knowledge Fact' : 'New Knowledge Fact'}
              </h3>
              <button
                onClick={() => setEditingItem(null)}
                className="text-zinc-400 hover:text-zinc-900 text-xs"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSubmitModal} className="p-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    Fact Category
                  </label>
                  <select
                    value={editingItem.category}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        category: e.target.value as KnowledgeCategory,
                      })
                    }
                    className="w-full text-xs p-2 border border-zinc-300 rounded bg-white"
                  >
                    <option value="general">General & Profile</option>
                    <option value="technical">Technical & CNC / Web</option>
                    <option value="pricing">Pricing & Estimates</option>
                    <option value="profile">Profile Fact</option>
                    <option value="service">CNC & Design Service</option>
                    <option value="education">Education</option>
                    <option value="skill">Technical Skill</option>
                    <option value="project">Project / Portfolio</option>
                    <option value="faq">Business FAQ</option>
                    <option value="policy">Policy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                    System Key
                  </label>
                  <input
                    type="text"
                    value={editingItem.key || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, key: e.target.value })}
                    required
                    placeholder="e.g. wood_carving_rates"
                    className="w-full text-xs p-2 border border-zinc-300 rounded font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Title / Headline
                </label>
                <input
                  type="text"
                  value={editingItem.title || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  required
                  placeholder="e.g. CNC 3D Relief Door Pricing"
                  className="w-full text-xs p-2 border border-zinc-300 rounded"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-700 mb-1">
                  Factual Content (Used by Gemini for grounding)
                </label>
                <textarea
                  rows={4}
                  value={editingItem.content || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, content: e.target.value })}
                  required
                  placeholder="Enter exact verified details..."
                  className="w-full text-xs p-2 border border-zinc-300 rounded font-sans"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 border border-zinc-200 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded text-xs font-medium"
                >
                  Save Fact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
