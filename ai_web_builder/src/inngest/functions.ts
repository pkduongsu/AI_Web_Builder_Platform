import { inngest } from "./client";
import { openai, createAgent, createTool, createNetwork } from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter"
import { getSandbox } from "./utils";
import { z } from "zod";
import { PROMPT } from "@/prompt";
import { lastAssistantTextMessageContent } from "./utils";

export const helloWorld = inngest.createFunction(
  { id: "hello-world" },
  { event: "test/hello.world" },
  async ({ event, step }) => {
    const sandboxId = await step.run("get-sandbox-id", async () => {
      const sandbox = await Sandbox.create("web_builder-nextjs-test");
      return sandbox.sandboxId;
    });

    const codeAgent = createAgent({
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
            { step, network }
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
  
   const network = createNetwork({
    name: "coding-agent-network",
    agents: [codeAgent],
    maxIter: 15, // Maximum iterations to prevent infinite loops
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

    const result = await network.run(event.data.value);

    const sandboxUrl = await step.run("get-sandbox-url", async () => {
      const sandbox = await getSandbox(sandboxId);
      const host = sandbox.getHost(3000);
      return 'https://' + host;
    });

    return {
      url: sandboxUrl ,
      title: "Fragment",
      files: result.state.data.files,
      summary: result.state.data.summary
    };
  },
);