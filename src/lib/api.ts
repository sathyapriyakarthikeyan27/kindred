import { ZodError } from "zod";
import { WorkflowError } from "@/lib/cases/workflow";

/** JSON.stringify chokes on BigInt — serialize ledger amounts as strings. */
export function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

export function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return Response.json(toJsonSafe(value), init);
}

/** Uniform error mapping: domain/validation failures are 4xx, the rest 500. */
export function errorResponse(error: unknown): Response {
  if (error instanceof ZodError) {
    return Response.json(
      { error: "Invalid input", issues: error.issues },
      { status: 400 },
    );
  }
  if (error instanceof WorkflowError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  console.error(error);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
