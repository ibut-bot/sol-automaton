import { Connection } from "@solana/web3.js";
import { ulid } from "ulid";
import chalk from "chalk";
import type {
  AutomatonIdentity,
  AutomatonConfig,
  AutomatonDatabase,
  ConwayClient,
  InferenceClient,
  InferenceMessage,
  AutomatonTool,
  Skill,
  SocialClientInterface,
  AgentState,
  TurnRecord,
  ToolContext,
  FinancialState,
} from "../types.js";
import { buildSystemPrompt, buildWakeupPrompt } from "./system-prompt.js";
import { createBuiltinTools, toolsToInferenceFormat, executeTool } from "./tools.js";
import { getSolanaUsdcBalance, getSolanaSolBalance } from "../solana/x402.js";

interface AgentLoopOptions {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
  conway: ConwayClient;
  inference: InferenceClient;
  social?: SocialClientInterface;
  skills?: Skill[];
  onStateChange?: (state: AgentState) => void;
  onTurnComplete?: (turn: TurnRecord) => void;
}

const MAX_TOOL_ROUNDS = 10;

export async function runAgentLoop(options: AgentLoopOptions): Promise<void> {
  const { identity, config, db, conway, inference, social, skills, onStateChange, onTurnComplete } = options;

  db.setAgentState("running");
  onStateChange?.("running");

  const tools = createBuiltinTools(identity.sandboxId);
  const toolDefs = toolsToInferenceFormat(tools);

  const toolContext: ToolContext = { identity, config, conway, inference, db, social };

  const financial = await getFinancialState(config, conway, identity);

  const isFirstRun = db.getTurnCount() === 0;
  const systemPrompt = buildSystemPrompt({
    identity, config, financial,
    state: "running", db, tools, skills,
    isFirstRun,
  });

  const wakeupPrompt = buildWakeupPrompt({ identity, config, financial, db });

  const messages: InferenceMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: wakeupPrompt },
  ];

  // ReAct loop: Think → Act → Observe → Repeat
  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;

    const ts = () => chalk.dim(`[${new Date().toISOString()}]`);

    console.log(`\n${ts()} ${chalk.cyan(`── Round ${rounds}/${MAX_TOOL_ROUNDS} ──`)}`);
    const response = await inference.chat(messages, toolDefs);

    if (response.content) {
      messages.push({ role: "assistant", content: response.content });
      console.log(`${ts()} ${chalk.yellow("THINKING:")}`);
      console.log(chalk.white(response.content));
    }

    if (response.toolCalls.length === 0) {
      console.log(`${ts()} ${chalk.dim("No tool calls — turn complete.")}`);
      const turn: TurnRecord = {
        id: ulid(),
        timestamp: new Date().toISOString(),
        thinking: response.content || "",
        toolCalls: [],
        tokenUsage: response.usage,
        inputSource: "self",
      };
      db.insertTurn(turn);
      onTurnComplete?.(turn);
      break;
    }

    // Build assistant message with tool_calls
    messages.push({
      role: "assistant",
      content: response.content || "",
      tool_calls: response.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    const toolResults = [];
    for (const toolCall of response.toolCalls) {
      console.log(`${ts()} ${chalk.green("TOOL CALL:")} ${chalk.bold(toolCall.name)}(${JSON.stringify(toolCall.arguments)})`);

      const result = await executeTool(toolCall.name, toolCall.arguments, tools, toolContext);
      toolResults.push(result);

      if (result.error) {
        console.log(`${ts()} ${chalk.red("ERROR:")} ${result.error} ${chalk.dim(`(${result.durationMs}ms)`)}`);
      } else {
        const preview = result.result.length > 500 ? result.result.slice(0, 500) + "..." : result.result;
        console.log(`${ts()} ${chalk.blue("RESULT:")} ${preview} ${chalk.dim(`(${result.durationMs}ms)`)}`);
      }

      messages.push({
        role: "tool",
        content: result.error || result.result,
        tool_call_id: toolCall.id,
      });
    }

    const turn: TurnRecord = {
      id: ulid(),
      timestamp: new Date().toISOString(),
      thinking: response.content || "",
      toolCalls: toolResults,
      tokenUsage: response.usage,
      inputSource: "self",
    };
    db.insertTurn(turn);
    onTurnComplete?.(turn);

    console.log(`${ts()} ${chalk.dim(`Tokens: ${response.usage.totalTokens} (prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens})`)}`);

    // Check if agent decided to sleep or die
    const currentState = db.getAgentState();
    if (currentState === "sleeping" || currentState === "dead") {
      onStateChange?.(currentState);
      return;
    }
  }

  // Default to sleeping after max rounds
  db.setAgentState("sleeping");
  db.setKV("sleep_until", new Date(Date.now() + 60_000).toISOString());
  onStateChange?.("sleeping");
}

async function getFinancialState(
  config: AutomatonConfig,
  conway: ConwayClient,
  identity: AutomatonIdentity,
): Promise<FinancialState> {
  let conwayCreditsCents = 0;
  let solanaUsdcBalance = 0;
  let solanaSolBalance = 0;

  try {
    conwayCreditsCents = await conway.getCreditsBalance();
  } catch {}

  try {
    const connection = new Connection(config.solanaRpcUrl, "confirmed");
    solanaUsdcBalance = await getSolanaUsdcBalance(connection, identity.solana.publicKey);
    solanaSolBalance = await getSolanaSolBalance(connection, identity.solana.publicKey);
  } catch {}

  return { conwayCreditsCents, solanaUsdcBalance, solanaSolBalance };
}
