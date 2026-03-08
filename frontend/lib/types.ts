// Core fields — these match the Rust graph model (see src/graph.rs)
export interface GraphNodeCore {
  label: string;
  category: string;
  confidence: number;
}

// Extended fields — UI-only enrichment, tracked client-side.
export interface GraphNode extends GraphNodeCore {
  id: string;
  rank: number;
  crossedOut: boolean;
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

export type AirQualityTrend = "up" | "down" | null;

export interface AirQualityReading extends Omit<AirQualityMessage, "type"> {
  co2Trend: AirQualityTrend;
}

// Incoming WebSocket graph update from Argus backend
export interface GraphUpdateMessage {
  type: "graph_update";
  seq: number;
  entities: {
    rank: number;
    label: string;
    category: string;
    confidence?: number;
    crossed_out?: boolean;
  }[];
  relations: {
    subject: string;
    relation: string;
    object: string;
  }[];
}

export interface GetEntityImagesMessage {
  type: "get_entity_images";
  entity: string;
}

export interface EntityImagesMessage {
  type: "entity_images";
  entity: string;
  images: string[];
}

export interface EntityImagesState {
  entity: string | null;
  images: string[];
  loading: boolean;
}

export type RoverCommandRequest =
  | { type: "rover_ping" }
  | { type: "rover_zero" }
  | { type: "rover_stop" }
  | { type: "rover_rotate"; degrees: number }
  | { type: "rover_distance"; centimeters: number }
  | { type: "rover_read_air" }
  | { type: "rover_read_motion" };

export interface RoverResultMessage {
  type: "rover_result";
  command: string;
  response: string;
}

export interface WsErrorMessage {
  type: "error";
  message: string;
}

export interface RoverCommandResult {
  ok: boolean;
  request: RoverCommandRequest;
  command?: string;
  response?: string;
  message?: string;
}

export interface RoverToolArgs {
  action:
    | "ping"
    | "zero"
    | "stop"
    | "rotate"
    | "distance"
    | "read_air"
    | "read_motion";
  degrees?: number;
  centimeters?: number;
}

export interface AssistantFunctionCall {
  name: "rover_command";
  args: RoverToolArgs;
}

export interface AssistantConversationPart {
  text?: string;
  functionCall?: AssistantFunctionCall;
  functionResponse?: {
    name: "rover_command";
    response: {
      result: RoverCommandResult;
    };
  };
}

export interface AssistantConversationContent {
  role: "user" | "model";
  parts: AssistantConversationPart[];
}

export interface AssistantStartRequest {
  userText: string;
  graphContext: string;
}

export interface AssistantContinueRequest {
  conversation: AssistantConversationContent[];
}

export type AssistantApiRequest =
  | AssistantStartRequest
  | AssistantContinueRequest;

export interface AssistantToolCallsResponse {
  kind: "tool_calls";
  toolCalls: AssistantFunctionCall[];
  conversation: AssistantConversationContent[];
}

export interface AssistantFinalResponse {
  kind: "final";
  text: string;
}

export interface AssistantErrorResponse {
  kind: "error";
  message: string;
}

export type AssistantApiResponse =
  | AssistantToolCallsResponse
  | AssistantFinalResponse
  | AssistantErrorResponse;

// Internal state used by UI components
export interface RoverState {
  connected: boolean;
  demoMode: boolean;
  latestFrame: { url: string; timestamp: number } | null;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  airQuality: AirQualityReading | null;
  selectedNodeId: string | null;
}
