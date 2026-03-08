// Core fields — these match the Rust graph model (see src/graph.rs)
export interface GraphNodeCore {
  label: string;
  category: string;
  confidence: number;
}

// Extended fields — UI-only enrichment, tracked client-side.
export interface GraphNode extends GraphNodeCore {
  id: string;
  first_seen_frame: number;
  last_seen_frame: number;
  position: { x: number; y: number };
}

export interface GraphEdge {
  source: string; // node id
  target: string; // node id
  relationship: string; // called "relation" in Rust model (src/graph.rs), aliased here for readability
}

export interface GraphMessage {
  type: "graph";
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface AirQualityMessage {
  type: "air_quality";
  pm25: number;
  pm10: number;
  co2: number;
  temperature: number;
  humidity: number;
  timestamp: number;
}

// Internal state used by UI components
export interface RoverState {
  connected: boolean;
  demoMode: boolean;
  latestFrame: { url: string; timestamp: number } | null;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  airQuality: Omit<AirQualityMessage, "type"> | null;
  selectedNodeId: string | null;
}
