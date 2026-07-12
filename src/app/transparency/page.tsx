import type { Metadata } from "next";
import { listAnchors } from "@/lib/anchoring/service";
import { verifyQuery } from "@/lib/anchoring/query";
import type { EntryVerification } from "@/lib/anchoring/service";

/**
 * The public transparency page (spec §5): anyone — donor or not — can list
 * the anchors and verify any record against them. No wallet, no account.
 */

export const metadata: Metadata = { title: "Transparency — Kindred" };

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
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

const ENTRY_LABEL: Record<string, string> = {
  DONATION_RECEIVED: "Donation received",
  ALLOCATION: "Allocation",
  DEALLOCATION: "Deallocation",
  DISBURSEMENT: "Disbursement",
  REFUND: "Refund",
  ADJUSTMENT: "Adjustment",
};

function Check({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span
      className={
        pass
          ? "inline-flex items-center gap-1 rounded-full bg-accent-wash px-2.5 py-0.5 text-xs font-medium text-accent-strong"
          : "inline-flex items-center gap-1 rounded-full bg-gold-wash px-2.5 py-0.5 text-xs font-medium text-gold"
      }
    >
      {pass ? "✓" : "✗"} {label}
    </span>
  );
}

function EntryCard({ v }: { v: EntryVerification }) {
  return (
    <li className="rounded-md border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {ENTRY_LABEL[v.kind] ?? v.kind}{" "}
          <span className="font-mono text-sm text-muted tabular-nums">
            {formatPaise(v.amountPaise)}
          </span>
        </p>
        <span className="font-mono text-xs text-faint">seq {v.seq.toString()}</span>
      </div>
      <p className="mt-1 text-xs text-faint">{formatDate(v.createdAt)}</p>
      <p className="mt-2 font-mono text-[11px] break-all text-faint">{v.entryHash}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Check pass={v.hashValid} label="record hash" />
        <Check pass={v.chainLinkValid} label="chain link" />
        {v.anchor ? (
          <>
            <Check pass={v.anchor.proofValid} label="Merkle proof" />
            {v.anchor.status === "CONFIRMED" && v.anchor.txHash ? (
              <a
                href={`https://amoy.polygonscan.com/tx/${v.anchor.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-xs text-muted underline-offset-2 hover:underline"
              >
                on-chain ↗
              </a>
            ) : (
              <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
                anchoring queued
              </span>
            )}
          </>
        ) : (
          <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">
            awaiting next anchor batch
          </span>
        )}
      </div>
    </li>
  );
}

export default async function TransparencyPage(props: PageProps<"/transparency">) {
  const params = await props.searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const [anchors, result] = await Promise.all([
    listAnchors(),
    q ? verifyQuery(q) : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <header>
        <p className="font-mono text-xs tracking-[0.2em] text-faint uppercase">
          Kindred · Public ledger
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-fraunces)] text-4xl sm:text-5xl">
          Transparency
        </h1>
        <p className="mt-3 max-w-lg text-muted">
          Every donation, allocation, and payout on Kindred is a permanent,
          hash-chained ledger entry. Batches of entries are committed to a
          public blockchain as Merkle roots — so anyone can prove a record
          was never altered, without trusting us.
        </p>
      </header>

      {/* Verify anything */}
      <form method="GET" className="mt-8 flex max-w-lg items-center gap-2 rounded-md border border-line bg-card p-2">
        <label htmlFor="q" className="sr-only">
          Donation number, ledger seq, or entry hash
        </label>
        <input
          id="q"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Verify a donation (D-5), ledger seq, or entry hash"
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-background hover:bg-accent-strong"
        >
          Verify
        </button>
      </form>

      {/* Verification result */}
      {result && (
        <section className="mt-8">
          {result.type === "not_found" ? (
            <p className="text-sm text-muted">
              Nothing found for{" "}
              <span className="font-mono">{result.query}</span>. Use a donation
              number like D-5, a ledger seq, or a 64-character entry hash.
            </p>
          ) : (
            <>
              <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
                {result.type === "donation"
                  ? `Verification — donation D-${result.donationNumber}`
                  : "Verification — ledger entry"}
              </h2>
              <ul className="mt-4 space-y-3">
                {(result.type === "donation" ? result.entries : [result.entry]).map((v) => (
                  <EntryCard key={v.entryHash} v={v} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Anchor log */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
          Anchor log
        </h2>
        {anchors.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No anchors yet — the first batch runs after the first ledger
            entries.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs tracking-wide text-faint uppercase">
                  <th className="p-3 font-semibold">Entries</th>
                  <th className="p-3 font-semibold">Merkle root</th>
                  <th className="p-3 font-semibold">Network</th>
                  <th className="p-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {anchors.map((a) => (
                  <tr key={a.merkleRoot}>
                    <td className="p-3 font-mono text-xs tabular-nums whitespace-nowrap">
                      {a.fromSeq.toString()}–{a.toSeq.toString()}
                    </td>
                    <td className="p-3 font-mono text-xs text-muted">
                      {a.merkleRoot.slice(0, 18)}…
                    </td>
                    <td className="p-3 text-xs text-muted whitespace-nowrap">{a.network}</td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {a.status === "CONFIRMED" && a.txHash ? (
                        <a
                          href={`https://amoy.polygonscan.com/tx/${a.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-strong underline-offset-2 hover:underline"
                        >
                          confirmed ↗
                        </a>
                      ) : (
                        <span className="text-muted">pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-12 border-t border-line pt-5 text-xs text-faint">
        <p>
          What this proves: a record existed at anchoring time and has never
          been altered since. What it doesn&apos;t: that a record was true when
          written — that&apos;s the job of our verification partners, KYC, and
          direct-to-provider payouts. We publish both halves so you can judge
          the whole.
        </p>
      </footer>
    </main>
  );
}
