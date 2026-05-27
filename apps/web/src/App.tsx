import { Navigate, Route, Routes } from "react-router-dom";

import { Shell } from "@/components/Shell";
import { ChessPage } from "@/pages/ChessPage";
import { ForgePage } from "@/pages/ForgePage";
import { HomePage } from "@/pages/HomePage";
import { RecoveredPage } from "@/pages/RecoveredPage";
import { SettingsPage } from "@/pages/SettingsPage";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/data" element={<ForgePage />} />
        <Route path="/chess" element={<ChessPage />} />
        <Route path="/registry" element={<RecoveredPage />} />
        <Route path="/registry/sources" element={<RecoveredPage />} />
        <Route path="/registry/models" element={<RecoveredPage />} />
        <Route path="/registry/datasets" element={<RecoveredPage />} />
        <Route path="/registry/environments" element={<RecoveredPage />} />
        <Route path="/runtime" element={<Navigate replace to="/settings" />} />
        <Route path="/spa" element={<Navigate replace to="/settings" />} />
        <Route path="/forge" element={<Navigate replace to="/data" />} />
        <Route path="/recovered" element={<Navigate replace to="/registry" />} />
        <Route path="/recovered/models" element={<Navigate replace to="/registry/models" />} />
        <Route path="/recovered/datasets" element={<Navigate replace to="/registry/datasets" />} />
        <Route path="/recovered/transcripts" element={<Navigate replace to="/registry/environments" />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Shell>
  );
}
