"use client";

import { useState, useEffect, useRef } from "react";
import type { GraphNode, GraphEdge, RoverState } from "./types";

const DEMO_LABELS = [
  { label: "door", category: "structure" },
  { label: "fire extinguisher", category: "safety" },
  { label: "exit sign", category: "safety" },
  { label: "desk", category: "furniture" },
  { label: "chair", category: "furniture" },
  { label: "window", category: "structure" },
  { label: "whiteboard", category: "furniture" },
  { label: "trash can", category: "object" },
  { label: "electrical panel", category: "equipment" },
  { label: "smoke detector", category: "safety" },
];

const RELATIONSHIPS = [
  "left_of",
  "right_of",
  "near",
  "above",
  "below",
  "mounted_on",
];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function generateInitialGraph(): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  // Pick 8-10 nodes from the pool
  const count = 8 + Math.floor(Math.random() * 3);
  const shuffled = [...DEMO_LABELS].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);

  const nodes: GraphNode[] = selected.map((item, i) => ({
    id: `node_${i}`,
    label: item.label,
    category: item.category,
    confidence: randomBetween(0.6, 0.98),
    first_seen_frame: 1,
    last_seen_frame: 1,
    position: {
      x: randomBetween(50, 550),
      y: randomBetween(50, 350),
    },
  }));

  // Generate 12-15 edges
  const edgeCount = 12 + Math.floor(Math.random() * 4);
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (let i = 0; i < edgeCount && edges.length < edgeCount; i++) {
    const sourceIdx = Math.floor(Math.random() * nodes.length);
    let targetIdx = Math.floor(Math.random() * nodes.length);
    if (targetIdx === sourceIdx) targetIdx = (targetIdx + 1) % nodes.length;

    const key = `${nodes[sourceIdx].id}-${nodes[targetIdx].id}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);

    edges.push({
      source: nodes[sourceIdx].id,
      target: nodes[targetIdx].id,
      relationship: RELATIONSHIPS[Math.floor(Math.random() * RELATIONSHIPS.length)],
    });
  }

  return { nodes, edges };
}

function mutateGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  frameId: number
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const newNodes = [...nodes];
  const newEdges = [...edges];
  const roll = Math.random();

  if (roll < 0.3 && newNodes.length < DEMO_LABELS.length) {
    // Add a node
    const existing = new Set(newNodes.map((n) => n.label));
    const available = DEMO_LABELS.filter((d) => !existing.has(d.label));
    if (available.length > 0) {
      const item = available[Math.floor(Math.random() * available.length)];
      const newId = `node_${Date.now()}`;
      newNodes.push({
        id: newId,
        label: item.label,
        category: item.category,
        confidence: randomBetween(0.5, 0.95),
        first_seen_frame: frameId,
        last_seen_frame: frameId,
        position: {
          x: randomBetween(50, 550),
          y: randomBetween(50, 350),
        },
      });
      // Add an edge to an existing node
      if (newNodes.length > 1) {
        const other = newNodes[Math.floor(Math.random() * (newNodes.length - 1))];
        newEdges.push({
          source: newId,
          target: other.id,
          relationship: RELATIONSHIPS[Math.floor(Math.random() * RELATIONSHIPS.length)],
        });
      }
    }
  } else if (roll < 0.45 && newNodes.length > 5) {
    // Remove a node
    const removeIdx = Math.floor(Math.random() * newNodes.length);
    const removedId = newNodes[removeIdx].id;
    newNodes.splice(removeIdx, 1);
    // Remove associated edges
    for (let i = newEdges.length - 1; i >= 0; i--) {
      if (newEdges[i].source === removedId || newEdges[i].target === removedId) {
        newEdges.splice(i, 1);
      }
    }
  } else if (roll < 0.7) {
    // Add an edge
    if (newNodes.length >= 2) {
      const a = newNodes[Math.floor(Math.random() * newNodes.length)];
      let b = newNodes[Math.floor(Math.random() * newNodes.length)];
      if (a.id === b.id) b = newNodes[(newNodes.indexOf(a) + 1) % newNodes.length];
      const exists = newEdges.some(
        (e) => e.source === a.id && e.target === b.id
      );
      if (!exists) {
        newEdges.push({
          source: a.id,
          target: b.id,
          relationship: RELATIONSHIPS[Math.floor(Math.random() * RELATIONSHIPS.length)],
        });
      }
    }
  } else if (newEdges.length > 5) {
    // Remove an edge
    newEdges.splice(Math.floor(Math.random() * newEdges.length), 1);
  }

  // Update last_seen_frame for all remaining nodes
  for (const node of newNodes) {
    node.last_seen_frame = frameId;
  }

  return { nodes: newNodes, edges: newEdges };
}

export function useDemoMode(): RoverState {
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>(
    () => generateInitialGraph()
  );
  const [latestFrame, setLatestFrame] = useState<RoverState["latestFrame"]>(null);
  const [airQuality, setAirQuality] = useState<RoverState["airQuality"]>(null);
  const frameIdRef = useRef(0);
  const prevFrameUrlRef = useRef<string | null>(null);

  // Mock frames — every 100ms
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;

    const interval = setInterval(() => {
      frameIdRef.current += 1;
      const ctx = canvas.getContext("2d")!;
      const now = Date.now();

      // Dark background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 640, 480);

      // Grid lines for "camera feed" effect
      ctx.strokeStyle = "rgba(45, 212, 160, 0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x < 640; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 480);
        ctx.stroke();
      }
      for (let y = 0; y < 480; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(640, y);
        ctx.stroke();
      }

      // Frame counter
      ctx.fillStyle = "#2dd4a0";
      ctx.font = "16px monospace";
      ctx.fillText(`FRAME ${frameIdRef.current}`, 20, 30);

      // Timestamp
      ctx.fillStyle = "#6b7f6b";
      ctx.font = "12px monospace";
      ctx.fillText(new Date(now).toISOString(), 20, 50);

      // "DEMO" watermark
      ctx.fillStyle = "rgba(45, 212, 160, 0.12)";
      ctx.font = "bold 72px monospace";
      ctx.textAlign = "center";
      ctx.fillText("DEMO", 320, 260);
      ctx.textAlign = "start";

      // Scan line effect
      const scanY = (now / 20) % 480;
      ctx.strokeStyle = "rgba(45, 212, 160, 0.15)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, scanY);
      ctx.lineTo(640, scanY);
      ctx.stroke();

      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          if (prevFrameUrlRef.current) {
            URL.revokeObjectURL(prevFrameUrlRef.current);
          }
          prevFrameUrlRef.current = url;
          setLatestFrame({ url, timestamp: now });
        },
        "image/jpeg",
        0.7
      );
    }, 100);

    return () => {
      clearInterval(interval);
      if (prevFrameUrlRef.current) {
        URL.revokeObjectURL(prevFrameUrlRef.current);
        prevFrameUrlRef.current = null;
      }
    };
  }, []);

  // Mock air quality — every 2s
  useEffect(() => {
    const baseValues = {
      pm25: 12,
      pm10: 25,
      co2: 420,
      temperature: 22,
      humidity: 45,
    };

    const emit = () => {
      setAirQuality({
        pm25: baseValues.pm25 + randomBetween(-2, 3),
        pm10: baseValues.pm10 + randomBetween(-5, 5),
        co2: baseValues.co2 + randomBetween(-20, 30),
        temperature: baseValues.temperature + randomBetween(-1, 1.5),
        humidity: baseValues.humidity + randomBetween(-5, 5),
        timestamp: Date.now(),
      });
    };

    emit();
    const interval = setInterval(emit, 2000);
    return () => clearInterval(interval);
  }, []);

  // Mock graph mutations — every 8-12s
  useEffect(() => {
    const scheduleNext = () => {
      const delay = 8000 + Math.random() * 4000;
      return setTimeout(() => {
        setGraph((prev) => mutateGraph(prev.nodes, prev.edges, frameIdRef.current));
        timerId = scheduleNext();
      }, delay);
    };

    let timerId = scheduleNext();
    return () => clearTimeout(timerId);
  }, []);

  return {
    connected: false,
    demoMode: true,
    latestFrame,
    graph,
    airQuality,
    selectedNodeId: null,
  };
}
