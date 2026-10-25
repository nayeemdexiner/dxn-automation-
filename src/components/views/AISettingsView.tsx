import React, { useState } from 'react';
import { Sliders, ShieldCheck, Save, Check, RefreshCw } from 'lucide-react';
import { AISettings, MessageCategory } from '../../types/index.ts';

interface AISettingsViewProps {
  settings: AISettings;
  onSaveSettings: (settings: Partial<AISettings>) => Promise<void>;
}

export const AISettingsView: React.FC<AISettingsViewProps> = ({
  settings,
  onSaveSettings,
}) => {
  const [formData, setFormData] = useState<AISettings>({ ...settings });
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const availableCategories: { id: MessageCategory; label: string; desc: string }[] = [
    {
      id: 'faq_business',
      label: 'FAQ & Business Inquiries',
      desc: 'Toolpaths, CNC wood carvings, Chittagong Door rates, programming skills.',
    },
    {
      id: 'general_personal',
      label: 'General Personal Conversations',
      desc: 'Casual friends & acquaintances. Recommended to keep unchecked to draft for approval.',
    },
    {
      id: 'romantic_flirtatious',
      label: 'Romantic / Flirtatious Messages',
      desc: 'Policy strictly mandates approval. Automated romantic commitments are blocked.',
    },
    {
      id: 'sensitive',
      label: 'Sensitive & Financial Requests',
      desc: 'Confidential topics, loan requests, secrets. Always requires personal admin review.',
    },
    {
      id: 'urgent',
      label: 'Urgent Work / Emergencies',
      desc: 'High priority time-sensitive queries.',
    },
    {
      id: 'uncertain',
      label: 'Uncertain / Low Confidence',
      desc: 'Ambiguous or adversarial inputs. Strictly held for review.',
    },
  ];

  const handleCategoryToggle = (catId: MessageCategory) => {
    const current = formData.allowedCategories;
    if (current.includes(catId)) {
      setFormData({
        ...formData,
        allowedCategories: current.filter((c) => c !== catId),
      });
    } else {
      setFormData({
        ...formData,
        allowedCategories: [...current, catId],
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveSettings(formData);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-zinc-700" />
            <span>AI Automation Policy & Governance Settings</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Define boundaries for autonomous reply generation, language behavior, and approval routing.
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 disabled:opacity-50 text-white text-xs font-medium rounded flex items-center space-x-1.5 transition-colors self-start sm:self-auto"
        >
          {isSaved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Saved Successfully</span>
            </>
          ) : isSaving ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save AI Policy</span>
            </>
          )}
        </button>
      </div>

      {/* Policy Master Switch */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-zinc-900">
              Master Auto-Reply Switch
            </div>
            <div className="text-[11px] text-zinc-500">
              When disabled, all incoming messages will create drafts in the Pending queue without auto-sending.
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={formData.autoReplyEnabled}
              onChange={(e) => setFormData({ ...formData, autoReplyEnabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-zinc-950"></div>
          </label>
        </div>
      </div>

      {/* Allowed Categories */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <div>
          <div className="text-xs font-semibold text-zinc-900">
            Allowed Autonomous Reply Categories
          </div>
          <div className="text-[11px] text-zinc-500">
            Select which inbound message categories are allowed to trigger instant automated responses. All unselected or high-impact categories create pending approval drafts.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
          {availableCategories.map((cat) => {
            const isChecked = formData.allowedCategories.includes(cat.id);
            return (
              <div
                key={cat.id}
                onClick={() => handleCategoryToggle(cat.id)}
                className={`p-3 rounded border text-xs cursor-pointer transition-all flex items-start space-x-2.5 ${
                  isChecked
                    ? 'bg-zinc-50 border-zinc-900 shadow-2xs'
                    : 'bg-white border-zinc-200 hover:border-zinc-300 opacity-80'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-0"
                />
                <div>
                  <div className="font-semibold text-zinc-900">{cat.label}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">{cat.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Safety Threshold & Linguistic Tone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Confidence Threshold */}
        <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-900">
              Safety Confidence Threshold
            </span>
            <span className="font-mono text-xs font-bold text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
              {(formData.confidenceThreshold * 100).toFixed(0)}%
            </span>
          </div>
          <p className="text-[11px] text-zinc-500">
            Messages classified with confidence below this threshold will automatically escalate to Muhammad Nayeem for manual verification.
          </p>
          <input
            type="range"
            min="0.5"
            max="0.99"
            step="0.01"
            value={formData.confidenceThreshold}
            onChange={(e) =>
              setFormData({ ...formData, confidenceThreshold: parseFloat(e.target.value) })
            }
            className="w-full accent-zinc-950"
          />
        </div>

        {/* Tone and Language Matching */}
        <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
          <div className="text-xs font-semibold text-zinc-900">
            Linguistic Tone & Language Policy
          </div>
          <div className="space-y-2 text-xs">
            <div>
              <label className="block text-[11px] text-zinc-600 mb-1">Language Matching</label>
              <select
                value={formData.languageMatching}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    languageMatching: e.target.value as any,
                  })
                }
                className="w-full text-xs p-2 border border-zinc-300 rounded bg-white"
              >
                <option value="match_sender">Auto-match sender (Bangla / Banglish / English)</option>
                <option value="english_only">Strict English Only</option>
                <option value="bangla_only">Strict Bangla Only</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-zinc-600 mb-1">Default Persona Tone</label>
              <select
                value={formData.defaultTone}
                onChange={(e) =>
                  setFormData({ ...formData, defaultTone: e.target.value as any })
                }
                className="w-full text-xs p-2 border border-zinc-300 rounded bg-white"
              >
                <option value="friendly_professional">Friendly & Professional (Default)</option>
                <option value="concise">Concise & Direct</option>
                <option value="formal">Formal & Structured</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Editable Master System Prompt */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-zinc-900">
            Master System Prompt & Operational Directives
          </div>
          <span className="text-[10px] font-mono text-zinc-400">
            Sent to server-side Gemini 3.8 Flash
          </span>
        </div>
        <p className="text-[11px] text-zinc-500">
          This prompt defines the absolute boundary for the AI. It enforces factual accuracy, non-manipulation, respecting boundaries, and protecting personal feelings.
        </p>
        <textarea
          rows={7}
          value={formData.systemPrompt}
          onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
          className="w-full text-xs p-3 border border-zinc-300 rounded focus:ring-1 focus:ring-zinc-900 font-mono text-zinc-800 leading-relaxed bg-zinc-50/50"
        />
      </div>

      {/* Notifications and Context */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
        <div className="text-xs font-semibold text-zinc-900">
          Operational Controls & Retention
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="flex items-center justify-between p-2.5 bg-zinc-50 rounded border border-zinc-200">
            <div>
              <div className="font-medium text-zinc-900">Telegram Instant Push Alerts</div>
              <div className="text-[10px] text-zinc-500">Send pending draft alerts to bot chat</div>
            </div>
            <input
              type="checkbox"
              checked={formData.telegramAlertsEnabled}
              onChange={(e) =>
                setFormData({ ...formData, telegramAlertsEnabled: e.target.checked })
              }
              className="rounded border-zinc-300 text-zinc-900"
            />
          </div>

          <div className="flex items-center justify-between p-2.5 bg-zinc-50 rounded border border-zinc-200">
            <div>
              <div className="font-medium text-zinc-900">Context Message Depth</div>
              <div className="text-[10px] text-zinc-500">Recent messages included in prompt</div>
            </div>
            <span className="font-mono text-xs font-bold text-zinc-800">
              {formData.maxHistoryInContext} messages
            </span>
          </div>
        </div>
      </div>
    </form>
  );
};
