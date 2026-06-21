# Google UI Prompt — Bullion Dealer (金商) Vertical

> **What this is.** A ready-to-paste prompt for Google (Gemini) to design the
> visuals for OpenTrade's new **bullion-dealer (金商 / HKGX member)** vertical.
> Per [ADR-0045](../decisions/0045-bullion-dealer-vertical-cgse.md) D7, all
> bullion-dealer page visuals are designed by Google; this team only wires
> data, API, state, and i18n. The DB and API shapes are now final, so the
> prop / field / tab structure below is exact. The registry was rebranded from
> CGSE (金銀業貿易場) to HKGX (香港黃金交易所) per
> [ADR-0050](../decisions/0050-rebrand-cgse-to-hkgx.md).
>
> **How to use.** Copy everything inside the fenced block titled
> "PROMPT TO PASTE" and give it to Google. The data shapes and labels are
> authoritative — they match the live API and the trilingual message files.

---

## Context for the reader (not part of the prompt)

The functional wiring already exists in the repo (reusing the securities
broker components):

- List route `apps/web/src/app/[locale]/bullion-dealers/page.tsx` → reuses
  `BrokerDirectory` with `category="BULLION"`, `namespace="bullionDealers"`.
- Detail route `apps/web/src/app/[locale]/bullion-dealers/[slug]/page.tsx` →
  reuses `BrokerDetailTabs` (tab set varies by `broker.category`).
- New `MembershipTab` (會籍) replaces the SFC `LicenseTab` for bullion.

Google's design output will be **swapped in** to replace this functional
baseline, exactly as the securities broker pages were originally
Google-designed. So the design must match the existing dark Web3 visual
language and consume the same data shape.

---

## PROMPT TO PASTE

