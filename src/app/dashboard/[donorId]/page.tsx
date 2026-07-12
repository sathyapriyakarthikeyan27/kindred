import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDonorDashboard } from "@/lib/donors/dashboard";

/**
 * The donor dashboard (spec §7): "lives you've touched." Server-rendered
 * from the same records the ledger commits to.
 */

export const metadata: Metadata = { title: "Your impact — Kindred" };

function formatPaise(paise: bigint): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(paise) / 100);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

const CASE_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Raising funds",
  FUNDED: "Fully funded",
  FULFILLED: "Fulfilled",
  FROZEN: "Paused for review",
  CLOSED_UNFULFILLED: "Closed",
};

export default async function DonorDashboard(props: PageProps<"/dashboard/[donorId]">) {
  const { donorId } = await props.params;
  const data = await getDonorDashboard(donorId);
  if (!data) notFound();
  const { donor, donations, impacts, stats, causeBreakdown } = data;

  const maxCause = causeBreakdown[0]?.amountPaise ?? 1n;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <header className="border-b border-line pb-6">
        <p className="font-mono text-xs tracking-[0.2em] text-faint uppercase">
          Kindred · Your impact
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl sm:text-5xl">
          {donor.name}
        </h1>
        <p className="mt-2 text-sm text-muted">Giving since {formatDate(donor.createdAt)}</p>
      </header>

      {/* Stat tiles — the hero numbers */}
      <section className="mt-7 grid grid-cols-3 gap-3">
        <div className="rounded-md border border-line bg-card p-4">
          <p className="font-mono text-2xl tabular-nums sm:text-3xl">
            {formatPaise(stats.totalGivenPaise)}
          </p>
          <p className="mt-1 text-xs text-muted">given in total</p>
        </div>
        <div className="rounded-md border border-line bg-card p-4">
          <p className="font-mono text-2xl tabular-nums sm:text-3xl">{stats.casesSupported}</p>
          <p className="mt-1 text-xs text-muted">
            {stats.casesSupported === 1 ? "case supported" : "cases supported"}
          </p>
        </div>
        <div className="rounded-md border border-accent/40 bg-accent-wash p-4">
          <p className="font-mono text-2xl tabular-nums text-accent-strong sm:text-3xl">
            {stats.livesTouched}
          </p>
          <p className="mt-1 text-xs text-muted">
            {stats.livesTouched === 1 ? "life touched" : "lives touched"}
          </p>
        </div>
      </section>

      {/* Lives touched — the fulfilled outcomes, most precious first */}
      {impacts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
            Lives you&apos;ve touched
          </h2>
          <ul className="mt-4 space-y-3">
            {impacts.map((impact) => (
              <li
                key={`${impact.case.caseNumber}-${impact.createdAt.toISOString()}`}
                className="rounded-md border border-gold/40 bg-gold-wash p-4"
              >
                <p className="font-[family-name:var(--font-fraunces)] leading-snug">
                  {impact.summary}
                </p>
                <p className="mt-1.5 text-xs text-muted">
                  {impact.case.beneficiary.publicName} · {formatDate(impact.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Where your giving goes — single-series magnitude bars */}
      {causeBreakdown.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
            Where your giving goes
          </h2>
          <ul className="mt-4 space-y-3">
            {causeBreakdown.map((cause) => {
              const pct = Number((cause.amountPaise * 100n) / maxCause);
              return (
                <li key={cause.name}>
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span>{cause.name}</span>
                    <span className="font-mono text-muted tabular-nums">
                      {formatPaise(cause.amountPaise)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-card">
                    <div
                      className="h-full rounded-sm bg-accent"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Your cases — live status per donation, each linking to its trail */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
          Your donations
        </h2>
        {donations.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Nothing here yet — your first donation starts your impact story.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-md border border-line">
            {donations.map((d) => {
              const latest = d.targetCase?.statusUpdates[0];
              return (
                <li key={d.donationNumber} className="p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">
                      {d.targetCase ? d.targetCase.title : "Cause pool contribution"}
                    </p>
                    <span className="font-mono text-sm tabular-nums">
                      {formatPaise(d.amountPaise)}
                    </span>
                  </div>
                  {d.targetCase && (
                    <p className="mt-1 text-sm text-muted">
                      {d.targetCase.beneficiary.publicName} · {d.targetCase.cause.name} ·{" "}
                      <span
                        className={
                          d.targetCase.status === "FULFILLED" ? "text-gold" : "text-accent-strong"
                        }
                      >
                        {CASE_STATUS_LABEL[d.targetCase.status] ?? d.targetCase.status}
                      </span>
                    </p>
                  )}
                  {latest && d.optInUpdates && (
                    <p className="mt-2 text-sm text-muted">
                      <span className="text-faint">Latest:</span> {latest.body}
                    </p>
                  )}
                  <p className="mt-2 text-xs">
                    <Link
                      href={`/trace/${d.donationNumber}`}
                      className="font-mono text-accent-strong underline-offset-2 hover:underline"
                    >
                      D-{d.donationNumber} · follow the money →
                    </Link>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="mt-12 border-t border-line pt-5 text-xs text-faint">
        <p>
          Every figure on this page comes from the same append-only ledger your
          donation trails are built on.
        </p>
      </footer>
    </main>
  );
}
