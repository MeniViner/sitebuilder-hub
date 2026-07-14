import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DashboardLabConceptId,
  DashboardLabShell
} from "../components/dashboard-lab/DashboardLabShell";
import { DashboardConceptCommandCenter } from "../components/dashboard-lab/DashboardConceptCommandCenter";
import { DashboardConceptExecutive } from "../components/dashboard-lab/DashboardConceptExecutive";
import { DashboardConceptOperationsCockpit } from "../components/dashboard-lab/DashboardConceptOperationsCockpit";
import { DashboardConceptProductionCandidate } from "../components/dashboard-lab/DashboardConceptProductionCandidate";
import { DashboardConceptVisualAnalytics } from "../components/dashboard-lab/DashboardConceptVisualAnalytics";
import { useDashboardLabData } from "../components/dashboard-lab/dashboardLabData";

const dashboardLabConceptIds: DashboardLabConceptId[] = [
  "production-candidate",
  "command",
  "executive",
  "operations",
  "analytics"
];

function isDashboardLabConceptId(value: string | null): value is DashboardLabConceptId {
  return Boolean(value && dashboardLabConceptIds.includes(value as DashboardLabConceptId));
}

export function DashboardLabPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchConcept = searchParams.get("concept");
  const requestedConcept = isDashboardLabConceptId(searchConcept) ? searchConcept : "production-candidate";
  const qaMode = searchParams.get("qa") === "1";
  const urlConcept = qaMode ? "production-candidate" : requestedConcept;
  const [activeConcept, setActiveConcept] = useState<DashboardLabConceptId>(urlConcept);
  const state = useDashboardLabData();

  useEffect(() => {
    setActiveConcept(urlConcept);
  }, [urlConcept]);

  const handleConceptChange = useCallback((concept: DashboardLabConceptId) => {
    setActiveConcept(concept);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("concept", concept);
    nextParams.delete("qa");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  return (
    <DashboardLabShell activeConcept={activeConcept} onConceptChange={handleConceptChange} qaMode={qaMode} state={state}>
      {activeConcept === "production-candidate" ? <DashboardConceptProductionCandidate state={state} /> : null}
      {activeConcept === "command" ? <DashboardConceptCommandCenter state={state} /> : null}
      {activeConcept === "executive" ? <DashboardConceptExecutive state={state} /> : null}
      {activeConcept === "operations" ? <DashboardConceptOperationsCockpit state={state} /> : null}
      {activeConcept === "analytics" ? <DashboardConceptVisualAnalytics state={state} /> : null}
    </DashboardLabShell>
  );
}
