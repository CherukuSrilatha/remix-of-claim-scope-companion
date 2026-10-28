import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";
const CLAIM_COOLDOWN_DAYS = 30;

function createRunIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) {
      headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
    }
    const response = await fetch(input, { ...init, headers });
    runId ??= response.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || undefined;
    return response;
  };
}

const analyzeInput = z.object({
  images: z.array(z.string()).min(1).max(4),
  storagePaths: z.array(z.string()).default([]),
});

const regionSchema = z.object({
  imageIndex: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  part: z.string(),
  severity: z.string().optional(),
});

const analysisSchema = z.object({
  isVehicle: z.boolean(),
  damagedParts: z.array(z.string()).default([]),
  regions: z.array(regionSchema).default([]),
  damagePercentage: z.number(),
  severity: z.string(),
  summary: z.string(),
});

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "```").trim();
  const fenced = cleaned.match(/```([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? cleaned;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in model output");
  return JSON.parse(candidate.slice(start, end + 1));
}

export const analyzeDamage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => analyzeInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (isAdmin) throw new Error("Insurer accounts cannot create claims.");

    // Fingerprint each photo and refuse any already used in another claim.
    const hashes = await Promise.all(
      data.images.map(async (img) => {
        const bytes = new TextEncoder().encode(img.slice(img.indexOf(",") + 1));
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }),
    );
    if (new Set(hashes).size !== hashes.length) {
      throw new Error("The same photo was added more than once.");
    }
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: dupes } = await supabaseAdmin
        .from("claims")
        .select("id")
        .overlaps("image_hashes", hashes)
        .limit(1);
      if (dupes && dupes.length > 0) {
        throw new Error(
          "One or more of these photos were already used in another claim. Please take new photos of the damage.",
        );
      }
    }

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const lovable = createOpenAI({
      apiKey,
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: createRunIdFetch(),
    });

    const prompt = [
      "You are a motor-insurance damage assessor.",
      "Inspect the attached photo(s) of a vehicle and locate every visibly damaged area.",
      "Reply with ONLY a JSON object, no prose, using exactly this shape:",
      '{"isVehicle": boolean, "damagedParts": string[], "regions": [{"imageIndex": number, "x": number, "y": number, "width": number, "height": number, "part": string, "severity": "minor"|"moderate"|"severe"}], "damagePercentage": number, "severity": "minor"|"moderate"|"severe"|"total loss", "summary": string}',
      "x, y, width and height are fractions of the image (0 to 1), where x,y is the top-left corner of a tight box around the damage.",
      "imageIndex is the zero-based index of the photo the box belongs to.",
      "damagePercentage is the overall share of the vehicle that is damaged, 0 to 100.",
      "Keep summary under 300 characters. If no vehicle is visible set isVehicle to false, regions to [] and damagePercentage to 0.",
    ].join("\n");

    const result = streamText({
      model: lovable.responses("openai/gpt-6-astra"),
      maxRetries: 1,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...data.images.map((image) => ({
              type: "image" as const,
              image: new URL(image),
            })),
          ],
        },
      ],
    });

    const text = await result.text;
    const parsed = analysisSchema.parse(extractJson(text));

    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    const regions = parsed.regions
      .filter((r) => r.imageIndex >= 0 && r.imageIndex < data.images.length)
      .map((r) => ({
        imageIndex: Math.round(r.imageIndex),
        x: clamp(r.x),
        y: clamp(r.y),
        width: clamp(r.width),
        height: clamp(r.height),
        part: r.part.slice(0, 60),
        severity: (r.severity ?? "moderate").slice(0, 20),
      }));

    const damagePercentage = Math.min(100, Math.max(0, Math.round(parsed.damagePercentage)));

    const { data: claim, error } = await context.supabase
      .from("claims")
      .insert({
        user_id: context.userId,
        image_urls: data.storagePaths,
        image_hashes: hashes,
        damage_regions: regions,
        damaged_parts: parsed.damagedParts.slice(0, 20),
        damage_percentage: damagePercentage,
        severity: parsed.severity.slice(0, 20),
        summary: parsed.isVehicle
          ? parsed.summary.slice(0, 400)
          : "No vehicle could be recognised in the uploaded photos.",
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    return { claimId: claim.id, isVehicle: parsed.isVehicle };
  });

const verifyInput = z.object({
  claimId: z.string().uuid(),
  holderName: z.string().trim().min(2).max(100),
  policyNumber: z.string().trim().min(3).max(40),
  insuranceType: z.string().trim().min(2).max(40),
  vehicleType: z.string().trim().min(2).max(40),
  vehicleModel: z.string().trim().min(2).max(80),
  insuredAmount: z.number().nonnegative().max(100_000_000),
  policyDate: z.string().trim().min(4).max(20),
  amountPaid: z.number().nonnegative().max(100_000_000),
});

const TYPE_FACTOR: Record<string, number> = {
  comprehensive: 1,
  zero_depreciation: 1,
  own_damage: 0.85,
  third_party: 0.5,
};

export const verifyClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => verifyInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: claim, error: claimError } = await context.supabase
      .from("claims")
      .select("id, damage_percentage, severity")
      .eq("id", data.claimId)
      .single();
    if (claimError || !claim) throw new Error("Claim not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: record } = await supabaseAdmin
      .from("policy_registry")
      .select("*")
      .ilike("policy_number", data.policyNumber.trim())
      .maybeSingle();

    const norm = (v: string) => v.trim().toLowerCase();
    const mismatches: string[] = [];
    let status: "verified" | "rejected" = "rejected";
    let reason = "No policy with this number exists in our records.";

    if (record) {
      if (norm(record.holder_name) !== norm(data.holderName)) mismatches.push("policy holder name");
      if (norm(record.vehicle_model) !== norm(data.vehicleModel)) mismatches.push("vehicle model");
      if (norm(record.vehicle_type) !== norm(data.vehicleType)) mismatches.push("vehicle type");
      if (norm(record.insurance_type) !== norm(data.insuranceType)) mismatches.push("insurance type");
      if (Math.abs(Number(record.insured_amount) - data.insuredAmount) > 1)
        mismatches.push("insured amount");
      if (!record.active) mismatches.push("policy status (inactive)");

      if (mismatches.length === 0) {
        status = "verified";
        reason = "All submitted details match our records.";
        // Waiting period: one claim per policy every CLAIM_COOLDOWN_DAYS days.
        const since = new Date(Date.now() - CLAIM_COOLDOWN_DAYS * 86_400_000).toISOString();
        const { data: recent } = await supabaseAdmin
          .from("claims")
          .select("created_at")
          .ilike("policy_number", data.policyNumber.trim())
          .eq("verification_status", "verified")
          .neq("id", data.claimId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1);
        if (recent && recent.length > 0) {
          const next = new Date(
            new Date(recent[0]!.created_at).getTime() + CLAIM_COOLDOWN_DAYS * 86_400_000,
          );
          status = "rejected";
          reason = `A claim was already made on this policy recently. Only one claim is allowed every ${CLAIM_COOLDOWN_DAYS} days — you can claim again from ${next.toLocaleDateString("en-IN")}.`;
        }
      } else {
        reason = `These details do not match our records: ${mismatches.join(", ")}.`;
      }
    }

    const damage = Number(claim.damage_percentage ?? 0);
    const factor = record ? (TYPE_FACTOR[norm(record.insurance_type)] ?? 0.7) : 0;
    const claimable =
      status === "verified" && record
        ? Math.round((Number(record.insured_amount) * damage * factor) / 100)
        : 0;

    const reference = null;

    const { error: updateError } = await context.supabase
      .from("claims")
      .update({
        holder_name: data.holderName,
        policy_number: data.policyNumber.trim().toUpperCase(),
        insurance_type: data.insuranceType,
        vehicle_type: data.vehicleType,
        vehicle_model: data.vehicleModel,
        insured_amount: data.insuredAmount,
        policy_date: data.policyDate,
        amount_paid: data.amountPaid,
        verification_status: status,
        claim_status: status === "verified" ? "under_review" : "rejected",
        verification_reason: reason,
        claimable_amount: claimable,
      })
      .eq("id", data.claimId);

    if (updateError) throw new Error(updateError.message);

    return { status, reason, claimable, reference };
  });

const chatInput = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(30),
});

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => chatInput.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const { data: claims } = await context.supabase
      .from("claims")
      .select(
        "claim_reference, created_at, damaged_parts, damage_percentage, severity, insurance_type, verification_status, verification_reason, claim_status, status_note, claimable_amount",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const lovable = createOpenAI({
      apiKey,
      baseURL: "https://ai.gateway.lovable.dev/v1",
      headers: { "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: createRunIdFetch(),
    });

    const system = [
      "You are the friendly AutoClaim assistant for an Indian motor-insurance claims app.",
      "Answer briefly and in plain language. Amounts are in Indian rupees.",
      "Insurance types: comprehensive (covers own damage + third party, 100% payout factor), zero depreciation (no depreciation on parts, 100%), own damage (85%), third party (only damage to others, 50%).",
      "Claimable amount = insured amount × damage % × cover factor. Policies are verified by matching holder name, vehicle type, model, insurance type and insured amount with insurer records.",
      "Claim stages: Submitted → Under review (sent to insurer) → Approved (insurer assigns claim ID, customer enters bank details) → In process (money credited in 2-5 working days) → Paid, or Rejected.",
      "The user's recent claims (JSON):",
      JSON.stringify(claims ?? []),
    ].join("\n");

    const result = streamText({
      model: lovable.responses("openai/gpt-6-astra"),
      maxRetries: 1,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
      system,
      messages: data.messages,
    });

    return { reply: await result.text };
  });
