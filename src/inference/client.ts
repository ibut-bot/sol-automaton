import { Keypair } from "@solana/web3.js";
import chalk from "chalk";
import type {
  InferenceClient,
  InferenceMessage,
  InferenceResponse,
  AutomatonConfig,
  X402_MODELS,
} from "../types.js";

const X402_GATEWAY = "https://x402-gateway-production.up.railway.app";

interface X402InferenceOptions {
  config: AutomatonConfig;
  paidFetch: typeof fetch;
}

/**
 * Builds an inference client that calls x402engine LLM endpoints,
 * paying per-request with Solana USDC via the x402 protocol.
 *
 * `paidFetch` is expected to be a fetch wrapper that automatically
 * handles 402 Payment Required responses (created via @x402/fetch).
 */
export function createInferenceClient(options: X402InferenceOptions): InferenceClient {
  const { config, paidFetch } = options;

  let currentModel = config.inferenceModel;
  let lowCompute = false;

  const chat = async (
    messages: InferenceMessage[],
    modelOverride?: string,
  ): Promise<InferenceResponse> => {
    const model = modelOverride ?? currentModel;
    const url = `${X402_GATEWAY}/api/llm/${model}`;

    const openaiMessages = messages.map((m) => {
      const msg: Record<string, unknown> = { role: m.role, content: m.content };
      if (m.name) msg.name = m.name;
      if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
      if (m.tool_calls) msg.tool_calls = m.tool_calls;
      return msg;
    });

    const body: Record<string, unknown> = {
      messages: openaiMessages,
      max_tokens: config.maxTokensPerTurn,
    };

    const res = await paidFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error");
      throw new Error(`Inference failed (${res.status}): ${errText}`);
    }

    const data = await res.json() as {
      content: string;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    };

    const response: InferenceResponse = {
      content: data.content ?? "",
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };

    return response;
  };

  const getDefaultModel = (): string => currentModel;

  const setLowComputeMode = (enabled: boolean): void => {
    lowCompute = enabled;
    currentModel = enabled ? config.lowComputeModel : config.inferenceModel;
    console.log(
      chalk.yellow(`[inference] Model switched to ${currentModel} (low_compute=${enabled})`),
    );
  };

  return { chat, getDefaultModel, setLowComputeMode };
}
