import { useSuspenseQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { MessageCard } from "./message-card";
import { MessageForm } from "./message-form";
import { useEffect, useRef } from "react";
import { Fragment } from '@/generated/prisma'
import { MessageLoading } from "./message-loading"

interface Props {
    projectId: string;
    activeFragment: Fragment | null;
    setActiveFragment: (fragment: Fragment | null) => void;
};

//better to use useSuspenseQuery in a deeper component -> faster page loading visually
export const MessagesContainer = ({
    projectId, 
    activeFragment,
    setActiveFragment
}: Props) => {
    //adding interaction that scrolls down to the bottom every reload:
    const trpc = useTRPC();
    const bottomRef = useRef<HTMLDivElement>(null);
    const lastAssistantMessageIdRef = useRef<string | null>(null);

    const {data: messages} = useSuspenseQuery(trpc.messages.getMany.queryOptions({
        projectId: projectId, 
    }, {
        //refetch the messages every 2 seconds so you don't have to refresh page every time
        refetchInterval: 2000,
    }));

    useEffect(() => {
        const lastAssistantMessage = messages.findLast(
            (message) => message.role === "ASSISTANT"
        );

        if (
            lastAssistantMessage?.fragment && 
            lastAssistantMessage.id !== lastAssistantMessageIdRef.current
        ) {
            setActiveFragment(lastAssistantMessage.fragment);
            lastAssistantMessageIdRef.current = lastAssistantMessage.id;
        }

    }, [messages, setActiveFragment]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView();
    }, [messages.length])

    const lastMessage = messages[messages.length-1]

    const isLastMessageUser = lastMessage?.role === "USER";

    return (
        <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="pt-2 pr-1">
                    {/* dynamically create messages */}
                    {messages.map((message) => (
                        <MessageCard 
                            key={message.id}
                            content={message.content}
                            role={message.role}
                            fragment={message.fragment}
                            createdAt={message.createdAt}
                            isActiveFragment={activeFragment?.id === message.fragment?.id}
                            onFragmentClick={() => setActiveFragment(message.fragment)}
                            type={message.type}
                        />
                    ))}
                    {isLastMessageUser && <MessageLoading /> }
                    <div ref={bottomRef} />
                </div>
            </div>
            <div className="relative p-3 pt-1">
                <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background/70 pointer-events-none" />
                    <MessageForm projectId={projectId} />
            </div>
        </div>
    );
};

