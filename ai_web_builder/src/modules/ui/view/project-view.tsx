"use client";

import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup
}
from '@/components/ui/resizable';
import { MessagesContainer } from "./components/messages-container";
import { Suspense } from "react";
import { useState } from 'react';
import {Fragment} from '@/generated/prisma'

import { ProjectHeader } from './components/project-header';

interface Props {
    projectId: string;
}

export const ProjectView = ({projectId} : Props) => {
    
    const [activeFragment, setActiveFragment] = useState<Fragment | null>(null);

    return (
        <div className="h-screen">
            <ResizablePanelGroup direction="horizontal">
                <ResizablePanel
                    defaultSize={35} //%, adds up to 100 with other panels
                    minSize={20}
                    className="flex flex-col min-h-0"
                >
                    <ProjectHeader projectId={projectId} />
                    <Suspense fallback={<p>Loading messages...</p>}>
                        <MessagesContainer 
                            projectId={projectId} 
                            activeFragment={activeFragment}
                            setActiveFragment={setActiveFragment}
                        />
                    </Suspense>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel
                    defaultSize={65}
                    minSize={50} 
                >
                    TODO: Project Preview
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
};