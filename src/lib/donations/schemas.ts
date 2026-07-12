import { z } from "zod";

const paise = z
  .string()
  .regex(/^[1-9]\d*$/, "Amount must be a positive integer number of paise, as a string")
  .transform(BigInt);

// TODO(auth): donorId from session once auth lands.
export const recordDonationSchema = z.object({
  donorId: z.string().min(1),
  caseId: z.string().min(1),
  amountPaise: paise,
  paymentRef: z.string().optional(),
  optInUpdates: z.boolean().optional(),
});

export const allocateSchema = z.object({
  donationId: z.string().min(1),
  milestoneId: z.string().min(1),
  amountPaise: paise,
});

export const disburseSchema = z.object({
  milestoneId: z.string().min(1),
  providerId: z.string().min(1),
  amountPaise: paise,
  paymentRef: z.string().optional(),
  proof: z.object({
    kind: z.enum(["INVOICE", "RECEIPT", "VERIFIER_SIGNOFF", "PHOTO", "DOCUMENT"]),
    storageKey: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex chars"),
    redactedKey: z.string().optional(),
  }),
});
