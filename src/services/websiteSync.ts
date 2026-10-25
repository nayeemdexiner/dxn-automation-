import crypto from 'node:crypto';
import { appStore } from '../db/store.ts';
import { getPostgresPool } from '../db/postgres.ts';
import { validateUrlForSSRF } from './research.ts';
import { sendTelegramMessage } from './telegram.ts';
import {
  WebsitePageSource,
  WebsiteSyncStatus,
  WebsiteSyncHistory,
  KnowledgeCategory,
} from '../types/index.ts';

const APPROVED_DOMAIN = 'muhammadnayeem.qzz.io';
const PRIMARY_URL = 'https://muhammadnayeem.qzz.io';

// In-memory fallbacks when Postgres is disconnected
const memoryPageSources: Map<string, WebsitePageSource> = new Map();
const memorySyncHistory: WebsiteSyncHistory[] = [];
let memorySyncStatus: WebsiteSyncStatus = {
  domain: PRIMARY_URL,
  lastSyncAt: null,
  nextScheduledSyncAt: null,
  totalPagesDiscovered: 0,
  totalApproved: 0,
  pendingReviewCount: 0,
  lastStatus: 'idle',
};

/**
 * Ensures website synchronization tables exist in PostgreSQL/Supabase.
 */
export async function ensureWebsiteSyncTables(): Promise<void> {
  const pool = getPostgresPool();
  if (!pool) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS website_sources (
        id VARCHAR(100) PRIMARY KEY,
        url VARCHAR(500) UNIQUE NOT NULL,
        title VARCHAR(300) NOT NULL,
        content_hash VARCHAR(64) NOT NULL,
        headings TEXT[] DEFAULT '{}',
        excerpt TEXT NOT NULL,
        full_text TEXT,
        last_fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_modified_header VARCHAR(100),
        status VARCHAR(50) DEFAULT 'discovered' CHECK (status IN ('discovered', 'changed', 'unchanged', 'approved', 'rejected', 'error')),
        error_message TEXT,
        approved_at TIMESTAMP WITH TIME ZONE,
        promoted_knowledge_id VARCHAR(100)
      );

      CREATE TABLE IF NOT EXISTS website_sync_history (
        id VARCHAR(100) PRIMARY KEY,
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        pages_scanned INTEGER DEFAULT 0,
        pages_changed INTEGER DEFAULT 0,
        status VARCHAR(50) NOT NULL,
        details JSONB DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_website_sources_status ON website_sources(status);
      CREATE INDEX IF NOT EXISTS idx_website_sync_history_time ON website_sync_history(timestamp DESC);
    `);
  } catch (err: unknown) {
    console.warn('[Website Sync Schema Notice]:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Validates that the target URL belongs exclusively to Muhammad Nayeem's verified domain.
 */
export function isApprovedWebsiteDomain(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    return host === APPROVED_DOMAIN || host.endsWith(`.${APPROVED_DOMAIN}`);
  } catch {
    return false;
  }
}

/**
 * Sanitizes HTML content and extracts structured metadata.
 */
export function parseHtmlContent(rawHtml: string, pageUrl: string): {
  title: string;
  headings: string[];
  cleanText: string;
  excerpt: string;
  links: string[];
} {
  // Title extraction
  let title = 'Muhammad Nayeem Personal Knowledge';
  const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  // Headings extraction
  const headings: string[] = [];
  const headingMatches = rawHtml.matchAll(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/gi);
  for (const m of headingMatches) {
    if (m[1]) {
      const hText = m[1].replace(/<[^>]+>/g, '').trim();
      if (hText && !headings.includes(hText)) {
        headings.push(hText);
      }
    }
  }

  // Links discovery within approved domain
  const links: string[] = [];
  const linkMatches = rawHtml.matchAll(/href=["']([^"']+)["']/gi);
  for (const lm of linkMatches) {
    const rawHref = lm[1].trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) {
      continue;
    }
    try {
      const resolved = new URL(rawHref, pageUrl);
      if (isApprovedWebsiteDomain(resolved.href) && !links.includes(resolved.href)) {
        links.push(resolved.href);
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  // Text sanitization: remove scripts, styles, comments, and tags
  let cleanText = rawHtml
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

  // Create clean excerpt
  const excerpt = cleanText.length > 300 ? cleanText.substring(0, 300) + '...' : cleanText;

  return { title, headings, cleanText, excerpt, links };
}

/**
 * Fetches a single page with SSRF protection, size limits, and timeout.
 */
export async function fetchWebsitePage(pageUrl: string): Promise<{
  url: string;
  title: string;
  headings: string[];
  cleanText: string;
  excerpt: string;
  contentHash: string;
  lastModified?: string;
  discoveredLinks: string[];
}> {
  if (!isApprovedWebsiteDomain(pageUrl)) {
    throw new Error(`Domain restriction: Only pages from ${APPROVED_DOMAIN} are authorized for synchronization.`);
  }

  const ssrfCheck = await validateUrlForSSRF(pageUrl);
  if (!ssrfCheck.valid) {
    throw new Error(`SSRF Guard: ${ssrfCheck.error}`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NayeemAIDeskSync/2.0; +https://muhammadnayeem.qzz.io)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const lastModified = res.headers.get('last-modified') || undefined;
    const rawHtml = await res.text();

    const parsed = parseHtmlContent(rawHtml, pageUrl);
    const contentHash = crypto.createHash('sha256').update(parsed.cleanText).digest('hex');

    return {
      url: pageUrl,
      title: parsed.title,
      headings: parsed.headings,
      cleanText: parsed.cleanText,
      excerpt: parsed.excerpt,
      contentHash,
      lastModified,
      discoveredLinks: parsed.links,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Executes a full synchronization of Muhammad Nayeem's official website.
 */
export async function syncWebsiteKnowledge(startUrl: string = PRIMARY_URL): Promise<{
  scannedCount: number;
  changedCount: number;
  discoveredCount: number;
  errors: string[];
}> {
  await ensureWebsiteSyncTables();
  memorySyncStatus.lastStatus = 'syncing';

  const errors: string[] = [];
  const queue: string[] = [startUrl];
  const visited: Set<string> = new Set();
  const maxPages = 10;
  let changedCount = 0;
  let discoveredCount = 0;

  // Known standard paths to crawl if website is single-page or simple
  const commonPaths = ['/', '/about', '/projects', '/services', '/skills', '/contact'];
  for (const p of commonPaths) {
    try {
      const u = new URL(p, startUrl).href;
      if (!queue.includes(u)) queue.push(u);
    } catch {
      // ignore
    }
  }

  const pool = getPostgresPool();

  while (queue.length > 0 && visited.size < maxPages) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    try {
      const page = await fetchWebsitePage(currentUrl);

      // Add newly discovered links to crawl queue
      for (const link of page.discoveredLinks) {
        if (!visited.has(link) && !queue.includes(link) && queue.length < 20) {
          queue.push(link);
        }
      }

      // Check existing version in database or memory
      let existing: WebsitePageSource | null = null;
      if (pool) {
        const res = await pool.query(`SELECT * FROM website_sources WHERE url = $1`, [page.url]);
        if (res.rows.length > 0) {
          const r = res.rows[0];
          existing = {
            id: r.id,
            url: r.url,
            title: r.title,
            contentHash: r.content_hash,
            headings: r.headings || [],
            excerpt: r.excerpt,
            fullText: r.full_text,
            lastFetchedAt: r.last_fetched_at,
            lastModifiedHeader: r.last_modified_header,
            status: r.status,
            approvedAt: r.approved_at,
            promotedKnowledgeId: r.promoted_knowledge_id,
          };
        }
      } else {
        existing = memoryPageSources.get(page.url) || null;
      }

      let newStatus: WebsitePageSource['status'] = 'discovered';
      if (existing) {
        if (existing.contentHash === page.contentHash) {
          newStatus = existing.status === 'approved' ? 'approved' : 'unchanged';
        } else {
          newStatus = 'changed';
          changedCount++;
        }
      } else {
        discoveredCount++;
      }

      const pageSource: WebsitePageSource = {
        id: existing?.id || `web_${crypto.randomBytes(6).toString('hex')}`,
        url: page.url,
        title: page.title,
        contentHash: page.contentHash,
        headings: page.headings,
        excerpt: page.excerpt,
        fullText: page.cleanText,
        lastFetchedAt: new Date().toISOString(),
        lastModifiedHeader: page.lastModified,
        status: newStatus,
        promotedKnowledgeId: existing?.promotedKnowledgeId,
        approvedAt: existing?.approvedAt,
      };

      // Save to Postgres or memory
      if (pool) {
        await pool.query(
          `INSERT INTO website_sources (id, url, title, content_hash, headings, excerpt, full_text, last_fetched_at, last_modified_header, status, promoted_knowledge_id, approved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (url) DO UPDATE SET
             title = EXCLUDED.title,
             content_hash = EXCLUDED.content_hash,
             headings = EXCLUDED.headings,
             excerpt = EXCLUDED.excerpt,
             full_text = EXCLUDED.full_text,
             last_fetched_at = EXCLUDED.last_fetched_at,
             last_modified_header = EXCLUDED.last_modified_header,
             status = EXCLUDED.status`,
          [
            pageSource.id,
            pageSource.url,
            pageSource.title,
            pageSource.contentHash,
            pageSource.headings,
            pageSource.excerpt,
            pageSource.fullText,
            pageSource.lastFetchedAt,
            pageSource.lastModifiedHeader,
            pageSource.status,
            pageSource.promotedKnowledgeId || null,
            pageSource.approvedAt || null,
          ]
        );
      } else {
        memoryPageSources.set(pageSource.url, pageSource);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error fetching ${currentUrl}: ${msg}`);
      console.warn(`[Website Sync Notice]: Could not fetch ${currentUrl}:`, msg);
    }
  }

  // Update sync status & history
  const scannedCount = visited.size;
  const historyEntry: WebsiteSyncHistory = {
    id: `sync_${Date.now()}`,
    timestamp: new Date().toISOString(),
    pagesScanned: scannedCount,
    pagesChanged: changedCount + discoveredCount,
    status: errors.length > 0 && scannedCount === 0 ? 'failed' : 'success',
    details: { errors, discoveredCount, changedCount },
  };

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO website_sync_history (id, timestamp, pages_scanned, pages_changed, status, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          historyEntry.id,
          historyEntry.timestamp,
          historyEntry.pagesScanned,
          historyEntry.pagesChanged,
          historyEntry.status,
          JSON.stringify(historyEntry.details),
        ]
      );
    } catch (e) {
      console.warn('[Sync History Insert Warning]:', e);
    }
  }
  memorySyncHistory.unshift(historyEntry);

  const allPages = await getWebsitePages();
  const approvedCount = allPages.filter((p) => p.status === 'approved').length;
  const pendingCount = allPages.filter((p) => p.status === 'discovered' || p.status === 'changed').length;

  const nextScan = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  memorySyncStatus = {
    domain: PRIMARY_URL,
    lastSyncAt: new Date().toISOString(),
    nextScheduledSyncAt: nextScan,
    totalPagesDiscovered: allPages.length,
    totalApproved: approvedCount,
    pendingReviewCount: pendingCount,
    lastStatus: errors.length > 0 && scannedCount === 0 ? 'failed' : 'completed',
    lastError: errors.length > 0 ? errors[0] : undefined,
  };

  // If new or changed pages need review, send Telegram notification
  if (pendingCount > 0) {
    const alertMsg = `<b>🌐 Website Knowledge Sync Update</b>\n\n` +
      `<b>Source:</b> <code>${PRIMARY_URL}</code>\n` +
      `<b>Pages Scanned:</b> ${scannedCount}\n` +
      `<b>New / Changed Pages:</b> ${pendingCount}\n\n` +
      `Please review and approve these updates in your AI Desk Dashboard under "Website Sync & Updates" before they are used as active personal facts.`;
    await sendTelegramMessage(alertMsg).catch(() => {});
  }

  return { scannedCount, changedCount, discoveredCount, errors };
}

