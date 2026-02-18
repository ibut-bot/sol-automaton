import { Connection } from "@solana/web3.js";
import { ulid } from "ulid";
import chalk from "chalk";
import type {
  AutomatonIdentity,
  AutomatonConfig,
  AutomatonDatabase,
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
import { getFinancialState, getTier } from "../survival/tiers.js";

interface AgentLoopOptions {
  identity: AutomatonIdentity;
  config: AutomatonConfig;
  db: AutomatonDatabase;
  inference: InferenceClient;
  social?: SocialClientInterface;
  skills?: Skill[];
  onStateChange?: (state: AgentState) => void;
  onTurnComplete?: (turn: TurnRecord) => void;
}

const MAX_TOOL_ROUNDS = 10;

export async function runAgentLoop(options: AgentLoopOptions): Promise<void> {
  const { identity, config, db, inference, social, skills, onStateChange, onTurnComplete } = options;

  db.setAgentState("running");
  onStateChange?.("running");

  const tools = createBuiltinTools();
  const toolDefs = toolsToInferenceFormat(tools);
  const toolContext: ToolContext = { identity, config, db };

  const connection = new Connection(config.solanaRpcUrl, "confirmed");
  const financial = await getFinancialState(connection, identity.solana.publicKey);

  const tier = getTier(financial.solanaUsdcBalance);
  if (tier === "dead") {
    console.log(chalk.red("[agent] USDC balance is zero — agent cannot think. Waiting for funding."));
    db.setAgentState("dead");
    onStateChange?.("dead");
    return;
  }
  if (tier === "low_compute" || tier === "critical") {
    inference.setLowComputeMode(true);
  }

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

  let rounds = 0;
  while (rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    const ts = () => chalk.dim(`[${new Date().toISOString()}]`);

    console.log(`\n${ts()} ${chalk.cyan(`── Round ${rounds}/${MAX_TOOL_ROUNDS} ──`)}`);

    let response;
    try {
      response = await inference.chat(messages);
    } catch (err: any) {
      console.log(`${ts()} ${chalk.red("INFERENCE ERROR:")} ${err.message}`);
      break;
    }

    if (response.content) {
      messages.push({ role: "assistant", content: response.content });
      console.log(`${ts()} ${chalk.yellow("THINKING:")}`);
      console.log(chalk.white(response.content));
    }

    console.log(`${ts()} ${chalk.dim(`Tokens: ${response.usage.totalTokens} (prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens})`)}`);

    // No tool calls in x402engine basic response — agent just thinks
    // Record the turn
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

    // Check if agent decided to sleep or die
    const currentState = db.getAgentState();
    if (currentState === "sleeping" || currentState === "dead") {
      onStateChange?.(currentState);
      return;
    }

    // For now, one turn per loop iteration (can be expanded with tool calling later)
    break;
  }

  db.setAgentState("sleeping");
  db.setKV("sleep_until", new Date(Date.now() + 60_000).toISOString());
  onStateChange?.("sleeping");
}
