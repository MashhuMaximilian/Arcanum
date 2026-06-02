import { BuilderResume } from "@/components/builder-resume";

type BuilderDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BuilderDetailPage({
  params,
}: BuilderDetailPageProps) {
  const { id } = await params;

  return <BuilderResume draftId={id} />;
}
