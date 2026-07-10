/**
 * AssemblyAI LLM Gateway — an OpenAI-compatible `/chat/completions` endpoint
 * over 25+ models (Claude, GPT, Gemini, …), plus a `/understanding` endpoint
 * that can reference a transcript by id.
 *
 * ⚠️ Same key-safety rule as {@link RestClient}: no client token exists, so set
 * `baseUrl` to your proxy on mobile, or pass `apiKey` server-side only.
 */
export type LlmGatewayOptions = {
  apiKey?: string;
  baseUrl?: string;
  useEU?: boolean;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatCompletionParams = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  /** Reference a transcript's text server-side without shipping it to the client. */
  transcript_id?: string;
  /** `global` routing for a discount. */
  model_region?: 'global' | string;
  [key: string]: unknown;
};

export type ChatCompletion = {
  request_id: string;
  choices: { index: number; message: ChatMessage; finish_reason: string }[];
  usage?: Record<string, number>;
};

export class LlmGateway {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(options: LlmGatewayOptions = {}) {
    this.baseUrl =
      options.baseUrl ??
      (options.useEU
        ? 'https://llm-gateway.eu.assemblyai.com/v1'
        : 'https://llm-gateway.assemblyai.com/v1');
    this.headers = options.apiKey ? { Authorization: options.apiKey } : {};
  }

  async chat(params: ChatCompletionParams): Promise<ChatCompletion> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`chat completion failed (${res.status}): ${await res.text()}`);
    return (await res.json()) as ChatCompletion;
  }

  /** Convenience: return just the assistant text from a single-turn prompt. */
  async complete(model: string, prompt: string, transcriptId?: string): Promise<string> {
    const completion = await this.chat({
      model,
      messages: [{ role: 'user', content: prompt }],
      ...(transcriptId ? { transcript_id: transcriptId } : {}),
    });
    return completion.choices[0]?.message.content ?? '';
  }
}
