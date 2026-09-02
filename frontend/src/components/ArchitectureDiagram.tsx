import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { ArchitectureModel, ServiceType, Connection, Resource } from '@shared/types/architecture-model';

const SERVICE_COLORS: Record<ServiceType, string> = {
  'lambda': '#F59E0B',
  'api-gateway': '#8B5CF6',
  'api-gateway-websocket': '#7C3AED',
  'dynamodb': '#3B82F6',
  's3': '#10B981',
  'cloudfront': '#8B5CF6',
  'cognito': '#EF4444',
  'sqs': '#F97316',
  'sns': '#EC4899',
  'step-functions': '#06B6D4',
  'eventbridge': '#F43F5E',
  'kinesis': '#6366F1',
  'rds-aurora-serverless': '#2563EB',
  'elasticache': '#DC2626',
  'ecs-fargate': '#F59E0B',
  'ecr': '#F97316',
  'cloudwatch': '#EF4444',
  'cloudtrail': '#10B981',
  'waf': '#6366F1',
  'secrets-manager': '#EC4899',
  'kms': '#14B8A6',
};

const SERVICE_ICONS: Record<ServiceType, string> = {
  'lambda': 'λ',
  'api-gateway': 'API',
  'api-gateway-websocket': 'WS',
  'dynamodb': 'DDB',
  's3': 'S3',
  'cloudfront': 'CF',
  'cognito': 'AUTH',
  'sqs': 'SQS',
  'sns': 'SNS',
  'step-functions': 'SF',
  'eventbridge': 'EB',
  'kinesis': 'KDS',
  'rds-aurora-serverless': 'RDS',
  'elasticache': 'EC',
  'ecs-fargate': 'ECS',
  'ecr': 'ECR',
  'cloudwatch': 'CW',
  'cloudtrail': 'CT',
  'waf': 'WAF',
  'secrets-manager': 'SM',
  'kms': 'KMS',
};

interface DiagramNode extends d3.SimulationNodeDatum {
  id: string;
  type: ServiceType;
  name: string;
}

interface DiagramLink extends d3.SimulationLinkDatum<DiagramNode> {
  id: string;
  label?: string;
  connectionType: Connection['type'];
}

interface ArchitectureDiagramProps {
  architecture: ArchitectureModel | null;
}

export default function ArchitectureDiagram({ architecture }: ArchitectureDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [legendVisible, setLegendVisible] = useState(true);

  useEffect(() => {
    if (!svgRef.current || !architecture) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const container = svgRef.current.parentElement;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr('width', width).attr('height', height);

    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 30)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'var(--color-text-secondary)');

    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    const nodes: DiagramNode[] = architecture.resources.map((r: Resource) => ({
      id: r.id,
      type: r.type,
      name: r.name,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: DiagramLink[] = architecture.connections
      .filter((c: Connection) => nodeIds.has(c.sourceId) && nodeIds.has(c.targetId))
      .map((c: Connection) => ({
        id: c.id,
        source: c.sourceId,
        target: c.targetId,
        label: c.label,
        connectionType: c.type,
      }));

    const simulation = d3
      .forceSimulation<DiagramNode>(nodes)
      .force('link', d3.forceLink<DiagramNode, DiagramLink>(links).id((d) => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(50));

    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'var(--color-text-secondary)')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrowhead)');

    const linkLabels = g
      .append('g')
      .selectAll('text')
      .data(links.filter((l) => l.label))
      .join('text')
      .attr('font-size', 10)
      .attr('fill', 'var(--color-text-secondary)')
      .attr('text-anchor', 'middle')
      .text((d) => d.label ?? '');

    const node = g
      .append('g')
      .selectAll<SVGGElement, DiagramNode>('g')
      .data(nodes)
      .join('g')
      .call(
        d3.drag<SVGGElement, DiagramNode>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    node
      .append('circle')
      .attr('r', 24)
      .attr('fill', (d) => SERVICE_COLORS[d.type] ?? '#6B7280')
      .attr('stroke', 'var(--color-surface)')
      .attr('stroke-width', 2);

    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 4)
      .attr('font-size', 10)
      .attr('font-weight', 'bold')
      .attr('fill', '#fff')
      .text((d) => SERVICE_ICONS[d.type] ?? '?');

    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 40)
      .attr('font-size', 11)
      .attr('fill', 'var(--color-text)')
      .text((d) => d.name);

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as DiagramNode).x ?? 0)
        .attr('y1', (d) => (d.source as DiagramNode).y ?? 0)
        .attr('x2', (d) => (d.target as DiagramNode).x ?? 0)
        .attr('y2', (d) => (d.target as DiagramNode).y ?? 0);

      linkLabels
        .attr('x', (d) => (((d.source as DiagramNode).x ?? 0) + ((d.target as DiagramNode).x ?? 0)) / 2)
        .attr('y', (d) => (((d.source as DiagramNode).y ?? 0) + ((d.target as DiagramNode).y ?? 0)) / 2 - 6);

      node.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [architecture]);

  if (!architecture) {
    return (
      <div className="diagram-empty">
        <p>Your architecture diagram will appear here as you describe your system.</p>
      </div>
    );
  }

  const usedTypes = [...new Set(architecture.resources.map((r) => r.type))];

  return (
    <div className="diagram-container">
      <svg ref={svgRef} />
      {legendVisible && usedTypes.length > 0 && (
        <div className="diagram-legend">
          <div className="legend-header">
            <strong>Services</strong>
            <button className="legend-close" onClick={() => setLegendVisible(false)}>
              &times;
            </button>
          </div>
          {usedTypes.map((type) => (
            <div key={type} className="legend-item">
              <span
                className="legend-dot"
                style={{ background: SERVICE_COLORS[type] ?? '#6B7280' }}
              />
              <span className="legend-label">{SERVICE_ICONS[type]}</span>
              <span>{type}</span>
            </div>
          ))}
        </div>
      )}
      {!legendVisible && (
        <button className="legend-toggle" onClick={() => setLegendVisible(true)}>
          Legend
        </button>
      )}
    </div>
  );
}
