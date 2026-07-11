# Kindred — Product Specification

**Version:** v0.1 draft · **Date:** 11 July 2026 · **Status:** planning — not yet in build

> A crowdfunding platform where every donation is traceable to a verified human outcome — and every donor sees the lives they've touched.

| | |
|---|---|
| **Market** | India (domestic INR only at launch) |
| **MVP thesis** | The money trail |
| **Name** | Kindred (trademark/domain check pending — see §16) |

---

## Contents

1. [Vision & differentiators](#1-vision--differentiators)
2. [Users & roles](#2-users--roles)
3. [Cause taxonomy](#3-cause-taxonomy)
4. [The money trail (core architecture)](#4-the-money-trail-core-architecture)
5. [Blockchain anchoring layer](#5-blockchain-anchoring-layer)
6. [Status updates & the closing moment](#6-status-updates--the-closing-moment)
7. [Donor impact dashboard](#7-donor-impact-dashboard)
8. [Data model](#8-data-model)
9. [Payments & compliance (India)](#9-payments--compliance-india)
10. [Trust, safety & fraud](#10-trust-safety--fraud)
11. [Privacy & consent](#11-privacy--consent)
12. [MVP scope](#12-mvp-scope)
13. [Build order](#13-build-order-dependency-aware)
14. [Roadmap](#14-roadmap)
15. [Tech stack](#15-tech-stack-proposed)
16. [Risks & open questions](#16-risks--open-questions)

---

## 1. Vision & differentiators

Most crowdfunding platforms end the donor's story at "payment successful." Kindred begins there. The product promise has four parts:

- **The money trail** — every donation is traceable through allocation, disbursement, and proof: "I know exactly where my money went."
- **The living status** — donors who opt in follow the beneficiary's journey through verified progress updates.
- **The closing moment** — when a goal is fulfilled or a patient recovers, the donor receives a final update: "Meera finished treatment and is home."
- **The impact dashboard** — a personal record of every life a donor has touched, across every cause they chose.

Donors direct their giving at any level of specificity — *cancer in general* or *pediatric leukemia specifically*; *environment broadly* or *waste management in one city* — and pooled gifts are still attributed to named cases, so broad giving closes the loop too.

> **The MVP wow-demo:** A donor gives ₹2,000 → watches it released to the hospital with an uploaded invoice → three weeks later receives a closing update that the patient is home. If this single flow feels magical and trustworthy, the product works.

## 2. Users & roles

| Role | Who | What they do |
|---|---|---|
| **Donor** | General public (India, INR) | Browse causes, give to cases or pools, track donations, receive updates, view impact dashboard |
| **Beneficiary** | Patient / recipient, or their guardian | Submit need with documents, consent to status sharing, receive fulfilled outcome |
| **Verification partner** | NGO, hospital social worker, field verifier | Confirm the beneficiary and the need are real; validate milestones before fund release |
| **Provider** | Hospital, vendor, school, service supplier | Receives direct disbursements against invoices; never handles pooled cash |
| **Admin / Trust & Safety** | Kindred team | Case approval, disbursement release, fraud review, policy enforcement |

## 3. Cause taxonomy

A three-level hierarchy. Donors can give at **any node**: a domain ("Health"), a category ("Cancer"), a subcategory ("Pediatric leukemia"), or a specific case within one.

```
Domain          Category              Subcategory
──────────────────────────────────────────────────────────
Health      ▸   Cancer            ▸   Breast · Leukemia · Pediatric
            ▸   Organ transplant
            ▸   Emergency surgery
Environment ▸   Waste management
            ▸   Reforestation
            ▸   Clean water
Education   ▸   Child education   ▸   Girl child · Rural schools
Relief      ▸   Disaster · Refugee support
Animals     ▸   Rescue · Shelter
```

- **Case-level gift** → 100% traced to that person/project.
- **Node-level gift** → enters that node's *pool*; the allocation engine (v2) distributes it to verified matching cases, and the donor is notified which case their money funded — e.g. *"Your ₹2,000 helped fund Ravi's chemo (Case #442)."*

The taxonomy is data, not code: nodes are rows in a table with a parent pointer, so new causes launch without deployments. MVP ships the taxonomy read-only for browsing/filtering; pools activate in v2.

## 4. The money trail (core architecture)

This is the heart of the product and the entire MVP thesis.

> **Principle:** Money flows to **verified providers, not beneficiary bank accounts**, whenever possible. Kindred pays the hospital, buys the wheelchair, funds the school fee — against an invoice, in milestone tranches.

```
Donation ──▶ Case / Pool ──▶ Allocation ──▶ Disbursement ──▶ Proof ──▶ Impact record
(D-1024,     (which need     (earmarked to  (paid direct     (invoice + (outcome recorded,
 ₹2,000 UPI)  it joins)       a milestone)   to provider)     sign-off)  donor notified)
```

### 4.1 Milestone escrow

Funds are held (Razorpay Route / nodal account) and released in **tranches tied to verified milestones** — e.g. "admission confirmed → 30%", "surgery scheduled → 50%", "post-op → 20%". A verification partner signs off each milestone before release. This structurally prevents "collected ₹5L, disappeared."

### 4.2 Traceable donation IDs

Every donation gets an ID (`D-1024`) the donor can follow — allocation → disbursement → proof — like tracking a package. Each hop links to its artifacts: the invoice, the verifier's sign-off, the payment reference.

### 4.3 The append-only ledger

All money movements are rows in an **append-only ledger** — no updates, no deletes, corrections are new offsetting entries. This is the source of truth for the trace view, the dashboard, audits, and the blockchain anchor (§5).

## 5. Blockchain anchoring layer

**Decision: hybrid model, live from day one.** The Postgres append-only ledger is the source of truth; a public blockchain provides independent tamper-evidence on top of it.

### 5.1 How it works

- On a schedule (e.g. hourly), all new ledger entries since the last anchor are hashed into a **Merkle tree**.
- The Merkle root — one 32-byte hash — is written to **Polygon PoS** in a single transaction (cost: a fraction of a paisa; does not scale with donation volume).
- Every ledger entry stores its Merkle proof path, so any single donation, allocation, or disbursement can be verified against the on-chain anchor.
- A public **/transparency** page lets anyone paste a donation ID and verify: "this record existed at this time and has never been altered" — no wallet, no crypto knowledge needed.

### 5.2 What this gives — and deliberately does not

**Gives (truthfully claimable):**
- "Independently verifiable, tamper-proof ledger" as a launch claim
- Public verification without donor wallets
- ~2–3 days of build effort
- Clean upgrade path to fuller on-chain features

**Does not attempt:**
- Crypto donations (30% VDA tax + RBI hostility — donations stay INR via Razorpay)
- Smart-contract escrow, tokens, donor wallets — would triple MVP complexity and shrink the donor base

> ⚠️ **Honest limits:** The chain proves a record was *never altered after being written* — it cannot prove the record was *true* when written (the oracle problem). Kindred's real trust engine is verification partners + direct-to-provider payment; anchoring is the tamper-evidence layer on top, never a substitute. Marketing copy must never blur this line.

## 6. Status updates & the closing moment

- **Who posts:** verified updaters only — the verification partner, hospital contact, or the beneficiary via a partner. No unverified status claims.
- **Double opt-in:** the *beneficiary* consents to what is shared (medical status is sensitive — granular: milestones-only vs. photos/notes), and the *donor* opts in to receive updates.
- **Structured milestones + free text:** updates attach to case milestones so the system knows where the journey stands, with an optional human note.
- **The closing update:** when the final milestone is verified (goal fulfilled / patient recovered), every contributing donor receives a celebratory final update. This is the emotional retention hook and the platform's biggest organic-sharing driver — design it as a first-class moment, not a notification.
- **Hard cases:** if a patient passes away or a case is closed unfulfilled, donors receive an honest, dignified update, and leftover funds follow the pre-agreed policy (§9.4).

## 7. Donor impact dashboard

MVP ships the seed: a "your cases" list with live status per case and the donation trace view. v2 grows it into the full experience:

- **Impact timeline/map** — every person and cause contributed to, with current status.
- **Live status feed** for opted-in cases.
- **Aggregate stats** — total given, lives touched, cause breakdown, "top X% of donors to child education."
- **Tax receipts** — auto-generated 80G receipts where applicable (§9.2).

## 8. Data model

| Entity | Purpose | Key relationships |
|---|---|---|
| **User** | Donor account, auth, preferences | has many Donations |
| **Beneficiary** | KYC'd recipient (or guardian) | has many Cases; grants ConsentRecords |
| **Cause** | Taxonomy node (domain/category/sub) | parent pointer; has many Cases; owns a Pool (v2) |
| **Case** | A verified need with goal, milestones, policy | belongs to Cause + Beneficiary; has Milestones, StatusUpdates |
| **Donation** | One gift; the donor-facing traceable ID | belongs to User; targets Case or Cause pool |
| **Allocation** | Earmark of donated funds to a case milestone | joins Donation ↔ Case/Milestone |
| **Disbursement** | Actual payout, direct to provider | belongs to Milestone + Provider; has ProofArtifacts |
| **ProofArtifact** | Invoice, receipt, verifier sign-off, photo | attached to Disbursement or StatusUpdate |
| **StatusUpdate** | Verified progress post incl. the closing update | belongs to Case; authored by verified updater |
| **VerificationPartner** | NGO / hospital / field verifier | verifies Cases and Milestones |
| **Provider** | Hospital / vendor / school payee | receives Disbursements; bank + GST validated |
| **LedgerEntry** | Append-only money-movement record | one per Donation/Allocation/Disbursement event; carries Merkle proof |
| **Anchor** | One on-chain Merkle root batch | covers many LedgerEntries; stores Polygon tx hash |
| **ImpactRecord** | Outcome linking donors to a fulfilled case | feeds the dashboard's "lives touched" |

## 9. Payments & compliance (India)

### 9.1 Payments & escrow

**Razorpay Route** (or a nodal account) so funds are held and split-disbursed without ever pooling in Kindred's operating account. UPI + cards + netbanking.

### 9.2 80G tax receipts — important nuance

> ⚠️ Donations to an **individual patient are not 80G-deductible**. Tax benefit applies only when money routes through a registered 80G trust/NGO. Every case is therefore labeled either **Individual** (no tax receipt; pure person-to-person giving) or **NGO-backed** (80G receipt auto-generated). This labeling is prominent at the point of donation — donors are never misled.

### 9.3 FCRA — foreign donations

Foreign contributions trigger heavy FCRA compliance. **MVP restricts to domestic INR donors.** International giving is a deliberate later phase, not an accident.

### 9.4 Leftover-funds policy

Written and agreed with the beneficiary *at case creation*, shown to donors before they give. Covers: patient passes away, goal over-funded, case abandoned. Options: redirect to a similar verified case, pro-rata refund, or move to the cause pool.

### 9.5 KYC

Beneficiaries and verification partners: Aadhaar/PAN-based KYC. Providers: bank-account + GST validation before first disbursement.

## 10. Trust, safety & fraud

- **No unverified case is ever public.** Verification = document check + KYC + a verification partner's on-ground confirmation.
- **Structural fraud resistance:** direct-to-provider payment + milestone escrow means even a fraudulent case struggles to extract cash.
- **Provider validation:** payee bank/GST checks prevent shell "hospitals."
- **Audit trail:** the append-only ledger + anchoring makes internal tampering detectable by outsiders.
- **Report & freeze:** any user can flag a case; flags pause disbursements pending review.

## 11. Privacy & consent

- Medical status is sensitive personal data — sharing is **opt-in by the beneficiary, granular, and revocable** (DPDP Act 2023 compliance).
- Donors see only what the beneficiary consented to share; identity can be partially masked ("a 7-year-old in Chennai") while keeping the money trail fully verifiable.
- Consent records are first-class data (`ConsentRecord`), timestamped and versioned.
- Proof documents (invoices, medical papers) are stored encrypted; donor-visible proofs are redacted copies.

## 12. MVP scope

The MVP does **one thing brilliantly: a donor can follow their money to a verified outcome.**

### In scope — v1

- Cause taxonomy (read-only browse/filter)
- Case creation + verification workflow
- Milestone escrow + direct-to-provider disbursement
- Proof attachment (invoices, sign-offs)
- Traceable donation view ("track your donation")
- Ledger anchoring to Polygon + /transparency page
- Status updates + the closing update (opt-in)
- Minimal donor dashboard ("your cases")
- Razorpay Route · UPI/cards/netbanking · INR only

### Deferred — v2+

- Cause pools + allocation engine
- Aggregate impact analytics ("top X%")
- 80G receipt automation, recurring giving
- Mobile apps
- Verification-partner self-serve portal
- Foreign donations (FCRA)
- Fuller on-chain features (if ever earned)

## 13. Build order (dependency-aware)

1. **Ledger + escrow data model** — append-only, auditable. Everything sits on this.
2. **Case + verification workflow** — beneficiary intake, KYC, partner sign-off.
3. **Razorpay Route integration** — collect → hold → split-disburse.
4. **Proof + trace view** — disbursement artifacts and the donor-facing trail.
5. **Anchoring service + /transparency page** — Merkle batching to Polygon.
6. **Status/closing updates + minimal dashboard.**

## 14. Roadmap

| Phase | Theme | Contents |
|---|---|---|
| **v1 — MVP** | Prove the money trail | Everything in §12 "In scope" |
| **v2** | Scale giving | Cause pools + allocation engine, aggregate impact dashboard, 80G automation, recurring giving, tax-receipt center |
| **v3** | Ecosystem | Mobile apps, partner portal, public transparency API, FCRA-compliant international giving, expanded on-chain layer if justified |

## 15. Tech stack (proposed)

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Next.js (React), responsive web-first | SEO for case pages matters; native mobile deferred |
| **Backend** | Node/NestJS or Django (typed) | Team preference; both handle the workflow + ledger patterns well |
| **Database** | PostgreSQL | Append-only ledger tables, audit triggers, relational integrity for the trace graph |
| **Payments** | Razorpay Route | Escrow-style holds + split disbursement, UPI native |
| **Anchoring** | Polygon PoS + Merkle batching service | Near-zero cost, public verifiability, no donor-side crypto |
| **Storage** | Object storage (S3-compatible), encrypted | Proof documents, redacted donor-visible copies |

## 16. Risks & open questions

- **Verification-partner supply:** the trust model depends on on-ground verifiers. Who are the first 3–5 partners? (Likely the real go-to-market bottleneck.)
- **Cold start:** donors need cases; cases need donor liquidity. Likely answer: launch with one city + one NGO partnership and a handful of deeply-verified cases.
- **Regulatory review:** escrow/nodal structure and payment-aggregator rules need a legal opinion before money moves.
- **Name clearance:** "Kindred" has existing marks (UK gambling group, US health startup). Domain candidates: `givekindred.org`, `kindred.fund`, `kindredgiving.in`, `kindred.care`. Run a trademark search in financial/charitable service classes before branding spend.
- **Update fatigue vs. silence:** how often is "alive and well" worth a notification? Needs UX testing.
- **Dignity line:** beneficiary stories must never become poverty spectacle — editorial guidelines needed before the first case page ships.

---

*Kindred · Product specification v0.1 · Prepared 11 July 2026 · Planning document — nothing in this spec has been implemented yet.*
