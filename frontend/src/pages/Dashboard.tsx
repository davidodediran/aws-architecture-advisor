import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useProjectStore } from '../store/projectStore';
import { api } from '../hooks/useApi';
import type { ListProjectsResponse } from '@shared/types/api';

export default function Dashboard() {
  const { projects, loading, error, setProjects, setLoading, setError } = useProjectStore();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ListProjectsResponse>('/projects')
      .then((res) => {
        if (!cancelled) setProjects(res.projects);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load projects');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setProjects, setLoading, setError]);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>My Projects</h1>
        <Link to="/projects/new" className="btn btn-primary">New Project</Link>
      </div>

      {loading ? (
        <div className="loading">Loading projects...</div>
      ) : error ? (
        <div className="empty-state">
          <h2>Error loading projects</h2>
          <p>{error}</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <h2>No projects yet</h2>
          <p>Describe the AWS architecture you want to build and the advisor will design, review, and deploy it for you.</p>
          <Link to="/projects/new" className="btn btn-primary">Get Started</Link>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <Link key={project.projectId} to={`/projects/${project.projectId}`} className="project-card">
              <h3>{project.name}</h3>
              <p>{project.description}</p>
              <div className="project-meta">
                <span className={`status status-${project.status}`}>{project.status}</span>
                <span className="updated">{new Date(project.updatedAt).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
