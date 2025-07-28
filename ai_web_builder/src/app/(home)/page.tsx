import { ProjectForm } from "@/modules/home/ui/components/project-form";
import { ProjectsList } from "@/modules/home/ui/components/projects-list";
import Image from "next/image";

const Page = () => {
  return (
    <div className="flex flex-col max-w-5xl mx-auto w-full">
      <section className="space-y-6 py-[12vh] 2xl:py-48">
        <div className="flex flex-col items-center">
            <Image 
              src="/avatar.png"
              alt='Kim'
              width={70}
              height={70}
              className="md:block rounded-full"
          />
        </div>
        <h1 className="text-2xl md:text-5xl font-bold text-center">
          Ask me to build something...
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground text-center">
          Create websites by chatting with Kode AI
        </p>
        <div className="max-w-3xl mx-auto w-full">
          <ProjectForm/>
        </div>
      </section>
      <ProjectsList />
    </div>
  )
};

export default Page;