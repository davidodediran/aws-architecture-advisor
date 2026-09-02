import { create } from 'zustand';
import type { ProjectSummary } from '@shared/types/api';

interface ProjectState {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  loading: boolean;
  error: string | null;
  setProjects: (projects: ProjectSummary[]) => void;
  setCurrentProject: (project: ProjectSummary | null) => void;
  addProject: (project: ProjectSummary) => void;
  updateProject: (projectId: string, updates: Partial<ProjectSummary>) => void;
  removeProject: (projectId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projects: [],
  currentProject: null,
  loading: false,
  error: null,
  setProjects: (projects) => set({ projects, error: null }),
  setCurrentProject: (currentProject) => set({ currentProject }),
  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),
  updateProject: (projectId, updates) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.projectId === projectId ? { ...p, ...updates } : p,
      ),
      currentProject:
        state.currentProject?.projectId === projectId
          ? { ...state.currentProject, ...updates }
          : state.currentProject,
    })),
  removeProject: (projectId) =>
    set((state) => ({
      projects: state.projects.filter((p) => p.projectId !== projectId),
      currentProject:
        state.currentProject?.projectId === projectId
          ? null
          : state.currentProject,
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
