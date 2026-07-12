import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";

function formatPaise(paise: bigint): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(paise) / 100);
}

async function lookupDonation(formData: FormData) {
  "use server";
  const raw = String(formData.get("number") ?? "").trim();
  const n = Number(raw.replace(/^D-/i, ""));
  if (Number.isInteger(n) && n > 0) redirect(`/trace/${n}`);
}

export default async function Home() {
  const cases = await prisma.case.findMany({
    where: { status: { in: ["ACTIVE", "FUNDED", "FULFILLED"] } },
    orderBy: { publishedAt: "desc" },
    take: 12,
    select: {
      caseNumber: true,
      title: true,
      status: true,
      goalPaise: true,
      raisedPaise: true,
      city: true,
      cause: { select: { name: true } },
      beneficiary: { select: { publicName: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
      <header>
        <h1 className="font-[family-name:var(--font-fraunces)] text-5xl sm:text-6xl">
          Kindred
        </h1>
        <p className="mt-3 max-w-md text-lg text-muted">
          Give to a verified need — then follow every rupee to the person it
          reached.
        </p>
      </header>

      <form
        action={lookupDonation}
        className="mt-8 flex max-w-md items-center gap-2 rounded-md border border-line bg-card p-2"
      >
        <label htmlFor="number" className="sr-only">
          Donation number
        </label>
        <input
          id="number"
          name="number"
          placeholder="Track a donation, e.g. D-1024"
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-background hover:bg-accent-strong"
        >
          Trace
        </button>
      </form>

      <section className="mt-12">
        <h2 className="text-sm font-semibold tracking-[0.14em] text-faint uppercase">
          Verified cases
        </h2>
        {cases.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No public cases yet — every case is verified before it appears here.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-md border border-line">
            {cases.map((c) => (
              <li key={c.caseNumber} className="p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="font-medium">{c.title}</p>
                  <span className="shrink-0 text-xs text-faint">
                    Case #{c.caseNumber}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">
                  {c.beneficiary.publicName} · {c.cause.name}
                  {c.city ? ` · ${c.city}` : ""}
                </p>
                <p className="mt-2 font-mono text-sm tabular-nums">
                  {formatPaise(c.raisedPaise)}{" "}
                  <span className="text-faint">of {formatPaise(c.goalPaise)}</span>
                  {c.status === "FULFILLED" && (
                    <span className="ml-2 text-gold">· fulfilled</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-14 border-t border-line pt-5 text-xs text-faint">
        <p>
          Funds are held in escrow and released direct to hospitals, schools,
          and vendors against verified milestones — never as loose cash.{" "}
          <Link href="/trace/1" className="underline hover:text-muted">
            See a live trail
          </Link>
        </p>
      </footer>
    </main>
  );
}