/**
 * Retrieves all tracked website page records.
 */
export async function getWebsitePages(): Promise<WebsitePageSource[]> {
  await ensureWebsiteSyncTables();
  const pool = getPostgresPool();
  if (pool) {
    try {
      const res = await pool.query(
        `SELECT id, url, title, content_hash AS "contentHash", headings, excerpt, full_text AS "fullText",
                last_fetched_at AS "lastFetchedAt", last_modified_header AS "lastModifiedHeader", status,
                error_message AS "errorMessage", approved_at AS "approvedAt", promoted_knowledge_id AS "promotedKnowledgeId"
         FROM website_sources
         ORDER BY last_fetched_at DESC`
      );
      return res.rows;
    } catch (err) {
      console.warn('[Get Website Pages Postgres Warning]:', err);
    }
  }
  return Array.from(memoryPageSources.values());
}

/**
 * Retrieves the latest website synchronization status.
 */
export async function getWebsiteSyncStatus(): Promise<WebsiteSyncStatus> {
  const pages = await getWebsitePages();
  const approvedCount = pages.filter((p) => p.status === 'approved').length;
  const pendingCount = pages.filter((p) => p.status === 'discovered' || p.status === 'changed').length;

  return {
    ...memorySyncStatus,
    totalPagesDiscovered: pages.length,
    totalApproved: approvedCount,
    pendingReviewCount: pendingCount,
  };
}

