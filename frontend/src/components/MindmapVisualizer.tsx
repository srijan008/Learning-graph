import { useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position
} from 'reactflow';
import type { Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from '@dagrejs/dagre';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 200;
const nodeHeight = 60;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    // We are shifting the dagre node position (which is center) to top left
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes: newNodes, edges };
};

interface MindmapVisualizerProps {
  data: {
    nodes: Array<{ id: string; label: string; type: string }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
}

const MindmapVisualizer = ({ data }: MindmapVisualizerProps) => {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!data?.nodes || !data?.edges) return { nodes: [], edges: [] };
    
    const ns: Node[] = data.nodes.map((n) => ({
      id: n.id,
      data: { label: n.label },
      position: { x: 0, y: 0 },
      style: {
        background: n.type === 'root' ? 'linear-gradient(135deg, #6366f1, #a855f7)' 
                  : n.type === 'topic' ? 'rgba(16, 185, 129, 0.1)' 
                  : 'rgba(255, 255, 255, 0.03)',
        color: 'white',
        border: `1px solid ${n.type === 'root' ? '#a855f7' : n.type === 'topic' ? '#10b981' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '12px',
        padding: '12px',
        fontSize: n.type === 'root' ? '0.95rem' : '0.8rem',
        fontWeight: n.type === 'root' ? 800 : 600,
        boxShadow: n.type === 'root' ? '0 0 25px rgba(168, 85, 247, 0.3)' : 'none',
        backdropFilter: 'blur(10px)',
        width: nodeWidth,
        textAlign: 'center',
      }
    }));

    const es: Edge[] = data.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: true,
      style: { stroke: 'rgba(168, 85, 247, 0.3)', strokeWidth: 2 },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: '#a855f7',
      },
    }));

    return getLayoutedElements(ns, es);
  }, [data]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div style={{ width: '100%', height: '650px', background: 'rgba(15, 23, 42, 0.3)', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.05)', overflow: 'hidden', position: 'relative' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.2}
        maxZoom={1.5}
      >
        <Background color="rgba(255,255,255,0.05)" gap={25} size={1} />
        <Controls 
            style={{ 
                background: 'rgba(15, 23, 42, 0.8)', 
                border: '1px solid rgba(255, 255, 255, 0.1)', 
                borderRadius: '8px',
                padding: '4px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
            }} 
        />
        <MiniMap 
          nodeColor={(node) => {
            if (node.id === 'root') return '#a855f7';
            if (node.id.startsWith('topic')) return '#10b981';
            return '#475569';
          }}
          maskColor="rgba(15, 23, 42, 0.7)"
          style={{ 
              background: 'rgba(15, 23, 42, 0.8)', 
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px'
          }}
          nodeStrokeWidth={3}
          zoomable
          pannable
        />
      </ReactFlow>
      
      {!data?.nodes && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.9)', zIndex: 100, borderRadius: '20px' }}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
             <Layers size={48} color="#ef4444" style={{ marginBottom: 16, opacity: 0.5 }} />
             <div style={{ color: '#fca5a5', fontWeight: 700, fontSize: '1.1rem' }}>Mindmap Unavailable</div>
             <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: 8 }}>We couldn't generate a mindmap for this chapter.</p>
          </div>
        </div>
      )}

      {/* Legend Overlay */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, background: 'rgba(15, 23, 42, 0.8)', padding: '12px 16px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(10px)', display: 'flex', gap: '16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 12, height: 12, borderRadius: '3px', background: 'linear-gradient(135deg, #6366f1, #a855f7)' }} />
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Chapter</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 12, height: 12, borderRadius: '3px', background: 'rgba(16, 185, 129, 0.4)', border: '1px solid #10b981' }} />
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Topic</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: 12, height: 12, borderRadius: '3px', background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Subtopic</span>
        </div>
      </div>
    </div>
  );
};

export default MindmapVisualizer;
