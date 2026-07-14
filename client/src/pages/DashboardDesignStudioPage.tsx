import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { CleanBentoAnalyticsArtboard } from "../components/dashboard-design-studio/CleanBentoAnalyticsArtboard";
import {
  DashboardDesignStudioShell,
  DesignStudioState,
  type DesignStudioViewId,
  designStudioViews
} from "../components/dashboard-design-studio/DashboardDesignStudioShell";
import { FleetMapArtboard } from "../components/dashboard-design-studio/FleetMapArtboard";
import { MorningBriefArtboard } from "../components/dashboard-design-studio/MorningBriefArtboard";
import { OperationsBoardArtboard } from "../components/dashboard-design-studio/OperationsBoardArtboard";
import { useDashboardLabData } from "../components/dashboard-lab/dashboardLabData";

const defaultView: DesignStudioViewId = "morning-brief";
const validViewIds = new Set<DesignStudioViewId>(designStudioViews.map((view) => view.id));

function isDesignStudioViewId(value: string | null): value is DesignStudioViewId {
  return Boolean(value && validViewIds.has(value as DesignStudioViewId));
}

export function DashboardDesignStudioPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useDashboardLabData();
  const requestedView = searchParams.get("view");
  const activeView = isDesignStudioViewId(requestedView) ? requestedView : defaultView;
  const qaMode = searchParams.get("qa") === "1";

  const handleViewChange = useCallback((view: DesignStudioViewId) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", view);
    nextParams.delete("qa");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  let content = null;
  if (state.loading) {
    content = <DesignStudioState type="loading" state={state} />;
  } else if (state.error) {
    content = <DesignStudioState type="error" state={state} />;
  } else if (!state.data || state.data.empty) {
    content = <DesignStudioState type="empty" state={state} />;
  } else if (activeView === "operations-board") {
    content = <OperationsBoardArtboard data={state.data} />;
  } else if (activeView === "fleet-map") {
    content = <FleetMapArtboard data={state.data} />;
  } else if (activeView === "clean-bento") {
    content = <CleanBentoAnalyticsArtboard data={state.data} />;
  } else {
    content = <MorningBriefArtboard data={state.data} />;
  }

  return (
    <DashboardDesignStudioShell activeView={activeView} onViewChange={handleViewChange} qaMode={qaMode}>
      {content}
    </DashboardDesignStudioShell>
  );
}
