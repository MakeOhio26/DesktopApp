"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { GraphNode, GraphEdge } from "@/lib/types";

interface MissionAssistantProps {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  selectedNodeId: string | null;
  onHighlightNodes: (nodeIds: string[]) => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function serializeGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selectedNodeId: string | null
): string {
  const nodeLines = nodes.map(
    (n) =>
      `${n.id}: ${n.label} (category: ${n.category}, confidence: ${(n.confidence * 100).toFixed(0)}%, position: ${n.position.x.toFixed(1)}, ${n.position.y.toFixed(1)})`
  );
  const edgeLines = edges.map(
    (e) => {
      const src = nodes.find((n) => n.id === e.source);
      const tgt = nodes.find((n) => n.id === e.target);
      return `${src?.label ?? e.source} --${e.relationship}--> ${tgt?.label ?? e.target}`;
    }
  );

  let context = `Objects detected:\n${nodeLines.join("\n")}\n\nSpatial relationships:\n${edgeLines.join("\n")}`;

  if (selectedNodeId) {
    const selected = nodes.find((n) => n.id === selectedNodeId);
    if (selected) {
      context += `\n\nThe user currently has '${selected.label}' selected.`;
    }
  }

  return context;
}

function findMentionedNodes(
  text: string,
  nodes: GraphNode[]
): string[] {
  const mentioned: string[] = [];
  for (const node of nodes) {
    if (node.label.length < 3) continue;
    const regex = new RegExp(`\\b${node.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (regex.test(text)) {
      mentioned.push(node.id);
    }
  }
  return mentioned;
}

export default function MissionAssistant({
  graph,
  selectedNodeId,
  onHighlightNodes,
}: MissionAssistantProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
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
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY ?? "";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            system_instruction: {
              parts: [
                {
                  text: "You are a mission assistant for a building inspection rover. You answer questions about objects detected during the mission based on the knowledge graph provided. Reference objects by name, describe their spatial relationships, and be concise. If asked where something is, describe its position relative to other objects.",
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${graphContext}\n\nQuestion: ${text}`,
                  },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 1024,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantText =
        data.candidates?.[0]?.content?.parts?.[0]?.text ??
        "Sorry, I could not generate a response.";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText },
      ]);

      // Scan for mentioned nodes and highlight them
      const mentioned = findMentionedNodes(assistantText, graph.nodes);
      if (mentioned.length > 0) {
        onHighlightNodes(mentioned);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Unable to reach the assistant. Ensure the API proxy is configured.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, graph, selectedNodeId, onHighlightNodes]);

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
      {/* Header */}
      <div className="px-4 py-3 border-b border-accent-secondary/30">
        <h2 className="text-sm font-semibold text-accent-primary tracking-wide">
          Mission Assistant
        </h2>
      </div>

      {/* Chat history */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="text-center text-text-secondary text-xs font-mono pt-8">
            Ask questions about detected objects and their spatial relationships.
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

      {/* Input */}
      <div className="p-3 border-t border-accent-secondary/30">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the environment..."
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
