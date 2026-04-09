import OpenAI from "openai";

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY or OPENAI environment variable is required");
    }
    _client = new OpenAI({ apiKey });
  }
  return _client;
}

export const MODEL = "gpt-4o";
export const MODEL_MINI = "gpt-4o-mini";
