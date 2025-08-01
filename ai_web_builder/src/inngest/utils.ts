import { Sandbox } from "@e2b/code-interpreter";
import { AgentResult, TextMessage } from "@inngest/agent-kit";
import { SANDBOX_TIMEOUT } from "./types";

export async function getSandbox(sandboxId: string) {
  const sandbox = await Sandbox.connect(sandboxId);
  await sandbox.setTimeout(SANDBOX_TIMEOUT); //10 minutes sandbox timeout
  return sandbox;
};

export function lastAssistantTextMessageContent(result: AgentResult) {
  const lastAssistantTextMessageIndex = result.output.findLastIndex(
    (message) => message.role === "assistant",
  );

  const message = result.output[lastAssistantTextMessageIndex] as 
    | TextMessage
    | undefined;

  return message?.content 
    ? typeof message.content === "string"
      ? message.content
      : message.content.map((c) => c.text).join("") //join text in case response is an array of strings
    : undefined;
};