/**
 * Minimal XLSX reader for the catalog sources (ADR-0038 D5).
 *
 * The official HKEX "List of Securities" files store every cell as an INLINE
 * string (`<is><t>…</t></is>`), so a full spreadsheet engine is overkill. We
 * unzip with `fflate` (tiny, maintained, no native deps) and regex the one
 * worksheet into rows keyed by column letter. This deliberately handles only
 * the subset of the OOXML spreadsheet format the HKEX files actually use
 * (inline strings + numeric `<v>`), not the entire spec.
 *
 * Namespace-agnostic: HKEX uses the `x:` prefix on tags, but other producers
 * omit it, so the patterns accept an optional `\w+:` prefix.
 */

import { unzipSync, strFromU8 } from 'fflate';

/** A worksheet row: column letter (A, B, C, …) → decoded cell text. */
export type XlsxRow = Record<string, string>;

const decodeEntities = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');

const columnLetter = (cellRef: string): string => cellRef.replace(/\d+$/, '');

const CELL_RE =
  /<(?:\w+:)?c\b[^>]*\sr="([A-Z]+\d+)"[^>]*?>(?:<(?:\w+:)?is>(?:<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>)?<\/(?:\w+:)?is>|<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>)?<\/(?:\w+:)?c>/g;

const ROW_RE = /<(?:\w+:)?row\b[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g;

/**
 * Parse the first worksheet of an XLSX buffer into rows keyed by column
 * letter. Empty cells are omitted from the row object.
 */
export function parseXlsxRows(buffer: Uint8Array): XlsxRow[] {
  const files = unzipSync(buffer);
  const sheetEntry = Object.keys(files).find((name) => /^xl\/worksheets\/sheet1\.xml$/i.test(name));
  if (!sheetEntry) {
    throw new Error('XLSX: xl/worksheets/sheet1.xml not found');
  }

  const sheetBytes = files[sheetEntry];
  if (!sheetBytes) {
    throw new Error('XLSX: worksheet entry is empty');
  }
  const xml = strFromU8(sheetBytes);
  const rows: XlsxRow[] = [];

  for (const rowMatch of xml.matchAll(ROW_RE)) {
    const body = rowMatch[1];
    if (body === undefined) continue;
    const row: XlsxRow = {};
    for (const cell of body.matchAll(CELL_RE)) {
      const ref = cell[1];
      const raw = cell[2] ?? cell[3];
      if (ref === undefined || raw === undefined || raw === '') continue;
      row[columnLetter(ref)] = decodeEntities(raw);
    }
    if (Object.keys(row).length > 0) rows.push(row);
  }

  return rows;
}

/** Fetch a URL as a byte buffer with a descriptive User-Agent. */
export async function fetchBuffer(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'OpenTrade-Instrument-Sync/1.0 (+https://opentrade.io)' },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} returned ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