```
You are designing two pages for OpenTrade, a Web3 decentralized review
platform for Hong Kong financial-service providers. Reviews are written to a
blockchain and can NEVER be edited or deleted by anyone, including the
platform. We are adding a new vertical: BULLION DEALERS (Chinese: 金商) — gold
and silver dealers that are members of the HKGX (Hong Kong Gold Exchange /
香港黃金交易所), Hong Kong's sole spot gold & silver exchange and a
self-regulatory bullion exchange (the corporatised successor to the former
Chinese Gold & Silver Exchange Society / 金銀業貿易場 since 2025).

These pages must be visually CONSISTENT with our existing "securities broker"
pages, which already use this design language:
- Dark theme. Near-black background (#050608). Glassmorphism cards
  (semi-transparent zinc-900 panels, white/10 borders, backdrop blur, rounded
  2xl corners).
- Single neon-green accent color #00FF88 (used for highlights, active states,
  primary actions, positive signals). Red (#f87171 / red-400) only for
  warnings / negative trust signals.
- Two soft atmospheric radial glows behind content (one green top-right, one
  blue bottom-left).
- Inter / system font for English & numbers; the page is fully responsive,
  mobile-first.
- Output as React + Tailwind CSS components. Keep the existing component
  contract (props/fields below) so engineering can swap your design in
  directly. Do NOT invent new data fields.

The product is a PURE INFORMATION PLATFORM. It gives NO investment advice.
Every page must carry a disclaimer. HKGX is a self-regulatory bullion
exchange, NOT a statutory securities regulator — never imply it is the SFC.

================================================================
SURFACE A — BULLION DEALER LIST / DIRECTORY PAGE
================================================================
A grid of bullion-dealer cards (reuse the securities broker grid layout: 1
column mobile, 2 columns md, 3 columns lg). Above the grid: a page title
("金商目錄"), a subtitle, a search box, and a "showing N dealers" count + sort
dropdown. NOTE: bullion dealers do NOT have SFC license-type filter pills (HKGX
has no regulated-activity categories) — so OMIT the row of filter pills that
the securities page shows.

Each CARD consumes this exact JSON (one array item from GET /v1/brokers?category=BULLION):
{
  "id": "uuid",
  "slug": "hkgx-009",                 // routing key, never shown as text
  "category": "BULLION",
  "displayName": "...",               // Traditional Chinese name
  "displayNameZhHans": "..." | null,  // Simplified Chinese name
  "legalName": "...",                 // English legal name
  "logoUrl": "https://..." | null,
  "isClaimed": false,
  "reviewCount": 12,
  "positiveRate": 83 | null,          // percentage, or null if no reviews
  "verifiedUserCount": 4,
  "licenses": [
    { "regulator": "HK_HKGX", "licenseNumber": "009", "status": "ACTIVE" }
  ]
}

Card content (top to bottom):
1. Logo (or 2-letter initials fallback) + the dealer name. Show the localized
   name as the headline and the other-language name as a smaller secondary
   line. The reader's locale decides which is primary (the app injects the
   correct strings; you just lay out a primary + optional secondary line).
2. A badge row:
   - A neon "HKGX 行員 {licenseNumber}" pill (shield-check icon) — read
     licenseNumber from the licenses[] entry whose regulator === "HK_HKGX".
   - If verifiedUserCount > 0: a neon pill "{count} verified users".
   - TRUST SIGNAL (red): if that HKGX license status is "SUSPENDED" or
     "REVOKED", show a red pill ("已被停業" / "已被除牌"). This is an
     immutable trust signal — design it to be noticeable but not alarming.
3. Bottom row: a large positive-rate percentage (neon) + "{reviewCount}
   reviews", and a chevron affordance to the detail page.

Card links to /bullion-dealers/{slug}.

Page footer: a one-line disclaimer that data comes from the public HKGX member
roster and is not investment advice.

================================================================
SURFACE B — BULLION DEALER DETAIL PAGE
================================================================
Reuse the securities broker detail layout: a back link, a header card, then a
two-column body (main content 2/3 + sidebar 1/3). The detail consumes
GET /v1/brokers/{slug}, which returns (bullion-relevant fields):
{
  "id": "uuid",
  "slug": "hkgx-009",
  "category": "BULLION",
  "displayName": "...", "displayNameZhHans": "..."|null, "legalName": "...",
  "description": "..."|null,
  "websiteUrl": "https://..."|null,
  "logoUrl": "https://..."|null,
  "isClaimed": false,
  "activeYears": 30|null,
  "reviewCount": 12,
  "positiveRate": 83|null,
  "verifiedUserCount": 4,
  "verifiedComplaintCount": 1,
  "sentimentAggregate": { "positive": 9, "neutral": 1, "negative": 2 },
  "licenses": [
    { "regulator": "HK_HKGX", "licenseType": "HK_HKGX_MEMBER",
      "licenseNumber": "009", "status": "ACTIVE", "issuedAt": "..."|null }
  ],
  "similarBrokers": [ ... same-shape mini list ... ]
}
NOTE: For bullion dealers the SFC-only fields (ceNumber, sfcDetailJson,
addressEn/Zh, the 10 regulated-activity records, responsible officers,
disciplinary actions) are ALWAYS absent/null. Do not design around them.

HEADER CARD:
- Back link "返回金商列表".
- Logo + localized name (primary) + other-language name (secondary).
- isClaimed → "已認領商戶" (blue) else "未認領商戶" (grey).
- If HKGX status is SUSPENDED/REVOKED → a red status badge in the header.
- websiteUrl link + "活躍 N 年" if activeYears present.
- On the right: a neon "HKGX 行員 {licenseNumber}" membership pill (this
  replaces the securities page's "SFC 發牌機構" badge).

TAB SET (exactly 3 tabs, in this order — far slimmer than securities because
HKGX carries little structured data):
1. 會籍 (Membership) — a compact record card showing:
   - 法團名稱 (corporate name: legalName + displayName)
   - 行員編號 (member number = licenses[].licenseNumber for HK_HKGX)
   - 會籍狀態 (status pill: ACTIVE→"在冊行員" neon green / SUSPENDED→"已被停業"
     red / REVOKED→"已被除牌" red)
   - 入會生效日期 (effective date, from issuedAt, only if present)
   - A link out to the official HKGX member roster
     (https://hkgx.com.hk/en/member/memberlist)
   - An info note: data sourced from the public HKGX roster, for reference
     only, not investment advice; HKGX is a self-regulatory exchange.
   Design this membership card cleanly — it is the bullion analogue of the
   securities "license" tab but with a SINGLE membership status, not 10
   regulated-activity categories.
2. 評論 (Reviews) — identical to the securities reviews tab:
   - A headline panel: positiveRate % + total review count + a 3-bar
     sentiment distribution (POSITIVE neon green / NEUTRAL grey / NEGATIVE
     red) computed from sentimentAggregate.
   - A "write an on-chain review" call-to-action (sign-in gated). The review
     form picks a sentiment (讚 / 普通 / 不讚 → Positive / Neutral / Negative),
     a short title, and a body. Emphasize that reviews are permanent and
     immutable on-chain.
   - A list of review cards. Each shows author + SBT-tier badge, a sentiment
     badge, the text, a date, an on-chain tx link, and an IPFS original-text
     link.
3. 投訴 (Complaints) — identical to the securities complaints tab:
   - A summary card: a big verifiedComplaintCount number (red if > 0, neon if
     0), plus "processing" / "not substantiated" sub-counts, plus a "file a
     complaint" CTA (verified users only).
   - A list of complaint cards with a status chip (OPEN orange / VERIFIED red
     / REJECTED grey). IMPORTANT: rejected complaints stay fully visible — the
     platform NEVER deletes content; only the status label changes. Show the
     admin note inline for rejected ones.

OMIT for bullion (present on securities, NOT here): the SFC "牌照資料" tab and
all its sub-tabs (概覽 / 受規管活動 / 條件 / 負責人員 / 代表 / 公開紀律行動 /
牌照記錄 / 相關實體 / 文件), the "相關 KOL" tab, and the "仲裁記錄" tab.

SIDEBAR: dealer description (if any), claim status, on-chain contract
addresses, and a "similar dealers" list (same-vertical only).

PAGE FOOTER: disclaimer — all reviews are immutable on-chain and the platform
will never delete a review for any reason.

================================================================
TRILINGUAL LABELS (the app supplies these; design must fit all three)
================================================================
Concept              | zh-Hant      | zh-Hans      | English
Nav / page title     | 金商          | 金商          | Bullion Dealers
HKGX member pill     | HKGX 行員 {n} | HKGX 行员 {n} | HKGX Member {n}
Status ACTIVE        | 在冊行員       | 在册行员       | Active member
Status SUSPENDED     | 已被停業       | 已被停业       | Suspended
Status REVOKED       | 已被除牌       | 已被除牌       | Revoked
Tab — Membership     | 會籍          | 会籍          | Membership
Tab — Reviews        | 評論          | 评论          | Reviews
Tab — Complaints     | 投訴          | 投诉          | Complaints
Member number        | 行員編號       | 行员编号       | Member number
Membership status    | 會籍狀態       | 会籍状态       | Membership status

Design notes for i18n: Chinese strings are short; English ("Bullion Dealers",
"Active member") is longer — make pills/tabs flex without truncation, and keep
the headline name on its own line so long English legal names wrap gracefully.

================================================================
HARD RULES (do not violate)
================================================================
- NEVER add any "delete review", "hide complaint", or "pay to rank" affordance.
- The SUSPENDED/REVOKED status is an immutable record — present it as a neutral
  factual trust signal, not as something editable.
- No investment advice, no buy/sell recommendation UI. Every page carries a
  disclaimer.
- Do not show the raw slug as a human-readable label; it is only a URL key.
- Keep the dark theme + #00FF88 accent; do not introduce new brand colors.
```

---

## References

- [ADR-0045](../decisions/0045-bullion-dealer-vertical-cgse.md) — D7 (UI division of labour), D3 (HKGX license shape)
- [ADR-0050](../decisions/0050-rebrand-cgse-to-hkgx.md) — CGSE → HKGX registry rebrand
- API list/detail shapes: `apps/api/src/domains/brokers/presentation/routes.ts`
- Functional baseline already wired: `BrokerDirectory.tsx`, `BrokerDetailTabs.tsx`
- Trilingual labels: `apps/web/messages/{zh-Hant,zh-Hans,en}.json` (`bullionDealers` + `brokerDetail` namespaces)
