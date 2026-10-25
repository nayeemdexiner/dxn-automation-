import crypto from 'node:crypto';
import { appStore } from '../db/store.ts';
import { KnowledgeCategory, FAQImportPreviewItem, FAQImportResult, KnowledgeItem } from '../types/index.ts';

/**
 * Normalizes any standard Google Sheets URL to a public CSV export URL.
 */
export function normalizeGoogleSheetsUrl(rawUrl: string): { exportUrl: string; sheetId?: string } {
  const trimmed = rawUrl.trim();

  // Pattern 1: docs.google.com/spreadsheets/d/e/{PUB_ID}/pubhtml or /pub
  if (trimmed.includes('/spreadsheets/d/e/')) {
    const match = trimmed.match(/\/spreadsheets\/d\/e\/([^/?#]+)/);
    if (match && match[1]) {
      const pubId = match[1];
      return {
        exportUrl: `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?output=csv`,
        sheetId: pubId,
      };
    }
  }

  // Pattern 2: docs.google.com/spreadsheets/d/{SHEET_ID}
  if (trimmed.includes('/spreadsheets/d/')) {
    const match = trimmed.match(/\/spreadsheets\/d\/([^/?#]+)/);
    if (match && match[1]) {
      const sheetId = match[1];
      // Check for specific gid
      const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
      return {
        exportUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`,
        sheetId,
      };
    }
  }

  // Direct CSV URL or already formatted
  return { exportUrl: trimmed };
}

/**
 * Parses raw CSV text into an array of object records based on headers.
 */
export function parseCsvRows(csvText: string): Array<Record<string, string>> {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return [];
  }

  // Simple and robust CSV line splitter respecting quoted fields
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let current = '';
    let insideQuote = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuote && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          insideQuote = !insideQuote;
        }
      } else if (char === ',' && !insideQuote) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const rowObj: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      const key = headers[h];
      if (key) {
        rowObj[key] = cols[h] || '';
      }
    }
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Converts generic parsed row records into normalized FAQ import preview items.
 */
export function normalizeRowsToFaqItems(
  rows: Array<Record<string, string>>,
  existingKb: KnowledgeItem[]
): FAQImportPreviewItem[] {
  const result: FAQImportPreviewItem[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Find question/title column
    const question =
      row['question'] ||
      row['q'] ||
      row['title'] ||
      row['topic'] ||
      row['inquiry'] ||
      row['faq'] ||
      '';

    // Find answer/content column
    const answer =
      row['answer'] ||
      row['a'] ||
      row['content'] ||
      row['reply'] ||
      row['response'] ||
      row['details'] ||
      '';

    if (!question || !answer) continue;

    // Detect category
    const rawCat = (row['category'] || row['cat'] || row['type'] || 'general').toLowerCase();
    let category: KnowledgeCategory = 'general';
    if (rawCat.includes('tech') || rawCat.includes('cnc') || rawCat.includes('cad') || rawCat.includes('code')) {
      category = 'technical';
    } else if (
      rawCat.includes('pric') ||
      rawCat.includes('cost') ||
      rawCat.includes('rate') ||
      rawCat.includes('quote') ||
      rawCat.includes('fee')
    ) {
      category = 'pricing';
    } else if (rawCat.includes('service')) {
      category = 'service';
    } else if (rawCat.includes('skill')) {
      category = 'skill';
    } else if (rawCat.includes('project')) {
      category = 'project';
    } else if (rawCat.includes('faq')) {
      category = 'faq';
    } else if (rawCat.includes('profile')) {
      category = 'profile';
    }

    // Generate unique slug key
    const rawKey = row['key'] || question;
    const cleanSlug = rawKey
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 40);
    const key = `faq_${cleanSlug || crypto.randomBytes(3).toString('hex')}`;

    // Duplicate detection
    const existing = existingKb.find(
      (k) => k.key === key || k.title.toLowerCase() === question.toLowerCase()
    );

    const tags = row['tags']
      ? row['tags'].split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
      : [category];

    result.push({
      key,
      question: question.trim(),
      answer: answer.trim(),
      category,
      tags,
      language: row['language'] || row['lang'] || 'auto',
      isDuplicate: Boolean(existing),
      existingId: existing?.id,
    });
  }

  return result;
}

/**
 * Parses free-form text blocks into structured FAQ entries.
 * Example format:
 * Question: What do you do?
 * Answer: I work with CNC programming, CAD/CAM, and precision design.
 * Category: General
 */
export function parseBatchFaqText(
  rawText: string,
  existingKb: KnowledgeItem[]
): FAQImportPreviewItem[] {
  const items: FAQImportPreviewItem[] = [];
  // Split on double newlines or "Question:" boundaries
  const blocks = rawText.split(/\n\s*(?=(?:question|q)\s*:)/i);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const qMatch = block.match(/(?:question|q)\s*:\s*([^\n]+)/i);
    const aMatch = block.match(/(?:answer|a|reply)\s*:\s*([\s\S]+?)(?=\n\s*(?:category|tags|key|$))/i);
    const catMatch = block.match(/category\s*:\s*([^\n]+)/i);
    const tagsMatch = block.match(/tags\s*:\s*([^\n]+)/i);

    if (qMatch && qMatch[1]) {
      const question = qMatch[1].trim();
      const answer = (aMatch && aMatch[1] ? aMatch[1].trim() : '').trim();
      if (!question || !answer) continue;

      const rawCat = (catMatch && catMatch[1] ? catMatch[1].trim() : 'general').toLowerCase();
      let category: KnowledgeCategory = 'general';
      if (rawCat.includes('tech') || rawCat.includes('cnc') || rawCat.includes('cad')) category = 'technical';
      else if (rawCat.includes('pric') || rawCat.includes('rate') || rawCat.includes('cost')) category = 'pricing';
      else if (rawCat.includes('service')) category = 'service';
      else if (rawCat.includes('skill')) category = 'skill';
      else if (rawCat.includes('project')) category = 'project';
      else if (rawCat.includes('faq')) category = 'faq';

      const key = `faq_${question.toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 36)}`;
      const existing = existingKb.find(
        (k) => k.key === key || k.title.toLowerCase() === question.toLowerCase()
      );

      items.push({
        key,
        question,
        answer,
        category,
        tags: tagsMatch ? tagsMatch[1].split(',').map((t) => t.trim()) : [category],
        isDuplicate: Boolean(existing),
        existingId: existing?.id,
      });
    }
  }

  return items;
}

/**
 * Fetches and parses a Google Sheets public URL into FAQ preview items.
 */
export async function fetchGoogleSheetFaq(sheetUrl: string): Promise<FAQImportPreviewItem[]> {
  const { exportUrl } = normalizeGoogleSheetsUrl(sheetUrl);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(exportUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 NayeemAIDesk/2.0 GoogleSheetImporter',
        Accept: 'text/csv,text/plain,*/*',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(
        `Failed to fetch Google Sheet (${res.status} ${res.statusText}). Ensure sheet sharing is set to "Anyone with the link can view".`
      );
    }

    const csvText = await res.text();
    const rows = parseCsvRows(csvText);

    if (rows.length === 0) {
      throw new Error('Google Sheet returned empty or invalid CSV data.');
    }

    const existingKb = await appStore.getKnowledgeBase();
    return normalizeRowsToFaqItems(rows, existingKb);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Google Sheets request timed out after 8 seconds.');
    }
    throw err;
  }
}

/**
 * Commits a list of validated FAQ preview items into the real database.
 */
export async function commitFaqImport(
  items: FAQImportPreviewItem[],
  overwriteExisting: boolean = true
): Promise<FAQImportResult> {
  let importedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      if (item.isDuplicate && !overwriteExisting) {
        skippedCount++;
        continue;
      }

      await appStore.upsertKnowledgeItem({
        id: item.existingId,
        key: item.key,
        category: item.category,
        title: item.question,
        content: item.answer,
        verified: true,
      });

      if (item.isDuplicate) {
        updatedCount++;
      } else {
        importedCount++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Error saving "${item.question}": ${msg}`);
    }
  }

  await appStore.addAuditLog({
    eventType: 'faq_batch_imported',
    actor: 'admin',
    details: {
      total: items.length,
      importedCount,
      updatedCount,
      skippedCount,
      errorCount: errors.length,
    },
  });

  return {
    totalProcessed: items.length,
    importedCount,
    updatedCount,
    skippedCount,
    errors,
  };
}
