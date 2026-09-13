/**
 * One way to call Gemini from the app: a system instruction, some parts
 * (text, images, PDFs), and a Zod schema for the answer. Every AI feature
 * goes through generateStructured so the model choice, usage accounting,
 * blocked answers, and the "no key configured" case live in one place.
 *
 * Tests inject a fake with setGenerator(); nothing else needs a key.
 * Configure with GEMINI_API_KEY (the SDK also reads GOOGLE_API_KEY) and,
 * optionally, GEMINI_MODEL.
 */
import { ApiError, GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import { z } from "zod";

export const DEFAULT_MODEL = "gemini-2.5-pro";

export class AiError extends Error {}
export class AiNotConfiguredError extends AiError {
  constructor() {
    super("AI is not configured. Set GEMINI_API_KEY on the server to turn it on.");
  }
}

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}
export function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

export interface GenerateRequest<T> {
  system: string;
  parts: Part[];
  schema: z.ZodType<T>;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export interface GenerateResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type Generator = <T>(req: GenerateRequest<T>) => Promise<GenerateResult<T>>;

let client: GoogleGenAI | null = null;
let override: Generator | null = null;

/** For tests: replace the model with a function. Pass null to restore. */
export function setGenerator(g: Generator | null) {
  override = g;
}

async function realGenerator<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
  if (!aiConfigured()) throw new AiNotConfiguredError();
  client ??= new GoogleGenAI({});
  const model = modelName();
  let response: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
  try {
    response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: req.parts }],
      config: {
        systemInstruction: req.system,
        responseMimeType: "application/json",
        responseJsonSchema: z.toJSONSchema(req.schema),
        maxOutputTokens: req.maxTokens ?? 8192,
        thinkingConfig: { thinkingLevel: { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH }[req.effort ?? "medium"] },
      },
    });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401 || e.status === 403) throw new AiError("The AI key was rejected. Check GEMINI_API_KEY.");
      if (e.status === 429) throw new AiError("The AI service is busy. Try again in a minute.");
      throw new AiError(`AI request failed (${e.status}): ${e.message}`);
    }
    throw e;
  }
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) throw new AiError(`The model declined this request (${blocked}).`);
  const finish = response.candidates?.[0]?.finishReason;
  if (finish === "MAX_TOKENS") throw new AiError("The answer was cut off. Try again with less input.");
  if (finish && finish !== "STOP") throw new AiError(`The model stopped early (${finish}).`);
  const text = response.text;
  if (!text) throw new AiError("The model returned no answer.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AiError("The model's answer was not valid JSON.");
  }
  const parsed = req.schema.safeParse(raw);
  if (!parsed.success) throw new AiError("The model's answer did not match the expected shape.");
  const usage = response.usageMetadata;
  return {
    data: parsed.data,
    model,
    inputTokens: usage?.promptTokenCount ?? 0,
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
}

export function generateStructured<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
  return (override ?? realGenerator)(req);
}

/** A stored File as a model part: images and PDFs inline, text files as text, anything else skipped. */
export function fileToPart(file: { name: string; mimeType: string; data: Uint8Array | null }): Part | null {
  if (!file.data) return null;
  const mt = file.mimeType.toLowerCase();
  if (["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"].includes(mt)) {
    return { inlineData: { mimeType: mt, data: Buffer.from(file.data).toString("base64"), displayName: file.name } };
  }
  if (mt.startsWith("text/")) {
    return { text: `File ${file.name}:\n${Buffer.from(file.data).toString("utf8").slice(0, 60000)}` };
  }
  return null;
}
