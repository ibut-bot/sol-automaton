import type {
  InferenceClient,
  InferenceMessage,
  InferenceToolDefinition,
  InferenceResponse,
} from "../types.js";

interface InferenceClientOptions {
  apiUrl: string;
  apiKey: string;
  defaultModel: string;
  maxTokens: number;
}

export function createInferenceClient(options: InferenceClientOptions): InferenceClient {
  const { apiUrl, apiKey, maxTokens } = options;
  let currentModel = options.defaultModel;
  let lowCompute = false;

  const chat = async (
    messages: InferenceMessage[],
    tools?: InferenceToolDefinition[],
    model?: string,
  ): Promise<InferenceResponse> => {
    const useModel = model || currentModel;
    const body: Record<string, unknown> = {
      model: useModel,
      messages,
      max_tokens: maxTokens,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const resp = await fetch(`${apiUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Inference error: ${resp.status}: ${text}`);
    }

    const data = (await resp.json()) as any;
    const choice = data.choices?.[0];
    const msg = choice?.message || {};

    const toolCalls = (msg.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || "{}"),
    }));

    return {
      content: msg.content || "",
      toolCalls,
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
      model: data.model || useModel,
    };
  };

  return {
    chat,
    getDefaultModel: () => currentModel,
    setLowComputeMode: (enabled: boolean) => {
      lowCompute = enabled;
      currentModel = enabled ? "gpt-4o-mini" : options.defaultModel;
    },
  };
}
