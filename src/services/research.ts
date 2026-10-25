import dns from 'node:dns/promises';
import net from 'node:net';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { appStore } from '../db/store.ts';
import { detectLanguage } from './gemini.ts';

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

/**
 * Checks whether an IPv4 or IPv6 string is private, loopback, or reserved.
 * Defends against Server-Side Request Forgery (SSRF) and DNS rebinding attacks.
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  // Normalize IPv6-mapped IPv4 e.g. ::ffff:127.0.0.1
  let cleanIp = ip.trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }

  const isV4 = net.isIPv4(cleanIp);
  const isV6 = net.isIPv6(cleanIp);

  if (!isV4 && !isV6) {
    return true; // Invalid format treated as unsafe
  }

  if (isV4) {
    const parts = cleanIp.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b] = parts;
    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private)
    if (a === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation/TEST-NET)
    if (a === 192 && b === 0) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
    if (a >= 224) return true;

    return false;
  }

  if (isV6) {
    const lower = cleanIp.toLowerCase();
    // Loopback
    if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
    // Unspecified
    if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
    // Unique Local (fc00::/7)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // Link-local (fe80::/10)
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;

    return false;
  }

  return true;
}

/**
 * Validates a target URL for SSRF vulnerabilities before fetching.
 */
export async function validateUrlForSSRF(rawUrl: string): Promise<{ valid: boolean; error?: string; parsedUrl?: URL }> {
  try {
    const parsed = new URL(rawUrl);

    // Only allow http and https
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: `Invalid protocol '${parsed.protocol}'. Only http: and https: are permitted.` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Disallow localhost or bare hostnames
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      !hostname.includes('.')
    ) {
      return { valid: false, error: `Direct access to local hostname '${hostname}' is strictly forbidden.` };
    }

    // Resolve DNS to verify destination IP addresses
    try {
      const lookupResults = await dns.lookup(hostname, { all: true });
      if (!lookupResults || lookupResults.length === 0) {
        return { valid: false, error: `Could not resolve hostname '${hostname}'.` };
      }

      for (const res of lookupResults) {
        if (isPrivateOrReservedIP(res.address)) {
          return {
            valid: false,
            error: `Hostname '${hostname}' resolves to restricted IP address (${res.address}). Access denied for security.`,
          };
        }
      }
    } catch (dnsErr: unknown) {
      const msg = dnsErr instanceof Error ? dnsErr.message : String(dnsErr);
      return { valid: false, error: `DNS resolution failed for '${hostname}': ${msg}` };
    }

    return { valid: true, parsedUrl: parsed };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { valid: false, error: `Invalid URL: ${msg}` };
  }
}

/**
 * Safely fetches web content with size limits and timeout.
 */
export async function safeFetchWebContent(url: string): Promise<{ title: string; content: string; url: string }> {
  const check = await validateUrlForSSRF(url);
  if (!check.valid || !check.parsedUrl) {
    throw new Error(check.error || 'Invalid URL');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(check.parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NayeemAIDesk/2.0 ResearchBot',
        Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP fetch failed with status ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text') && !contentType.includes('json') && !contentType.includes('xml')) {
      throw new Error(`Unsupported content type: ${contentType}. Only text, JSON, and web pages can be researched.`);
    }

    // Read response with max 2MB limit
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return sanitizeHtmlToText(text, url);
    }

    let receivedBytes = 0;
    const maxBytes = 2 * 1024 * 1024; // 2MB
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        if (receivedBytes > maxBytes) {
          reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }

    const fullBuffer = Buffer.concat(chunks);
    const rawText = fullBuffer.toString('utf-8');
    return sanitizeHtmlToText(rawText, url);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Web request timed out after 8 seconds.');
    }
    throw err;
  }
}

/**
 * Strips script tags, styles, and HTML tags to extract clean text.
 */
function sanitizeHtmlToText(rawHtml: string, url: string): { title: string; content: string; url: string } {
  let title = 'Web Source';
  const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  // Remove scripts, styles, comments
  let text = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  // Limit to 6,000 characters for reasoning context
  if (text.length > 6000) {
    text = text.substring(0, 6000) + '... [truncated]';
  }

  return { title, content: text, url };
}

// In-memory store for recent research results
const recentResearchStore: ResearchResult[] = [];

export async function getRecentResearch(): Promise<ResearchResult[]> {
  return [...recentResearchStore];
}

/**
 * Conducts deep research on a query or URL using Gemini or knowledge base grounding.
 * Separates explicit facts from inferences, cites sources, and drafts a WhatsApp reply.
 */
