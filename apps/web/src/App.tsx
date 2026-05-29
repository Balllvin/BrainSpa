import { Navigate, Route, Routes } from "react-router-dom";

import { Shell } from "@/components/Shell";
import { ChipmunkPage } from "@/pages/ChipmunkPage";
import { HomePage } from "@/pages/HomePage";
import { WorkspacePage } from "@/pages/WorkspacePage";
import { DatasetsRoutes } from "@/pages/datasets/DatasetsRoutes";
import { TuneRoutes } from "@/pages/tune/TuneRoutes";
import { EvidenceHomePage } from "@/pages/evidence/EvidenceHomePage";
import { EvidenceReviewPage } from "@/pages/evidence/EvidenceReviewPage";
import { EvidenceSourcePage } from "@/pages/evidence/EvidenceSourcePage";
import { TestEnvironmentPage } from "@/pages/test/TestEnvironmentPage";
import { TestHomePage } from "@/pages/test/TestHomePage";
import { TestModelPage } from "@/pages/test/TestModelPage";
import { ChipmunkSettingsPage } from "@/pages/settings/ChipmunkSettingsPage";
import { ConnectionsPage } from "@/pages/settings/ConnectionsPage";
import { HermesAgentsPage } from "@/pages/settings/HermesAgentsPage";
import { ModelsPage } from "@/pages/settings/ModelsPage";
import { SettingsIndexRedirect, SettingsLayout } from "@/pages/settings/SettingsLayout";
import { TelegramPage } from "@/pages/settings/TelegramPage";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate replace to="/chipmunk" />} />
        <Route path="/chipmunk" element={<ChipmunkPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/loop" element={<HomePage />} />
        <Route path="/evidence" element={<EvidenceHomePage />} />
        <Route path="/evidence/sources/:slug" element={<EvidenceSourcePage />} />
        <Route path="/evidence/:slug/review" element={<EvidenceReviewPage />} />
        <Route path="/datasets/*" element={<DatasetsRoutes />} />
        <Route path="/tune/*" element={<TuneRoutes />} />
        <Route path="/test" element={<TestHomePage />} />
        <Route path="/test/:modelSlug" element={<TestModelPage />} />
        <Route path="/test/:modelSlug/:scenarioKey" element={<TestEnvironmentPage />} />
        <Route path="/settings" element={<SettingsLayout />}>
          <Route index element={<SettingsIndexRedirect />} />
          <Route path="chipmunk" element={<ChipmunkSettingsPage />} />
          <Route path="connections" element={<ConnectionsPage />} />
          <Route path="agents" element={<HermesAgentsPage />} />
          <Route path="telegram" element={<TelegramPage />} />
          <Route path="models" element={<ModelsPage />} />
        </Route>
        <Route path="/registry" element={<Navigate replace to="/evidence" />} />
        <Route path="/registry/sources" element={<Navigate replace to="/evidence" />} />
        <Route path="/registry/models" element={<Navigate replace to="/tune" />} />
        <Route path="/registry/datasets" element={<Navigate replace to="/datasets" />} />
        <Route path="/registry/environments" element={<Navigate replace to="/test" />} />
        <Route path="/runtime" element={<Navigate replace to="/settings" />} />
        <Route path="/data" element={<Navigate replace to="/datasets" />} />
        <Route path="/environments" element={<Navigate replace to="/test" />} />
        <Route path="/chess" element={<Navigate replace to="/test" />} />
        <Route path="/spa" element={<Navigate replace to="/settings" />} />
        <Route path="/forge" element={<Navigate replace to="/datasets" />} />
        <Route path="/recovered" element={<Navigate replace to="/evidence" />} />
        <Route path="/recovered/models" element={<Navigate replace to="/tune" />} />
        <Route path="/recovered/datasets" element={<Navigate replace to="/datasets" />} />
        <Route path="/recovered/transcripts" element={<Navigate replace to="/test" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Shell>
  );
}
