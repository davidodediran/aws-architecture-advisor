import { useParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import ConversationPanel from '../components/ConversationPanel';
import ArchitectureDiagram from '../components/ArchitectureDiagram';
import CfnViewer from '../components/CfnViewer';
import WaReview from '../components/WaReview';
import CostEstimate from '../components/CostEstimate';
import DeploymentPanel from '../components/DeploymentPanel';
import { useArchitectureStore } from '../store/architectureStore';
import { useConversationStore } from '../store/conversationStore';
import { api } from '../hooks/useApi';
import type { GetArchitectureResponse, GenerateCfnResponse, WaReviewResponse } from '@shared/types/api';

type Tab = 'diagram' | 'cfn' | 'wa' | 'cost' | 'deploy';

const TABS: { key: Tab; label: string }[] = [
  { key: 'diagram', label: 'Diagram' },
  { key: 'cfn', label: 'CloudFormation' },
  { key: 'wa', label: 'Well-Architected' },
  { key: 'cost', label: 'Cost' },
  { key: 'deploy', label: 'Deploy' },
];

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [activeTab, setActiveTab] = useState<Tab>('diagram');
  const {
    architecture,
    cfnTemplate,
    costEstimate,
    waReview,
    setArchitecture,
    setCfnTemplate,
    setCostEstimate,
    setWaReview,
    reset,
  } = useArchitectureStore();
  const { clearMessages } = useConversationStore();

  useEffect(() => {
    reset();
    clearMessages();

    if (!projectId) return;
    let cancelled = false;

    api
      .get<GetArchitectureResponse>(`/projects/${projectId}/architecture`)
      .then((res) => {
        if (cancelled) return;
        setArchitecture(res.model);
        if (res.costEstimateUsd !== undefined) {
          const totalCost = res.model.resources.reduce<import('@shared/types/architecture-model').CostEstimate | null>(
            (acc, r) => {
              if (!r.costEstimate) return acc;
              if (!acc) return r.costEstimate;
              return {
                monthlyUsd: acc.monthlyUsd + r.costEstimate.monthlyUsd,
                breakdown: [...acc.breakdown, ...r.costEstimate.breakdown],
                assumptions: [...new Set([...acc.assumptions, ...r.costEstimate.assumptions])],
              };
            },
            null,
          );
          if (totalCost) setCostEstimate(totalCost);
        }
      })
      .catch(() => {
        // project may not have architecture yet
      });

    api.get<GenerateCfnResponse>(`/projects/${projectId}/cfn`).then((res) => {
      if (!cancelled) setCfnTemplate(res);
    }).catch(() => {});

    api.get<WaReviewResponse>(`/projects/${projectId}/wa-review`).then((res) => {
      if (!cancelled) setWaReview(res);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [projectId, setArchitecture, setCfnTemplate, setCostEstimate, setWaReview, reset, clearMessages]);

  if (!projectId) return null;

  return (
    <div className="project-view">
      <ConversationPanel projectId={projectId} />
      <div className="diagram-panel">
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`tab ${activeTab === tab.key ? 'tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="tab-content">
          {activeTab === 'diagram' && <ArchitectureDiagram architecture={architecture} />}
          {activeTab === 'cfn' && <CfnViewer cfnTemplate={cfnTemplate} />}
          {activeTab === 'wa' && <WaReview waReview={waReview} />}
          {activeTab === 'cost' && <CostEstimate costEstimate={costEstimate} />}
          {activeTab === 'deploy' && (
            <DeploymentPanel
              projectId={projectId}
              architectureVersion={architecture?.metadata.version ?? 1}
            />
          )}
        </div>
      </div>
    </div>
  );
}