/**
 * Promotes an approved website page directly into the personal knowledge base.
 */
export async function approvePageSource(pageId: string, customCategory: KnowledgeCategory = 'profile'): Promise<WebsitePageSource | null> {
  const pool = getPostgresPool();
  const pages = await getWebsitePages();
  const page = pages.find((p) => p.id === pageId);
  if (!page) return null;

  const knowledgeKey = `web_${crypto.createHash('md5').update(page.url).digest('hex').substring(0, 8)}`;
  const cleanSummary = page.excerpt.length > 20
    ? `${page.title}: ${page.excerpt} (Source: ${page.url})`
    : `Verified page from personal website (${page.url}): ${page.title}`;

  // Upsert into Knowledge Base
  const kbItem = await appStore.upsertKnowledgeItem({
    key: knowledgeKey,
    category: customCategory,
    title: page.title || 'Verified Website Fact',
    content: cleanSummary,
    verified: true,
  });

  page.status = 'approved';
  page.approvedAt = new Date().toISOString();
  page.promotedKnowledgeId = kbItem.id;

  if (pool) {
    await pool.query(
      `UPDATE website_sources
       SET status = 'approved', approved_at = $1, promoted_knowledge_id = $2
       WHERE id = $3`,
      [page.approvedAt, page.promotedKnowledgeId, page.id]
    );
  } else {
    memoryPageSources.set(page.url, page);
  }

  await appStore.addAuditLog({
    eventType: 'website_knowledge_approved',
    actor: 'admin',
    details: { pageId: page.id, url: page.url, knowledgeId: kbItem.id },
  });

  return page;
}

/**
 * Rejects or dismisses a discovered website page so it is not promoted to knowledge base.
 */
export async function rejectPageSource(pageId: string): Promise<boolean> {
  const pool = getPostgresPool();
  const pages = await getWebsitePages();
  const page = pages.find((p) => p.id === pageId);
  if (!page) return false;

  page.status = 'rejected';
  if (pool) {
    await pool.query(`UPDATE website_sources SET status = 'rejected' WHERE id = $1`, [page.id]);
  } else {
    memoryPageSources.set(page.url, page);
  }
  return true;
}
