import { inngest } from "./client";
import { openai, createAgent, createTool, createNetwork, type Tool, Message, createState } from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter"
import { getSandbox } from "./utils";
import { z } from "zod";
import { FRAGMENT_TITLE_PROMPT, PROMPT, RESPONSE_PROMPT } from "@/prompt";
import { lastAssistantTextMessageContent } from "./utils";
import { prisma } from "@/lib/db";
import { parseAgentOutput } from "@/lib/utils";
import { SANDBOX_TIMEOUT } from "./types";


interface AgentState {
  summary: string,
  files: { [path: string]: string}
};

export const codeAgentFunction = inngest.createFunction(
  { id: "code-agent" },
  { event: "code-agent/run" },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("web_builder-nextjs-test");
      await sandbox.setTimeout(SANDBOX_TIMEOUT); //10 minutes sandbox timeout
      return sandbox.sandboxId;
    });

    //agent memory: retain context from previous messages
    const previousMessages = await step.run("get-previous-messages", async() => {
      const formattedMessages: Message[] = [];

      const messages = await prisma.message.findMany({
        where: {
          projectId: event.data.projectId,
        },
        orderBy: {
          createdAt: "desc" //change to asc if ai doesn't understand what is the primary message/goal and latest messages
        },
        take: 5, //limit the number of messages to 5
      });

      for (const message of messages) {
        formattedMessages.push({
          type: "text",
          role: message.role === "ASSISTANT" ? "assistant" : "user",
          content: message.content,
        })
      }

      return formattedMessages.reverse();
    });
    
    const state = createState<AgentState>(
      {
        summary: "",
        files: {},
      },
      {
        messages: previousMessages
      }
    );

    const codeAgent = createAgent<AgentState>({
      name: "code-agent",
      description: "An expert coding agent",
      system: PROMPT,
      model: openai({
         model: "gpt-4.1",
         defaultParameters: {
          temperature: 0.1, // Low temperature for more deterministic output
         }
        }),
      tools: [
        createTool({
          name: "terminal",
          description: "Use the terminal to run commands",
          parameters: z.object({
            command: z.string(),
          }),
          handler: async ({ command }, { step }) => {
            return await step?.run("terminal", async () => { //? to check for undefined step
              const buffers = {stdout: "", stderr: ""};

              try {
                const sandbox = await getSandbox(sandboxId);
                //execute the command in the sandbox
                const result = await sandbox.commands.run(command, {
                //grabs data from stdout and stderr
                 onStdout: (data: string) => { 
                  buffers.stdout += data;
                 },
                 onStderr: (data: string) => {
                  buffers.stderr += data;
                   }  
              });
                return result.stdout;
              } catch (e) {
                console.error(
                  `Command failed: ${e} \nstdout: ${buffers.stdout} \nstderr: ${buffers.stderr}`,
                );
                return `Command failed: ${e} \nstdout: ${buffers.stdout} \nstderr: ${buffers.stderr}`;
              }
            })
          }
        }),
        createTool({
          name: "createOrUpdateFiles",
          description: "Create or update files in the sandbox",
          parameters: z.object({
            files: z.array(
            z.object({
              path: z.string(),
              content: z.string(),
            }),
          ),
          }),
          handler: async ( 
            { files },
            { step, network }: Tool.Options<AgentState>
          ) => { 
            const newFiles = await step?.run("createOrUpdateFiles", async () => {
              try {
                const updatedFiles = network.state.data.files || {};
                const sandbox = await getSandbox(sandboxId);
                for (const file of files) {
                  await sandbox.files.write(file.path, file.content);
                  updatedFiles[file.path] = file.content;
                }

                return updatedFiles;
              } catch (e) {
                return "Error: " + e
              }
            });

            if (typeof newFiles === "object") {
              network.state.data.files = newFiles;
            } //if newFiles is an object, store it in the internal network state


          }
        }),
        createTool({
          name: "readFiles",
          description: "Read files from the sandbox",
          parameters: z.object({
            files: z.array(z.string()),
          }),
          handler: async ({ files }, { step }) => {
            return await step?.run("readFiles", async () => {
              try {
                const sandbox = await getSandbox(sandboxId);
                const contents = [];
                for (const file of files) {
                  const content = await sandbox.files.read(file);
                  contents.push({path: files, content});
                }
                return JSON.stringify(contents);
              } catch (e) {
                return "Error: " + e;
              }
            })
          }
        })
      ],
      lifecycle: {
        onResponse: async ({ result, network }) => {
          const lastAssistantMessageText = 
          lastAssistantTextMessageContent(result);

          if (lastAssistantMessageText && network) {
            //check for the final task summary when task is complete
            if (lastAssistantMessageText.includes("<task_summary>")) {
              network.state.data.summary = lastAssistantMessageText;
            }
          }

          return result;
      },
    },
});
  
   const network = createNetwork<AgentState>({
    name: "coding-agent-network",
    agents: [codeAgent],
    maxIter: 15, // Maximum iterations to prevent infinite loops
    defaultState: state,
    router: async ({ network }) => {
      const summary = network.state.data.summary;

      //break the loop if a summary is found
      if (summary) {
        return;
      }

      //else continue calling the code agent to generate more till summary
      return codeAgent;
    }
   })

    const result = await network.run(event.data.value, { state });

    //create another agent to generate fragment title
    const fragmentTitleGenerator = createAgent({
      name: "fragment-title-generator",
      description: "A fragment title generator",
      system: FRAGMENT_TITLE_PROMPT,
      model: openai({
         model: "o4-mini",
        }),
    });

    //create another agent to generate proper response
    const responseGenerator = createAgent({
      name: "response-generator",
      description: "A response generator",
      system: RESPONSE_PROMPT,
      model: openai({
         model: "o4-mini",
        }),
    });

    const { output: fragmentTitleOutput } = await fragmentTitleGenerator.run(result.state.data.summary);
    const { output: responseOutput } = await responseGenerator.run(result.state.data.summary);

    const isError = !result.state.data.summary || 
    Object.keys(result.state.data.files || {}).length === 0;

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return 'https://' + host;
    });

    //save the sandbox URL to the database
    await step.run("save-sandbox-url", async () => {
      if (isError) {
        return await prisma.message.create({
          data: {
            projectId: event.data.projectId,
            content: "Something went wrong. Please try again.",
            role: "ASSISTANT",
            type: "ERROR",
          },
        });
      }
      
      
      return await prisma.message.create({
        data: {
          projectId: event.data.projectId,
          content: parseAgentOutput(responseOutput),
          role: "ASSISTANT",
          type: "RESULT",
          fragment: {
            create: {
              sandboxUrl: sandboxUrl,
              title: parseAgentOutput(fragmentTitleOutput),
              files: result.state.data.files,
          }
        }
      } 
     })
    });

    return {
      url: sandboxUrl ,
      title: "Fragment",
      files: result.state.data.files,
      summary: result.state.data.summary
    };
  },
);