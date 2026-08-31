import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

interface Project {
  projectId: string;
  name: string;
  description: string;
  status: string;
  updatedAt: string;
}

export default function Dashboard() {
  const [projects, _setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Fetch projects from API
    setLoading(false);
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>My Projects</h1>
        <Link to="/projects/new" className="btn btn-primary">New Project</Link>
      </div>

      {loading ? (
        <div className="loading">Loading projects...</div>
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
