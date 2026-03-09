"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type {
  AirQualityReading,
  AirQualityMessage,
  EntityImagesMessage,
  EntityImagesState,
  GetEntityImagesMessage,
  GraphEdge,
  GraphNode,
  GraphUpdateMessage,
  RoverCommandRequest,
  RoverCommandResult,
  RoverResultMessage,
  RoverState,
  WsErrorMessage,
} from "./types";
import { WS_URL } from "./constants";
import { useDemoMode } from "./useDemoMode";

const AIR_POLL_INTERVAL_MS = 2500;

function withCo2Trend(
  next: Omit<AirQualityReading, "co2Trend">,
  previous: AirQualityReading | null
): AirQualityReading {
  return {
    ...next,
    co2Trend:
      previous && next.co2 !== previous.co2
        ? next.co2 > previous.co2
          ? "up"
          : "down"
        : null,
  };
}

function parseJsonAirPayload(payload: string): Omit<AirQualityReading, "co2Trend"> | null {
  try {
    const parsed = JSON.parse(payload) as Partial<Record<string, unknown>>;
    const pm25 = typeof parsed.pm25 === "number" ? parsed.pm25 : null;
    const pm10 = typeof parsed.pm10 === "number" ? parsed.pm10 : null;
    const co2 = typeof parsed.co2 === "number" ? parsed.co2 : null;
    const temperature =
      typeof parsed.temperature === "number" ? parsed.temperature : null;
    const humidity = typeof parsed.humidity === "number" ? parsed.humidity : null;
    const timestamp =
      typeof parsed.timestamp === "number" ? parsed.timestamp : Date.now();

    if (
      pm25 === null ||
      pm10 === null ||
      co2 === null ||
      temperature === null ||
      humidity === null
    ) {
      return null;
    }

    return { pm25, pm10, co2, temperature, humidity, timestamp };
  } catch {
    return null;
  }
}

function parseDelimitedAirPayload(
  payload: string
): Omit<AirQualityReading, "co2Trend"> | null {
  const parts = payload.split("|");
  if (parts.length < 4 || parts[0] !== "DATA" || parts[1] !== "AIR") {
    return null;
  }

  const body = parts.slice(2);
  if (body.length === 1) {
    return parseJsonAirPayload(body[0]);
  }

  const values = body.map((value) => Number(value));
  if (values.some((value) => Number.isNaN(value))) {
    return null;
  }

  if (values.length >= 5) {
    const [first, second, third, fourth, fifth] = values;

    if (first > 200 && third <= 200) {
      return {
        co2: first,
        pm25: second,
        pm10: third,
        temperature: fourth,
        humidity: fifth,
        timestamp: Date.now(),
      };
    }

    return {
      pm25: first,
      pm10: second,
      co2: third,
      temperature: fourth,
      humidity: fifth,
      timestamp: Date.now(),
    };
  }

  return null;
}

function parseAirQualityResponse(
  payload: string,
  previous: AirQualityReading | null
): AirQualityReading | null {
  const parsed = parseJsonAirPayload(payload) ?? parseDelimitedAirPayload(payload);
  return parsed ? withCo2Trend(parsed, previous) : null;
}

