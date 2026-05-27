import { Navigate, Route, Routes } from "react-router-dom";

import { Shell } from "@/components/Shell";
import { HomePage } from "@/pages/HomePage";
import { DatasetsPage, EvidencePage, TestPage, TunePage } from "@/pages/LoopPages";
import { SettingsPage } from "@/pages/SettingsPage";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/evidence" element={<EvidencePage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/tune" element={<TunePage />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/settings" element={<SettingsPage />} />
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
