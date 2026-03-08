// WebSocket message types (server → client)
export interface FrameMessage {
  type: "frame";
  data: string; // base64 encoded JPEG
  timestamp: number;
  frame_id: number;
}
// NOTE: This WebSocket message shape does not exist on the Rust side yet.
// The Rust frame model (src/frame.rs) has raw JPEG bytes + id + captured_at.
// When the Rust WebSocket serializer is built, it will need to base64-encode
// the JPEG bytes and map captured_at → timestamp, id → frame_id to match
// this contract. Demo mode generates data in this shape directly.

// Core fields — these match the Rust graph model (see src/graph.rs)
export interface GraphNodeCore {
  label: string;
  category: string;
  confidence: number;
}

// Extended fields — UI-only enrichment, tracked client-side.
// The Rust model does not yet send these. Demo mode populates them with
// mock data. When the Rust WebSocket is built, either extend the Rust
// model to include these fields, or have the frontend compute them
// (e.g. tracking first/last seen frame as graph updates arrive).
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

export type RoverMessage = FrameMessage | GraphMessage | AirQualityMessage;

// Client → server
export interface RequestGraphMessage {
  type: "request_graph";
}

// Internal state used by UI components
export interface RoverState {
  connected: boolean;
  demoMode: boolean;
  latestFrame: { data: string; timestamp: number; frameId: number } | null;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  airQuality: Omit<AirQualityMessage, "type"> | null;
  selectedNodeId: string | null;
}
