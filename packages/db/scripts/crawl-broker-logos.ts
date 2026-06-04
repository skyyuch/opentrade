/**
 * Broker Logo Crawler
 *
 * Multi-strategy script that:
 * 1. Reads CE numbers from sfc-brokers.json
 * 2. Scrapes website URLs from SFC register (addresses page)
 * 3. Acquires logos via apple-touch-icon, og:image, Clearbit, Google Favicon
 * 4. Uploads to S3
 * 5. Updates DB (websiteUrl + logoUrl)
 *
 * Resumable: progress saved to crawl-progress.json
 *
 * Run via:
 *   pnpm --filter @opentrade/db crawl:logos
 *
 * Environment variables:
 *   ASSETS_BUCKET_NAME - S3 bucket name (required)
 *   ASSETS_CDN_URL     - CloudFront URL prefix (required)
 *   AWS_PROFILE        - AWS profile (default: opentrade-dev)
 *   DATABASE_URL       - Postgres connection string (required)
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { load as cheerioLoad } from 'cheerio';
import sharp from 'sharp';

import { prisma } from '../src/index.js';

import type { PrismaClient } from '../src/generated/prisma/client.js';
import type { SfcBrokerData } from '../src/sfc/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BUCKET_NAME = process.env['ASSETS_BUCKET_NAME'] ?? '';
const CDN_URL = process.env['ASSETS_CDN_URL'] ?? '';
const AWS_REGION = process.env['AWS_REGION'] ?? 'ap-southeast-1';

const SFC_ADDRESSES_URL = 'https://apps.sfc.hk/publicregWeb/corp/{ceref}/addresses';
const SFC_REQUEST_DELAY_MS = 500;
const LOGO_REQUEST_DELAY_MS = 300;
const CONCURRENCY = 5;
const MIN_LOGO_SIZE = 48;
const TARGET_LOGO_SIZE = 256;

const PROGRESS_FILE = resolve(__dirname, '../crawl-progress.json');
const FAILURES_FILE = resolve(__dirname, '../crawl-failures.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CrawlProgress = {
  completedCeNumbers: string[];
  websiteUrlMap: Record<string, string>;
  logoUrlMap: Record<string, string>;
  lastUpdated: string;
};

type CrawlFailure = {
  ceNumber: string;
  slug: string;
  legalName: string;
  stage: 'website' | 'logo' | 'upload';
  error: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadProgress(): CrawlProgress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8')) as CrawlProgress;
  }
  return {
    completedCeNumbers: [],
    websiteUrlMap: {},
    logoUrlMap: {},
    lastUpdated: new Date().toISOString(),
  };
}

function saveProgress(progress: CrawlProgress): void {
  progress.lastUpdated = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2) + '\n', 'utf-8');
}

function loadFailures(): CrawlFailure[] {
  if (existsSync(FAILURES_FILE)) {
    return JSON.parse(readFileSync(FAILURES_FILE, 'utf-8')) as CrawlFailure[];
  }
  return [];
}

function saveFailures(failures: CrawlFailure[]): void {
  writeFileSync(FAILURES_FILE, JSON.stringify(failures, null, 2) + '\n', 'utf-8');
}

// ---------------------------------------------------------------------------
// Step 1: Scrape website URL from SFC register
// ---------------------------------------------------------------------------

async function fetchWebsiteFromSfc(ceNumber: string): Promise<string | null> {
  const url = SFC_ADDRESSES_URL.replace('{ceref}', ceNumber);

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'OpenTrade-LogoCrawler/1.0',
        Accept: 'text/html',
      },
    });

    if (!res.ok) return null;

    const html = await res.text();
    const match = /var\s+websiteData\s*=\s*(\[.*?\]);/.exec(html);
    if (!match?.[1]) return null;

    const data = JSON.parse(match[1]) as { website: string }[];
    if (data.length === 0 || !data[0]?.website) return null;

    let website = data[0].website.trim();
    if (!website.startsWith('http')) {
      website = `https://${website}`;
    }

    return website;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Step 2: Logo acquisition strategies
// ---------------------------------------------------------------------------

function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0] ?? '';
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'OpenTrade-LogoCrawler/1.0' },
      redirect: 'follow',
    });
    clearTimeout(timer);
    return res;
  } catch {
    return null;
  }
}

async function tryAppleTouchIcon(websiteUrl: string): Promise<Buffer | null> {
  const res = await fetchWithTimeout(websiteUrl);
  if (!res?.ok) return null;

  const html = await res.text();
  const $ = cheerioLoad(html);

  const iconHref =
    $('link[rel="apple-touch-icon"]').attr('href') ??
    $('link[rel="apple-touch-icon-precomposed"]').attr('href');

  if (!iconHref) return null;

  const iconUrl = new URL(iconHref, websiteUrl).href;
  const iconRes = await fetchWithTimeout(iconUrl);
  if (!iconRes?.ok) return null;

  const contentType = iconRes.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) return null;

  return Buffer.from(await iconRes.arrayBuffer());
}

async function tryOgImage(websiteUrl: string): Promise<Buffer | null> {
  const res = await fetchWithTimeout(websiteUrl);
  if (!res?.ok) return null;

  const html = await res.text();
  const $ = cheerioLoad(html);

  const ogImage = $('meta[property="og:image"]').attr('content');
  if (!ogImage) return null;

  const imageUrl = new URL(ogImage, websiteUrl).href;
  const imageRes = await fetchWithTimeout(imageUrl);
  if (!imageRes?.ok) return null;

  const contentType = imageRes.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) return null;

  return Buffer.from(await imageRes.arrayBuffer());
}

async function tryClearbit(domain: string): Promise<Buffer | null> {
  const url = `https://logo.clearbit.com/${domain}`;
  const res = await fetchWithTimeout(url);
  if (!res?.ok) return null;

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.startsWith('image/')) return null;

  return Buffer.from(await res.arrayBuffer());
}

async function tryGoogleFavicon(domain: string): Promise<Buffer | null> {
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  const res = await fetchWithTimeout(url);
  if (!res?.ok) return null;

  return Buffer.from(await res.arrayBuffer());
}

async function acquireLogo(websiteUrl: string): Promise<Buffer | null> {
  const domain = extractDomain(websiteUrl);

  // Strategy 1: apple-touch-icon (best quality, usually 180x180)
  const touchIcon = await tryAppleTouchIcon(websiteUrl);
  if (touchIcon && (await isValidLogo(touchIcon))) return touchIcon;

  // Strategy 2: Clearbit Logo API (high quality, 128px+)
  const clearbit = await tryClearbit(domain);
  if (clearbit && (await isValidLogo(clearbit))) return clearbit;

  // Strategy 3: og:image (variable quality, might be a banner)
  const ogImage = await tryOgImage(websiteUrl);
  if (ogImage && (await isValidLogo(ogImage))) return ogImage;

  // Strategy 4: Google Favicon (guaranteed but low quality)
  const favicon = await tryGoogleFavicon(domain);
  if (favicon && (await isValidLogo(favicon))) return favicon;

  return null;
}

// ---------------------------------------------------------------------------
// Step 3: Image validation & processing
// ---------------------------------------------------------------------------

async function isValidLogo(buffer: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.width || !meta.height) return false;
    return meta.width >= MIN_LOGO_SIZE && meta.height >= MIN_LOGO_SIZE;
  } catch {
    return false;
  }
}

async function processLogo(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(TARGET_LOGO_SIZE, TARGET_LOGO_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Step 4: S3 upload
// ---------------------------------------------------------------------------

function createS3Client(): S3Client {
  return new S3Client({ region: AWS_REGION });
}

async function uploadToS3(s3: S3Client, slug: string, buffer: Buffer): Promise<string> {
  const key = `logos/brokers/${slug}.png`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return `${CDN_URL}/${key}`;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function processBroker(
  broker: SfcBrokerData,
  s3: S3Client,
  progress: CrawlProgress,
  failures: CrawlFailure[],
): Promise<void> {
  const { ceNumber, slug, legalNameEn } = broker;

  // Step 1: Get website URL
  let websiteUrl = progress.websiteUrlMap[ceNumber] ?? null;
  if (!websiteUrl) {
    websiteUrl = await fetchWebsiteFromSfc(ceNumber);
    await sleep(SFC_REQUEST_DELAY_MS);

    if (websiteUrl) {
      progress.websiteUrlMap[ceNumber] = websiteUrl;
    } else {
      failures.push({
        ceNumber,
        slug,
        legalName: legalNameEn,
        stage: 'website',
        error: 'No website found on SFC',
      });
      progress.completedCeNumbers.push(ceNumber);
      return;
    }
  }

  // Step 2: Acquire logo
  let logoBuffer: Buffer | null = null;
  try {
    logoBuffer = await acquireLogo(websiteUrl);
    await sleep(LOGO_REQUEST_DELAY_MS);
  } catch (err) {
    failures.push({
      ceNumber,
      slug,
      legalName: legalNameEn,
      stage: 'logo',
      error: err instanceof Error ? err.message : String(err),
    });
    progress.completedCeNumbers.push(ceNumber);
    return;
  }

  if (!logoBuffer) {
    failures.push({
      ceNumber,
      slug,
      legalName: legalNameEn,
      stage: 'logo',
      error: 'All logo strategies failed',
    });
    progress.completedCeNumbers.push(ceNumber);
    return;
  }

  // Step 3: Process and upload
  try {
    const processed = await processLogo(logoBuffer);
    const logoUrl = await uploadToS3(s3, slug, processed);
    progress.logoUrlMap[ceNumber] = logoUrl;
  } catch (err) {
    failures.push({
      ceNumber,
      slug,
      legalName: legalNameEn,
      stage: 'upload',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  progress.completedCeNumbers.push(ceNumber);
}

async function processBatch(
  batch: SfcBrokerData[],
  s3: S3Client,
  progress: CrawlProgress,
  failures: CrawlFailure[],
): Promise<void> {
  const tasks = batch.map((broker) => processBroker(broker, s3, progress, failures));
  await Promise.allSettled(tasks);
}

async function updateDatabase(prisma: PrismaClient, progress: CrawlProgress): Promise<void> {
  console.log('\nUpdating database...');

  const jsonPath = resolve(__dirname, '../seed/data/sfc-brokers.json');
  const brokers = JSON.parse(readFileSync(jsonPath, 'utf-8')) as SfcBrokerData[];

  let websiteUpdates = 0;
  let logoUpdates = 0;

  for (const broker of brokers) {
    const websiteUrl = progress.websiteUrlMap[broker.ceNumber];
    const logoUrl = progress.logoUrlMap[broker.ceNumber];

    if (!websiteUrl && !logoUrl) continue;

    const updateData: { websiteUrl?: string; logoUrl?: string } = {};
    if (websiteUrl) updateData.websiteUrl = websiteUrl;
    if (logoUrl) updateData.logoUrl = logoUrl;

    await prisma.broker.updateMany({
      where: { slug: broker.slug },
      data: updateData,
    });

    if (websiteUrl) websiteUpdates++;
    if (logoUrl) logoUpdates++;
  }

  console.log(`  Updated websiteUrl for ${websiteUpdates} brokers`);
  console.log(`  Updated logoUrl for ${logoUpdates} brokers`);
}

async function main(): Promise<void> {
  if (!BUCKET_NAME || !CDN_URL) {
    console.error('Missing required env: ASSETS_BUCKET_NAME and ASSETS_CDN_URL');
    console.error('Example:');
    console.error('  ASSETS_BUCKET_NAME=opentrade-dev-assets-371637912734 \\');
    console.error('  ASSETS_CDN_URL=https://xxxxx.cloudfront.net \\');
    console.error('  pnpm --filter @opentrade/db crawl:logos');
    process.exitCode = 1;
    return;
  }

  const jsonPath = resolve(__dirname, '../seed/data/sfc-brokers.json');
  const allBrokers = JSON.parse(readFileSync(jsonPath, 'utf-8')) as SfcBrokerData[];
  console.log(`Loaded ${allBrokers.length} brokers from sfc-brokers.json`);

  const progress = loadProgress();
  const failures = loadFailures();
  const completedSet = new Set(progress.completedCeNumbers);

  const remaining = allBrokers.filter((b) => !completedSet.has(b.ceNumber));
  console.log(`Already completed: ${completedSet.size}, remaining: ${remaining.length}`);

  if (remaining.length === 0) {
    console.log('All brokers already processed. Updating database...');
    try {
      await updateDatabase(prisma, progress);
    } finally {
      await prisma.$disconnect();
    }
    return;
  }

  const s3 = createS3Client();
  const batchSize = CONCURRENCY;
  let processed = 0;

  console.log(`\nStarting crawl (concurrency=${CONCURRENCY}, delay=${SFC_REQUEST_DELAY_MS}ms)...`);
  console.log('Press Ctrl+C to stop — progress is saved automatically.\n');

  for (let i = 0; i < remaining.length; i += batchSize) {
    const batch = remaining.slice(i, i + batchSize);
    await processBatch(batch, s3, progress, failures);
    processed += batch.length;

    if (processed % 50 === 0 || i + batchSize >= remaining.length) {
      saveProgress(progress);
      saveFailures(failures);

      const websiteCount = Object.keys(progress.websiteUrlMap).length;
      const logoCount = Object.keys(progress.logoUrlMap).length;
      const failCount = failures.length;
      console.log(
        `  [${processed}/${remaining.length}] websites=${websiteCount} logos=${logoCount} failures=${failCount}`,
      );
    }
  }

  saveProgress(progress);
  saveFailures(failures);

  console.log('\n--- Crawl Complete ---');
  console.log(`  Total processed: ${progress.completedCeNumbers.length}`);
  console.log(`  Websites found: ${Object.keys(progress.websiteUrlMap).length}`);
  console.log(`  Logos acquired: ${Object.keys(progress.logoUrlMap).length}`);
  console.log(`  Failures: ${failures.length}`);

  // Update database
  try {
    await updateDatabase(prisma, progress);
  } finally {
    await prisma.$disconnect();
  }

  console.log('\nDone.');
}

// Graceful shutdown — save progress on SIGINT
process.on('SIGINT', () => {
  console.log('\n\nInterrupted — saving progress...');
  process.exit(0);
});

try {
  await main();
} catch (err) {
  console.error('Crawl failed:', err);
  process.exitCode = 1;
}
