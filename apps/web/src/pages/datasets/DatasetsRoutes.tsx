import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { canonicalDatasetSlug, datasetRowsPath, datasetsHomePath } from "@/lib/datasetsRoutes";

import { DatasetsGeneratePage } from "./DatasetsGeneratePage";
import { DatasetsHomePage } from "./DatasetsHomePage";
import { DatasetsRowsPage } from "./DatasetsRowsPage";
import { DatasetsSnakePage } from "./DatasetsSnakePage";

export function DatasetsRoutes() {
  return (
    <Routes>
      <Route index element={<DatasetsHomePage />} />
      <Route path="snake/generate" element={<Navigate replace to="/datasets/snake/rollout" />} />
      <Route path="snake/rows" element={<Navigate replace to="/datasets/snake/rollout" />} />
      <Route path=":datasetSlug/generate" element={<DatasetsGeneratePage />} />
      <Route path=":datasetSlug/rows" element={<DatasetsRowsPage />} />
      <Route path="snake/rollout" element={<DatasetsSnakePage />} />
      <Route path=":datasetSlug" element={<DatasetSlugRedirect />} />
      <Route path="*" element={<Navigate replace to={datasetsHomePath()} />} />
    </Routes>
  );
}

function DatasetSlugRedirect() {
  const { datasetSlug = "snake" } = useParams();
  return <Navigate replace to={datasetRowsPath(canonicalDatasetSlug(datasetSlug))} />;
}
