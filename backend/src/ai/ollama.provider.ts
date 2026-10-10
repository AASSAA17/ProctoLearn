import { ConfigService } from '@nestjs/config';

export interface OllamaToolCall { function: { name: string; arguments: Record<string, unknown> } }
export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_name?: string;
  tool_calls?: OllamaToolCall[];
}

export class OllamaProvider {
  constructor(private readonly config: ConfigService) {}

  async chat(messages: OllamaMessage[], tools: unknown[] | undefined, signal: AbortSignal): Promise<OllamaMessage> {
    const url = new URL(this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://127.0.0.1:11434');
    // Backend-controlled local endpoint only; no model- or user-selected URL.
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]', 'ollama', 'host.docker.internal'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('InvalidLocalEndpoint');
    const model = this.config.get<string>('OLLAMA_MODEL') ?? 'qwen3:4b';
    if (!/^[a-zA-Z0-9_.:/-]{1,100}$/.test(model) || /cloud/i.test(model)) throw new Error('InvalidLocalModel');
    if (JSON.stringify(messages).length > 32000) throw new Error('ContextLimit');
    const response = await fetch(new URL('/api/chat', url), {
      method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json' },
      // The installed Qwen3 template requires thinking enabled to separate its
      // reasoning channel correctly. It is discarded below, never sent to UI.
      body: JSON.stringify({ model, messages, tools, stream: false, think: true,
        keep_alive: '5m', options: { num_ctx: 8192, num_predict: 1500, temperature: 0.2 } }),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error('ProviderUnavailable'); }
    if (!response.body) throw new Error('MissingBody');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65536) throw new Error('ProviderBodyLimit');
        chunks.push(value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || (data as any).done !== true || (data as any).done_reason === 'length') throw new Error('MalformedReply');
    const message = (data as any).message;
    if (!message || message.role !== 'assistant' || typeof message.content !== 'string' || message.content.length > 6000) throw new Error('MalformedReply');
    const calls = message.tool_calls;
    if (calls !== undefined && (!Array.isArray(calls) || calls.length > 4 || calls.some((call: any) =>
      !call?.function || typeof call.function.name !== 'string' || call.function.name.length > 60 ||
      !call.function.arguments || typeof call.function.arguments !== 'object' || Array.isArray(call.function.arguments) ||
      JSON.stringify(call.function.arguments).length > 1000))) throw new Error('MalformedToolCall');
    // Explicit projection discards thinking and any unexpected provider fields.
    // Older/custom templates can place a reasoning block in content instead.
    const content = message.content.includes('</think>') ? message.content.slice(message.content.lastIndexOf('</think>') + 8).trim() : message.content;
    if (content.includes('<think>')) throw new Error('UnclosedThinking');
    return { role: 'assistant', content, ...(calls ? { tool_calls: calls.map((call: any) => ({
      function: { name: call.function.name, arguments: call.function.arguments },
    })) } : {}) };
  }
}
