import { create } from 'zustand';
import type { ArchitectureModel, CostEstimate } from '@shared/types/architecture-model';
import type {
  GenerateCfnResponse,
  WaReviewResponse,
  DeploymentStatusResponse,
} from '@shared/types/api';

interface ArchitectureState {
  architecture: ArchitectureModel | null;
  cfnTemplate: GenerateCfnResponse | null;
  costEstimate: CostEstimate | null;
  waReview: WaReviewResponse | null;
  deploymentStatus: DeploymentStatusResponse | null;
  setArchitecture: (architecture: ArchitectureModel | null) => void;
  setCfnTemplate: (cfn: GenerateCfnResponse | null) => void;
  setCostEstimate: (cost: CostEstimate | null) => void;
  setWaReview: (review: WaReviewResponse | null) => void;
  setDeploymentStatus: (status: DeploymentStatusResponse | null) => void;
  reset: () => void;
}

export const useArchitectureStore = create<ArchitectureState>((set) => ({
  architecture: null,
  cfnTemplate: null,
  costEstimate: null,
  waReview: null,
  deploymentStatus: null,
  setArchitecture: (architecture) => set({ architecture }),
  setCfnTemplate: (cfnTemplate) => set({ cfnTemplate }),
  setCostEstimate: (costEstimate) => set({ costEstimate }),
  setWaReview: (waReview) => set({ waReview }),
  setDeploymentStatus: (deploymentStatus) => set({ deploymentStatus }),
  reset: () =>
    set({
      architecture: null,
      cfnTemplate: null,
      costEstimate: null,
      waReview: null,
      deploymentStatus: null,
    }),
}));
