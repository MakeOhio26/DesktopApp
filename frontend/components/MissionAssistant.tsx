"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type {
  AssistantApiRequest,
  AssistantApiResponse,
  AssistantConversationContent,
  AssistantConversationPart,
  AssistantFunctionCall,
  GraphEdge,
  GraphNode,
  RoverCommandRequest,
  RoverCommandResult,
} from "@/lib/types";

interface MissionAssistantProps {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  selectedNodeId: string | null;
  onHighlightNodes: (nodeIds: string[]) => void;
  runRoverCommand: (request: RoverCommandRequest) => Promise<RoverCommandResult>;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const MAX_TOOL_ITERATIONS = 8;

function serializeGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedNodeId: string | null
): string {
  const nodeLines = nodes.map(
    (n) =>
      `${n.id}: ${n.label} (category: ${n.category}, confidence: ${(n.confidence * 100).toFixed(0)}%, position: ${n.position.x.toFixed(1)}, ${n.position.y.toFixed(1)})`
  );
  const edgeLines = edges.map((e) => {
    const src = nodes.find((n) => n.id === e.source);
    const tgt = nodes.find((n) => n.id === e.target);
    return `${src?.label ?? e.source} --${e.relationship}--> ${tgt?.label ?? e.target}`;
  });

  let context = `Objects detected:\n${nodeLines.join("\n")}\n\nSpatial relationships:\n${edgeLines.join("\n")}`;

  if (selectedNodeId) {
    const selected = nodes.find((n) => n.id === selectedNodeId);
    if (selected) {
      context += `\n\nThe user currently has '${selected.label}' selected.`;
    }
  }

  return context;
}

function findMentionedNodes(text: string, nodes: GraphNode[]): string[] {
  const mentioned: string[] = [];
  for (const node of nodes) {
    if (node.label.length < 3) continue;
    const regex = new RegExp(
      `\\b${node.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
      "i"
    );
    if (regex.test(text)) {
      mentioned.push(node.id);
    }
  }
  return mentioned;
}

function mapToolCallToRequest(
  toolCall: AssistantFunctionCall
): { request: RoverCommandRequest; valid: boolean; message?: string } {
  switch (toolCall.args.action) {
    case "ping":
      return { request: { type: "rover_ping" }, valid: true };
    case "zero":
      return { request: { type: "rover_zero" }, valid: true };
    case "stop":
      return { request: { type: "rover_stop" }, valid: true };
    case "read_air":
      return { request: { type: "rover_read_air" }, valid: true };
    case "read_motion":
      return { request: { type: "rover_read_motion" }, valid: true };
    case "rotate":
      return typeof toolCall.args.degrees === "number"
        ? {
            request: { type: "rover_rotate", degrees: toolCall.args.degrees },
            valid: true,
          }
        : {
            request: { type: "rover_rotate", degrees: 0 },
            valid: false,
            message: "Rotate requires a numeric degrees value.",
          };
    case "distance":
      return typeof toolCall.args.centimeters === "number"
        ? {
            request: {
              type: "rover_distance",
              centimeters: toolCall.args.centimeters,
            },
            valid: true,
          }
        : {
            request: { type: "rover_distance", centimeters: 0 },
            valid: false,
            message: "Distance requires a numeric centimeters value.",
          };
    default:
      return {
        request: { type: "rover_ping" },
        valid: false,
        message: `Unsupported rover action: ${toolCall.args.action}`,
      };
  }
}

async function postAssistantRequest(
  payload: AssistantApiRequest
): Promise<AssistantApiResponse> {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as AssistantApiResponse;
  if (!response.ok) {
    if (data.kind === "error") {
      throw new Error(data.message);
    }
    throw new Error(`Assistant API error: ${response.status}`);
  }

  return data;
}

export default function MissionAssistant({
  graph,
  selectedNodeId,
  onHighlightNodes,
  runRoverCommand,
}: MissionAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    const graphContext = serializeGraph(
      graph.nodes,
      graph.edges,
      selectedNodeId
    );

    try {
      let payload: AssistantApiRequest = {
        userText: text,
        graphContext,
      };
      let assistantText = "";

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const response = await postAssistantRequest(payload);

        if (response.kind === "error") {
          throw new Error(response.message);
        }

        if (response.kind === "final") {
          assistantText =
            response.text || "Sorry, I could not generate a response.";
          break;
        }

        if (response.toolCalls.length === 0) {
          throw new Error("Assistant requested a tool step with no tool calls.");
        }

        const functionResponseParts: AssistantConversationPart[] = [];
        for (const toolCall of response.toolCalls) {
          const mapped = mapToolCallToRequest(toolCall);
          const result = mapped.valid
            ? await runRoverCommand(mapped.request)
            : {
                ok: false,
                request: mapped.request,
                message: mapped.message,
              };

          functionResponseParts.push({
            functionResponse: {
              name: "rover_command",
              response: {
                result,
              },
            },
          });
        }

        const conversation: AssistantConversationContent[] = [
          ...response.conversation,
          {
            role: "user",
            parts: functionResponseParts,
          },
        ];

        payload = { conversation };
      }

      if (!assistantText) {
        throw new Error("Assistant did not return a final response.");
      }

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText },
      ]);

      const mentioned = findMentionedNodes(assistantText, graph.nodes);
      if (mentioned.length > 0) {
        onHighlightNodes(mentioned);
      }
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "Unable to reach the assistant. Ensure the API route is configured.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [
    graph,
    input,
    loading,
    onHighlightNodes,
    runRoverCommand,
    selectedNodeId,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="flex flex-col h-full rounded-xl border border-accent-secondary/40 bg-bg-panel shadow-[-4px_0_24px_rgba(0,0,0,0.5)]">
      <div className="px-4 py-3 border-b border-accent-secondary/30">
        <h2 className="text-sm font-semibold text-accent-primary tracking-wide">
          Mission Assistant
        </h2>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-center text-text-secondary text-xs font-mono pt-8">
            Ask about the environment or tell the rover what to do.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-chat-user text-text-primary rounded-br-sm"
                  : "bg-chat-assistant text-text-primary rounded-bl-sm border border-accent-secondary/20"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-chat-assistant border border-accent-secondary/20 px-3 py-2 rounded-lg rounded-bl-sm">
              <span className="text-text-secondary text-sm animate-pulse">
                Thinking...
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-accent-secondary/30">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the environment or command the rover..."
            disabled={loading}
            className="flex-1 bg-bg-surface border border-accent-secondary/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:border-accent-primary/60 transition-colors duration-200 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-accent-primary text-bg-primary text-sm font-semibold rounded-lg hover:brightness-110 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
