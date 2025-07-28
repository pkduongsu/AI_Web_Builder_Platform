import { protectedProcedure,createTRPCRouter} from "@/trpc/init";
import z from "zod";
import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/db";
import { TRPCError } from "@trpc/server";
import { consumeCredits } from "@/lib/usage";

export const messagesRouter = createTRPCRouter({
    getMany: protectedProcedure
        .input(
            z.object({
                projectId: z.string().min(1, {message: "Project ID is required"}),
            }),
        )
        .query(async ({input, ctx}) => {
            const messages = await prisma.message.findMany({
                where: {
                    projectId: input.projectId,
                    project: {
                        userId: ctx.auth.userId,
                    },
                },
                orderBy: {
                    updatedAt: "asc", //first message should be User, then asisstant
                },
                include: {
                    fragment: true,
                }
            });
            return messages;
        }),

    create: protectedProcedure
     .input(
        z.object({
            value: z.string().min(1, {message: "Message is required"})
            .max(10000, {message: "Message is too long"}),
            projectId: z.string().min(1, {message: "Project ID is required"}),
        }),
     )
     .mutation(async ({ input, ctx}) => {
        const existingProject = await prisma.project.findUnique({
            where:{
                id: input.projectId,
                userId: ctx.auth.userId,
            },
        });

        if (!existingProject) {
            throw new TRPCError({code: "NOT_FOUND", message:"Project not found."})
        } //does not allow anyone to create a message in other person's project -> protect before triggering background jobs


        try {
            await consumeCredits();
        } catch (error) {
            if (error instanceof Error) {
                throw new TRPCError({code: "BAD_REQUEST", message: "Something went wrong"});
            } else {
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: "You have run out of credits"
                });
            }
        }

        //create new message in the database
        const createdMessage = await prisma.message.create({
            data: {
                content: input.value,
                role: "USER",
                type: "RESULT",
                projectId: input.projectId,
            },
        });

        await inngest.send({ 
            name: 'code-agent/run',
            data: {
            value: input.value,
            projectId: input.projectId,
         }
        });

        return createdMessage;
     }),
});
