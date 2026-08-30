import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SUPPORTED_REGIONS } from '@shared/constants/regions';

export default function NewProject() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);

    // TODO: POST to /api/projects
    const projectId = crypto.randomUUID();
    navigate(`/projects/${projectId}`);
  };

  return (
    <div className="new-project">
      <h1>Create New Project</h1>
      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label htmlFor="name">Project Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Serverless API"
            required
            maxLength={128}
          />
        </div>
        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you want to build..."
            rows={4}
            maxLength={1024}
          />
        </div>
        <div className="form-group">
          <label htmlFor="region">AWS Region</label>
          <select id="region" value={region} onChange={(e) => setRegion(e.target.value)}>
            {Object.values(SUPPORTED_REGIONS).map((r) => (
              <option key={r.code} value={r.code}>{r.name} ({r.code})</option>
            ))}
          </select>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/')}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
