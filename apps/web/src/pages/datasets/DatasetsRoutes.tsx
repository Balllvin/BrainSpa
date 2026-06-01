import { Navigate, Route, Routes, useParams } from "react-router-dom";

import { canonicalDatasetSlug, datasetRowsPath, datasetsHomePath } from "@/lib/datasetsRoutes";

import { DatasetsGeneratePage } from "./DatasetsGeneratePage";
import { DatasetsHomePage } from "./DatasetsHomePage";
import { DatasetsRowsPage } from "./DatasetsRowsPage";

export function DatasetsRoutes() {
  return (
    <Routes>
      <Route index element={<DatasetsHomePage />} />
      <Route path=":datasetSlug/generate" element={<DatasetsGeneratePage />} />
      <Route path=":datasetSlug/rows" element={<DatasetsRowsPage />} />
      <Route path=":datasetSlug" element={<DatasetSlugRedirect />} />
      <Route path="*" element={<Navigate replace to={datasetsHomePath()} />} />
    </Routes>
  );
}

function DatasetSlugRedirect() {
  const { datasetSlug = "starter" } = useParams();
  return <Navigate replace to={datasetRowsPath(canonicalDatasetSlug(datasetSlug))} />;
}
