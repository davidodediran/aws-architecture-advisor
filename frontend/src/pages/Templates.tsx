import { useNavigate } from 'react-router-dom';

interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  services: string[];
  estimatedCostUsd: number;
}

const STARTER_TEMPLATES: Template[] = [
  {
    id: 'serverless-web-app',
    name: 'Serverless Web App',
    description: 'Full-stack serverless application with React frontend, API Gateway, Lambda, DynamoDB, and Cognito authentication.',
    category: 'Full Stack',
    services: ['CloudFront', 'S3', 'API Gateway', 'Lambda', 'DynamoDB', 'Cognito'],
    estimatedCostUsd: 5,
  },
  {
    id: 'rest-api-backend',
    name: 'REST API Backend',
    description: 'Production-ready REST API with Lambda functions, DynamoDB, and API key authentication.',
    category: 'Backend',
    services: ['API Gateway', 'Lambda', 'DynamoDB', 'CloudWatch'],
    estimatedCostUsd: 3,
  },
  {
    id: 'event-driven-pipeline',
    name: 'Event-Driven Data Pipeline',
    description: 'Asynchronous data processing pipeline with SQS queues, Lambda processors, and S3 storage.',
    category: 'Data',
    services: ['SQS', 'Lambda', 'S3', 'EventBridge', 'CloudWatch'],
    estimatedCostUsd: 4,
  },
  {
    id: 'ml-inference-service',
    name: 'ML Inference Service',
    description: 'Scalable ML inference endpoint with API Gateway, Lambda, and S3 model storage.',
    category: 'Machine Learning',
    services: ['API Gateway', 'Lambda', 'S3', 'CloudWatch', 'SQS'],
    estimatedCostUsd: 8,
  },
  {
    id: 'static-website',
    name: 'Static Website',
    description: 'Fast, secure static website hosted on S3 with CloudFront CDN and custom domain support.',
    category: 'Frontend',
    services: ['CloudFront', 'S3', 'WAF'],
    estimatedCostUsd: 1,
  },
];

export default function Templates() {
  const navigate = useNavigate();

  const handleUseTemplate = (templateId: string) => {
    navigate(`/projects/new?template=${templateId}`);
  };

  return (
    <div className="templates">
      <div className="templates-header">
        <h1>Starter Templates</h1>
        <p>Choose a template to get started quickly, then customize it through conversation.</p>
      </div>
      <div className="template-grid">
        {STARTER_TEMPLATES.map((template) => (
          <div key={template.id} className="template-card">
            <div className="template-category">{template.category}</div>
            <h3>{template.name}</h3>
            <p>{template.description}</p>
            <div className="template-services">
              {template.services.map((service) => (
                <span key={service} className="service-tag">{service}</span>
              ))}
            </div>
            <div className="template-footer">
              <span className="cost-estimate">~${template.estimatedCostUsd}/mo</span>
              <button className="btn btn-primary" onClick={() => handleUseTemplate(template.id)}>
                Use Template
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
