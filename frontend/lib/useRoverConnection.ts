"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RoverState, RoverMessage, GraphNode, GraphEdge } from "./types";
import { WS_URL } from "./constants";
import { useDemoMode } from "./useDemoMode";

const INITIAL_STATE: RoverState = {
  connected: false,
  demoMode: true,
  latestFrame: null,
  graph: { nodes: [], edges: [] },
  airQuality: null,
  selectedNodeId: null,
};

export function useRoverConnection() {
  const [demoMode, setDemoModeState] = useState(true);
  const [wsState, setWsState] = useState<Omit<RoverState, "demoMode" | "selectedNodeId">>({
    connected: false,
    latestFrame: null,
    graph: { nodes: [], edges: [] },
    airQuality: null,
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const demoState = useDemoMode();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);

  // WebSocket connection management
  useEffect(() => {
    if (demoMode) {
      // Clean up any existing WebSocket when switching to demo
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    function connect() {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
        setWsState((prev) => ({ ...prev, connected: true }));
        // Request initial graph
        ws.send(JSON.stringify({ type: "request_graph" }));
      };

      ws.onclose = () => {
        setWsState((prev) => ({ ...prev, connected: false }));
        wsRef.current = null;
        // Auto-reconnect with exponential backoff
        reconnectTimeoutRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, 10000);
          connect();
        }, backoffRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as RoverMessage;
          switch (msg.type) {
            case "frame":
              setWsState((prev) => ({
                ...prev,
                latestFrame: {
                  data: msg.data,
                  timestamp: msg.timestamp,
                  frameId: msg.frame_id,
                },
              }));
              break;
            case "graph":
              setWsState((prev) => ({
                ...prev,
                graph: { nodes: msg.nodes, edges: msg.edges },
              }));
              break;
            case "air_quality": {
              const { type: _, ...rest } = msg;
              setWsState((prev) => ({ ...prev, airQuality: rest }));
              break;
            }
          }
        } catch {
          // Ignore malformed messages
        }
      };
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [demoMode]);

  const setDemoMode = useCallback((on: boolean) => {
    setDemoModeState(on);
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const requestGraph = useCallback(() => {
    if (!demoMode && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "request_graph" }));
    }
  }, [demoMode]);

  // Compose state from the active source
  const state: RoverState = demoMode
    ? { ...demoState, selectedNodeId }
    : { ...wsState, demoMode: false, selectedNodeId };

  return { state, setDemoMode, selectNode, requestGraph };
}
