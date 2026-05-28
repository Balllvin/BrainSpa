export const WORKSPACE_SPEC_KEY = "brain-spa-workspace-spec-v1";

export type SpecSectionId =
  | "evidence"
  | "datasets"
  | "tune"
  | "test"
  | "eval"
  | "open";

export type SpecSection = {
  id: SpecSectionId;
  title: string;
  placeholder: string;
};

export const SPEC_SECTIONS: SpecSection[] = [
  {
    id: "evidence",
    title: "Evidence",
    placeholder: "Sources and proof…",
  },
  {
    id: "datasets",
    title: "Datasets",
    placeholder: "Examples and preference pairs…",
  },
  {
    id: "tune",
    title: "Training",
    placeholder: "Model, dry-run, artifacts…",
  },
  {
    id: "test",
    title: "Testing & environments",
    placeholder: "Harnesses and eval…",
  },
  {
    id: "eval",
    title: "Evaluation",
    placeholder: "Success criteria…",
  },
  {
    id: "open",
    title: "Open questions",
    placeholder: "Notes…",
  },
];

export type WorkspaceSpecState = Record<SpecSectionId, string>;

export function defaultSpecState(): WorkspaceSpecState {
  return SPEC_SECTIONS.reduce((acc, section) => {
    acc[section.id] = "";
    return acc;
  }, {} as WorkspaceSpecState);
}

export function loadSpecState(): WorkspaceSpecState {
  try {
    const raw = localStorage.getItem(WORKSPACE_SPEC_KEY);
    if (!raw) return defaultSpecState();
    const parsed = JSON.parse(raw) as Partial<WorkspaceSpecState>;
    return { ...defaultSpecState(), ...parsed };
  } catch {
    return defaultSpecState();
  }
}

export function saveSpecState(state: WorkspaceSpecState) {
  localStorage.setItem(WORKSPACE_SPEC_KEY, JSON.stringify(state));
}
