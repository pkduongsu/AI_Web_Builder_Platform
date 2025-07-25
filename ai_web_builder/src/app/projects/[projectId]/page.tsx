import { ProjectView } from "@/modules/ui/view/project-view";
import { getQueryClient, trpc } from "@/trpc/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { Suspense } from "react";

//to extract project ID from the URL
interface Props {
    params: Promise<{
        projectId: string;
    }>
};


const Page = async ({ params }: Props) => {
    const { projectId } = await params;

    //using prefetching to get the query client
    const queryClient = getQueryClient();
    void queryClient.prefetchQuery(trpc.messages.getMany.queryOptions( {projectId} ));

    //fetch projectId 
    void queryClient.prefetchQuery(trpc.projects.getOne.queryOptions({id: projectId,}))

    return(
        <HydrationBoundary state={dehydrate(queryClient)}>
            <Suspense fallback={<p>Loading...</p>}>
                <ProjectView projectId={projectId} />
            </Suspense>
        </HydrationBoundary>
    );
}

export default Page;