export function useRoverConnection() {
  const [demoMode, setDemoModeState] = useState(true);
  const [connected, setConnected] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [liveGraph, setLiveGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [liveAirQuality, setLiveAirQuality] = useState<RoverState["airQuality"]>(null);
  const [entityImages, setEntityImages] = useState<EntityImagesState>({
    entity: null,
    images: [],
    loading: false,
  });

  const demoState = useDemoMode();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(1000);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const selectedNodeIdRef = useRef<string | null>(null);
  const pendingEntityImagesRef = useRef(false);
  const roverCommandQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRoverCommandRef = useRef<{
    request: RoverCommandRequest;
    resolve: (result: RoverCommandResult) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);

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

  const settlePendingRoverCommand = useCallback((result: RoverCommandResult) => {
    const pending = pendingRoverCommandRef.current;
    if (!pending) return false;

    clearTimeout(pending.timeoutId);
    pendingRoverCommandRef.current = null;
    pending.resolve(result);
    return true;
  }, []);

  const requestEntityImages = useCallback((entity: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    pendingEntityImagesRef.current = true;
    const message: GetEntityImagesMessage = {
      type: "get_entity_images",
      entity,
    };
    ws.send(JSON.stringify(message));
  }, []);

  const runRoverCommand = useCallback((request: RoverCommandRequest): Promise<RoverCommandResult> => {
    if (demoMode) {
      return Promise.resolve({
        ok: false,
        request,
        message: "Rover commands are unavailable in demo mode.",
      });
    }

    const run = async () =>
      new Promise<RoverCommandResult>((resolve) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          resolve({
            ok: false,
            request,
            message: "Rover websocket is not connected.",
          });
          return;
        }

        const timeoutId = setTimeout(() => {
          settlePendingRoverCommand({
            ok: false,
            request,
            message: "Rover command timed out.",
          });
        }, 45000);

        pendingRoverCommandRef.current = {
          request,
          resolve,
          timeoutId,
        };

        try {
          ws.send(JSON.stringify(request));
        } catch {
          settlePendingRoverCommand({
            ok: false,
            request,
            message: "Failed to send rover command.",
          });
        }
      });

    const queued = roverCommandQueueRef.current.then(run);
    roverCommandQueueRef.current = queued.then(() => undefined, () => undefined);
    return queued;
  }, [demoMode, settlePendingRoverCommand]);

  useEffect(() => {
    if (demoMode || !connected) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const pollAirQuality = async () => {
      await runRoverCommand({ type: "rover_read_air" });
      if (cancelled) return;
      timeoutId = setTimeout(pollAirQuality, AIR_POLL_INTERVAL_MS);
    };

    pollAirQuality();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [connected, demoMode, runRoverCommand]);

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
      pendingEntityImagesRef.current = false;
      if (pendingRoverCommandRef.current) {
        settlePendingRoverCommand({
          ok: false,
          request: pendingRoverCommandRef.current.request,
          message: "Live websocket closed while rover command was pending.",
        });
      }
      return;
    }

    function connect() {
      const ws = new WebSocket(WS_URL);
      ws.binaryType = "blob";
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = 1000;
        setConnected(true);
        if (selectedNodeIdRef.current) {
          requestEntityImages(selectedNodeIdRef.current);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setLiveAirQuality(null);
        wsRef.current = null;
        pendingEntityImagesRef.current = false;
        if (pendingRoverCommandRef.current) {
          settlePendingRoverCommand({
            ok: false,
            request: pendingRoverCommandRef.current.request,
            message: "Rover websocket disconnected.",
          });
        }
        reconnectTimeoutRef.current = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, 10000);
          connect();
        }, backoffRef.current);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        // Text message → JSON (graph updates)
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data) as
              | AirQualityMessage
              | GraphUpdateMessage
              | EntityImagesMessage
              | RoverResultMessage
              | WsErrorMessage;
            if (msg.type === "air_quality") {
              setLiveAirQuality((previousAirQuality) =>
                withCo2Trend(
                  {
                    pm25: msg.pm25,
                    pm10: msg.pm10,
                    co2: msg.co2,
                    temperature: msg.temperature,
                    humidity: msg.humidity,
                    timestamp: msg.timestamp,
                  },
                  previousAirQuality
                )
              );
            } else if (msg.type === "graph_update") {
              const positions = nodePositionsRef.current;
              const nodes: GraphNode[] = msg.entities.map((e) => {
                let pos = positions.get(e.label);
                if (!pos) {
                  pos = { x: 50 + Math.random() * 500, y: 50 + Math.random() * 300 };
                  positions.set(e.label, pos);
                }
                return {
                  id: e.label,
                  label: e.label,
                  category: e.category,
                  confidence: typeof e.confidence === "number" ? e.confidence : 1,
                  rank: e.rank,
                  crossedOut: Boolean(e.crossed_out),
                  first_seen_frame: msg.seq,
                  last_seen_frame: msg.seq,
                  position: pos,
                };
              });
              const edges: GraphEdge[] = msg.relations.map((r) => ({
                source: r.subject,
                target: r.object,
                relationship: r.relation,
              }));
              setLiveGraph({ nodes, edges });
            } else if (msg.type === "entity_images") {
              pendingEntityImagesRef.current = false;
              if (selectedNodeIdRef.current !== msg.entity) {
                return;
              }
              setEntityImages({
                entity: msg.entity,
                images: msg.images.slice(0, 5),
                loading: false,
              });
            } else if (msg.type === "rover_result") {
              if (msg.command === "read_air") {
                setLiveAirQuality((previousAirQuality) =>
                  parseAirQualityResponse(msg.response, previousAirQuality) ??
                  previousAirQuality
                );
              }
              settlePendingRoverCommand({
                ok: true,
                request: pendingRoverCommandRef.current?.request ?? { type: "rover_ping" },
                command: msg.command,
                response: msg.response,
              });
            } else if (msg.type === "error") {
              if (pendingRoverCommandRef.current) {
                settlePendingRoverCommand({
                  ok: false,
                  request: pendingRoverCommandRef.current.request,
                  message: msg.message,
                });
              } else if (pendingEntityImagesRef.current) {
                pendingEntityImagesRef.current = false;
                setEntityImages((prev) => ({ ...prev, loading: false }));
              }
            }
          } catch {
            // Ignore malformed JSON
          }
          return;
        }

        // Binary message → JPEG frame
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
      pendingEntityImagesRef.current = false;
      if (pendingRoverCommandRef.current) {
        settlePendingRoverCommand({
          ok: false,
          request: pendingRoverCommandRef.current.request,
          message: "Live websocket closed while rover command was pending.",
        });
      }
    };
  }, [demoMode, requestEntityImages, settlePendingRoverCommand]);

  const setDemoMode = useCallback((on: boolean) => {
    setLiveAirQuality(null);
    setDemoModeState(on);
  }, []);

  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId((prev) => {
      const nextId = prev === id ? null : id;
      selectedNodeIdRef.current = nextId;

      if (!nextId) {
        pendingEntityImagesRef.current = false;
        setEntityImages({ entity: null, images: [], loading: false });
      } else {
        setEntityImages({ entity: nextId, images: [], loading: !demoMode });
        if (!demoMode) {
          requestEntityImages(nextId);
        }
      }

      return nextId;
    });
  }, [demoMode, requestEntityImages]);

  const state: RoverState = demoMode
    ? { ...demoState, selectedNodeId }
      : {
        connected,
        demoMode: false,
        latestFrame: null,
        graph: liveGraph,
        airQuality: liveAirQuality ?? demoState.airQuality,
        selectedNodeId,
      };

  return { state, entityImages, setDemoMode, selectNode, subscribeToFrames, runRoverCommand };
}
