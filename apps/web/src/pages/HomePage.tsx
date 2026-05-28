import { Navigate } from "react-router-dom";

/** Legacy /loop route — hub retired to Drafts/retired/home */
export function HomePage() {
  return <Navigate replace to="/chipmunk" />;
}
