import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDonationTrace } from "@/lib/donations/service";

/**
 * The donor-facing trail (spec §4.2): track your donation like a package.
 * Server-rendered straight from the ledger — what you see is what the
 * hash chain committed to.
 */

export const metadata: Metadata = { title: "Track your donation — Kindred" };

function formatPaise(paise: bigint): string {
  const rupees = Number(paise) / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

const ENTRY_LABEL: Record<string, string> = {
  DONATION_RECEIVED: "Received into escrow",
  ALLOCATION: "Earmarked to a milestone",
  DEALLOCATION: "Earmark reversed",
  DISBURSEMENT: "Released to provider",
  REFUND: "Refunded",
  ADJUSTMENT: "Adjustment",
};

const CASE_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Raising funds",
  FUNDED: "Fully funded",
  FULFILLED: "Fulfilled",
  FROZEN: "Paused for review",
  CLOSED_UNFULFILLED: "Closed",
};

export default async function TracePage(props: PageProps<"/trace/[number]">) {
  const { number } = await props.params;
  const donationNumber = Number(number.replace(/^D-/i, ""));
  if (!Number.isInteger(donationNumber) || donationNumber <= 0) notFound();

  const trace = await getDonationTrace(donationNumber);
  if (!trace) notFound();
  const { donation, anchors } = trace;
  const kase = donation.targetCase!;

  // Disbursement details (provider, proofs) keyed by id, to enrich trail stops
  const disbursementsById = new Map(
    donation.allocations.flatMap((a) =>
      a.milestone ? a.milestone.disbursements.map((d) => [d.id, d] as const) : [],
    ),
  );

  const closing = kase.statusUpdates.find((u) => u.kind === "CLOSING");
  const confirmedAnchor = anchors.find((a) => a.status === "CONFIRMED");
  const pendingAnchor = anchors.find((a) => a.status === "PENDING");

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      {/* Header: the tracking number is the hero */}
      <header className="border-b border-line pb-6">
        <p className="font-mono text-xs tracking-[0.2em] text-faint uppercase">
          Kindred · Donation trail
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl sm:text-5xl">
          D-{donation.donationNumber}
        </h1>
        <p className="mt-3 text-muted">
          <span className="font-mono font-medium text-foreground">
            {formatPaise(donation.amountPaise)}
          </span>{" "}
          from {donation.donor.name} · {formatDate(donation.createdAt)}
        </p>
        <p className="mt-1 text-sm text-muted">
          Supporting{" "}
          <span className="text-foreground">
            {kase.title} (Case #{kase.caseNumber})
          </span>{" "}
          — {kase.beneficiary.publicName} · {kase.cause.name}
        </p>
        <span className="mt-3 inline-block rounded-full bg-accent-wash px-3 py-1 text-xs font-medium text-accent-strong">
          {CASE_STATUS_LABEL[kase.status] ?? kase.status}
        </span>
      </header>

      {/* The closing moment, when it exists, comes before everything */}
      {closing && (
        <section className="mt-6 rounded-md border border-gold/40 bg-gold-wash p-5">
          <p className="text-xs font-semibold tracking-[0.14em] text-gold uppercase">
            The good news
          </p>
          <p className="mt-2 font-[family-name:var(--font-fraunces)] text-lg leading-snug">
            {closing.body}
          </p>
          <p className="mt-2 text-xs text-muted">{formatDate(closing.publishedAt)}</p>
        </section>
      )}

      {/* The trail — every hop is a hash-chained ledger entry */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
          Where your money went
        </h2>
        <ol className="mt-4 border-l-2 border-line">
          {donation.ledgerEntries.map((entry) => {
            const disbursement = entry.disbursementId
              ? disbursementsById.get(entry.disbursementId)
              : undefined;
            return (
              <li key={entry.entryHash} className="relative pb-7 pl-6 last:pb-0">
                <span
                  aria-hidden
                  className="absolute top-1 -left-[7px] h-3 w-3 rounded-full border-2 border-background bg-accent"
                />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <p className="font-medium">{ENTRY_LABEL[entry.kind] ?? entry.kind}</p>
                  <p className="font-mono text-sm text-muted tabular-nums">
                    {formatPaise(entry.amountPaise)}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-faint">{formatDate(entry.createdAt)}</p>
                {disbursement && (
                  <div className="mt-2 rounded-md border border-line bg-card p-3 text-sm">
                    <p>
                      Paid directly to{" "}
                      <span className="font-medium">{disbursement.provider.name}</span>
                      <span className="text-faint"> · {disbursement.provider.kind.toLowerCase()}</span>
                    </p>
                    {disbursement.proofs.map((proof) => (
                      <p key={proof.sha256} className="mt-1.5 text-xs text-muted">
                        {proof.kind === "INVOICE" ? "Invoice" : proof.kind.toLowerCase()} on file ·{" "}
                        <span className="font-mono text-faint">
                          sha256 {proof.sha256.slice(0, 12)}…
                        </span>
                      </p>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 font-mono text-[11px] text-faint">
                  entry {entry.entryHash.slice(0, 16)}… · seq {entry.seq.toString()}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Milestone tranches — how the escrow releases */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
          Escrow milestones
        </h2>
        <ul className="mt-4 divide-y divide-line rounded-md border border-line">
          {donation.allocations
            .filter((a) => a.milestone)
            .map((a) => (
              <li key={a.milestone!.ord} className="flex items-center justify-between gap-4 p-3">
                <div>
                  <p className="text-sm font-medium">
                    {a.milestone!.ord}. {a.milestone!.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Your share: <span className="font-mono">{formatPaise(a.amountPaise)}</span>
                  </p>
                </div>
                <span
                  className={
                    a.milestone!.status === "RELEASED"
                      ? "rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-medium text-accent-strong"
                      : "rounded-full border border-line px-2.5 py-0.5 text-xs text-muted"
                  }
                >
                  {a.milestone!.status === "RELEASED"
                    ? "Released"
                    : a.milestone!.status === "VERIFIED"
                      ? "Verified — release due"
                      : "In progress"}
                </span>
              </li>
            ))}
        </ul>
      </section>

      {/* Updates from the field */}
      {kase.statusUpdates.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
            Updates
          </h2>
          <ul className="mt-4 space-y-4">
            {kase.statusUpdates.map((u) => (
              <li key={`${u.kind}-${u.publishedAt.toISOString()}`} className="text-sm">
                <p className={u.kind === "CLOSING" ? "font-medium text-gold" : ""}>{u.body}</p>
                <p className="mt-0.5 text-xs text-faint">{formatDate(u.publishedAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Verifiability footer */}
      <footer className="mt-12 border-t border-line pt-5 text-xs text-faint">
        {confirmedAnchor ? (
          <p>
            These records are anchored on {confirmedAnchor.network} — Merkle root{" "}
            <span className="font-mono">{confirmedAnchor.merkleRoot.slice(0, 16)}…</span>. No entry
            can be altered without breaking the public proof.
          </p>
        ) : pendingAnchor ? (
          <p>
            These records are hash-chained and queued for public anchoring (root{" "}
            <span className="font-mono">{pendingAnchor.merkleRoot.slice(0, 16)}…</span>).
          </p>
        ) : (
          <p>These records are hash-chained; public anchoring runs on a schedule.</p>
        )}
        <p className="mt-2">
          Every amount above is a permanent ledger entry. Corrections, if ever needed, appear as
          new entries — history is never edited.
        </p>
      </footer>
    </main>
  );
}
