import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { canonicalModelSlug, tuneHomePath, tuneModelPath } from "@/lib/tuneRoutes";

import { TuneBuildPage } from "./TuneBuildPage";
import { TuneHomePage } from "./TuneHomePage";
import { TuneModelPage } from "./TuneModelPage";
import { TuneStatusPage } from "./TuneStatusPage";
import { TuneTryPage } from "./TuneTryPage";

function TuneModelRedirect() {
  const { modelSlug = "" } = useParams();
  return <Navigate replace to={tuneModelPath(canonicalModelSlug(modelSlug))} />;
}

export function TuneRoutes() {
  return (
    <Routes>
      <Route index element={<TuneHomePage />} />
      <Route path=":modelSlug" element={<TuneModelPage />} />
      <Route path=":modelSlug/build" element={<TuneBuildPage />} />
      <Route path=":modelSlug/status" element={<TuneStatusPage />} />
      <Route path=":modelSlug/try" element={<TuneTryPage />} />
      <Route path="*" element={<Navigate replace to={tuneHomePath()} />} />
    </Routes>
  );
}

export { TuneModelRedirect };
