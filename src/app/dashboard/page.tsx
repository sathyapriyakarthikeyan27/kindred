import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { findDonorByEmail } from "@/lib/donors/dashboard";

export const metadata: Metadata = { title: "Your impact — Kindred" };

async function openDashboard(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return;
  const donor = await findDonorByEmail(email);
  // TODO(auth): replace lookup with the signed-in donor's session
  if (donor) redirect(`/dashboard/${donor.id}`);
  redirect(`/dashboard?notfound=1`);
}

export default async function DashboardLookup(props: PageProps<"/dashboard">) {
  const params = await props.searchParams;
  const notFound = params.notfound === "1";

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
      <h1 className="font-[family-name:var(--font-fraunces)] text-4xl sm:text-5xl">
        Your impact
      </h1>
      <p className="mt-3 max-w-md text-muted">
        See every case you&apos;ve supported and every life your giving has
        touched.
      </p>
      <form
        action={openDashboard}
        className="mt-8 flex max-w-md items-center gap-2 rounded-md border border-line bg-card p-2"
      >
        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="The email you donated with"
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-faint"
        />
        <button
          type="submit"
          className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-background hover:bg-accent-strong"
        >
          Open
        </button>
      </form>
      {notFound && (
        <p className="mt-3 text-sm text-muted">
          No donations found for that email. Check the address you used when
          giving.
        </p>
      )}
    </main>
  );
}
