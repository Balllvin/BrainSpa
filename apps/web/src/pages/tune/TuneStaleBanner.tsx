import { Link } from "react-router-dom";

import { datasetGeneratePath, datasetRowsPath } from "@/lib/datasetsRoutes";

export function TuneStaleBanner({
  message,
  datasetSlug,
}: {
  message: string;
  datasetSlug: string;
}) {
  return (
    <p className="tune-stale-banner">
      {message}{" "}
      <Link to={datasetRowsPath(datasetSlug)}>Review rows</Link>
      {" · "}
      <Link to={datasetGeneratePath(datasetSlug)}>Regenerate dataset</Link>
    </p>
  );
}
