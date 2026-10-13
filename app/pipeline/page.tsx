import { getSnapshot } from "@/lib/data";
import PipelineTable from "@/components/PipelineTable";
import ManageBar from "@/components/ManageBar";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const { rows } = await getSnapshot();
  const data = rows.map((r) => ({
    inv: r.inv,
    state: r.latest?.state ?? null,
    signalUrl: r.latest?.best_signal?.url ?? null,
    delta: r.latest?.score != null && r.previous?.score != null ? r.latest.score - r.previous.score : null,
  }));
  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Supabase table · vc_investors</div>
          <h1>All {rows.length} investors</h1>
          <p>
            This is Vikram&apos;s live Supabase table. Purple columns are his and can be edited here; the refresh
            pipeline is blocked from writing them by a database trigger. Blue columns are rewritten on every run.
          </p>
        </div>
      </header>
      <ManageBar />
      <PipelineTable rows={data} />
    </div>
  );
}
