import React, { useState } from 'react';
import {
  Cpu,
  Database,
  MessageCircle,
  Bot,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  Code,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { IntegrationStatus } from '../../types/index.ts';

interface IntegrationsViewProps {
  integrations: IntegrationStatus[];
  onRefreshIntegrations: () => Promise<void>;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  integrations,
  onRefreshIntegrations,
}) => {
  const [testResult, setTestResult] = useState<{ service: string; output: any } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [activeGuide, setActiveGuide] = useState<'render' | 'supabase' | 'none'>('render');

  const getStatus = (service: string) => integrations.find((i) => i.service === service);

  const handleTestPostgres = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/test-postgres', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('nayeem_desk_token')}`,
        },
      });
      const data = await res.json();
      setTestResult({ service: 'postgres', output: data });
    } catch (err: unknown) {
      setTestResult({ service: 'postgres', output: { error: String(err) } });
    } finally {
      setIsTesting(false);
      onRefreshIntegrations();
    }
  };

  const handleCopySchema = async () => {
    setIsLoadingSchema(true);
    try {
      const res = await fetch('/api/integrations/supabase-schema', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('nayeem_desk_token')}`,
        },
      });
      const data = await res.json();
      if (data.schemaSql) {
        await navigator.clipboard.writeText(data.schemaSql);
        setCopiedKey('schema_sql');
        setTimeout(() => setCopiedKey(null), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSchema(false);
    }
  };

  const handleTestTelegram = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/test-telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('nayeem_desk_token')}`,
        },
      });
      const data = await res.json();
      setTestResult({ service: 'telegram', output: data });
    } catch (err: unknown) {
      setTestResult({ service: 'telegram', output: { error: String(err) } });
    } finally {
      setIsTesting(false);
      onRefreshIntegrations();
    }
  };

  const handleTestGemini = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/integrations/test-gemini', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('nayeem_desk_token')}`,
        },
        body: JSON.stringify({
          prompt: 'What are the CNC toolpath specialties of Muhammad Nayeem at Chittagong Door?',
        }),
      });
      const data = await res.json();
      setTestResult({ service: 'gemini', output: data });
    } catch (err: unknown) {
      setTestResult({ service: 'gemini', output: { error: String(err) } });
    } finally {
      setIsTesting(false);
      onRefreshIntegrations();
    }
  };

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const appUrl = window.location.origin;
  const pgStatus = getStatus('postgres');

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 tracking-tight flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-zinc-700" />
            <span>Infrastructure & API Connection Status</span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Strict verification: Services are only marked Connected when real credentials and network pings succeed.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-zinc-100 p-0.5 rounded border border-zinc-200">
            <button
              onClick={() => setActiveGuide(activeGuide === 'render' ? 'none' : 'render')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeGuide === 'render'
                  ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              24/7 Render & WhatsApp Setup
            </button>
            <button
              onClick={() => setActiveGuide(activeGuide === 'supabase' ? 'none' : 'supabase')}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                activeGuide === 'supabase'
                  ? 'bg-white text-zinc-950 shadow-2xs font-semibold'
                  : 'text-zinc-600 hover:text-zinc-950'
              }`}
            >
              Supabase Database Guide
            </button>
          </div>
          <button
            onClick={onRefreshIntegrations}
            className="px-3 py-1.5 text-xs border border-zinc-200 hover:bg-zinc-50 rounded text-zinc-700 flex items-center space-x-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Status</span>
          </button>
        </div>
      </div>

      {/* Guide 1: 24/7 Render & WhatsApp Auto-Reply Setup Guide */}
      {activeGuide === 'render' && (
        <div className="bg-white border-2 border-emerald-600 rounded-lg p-5 space-y-4 shadow-xs animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-zinc-100">
            <div className="flex items-start space-x-2.5">
              <div className="w-7 h-7 rounded bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                24/7
              </div>
              <div>
                <h3 className="text-xs font-bold text-zinc-950 uppercase tracking-wider flex items-center space-x-2">
                  <span>Render 24/7 Cloud Deployment & Meta WhatsApp Webhook Setup</span>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-normal normal-case">
                    অফলাইনেও অটো-রিপ্লাই সচল থাকবে
                  </span>
                </h3>
                <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
                  Render-এ ডেপ্লয় করার পর আপনার কম্পিউটার বা ফোন বন্ধ থাকলেও Render ক্লাউড সার্ভার ২৪ ঘণ্টা সচল থাকবে এবং WhatsApp মেসেজ আসলে সাথে সাথে স্বয়ংক্রিয়ভাবে রিপ্লাই পাঠাবে।
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={() => copyToClipboard('nayeem_webhook_verify_2026_a8f3', 'verify_tok_guide')}
                className="px-2.5 py-1 text-xs border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded font-mono font-medium flex items-center space-x-1"
              >
                {copiedKey === 'verify_tok_guide' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Token Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Verify Token</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            {/* Step 1 */}
            <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1.5">
              <div className="font-mono text-[10px] uppercase font-bold text-zinc-500">ধাপ ১: Render এ ডেপ্লয়</div>
              <div className="font-semibold text-zinc-900">Render Free Web Service</div>
              <p className="text-[11px] text-zinc-600 leading-normal">
                ১. <a href="https://render.com" target="_blank" rel="noreferrer" className="underline font-medium text-emerald-700">render.com</a> এ গিয়ে <strong>New Web Service</strong> এ ক্লিক করুন।<br />
                ২. <strong>Build Command:</strong> <code className="bg-zinc-200 px-1 rounded text-[10px]">npm install && npm run build</code><br />
                ৩. <strong>Start Command:</strong> <code className="bg-zinc-200 px-1 rounded text-[10px]">npm start</code>
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1.5">
              <div className="font-mono text-[10px] uppercase font-bold text-zinc-500">ধাপ ২: Environment ভ্যারিয়েবল</div>
              <div className="font-semibold text-zinc-900">Render এ Env Vars দিন</div>
              <p className="text-[11px] text-zinc-600 leading-normal">
                Render-এর <strong>Environment</strong> ট্যাবে নিচের কি-গুলো যোগ করুন:<br />
                • <code className="bg-zinc-200 px-1 rounded text-[10px]">DATABASE_URL</code> (Supabase URI)<br />
                • <code className="bg-zinc-200 px-1 rounded text-[10px]">WHATSAPP_PHONE_NUMBER_ID</code><br />
                • <code className="bg-zinc-200 px-1 rounded text-[10px]">WHATSAPP_ACCESS_TOKEN</code><br />
                • <code className="bg-zinc-200 px-1 rounded text-[10px]">WHATSAPP_VERIFY_TOKEN</code>: <code className="font-bold">nayeem_webhook_verify_2026_a8f3</code>
              </p>
            </div>

            {/* Step 3 */}
            <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1.5">
              <div className="font-mono text-[10px] uppercase font-bold text-zinc-500">ধাপ ৩: Meta Callback URL</div>
              <div className="font-semibold text-zinc-900">Meta Webhook কনফিগার</div>
              <p className="text-[11px] text-zinc-600 leading-normal">
                ১. <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline font-medium text-emerald-700">Meta Developer Portal</a> &gt; WhatsApp &gt; Configuration &gt; <strong>Webhook</strong> &gt; Edit এ যান।<br />
                ২. <strong>Callback URL:</strong> <code className="bg-zinc-200 px-1 rounded text-[10px]">https://&lt;render-app&gt;.onrender.com/api/webhooks/whatsapp</code><br />
                ৩. <strong>Verify Token:</strong> <code className="bg-zinc-200 px-1 rounded text-[10px]">nayeem_webhook_verify_2026_a8f3</code> দিয়ে Verify and save চাপুন।
              </p>
            </div>

            {/* Step 4 */}
            <div className="p-3 bg-amber-50/70 rounded border border-amber-300 space-y-1.5">
              <div className="font-mono text-[10px] uppercase font-bold text-amber-800">ধাপ ৪: অতি গুরুত্বপূর্ণ (Must Do)</div>
              <div className="font-semibold text-amber-950">Webhook Fields এ &quot;messages&quot; চেক করুন</div>
              <p className="text-[11px] text-zinc-700 leading-normal">
                Meta পোর্টালে Webhook fields এর পাশে <strong>&quot;Manage&quot;</strong> এ ক্লিক করে <strong>&quot;messages&quot;</strong> এর বক্সে টিক দিয়ে Subscribe চাপুন।<br />
                <span className="text-amber-900 font-medium">⚠️ এটি সাবস্ক্রাইব না করলে মেটা কোনো মেসেজ পাঠায় না!</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Guide 2: Supabase PostgreSQL Beginner Step-by-Step Guide */}
      {activeGuide === 'supabase' && (
        <div className="bg-white border-2 border-zinc-900 rounded-lg p-5 space-y-4 shadow-xs animate-in fade-in">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 rounded bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                S
              </div>
              <div>
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                  Supabase Free-Tier Setup (Simple 4-Step Guide — No Terminal Required)
                </h3>
                <p className="text-[11px] text-zinc-500">
                  Follow these clicks entirely inside your web browser. You do not need Node.js or any terminal commands.
                </p>
              </div>
            </div>
            <button
              onClick={handleCopySchema}
              disabled={isLoadingSchema}
              className="px-3 py-1.5 text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded font-medium flex items-center space-x-1.5 transition-colors shadow-2xs"
            >
              {copiedKey === 'schema_sql' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SQL Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>1-Click Copy Supabase SQL</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1.5">
              <div className="font-mono text-[10px] uppercase font-bold text-zinc-400">Step 1</div>
              <div className="font-semibold text-zinc-900">Create Free Supabase Project</div>
              <p className="text-[11px] text-zinc-600 leading-normal">
                Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-medium text-zinc-900">supabase.com</a>, log in, click <strong>&quot;New Project&quot;</strong>, enter a name (e.g. <code>nayeem-ai-desk</code>), and set a database password. Free tier includes 500MB storage.
              </p>
            </div>

            <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1.5">
              <div className="font-mono text-[10px] uppercase font-bold text-zinc-400">Step 2</div>
              <div className="font-semibold text-zinc-900">Run SQL in Supabase</div>
              <p className="text-[11px] text-zinc-600 leading-normal">
                In your Supabase project left menu, click <strong>SQL Editor</strong> &gt; <strong>&quot;New Query&quot;</strong>. Click the <strong>&quot;1-Click Copy Supabase SQL&quot;</strong> button above, paste it into the editor, and click <strong>&quot;Run&quot;</strong>.
              </p>
            </div>

            <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1.5">
              <div className="font-mono text-[10px] uppercase font-bold text-zinc-400">Step 3</div>
              <div className="font-semibold text-zinc-900">Get Connection String</div>
              <p className="text-[11px] text-zinc-600 leading-normal">
                Click <strong>Project Settings (gear icon)</strong> &gt; <strong>Database</strong>. Scroll down to <strong>Connection string</strong>, select <strong>URI</strong> &gt; <strong>Connection pooling (Session/Transaction mode)</strong>. Copy the URI and replace <code>[YOUR-PASSWORD]</code> with your database password.
              </p>
            </div>

            <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1.5">
              <div className="font-mono text-[10px] uppercase font-bold text-zinc-400">Step 4</div>
              <div className="font-semibold text-zinc-900">Paste in Render</div>
              <p className="text-[11px] text-zinc-600 leading-normal">
                In your <strong>Render Dashboard</strong>, click your Web Service &gt; <strong>Environment</strong>. Add an Environment Variable with key <code className="font-mono bg-zinc-200 px-1 py-0.5 rounded">DATABASE_URL</code> and paste your Supabase URI as value. Save Changes.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Test Result Inspector Output */}
      {testResult && (
        <div className="p-3.5 bg-zinc-900 text-zinc-100 rounded-lg text-xs font-mono space-y-1 animate-in fade-in">
          <div className="text-[10px] text-zinc-400 uppercase tracking-wider flex items-center justify-between">
            <span>Diagnostic Ping Output: {testResult.service}</span>
            <button
              onClick={() => setTestResult(null)}
              className="text-zinc-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <pre className="overflow-x-auto text-[11px] leading-relaxed">
            {JSON.stringify(testResult.output, null, 2)}
          </pre>
        </div>
      )}

      {/* Service Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Supabase / PostgreSQL Database */}
        <div className="bg-white border-2 border-zinc-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-zinc-900">
                  PostgreSQL (Supabase Cloud)
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${
                  pgStatus?.status === 'connected'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                }`}
              >
                {pgStatus?.status === 'connected' ? 'CONNECTED' : 'DISCONNECTED (FALLBACK ACTIVE)'}
              </span>
            </div>

            <p className="text-xs text-zinc-700 leading-relaxed">
              {pgStatus?.message}
            </p>

            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-[11px] text-zinc-600 space-y-1.5 font-sans">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-900">Target Free Database:</span>
                <span className="font-mono text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded">
                  Supabase Cloud Free Tier (0$/mo)
                </span>
              </div>
              <div><strong>Active Schema File:</strong> <code className="font-mono bg-zinc-200/60 px-1 rounded">supabase_schema.sql</code> (in project root)</div>
              <div><strong>Resilience Status:</strong> When disconnected, the app maintains full operational stability using internal safe storage with zero crashes.</div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
            <button
              onClick={handleCopySchema}
              disabled={isLoadingSchema}
              className="px-2.5 py-1 text-xs border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded font-medium flex items-center space-x-1"
            >
              <Copy className="w-3 h-3" />
              <span>{copiedKey === 'schema_sql' ? 'Copied!' : 'Copy Schema SQL'}</span>
            </button>
            <button
              onClick={handleTestPostgres}
              disabled={isTesting}
              className="px-3 py-1 text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded font-medium disabled:opacity-50 flex items-center space-x-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
              <span>Test Connection Now</span>
            </button>
          </div>
        </div>

        {/* 2. Google Gemini AI */}
        <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <h3 className="text-xs font-semibold text-zinc-900">Google Gemini AI Engine</h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${
                  getStatus('gemini')?.status === 'connected'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}
              >
                {getStatus('gemini')?.status || 'mock_mode'}
              </span>
            </div>

            <p className="text-xs text-zinc-600">
              {getStatus('gemini')?.message}
            </p>

            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded text-[11px] text-zinc-600 space-y-1">
              <div><strong>Model Selected:</strong> <code className="font-mono bg-zinc-200/60 px-1 rounded">gemini-3.8-flash</code></div>
              <div><strong>Architecture:</strong> Server-side only via official <code className="font-mono bg-zinc-200/60 px-1 rounded">@google/genai</code> SDK.</div>
              <div><strong>Prompt Security:</strong> Quarantines prompt injection triggers before generation.</div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 font-mono">SDK: @google/genai</span>
            <button
              onClick={handleTestGemini}
              disabled={isTesting}
              className="px-2.5 py-1 text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded font-medium disabled:opacity-50"
            >
              Test AI Prompt Ping
            </button>
          </div>
        </div>

        {/* 3. Meta WhatsApp Cloud API */}
        <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-semibold text-zinc-900">Meta WhatsApp Cloud API</h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${
                  getStatus('whatsapp')?.status === 'configured'
                    ? 'bg-blue-50 text-blue-900 border-blue-200'
                    : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                }`}
              >
                {getStatus('whatsapp')?.status || 'disconnected'}
              </span>
            </div>

            <p className="text-xs text-zinc-600">
              {getStatus('whatsapp')?.message}
            </p>

            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded text-[11px] space-y-2 font-mono">
              <div className="space-y-1">
                <div className="text-zinc-500 font-semibold text-[10px] uppercase">
                  Webhook Callback URL:
                </div>
                <div className="flex items-center justify-between bg-white p-1 rounded border border-zinc-200">
                  <span className="truncate text-zinc-800 text-[10px]">{appUrl}/api/webhooks/whatsapp</span>
                  <button
                    onClick={() => copyToClipboard(`${appUrl}/api/webhooks/whatsapp`, 'wa_url')}
                    className="p-1 text-zinc-500 hover:text-zinc-950"
                    title="Copy URL"
                  >
                    {copiedKey === 'wa_url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-zinc-500 font-semibold text-[10px] uppercase">
                  Verify Token:
                </div>
                <div className="flex items-center justify-between bg-white p-1 rounded border border-zinc-200">
                  <span className="truncate text-zinc-800 text-[10px]">nayeem_webhook_verify_2026_a8f3</span>
                  <button
                    onClick={() => copyToClipboard('nayeem_webhook_verify_2026_a8f3', 'wa_verify_tok')}
                    className="p-1 text-zinc-500 hover:text-zinc-950"
                    title="Copy Verify Token"
                  >
                    {copiedKey === 'wa_verify_tok' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-amber-800 font-sans bg-amber-50 p-1.5 rounded border border-amber-200">
                ⚠️ Meta Webhook fields &gt; &quot;messages&quot; অবশ্যই Subscribed হতে হবে।
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-zinc-500">
              Live Auto-Reply: Active 24/7
            </span>
            <button
              onClick={() => setActiveGuide('render')}
              className="text-[11px] text-emerald-700 hover:underline font-medium"
            >
              View Render Guide &rarr;
            </button>
          </div>
        </div>

        {/* 4. Telegram Bot API */}
        <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bot className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-semibold text-zinc-900">Telegram Admin Bot</h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${
                  getStatus('telegram')?.status === 'configured'
                    ? 'bg-blue-50 text-blue-900 border-blue-200'
                    : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                }`}
              >
                {getStatus('telegram')?.status || 'disconnected'}
              </span>
            </div>

            <p className="text-xs text-zinc-600">
              {getStatus('telegram')?.message}
            </p>

            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded text-[11px] text-zinc-600 space-y-1">
              <div><strong>Instant Approvals:</strong> Sends approval requests with Approve & Reject buttons.</div>
              <div><strong>Admin Chat ID:</strong> Validates callback queries strictly against your personal ID.</div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500">Alerts: Push notifications</span>
            <button
              onClick={handleTestTelegram}
              disabled={isTesting}
              className="px-2.5 py-1 text-xs bg-zinc-950 hover:bg-zinc-800 text-white rounded font-medium disabled:opacity-50"
            >
              Test Telegram Alert Ping
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
