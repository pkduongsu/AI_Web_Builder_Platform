//to extract project ID from the URL
interface Props {
    params: Promise<{
        projectId: string;
    }>
};


const Page = async ({ params }: Props) => {
    const { projectId } = await params;

    return(
        <div>
            ProjectId
        </div>
    );
}

export default Page;