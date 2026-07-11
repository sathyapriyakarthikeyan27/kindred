-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DONOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('MILESTONES_ONLY', 'NOTES_AND_PHOTOS', 'FULL_STORY');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('INDIVIDUAL', 'NGO_BACKED');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'ACTIVE', 'FUNDED', 'FULFILLED', 'CLOSED_UNFULFILLED', 'FROZEN');

-- CreateEnum
CREATE TYPE "LeftoverPolicy" AS ENUM ('SIMILAR_CASE', 'PRO_RATA_REFUND', 'CAUSE_POOL');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PENDING', 'VERIFIED', 'RELEASED');

-- CreateEnum
CREATE TYPE "DonationStatus" AS ENUM ('INITIATED', 'HELD', 'ALLOCATED', 'DISBURSED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('INITIATED', 'SETTLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProofKind" AS ENUM ('INVOICE', 'RECEIPT', 'VERIFIER_SIGNOFF', 'PHOTO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "UpdateKind" AS ENUM ('PROGRESS', 'MILESTONE', 'CLOSING', 'CLOSURE');

-- CreateEnum
CREATE TYPE "LedgerEntryKind" AS ENUM ('DONATION_RECEIVED', 'ALLOCATION', 'DEALLOCATION', 'DISBURSEMENT', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AnchorStatus" AS ENUM ('PENDING', 'CONFIRMED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'DONOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiaries" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "publicName" TEXT NOT NULL,
    "guardian" TEXT,
    "city" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "kycRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "version" INTEGER NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_partners" (
    "id" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "gstin" TEXT,
    "bankVerified" BOOLEAN NOT NULL DEFAULT false,
    "bankRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "causes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "causes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL,
    "caseNumber" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "story" TEXT NOT NULL,
    "city" TEXT,
    "type" "CaseType" NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "goalPaise" BIGINT NOT NULL,
    "raisedPaise" BIGINT NOT NULL DEFAULT 0,
    "leftoverPolicy" "LeftoverPolicy" NOT NULL,
    "causeId" TEXT NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "verifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "ord" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donations" (
    "id" TEXT NOT NULL,
    "donationNumber" SERIAL NOT NULL,
    "donorId" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "DonationStatus" NOT NULL DEFAULT 'INITIATED',
    "paymentRef" TEXT,
    "optInUpdates" BOOLEAN NOT NULL DEFAULT true,
    "targetCaseId" TEXT,
    "targetCauseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocations" (
    "id" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'INITIATED',
    "paymentRef" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_artifacts" (
    "id" TEXT NOT NULL,
    "kind" "ProofKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "redactedKey" TEXT,
    "sha256" TEXT NOT NULL,
    "disbursementId" TEXT,
    "statusUpdateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proof_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_updates" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "UpdateKind" NOT NULL,
    "body" TEXT NOT NULL,
    "milestoneId" TEXT,
    "authorPartnerId" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "status_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_records" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "donationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impact_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "kind" "LedgerEntryKind" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "donationId" TEXT,
    "allocationId" TEXT,
    "disbursementId" TEXT,
    "caseId" TEXT,
    "payload" JSONB NOT NULL,
    "prevHash" TEXT NOT NULL,
    "entryHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anchors" (
    "id" TEXT NOT NULL,
    "fromSeq" BIGINT NOT NULL,
    "toSeq" BIGINT NOT NULL,
    "merkleRoot" TEXT NOT NULL,
    "network" TEXT NOT NULL DEFAULT 'polygon-amoy',
    "txHash" TEXT,
    "status" "AnchorStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anchoredAt" TIMESTAMP(3),

    CONSTRAINT "anchors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "consent_records_beneficiaryId_idx" ON "consent_records"("beneficiaryId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_partners_email_key" ON "verification_partners"("email");

-- CreateIndex
CREATE UNIQUE INDEX "causes_slug_key" ON "causes"("slug");

-- CreateIndex
CREATE INDEX "causes_parentId_idx" ON "causes"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "cases_caseNumber_key" ON "cases"("caseNumber");

-- CreateIndex
CREATE INDEX "cases_causeId_status_idx" ON "cases"("causeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "milestones_caseId_ord_key" ON "milestones"("caseId", "ord");

-- CreateIndex
CREATE UNIQUE INDEX "donations_donationNumber_key" ON "donations"("donationNumber");

-- CreateIndex
CREATE INDEX "donations_donorId_idx" ON "donations"("donorId");

-- CreateIndex
CREATE INDEX "donations_targetCaseId_idx" ON "donations"("targetCaseId");

-- CreateIndex
CREATE INDEX "allocations_donationId_idx" ON "allocations"("donationId");

-- CreateIndex
CREATE INDEX "allocations_caseId_idx" ON "allocations"("caseId");

-- CreateIndex
CREATE INDEX "disbursements_milestoneId_idx" ON "disbursements"("milestoneId");

-- CreateIndex
CREATE INDEX "status_updates_caseId_publishedAt_idx" ON "status_updates"("caseId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "impact_records_caseId_donationId_key" ON "impact_records"("caseId", "donationId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_seq_key" ON "ledger_entries"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_entryHash_key" ON "ledger_entries"("entryHash");

-- CreateIndex
CREATE INDEX "ledger_entries_donationId_idx" ON "ledger_entries"("donationId");

-- CreateIndex
CREATE INDEX "ledger_entries_caseId_idx" ON "ledger_entries"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "anchors_fromSeq_toSeq_key" ON "anchors"("fromSeq", "toSeq");

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "causes" ADD CONSTRAINT "causes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "causes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_causeId_fkey" FOREIGN KEY ("causeId") REFERENCES "causes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_beneficiaryId_fkey" FOREIGN KEY ("beneficiaryId") REFERENCES "beneficiaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "verification_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "verification_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_targetCaseId_fkey" FOREIGN KEY ("targetCaseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donations" ADD CONSTRAINT "donations_targetCauseId_fkey" FOREIGN KEY ("targetCauseId") REFERENCES "causes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_artifacts" ADD CONSTRAINT "proof_artifacts_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "disbursements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_artifacts" ADD CONSTRAINT "proof_artifacts_statusUpdateId_fkey" FOREIGN KEY ("statusUpdateId") REFERENCES "status_updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_updates" ADD CONSTRAINT "status_updates_authorPartnerId_fkey" FOREIGN KEY ("authorPartnerId") REFERENCES "verification_partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_records" ADD CONSTRAINT "impact_records_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_records" ADD CONSTRAINT "impact_records_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "allocations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "disbursements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ────────────────────────────────────────────────────────────────────
-- Kindred integrity guarantees (hand-written; Prisma cannot express these)
-- ────────────────────────────────────────────────────────────────────

-- 1. The ledger is append-only (spec §4.3). Corrections are new
--    offsetting entries — never edits. This blocks UPDATE/DELETE even
--    from application bugs or careless admin SQL.
CREATE OR REPLACE FUNCTION kindred_ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only: % rejected. Corrections are new offsetting entries.', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION kindred_ledger_append_only();

-- 2. A donation targets EXACTLY ONE of: a specific case, or a cause pool
--    (spec §3 / §8 — pool-ready from day one).
ALTER TABLE "donations" ADD CONSTRAINT "donation_exactly_one_target"
  CHECK (num_nonnulls("targetCaseId", "targetCauseId") = 1);

-- 3. Money sanity: amounts are always positive integer paise.
ALTER TABLE "donations"      ADD CONSTRAINT "donation_amount_positive"     CHECK ("amountPaise" > 0);
ALTER TABLE "allocations"    ADD CONSTRAINT "allocation_amount_positive"   CHECK ("amountPaise" > 0);
ALTER TABLE "disbursements"  ADD CONSTRAINT "disbursement_amount_positive" CHECK ("amountPaise" > 0);
ALTER TABLE "milestones"     ADD CONSTRAINT "milestone_amount_positive"    CHECK ("amountPaise" > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_amount_positive"       CHECK ("amountPaise" > 0);
ALTER TABLE "cases"          ADD CONSTRAINT "case_goal_positive"           CHECK ("goalPaise" > 0);
