import { z } from "zod";

/** Rupee-friendly wire format: amounts arrive as integer paise strings. */
const paise = z
  .string()
  .regex(/^[1-9]\d*$/, "Amount must be a positive integer number of paise, as a string")
  .transform(BigInt);

export const caseIntakeSchema = z.object({
  beneficiary: z.object({
    fullName: z.string().min(2),
    publicName: z.string().min(2),
    guardian: z.string().min(2).optional(),
    city: z.string().min(2).optional(),
  }),
  consentScope: z.enum(["MILESTONES_ONLY", "NOTES_AND_PHOTOS", "FULL_STORY"]),
  case: z.object({
    title: z.string().min(5),
    story: z.string().min(20),
    city: z.string().min(2).optional(),
    type: z.enum(["INDIVIDUAL", "NGO_BACKED"]),
    goalPaise: paise,
    leftoverPolicy: z.enum(["SIMILAR_CASE", "PRO_RATA_REFUND", "CAUSE_POOL"]),
    causeSlug: z.string().min(2),
  }),
  milestones: z
    .array(z.object({ title: z.string().min(3), amountPaise: paise }))
    .min(1),
});

// TODO(auth): partnerId comes from the request body until sessions land —
// every verification endpoint must switch to the authenticated partner.
export const verifyCaseSchema = z.object({ partnerId: z.string().min(1) });

export const verifyMilestoneSchema = z.object({
  partnerId: z.string().min(1),
  note: z.string().min(3).optional(),
});

export const freezeCaseSchema = z.object({ reason: z.string().min(5) });

export const returnToDraftSchema = z.object({ reason: z.string().min(5) });

export const fulfillCaseSchema = z.object({
  partnerId: z.string().min(1),
  closingMessage: z.string().min(10),
});