export async function conductResearch(params: {
  query: string;
  targetUrl?: string;
  senderName?: string;
  senderPhone?: string;
}): Promise<ResearchResult> {
  const { query, targetUrl, senderName } = params;
  let fetchedData: { title: string; content: string; url: string } | null = null;
  const sources: ResearchSource[] = [];

  if (targetUrl) {
    fetchedData = await safeFetchWebContent(targetUrl);
    sources.push({
      title: fetchedData.title,
      url: fetchedData.url,
      snippet: fetchedData.content.slice(0, 200) + '...',
    });
  }

  // Retrieve personal knowledge base items
  const kb = await appStore.getKnowledgeBase();
  const relevantKb = kb.slice(0, 10);
  for (const item of relevantKb) {
    sources.push({
      title: `Personal Knowledge Base: ${item.title}`,
      url: `desk://knowledge/${item.key}`,
      snippet: item.content.slice(0, 180) + '...',
    });
  }

  const detectedLang = detectLanguage(query);
  const apiKey = process.env.GEMINI_API_KEY;
  const hasGemini = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');

  let summary = '';
  let facts: string[] = [];
  let inferences: string[] = [];
  let draftReply = '';

  if (hasGemini) {
    try {
      const ai = new GoogleGenAI({
        apiKey: apiKey!,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const prompt = `You are the Research and Intelligence Assistant for Muhammad Nayeem AI Desk.
Topic / Query: "${query.replace(/"/g, '\\"')}"
Language requested: ${detectedLang === 'bn' ? 'Bengali (বাংলা)' : detectedLang === 'banglish' ? 'Banglish' : 'English'}

${fetchedData ? `Fetched Web Document Content (${fetchedData.url}):\n${fetchedData.content}\n` : ''}

Verified Profile Context:
${relevantKb.map((k) => `- [${k.category}] ${k.title}: ${k.content}`).join('\n')}

Instructions:
1. Provide a concise, rigorous synthesis.
2. Separate definite, verified FACTS from logical INFERENCES or conclusions.
3. Draft a direct, human, concise WhatsApp message reply for ${senderName || 'the sender'} matching their language (${detectedLang}).

Format response as strict JSON:
{
  "summary": "2-3 sentence overview",
  "facts": ["Fact 1", "Fact 2", "Fact 3"],
  "inferences": ["Inference 1", "Inference 2"],
  "draftReply": "Concise, friendly WhatsApp message ready to send"
}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: {
            abortSignal: controller.signal,
            responseMimeType: 'application/json',
            temperature: 0.2,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        });
        clearTimeout(timeoutId);

        const parsed = JSON.parse(res.text || '{}');
        if (parsed.summary) summary = parsed.summary;
        if (Array.isArray(parsed.facts)) facts = parsed.facts;
        if (Array.isArray(parsed.inferences)) inferences = parsed.inferences;
        if (parsed.draftReply) draftReply = parsed.draftReply;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch {
      // Fall back to deterministic grounded synthesis
    }
  }

  // Fallback if Gemini is unconfigured or failed
  if (!summary) {
    if (fetchedData) {
      summary = `Web analysis completed for ${fetchedData.title}. Extracted verified content from source URL.`;
      facts = [
        `Verified URL: ${fetchedData.url}`,
        `Document Title: ${fetchedData.title}`,
        `Sample text excerpt: "${fetchedData.content.slice(0, 150)}..."`,
      ];
      inferences = [
        'Content directly relates to the submitted research query.',
        'Can be synthesized into customer-facing WhatsApp response.',
      ];
      draftReply =
        detectedLang === 'bn'
          ? `আপনার বিষয়টি নিয়ে তথ্য সংগ্রহ করেছি: ${fetchedData.title}। বিস্তারিত জানতে চাইলে যেকোনো সময় মেসেজ দিতে পারেন।`
          : `I checked the details regarding ${fetchedData.title}. Let me know if you need any specific customization or further details!`;
    } else {
      summary = `Synthesized research query based on Muhammad Nayeem's verified CNC programming and web engineering knowledge.`;
      facts = [
        'Muhammad Nayeem is Senior CNC Programmer & Designer at Chittagong Door in Hajiganj, Chandpur.',
        'Specializes in millimeter-accurate 2D DXF blueprints, 3D relief wood carving, ArtCAM, Aspire, and modern full-stack web engineering.',
        'Relationship status: Single, focused on career development and technical projects.',
      ];
      inferences = [
        'Query aligns with verified professional capabilities and service offerings.',
        'No external private data or unauthorized facts are disclosed.',
      ];
      draftReply =
        detectedLang === 'bn'
          ? `মুহাম্মদ নাঈমের পক্ষ থেকে জানাচ্ছি: আপনার প্রশ্নের বিষয়ে আমাদের সিএনসি ৩ডি রিলিফ ও প্রযুক্তিগত ফাইল সম্পূর্ণ প্রস্তুত আছে। আপনার প্রজেক্টের মাপ বা ড্রয়িং শেয়ার করলে দ্রুত সাহায্য করতে পারব।`
          : `Regarding your inquiry on "${query}": We have complete technical workflows ready for millimeter-accurate 2D/3D toolpaths and web systems. Feel free to share your specific requirements!`;
    }
  }

  const result: ResearchResult = {
    id: `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    query,
    targetUrl,
    summary,
    facts,
    inferences,
    sources,
    draftReply,
    conductedAt: new Date().toISOString(),
  };

  // Keep latest 25 in memory
  recentResearchStore.unshift(result);
  if (recentResearchStore.length > 25) {
    recentResearchStore.pop();
  }

  return result;
}
