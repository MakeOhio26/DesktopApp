"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RoverState } from "./types";
import { WS_URL } from "./constants";
import { useDemoMode } from "./useDemoMode";

export function useRoverConnection() {
  const [demoMode, setDemoModeState] = useState(true);
  const [connected, setConnected] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const demoState = useDemoMode();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);

  // Frame state managed outside React to avoid 30fps re-renders.
  // Components read from this ref via a callback or direct img.src update.
  const liveFrameRef = useRef<{ url: string; timestamp: number } | null>(null);
  const prevFrameUrlRef = useRef<string | null>(null);
  const frameListenersRef = useRef<Set<(frame: { url: string; timestamp: number }) => void>>(new Set());

  const subscribeToFrames = useCallback(
    (listener: (frame: { url: string; timestamp: number }) => void) => {
      frameListenersRef.current.add(listener);
      return () => { frameListenersRef.current.delete(listener); };
    },
    []
  );

  // WebSocket connection management
  useEffect(() => {
    if (demoMode) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (prevFrameUrlRef.current) {
        URL.revokeObjectURL(prevFrameUrlRef.current);
        prevFrameUrlRef.current = null;
      }
      liveFrameRef.current = null;
      setConnected(false);
      return;
    }

    function connect() {
      const ws = new WebSocket(WS_URL);
      ws.binaryType = "blob";
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, 10000);
          connect();
        }, backoffRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        const blob = event.data as Blob;
        const url = URL.createObjectURL(blob);

        if (prevFrameUrlRef.current) {
          URL.revokeObjectURL(prevFrameUrlRef.current);
        }
        prevFrameUrlRef.current = url;

        const frame = { url, timestamp: Date.now() };
        liveFrameRef.current = frame;

        // Notify listeners directly — no React state update
        for (const listener of frameListenersRef.current) {
          listener(frame);
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
      if (prevFrameUrlRef.current) {
        URL.revokeObjectURL(prevFrameUrlRef.current);
        prevFrameUrlRef.current = null;
      }
    };
  }, [demoMode]);

  const setDemoMode = useCallback((on: boolean) => {
    setDemoModeState(on);
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const state: RoverState = demoMode
    ? { ...demoState, selectedNodeId }
    : {
        connected,
        demoMode: false,
        latestFrame: liveFrameRef.current,
        graph: { nodes: [], edges: [] },
        airQuality: null,
        selectedNodeId,
      };

  return { state, setDemoMode, selectNode, subscribeToFrames };
}
