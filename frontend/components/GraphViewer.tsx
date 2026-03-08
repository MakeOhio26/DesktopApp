"use client";

import { useRef, useEffect, useCallback } from "react";
import type { GraphNode, GraphEdge } from "@/lib/types";
import { CONNECTION_DIST, NODE_DRIFT_SPEED, GRAPH_REPULSION_DIST } from "@/lib/constants";

interface GraphViewerProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

interface RenderNode {
  id: string;
  label: string;
  category: string;
  confidence: number;
  rank: number;
  crossedOut: boolean;
  firstSeenFrame: number;
  lastSeenFrame: number;
  dataPosition: { x: number; y: number };
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  brightness: number;
  targetBrightness: number;
  opacity: number;
  targetOpacity: number;
}

function rankBrightness(rank: number): number {
  return Math.max(0.65, 1.0 - (rank - 1) * 0.075);
}

interface SimState {
  nodes: Map<string, RenderNode>;
  edges: GraphEdge[];
  mouseX: number;
  mouseY: number;
  hoveredNodeId: string | null;
  canvasW: number;
  canvasH: number;
}

function baseBrightness(): number {
  return 0.2 + Math.random() * 0.15;
}

export default function GraphViewer({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: GraphViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimState>({
    nodes: new Map(),
    edges: [],
    mouseX: -1000,
    mouseY: -1000,
    hoveredNodeId: null,
    canvasW: 800,
    canvasH: 400,
  });
  const rafRef = useRef<number>(0);

  // Sync props → simulation state
  useEffect(() => {
    const sim = simRef.current;
    const existingIds = new Set(sim.nodes.keys());
    const incomingIds = new Set(nodes.map((n) => n.id));

    // Add or update nodes
    for (const node of nodes) {
      const existing = sim.nodes.get(node.id);
      if (existing) {
        // Update metadata, keep position
        existing.label = node.label;
        existing.category = node.category;
        existing.confidence = node.confidence;
        existing.rank = node.rank;
        existing.crossedOut = node.crossedOut;
        existing.firstSeenFrame = node.first_seen_frame;
        existing.lastSeenFrame = node.last_seen_frame;
        existing.dataPosition = { ...node.position };
      } else {
        // New node — place near connected neighbors or random
        let startX: number;
        let startY: number;

        const neighborPositions: { x: number; y: number }[] = [];
        for (const edge of edges) {
          const neighborId =
            edge.source === node.id
              ? edge.target
              : edge.target === node.id
                ? edge.source
                : null;
          if (neighborId) {
            const neighbor = sim.nodes.get(neighborId);
            if (neighbor) {
              neighborPositions.push({ x: neighbor.x, y: neighbor.y });
            }
          }
        }

        if (neighborPositions.length > 0) {
          const avgX =
            neighborPositions.reduce((s, p) => s + p.x, 0) /
            neighborPositions.length;
          const avgY =
            neighborPositions.reduce((s, p) => s + p.y, 0) /
            neighborPositions.length;
          startX = avgX + (Math.random() - 0.5) * 60;
          startY = avgY + (Math.random() - 0.5) * 60;
        } else {
          startX = Math.random() * sim.canvasW;
          startY = Math.random() * sim.canvasH;
        }

        sim.nodes.set(node.id, {
          id: node.id,
          label: node.label,
          category: node.category,
          confidence: node.confidence,
          rank: node.rank,
          crossedOut: node.crossedOut,
          firstSeenFrame: node.first_seen_frame,
          lastSeenFrame: node.last_seen_frame,
          dataPosition: { ...node.position },
          x: startX,
          y: startY,
          vx: (Math.random() - 0.5) * NODE_DRIFT_SPEED * 2,
          vy: (Math.random() - 0.5) * NODE_DRIFT_SPEED * 2,
          r: 3,
          brightness: 0,
          targetBrightness: baseBrightness(),
          opacity: 0,
          targetOpacity: 1,
        });
      }
    }

    // Mark removed nodes for fade-out
    for (const id of existingIds) {
      if (!incomingIds.has(id)) {
        const node = sim.nodes.get(id)!;
        node.targetBrightness = 0;
        node.targetOpacity = 0;
      }
    }

    sim.edges = edges;
  }, [nodes, edges]);

  // Canvas setup + animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d")!;

    function resize() {
      const rect = container!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      simRef.current.canvasW = rect.width;
      simRef.current.canvasH = rect.height;
    }

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    function getConnectedNeighbors(nodeId: string): Set<string> {
      const neighbors = new Set<string>();
      for (const edge of simRef.current.edges) {
        if (edge.source === nodeId) neighbors.add(edge.target);
        if (edge.target === nodeId) neighbors.add(edge.source);
      }
      return neighbors;
    }

    function tick() {
      const sim = simRef.current;
      const w = sim.canvasW;
      const h = sim.canvasH;
      const nodesArr = Array.from(sim.nodes.values());

      // --- Physics ---

      // Repulsion between close nodes
      for (let i = 0; i < nodesArr.length; i++) {
        for (let j = i + 1; j < nodesArr.length; j++) {
          const a = nodesArr[i];
          const b = nodesArr[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < GRAPH_REPULSION_DIST) {
            const force = ((GRAPH_REPULSION_DIST - dist) / GRAPH_REPULSION_DIST) * 0.3;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      // Attraction along semantic edges
      for (const edge of sim.edges) {
        const a = sim.nodes.get(edge.source);
        const b = sim.nodes.get(edge.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist > 120) {
          const force = (dist - 120) * 0.0005;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
      }

      // Update positions, wrap, animate brightness/opacity
      for (const node of nodesArr) {
        // Damping
        node.vx *= 0.98;
        node.vy *= 0.98;

        // Clamp velocity
        const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (speed > 0.75) {
          node.vx = (node.vx / speed) * 0.75;
          node.vy = (node.vy / speed) * 0.75;
        }

        node.x += node.vx;
        node.y += node.vy;

        // Wrap around canvas edges
        if (node.x < -20) node.x = w + 20;
        if (node.x > w + 20) node.x = -20;
        if (node.y < -20) node.y = h + 20;
        if (node.y > h + 20) node.y = -20;

        // Animate brightness
        node.brightness += (node.targetBrightness - node.brightness) * 0.05;

        // Animate opacity
        node.opacity += (node.targetOpacity - node.opacity) * 0.05;

        // Interpolate radius based on brightness
        node.r = 2 + node.brightness * 3;
      }

      // Remove fully faded nodes
      for (const [id, node] of sim.nodes) {
        if (node.targetOpacity === 0 && node.opacity < 0.01) {
          sim.nodes.delete(id);
        }
      }

      // --- Hover brightness logic ---
      const hoveredId = sim.hoveredNodeId;
      const connectedToHover = hoveredId
        ? getConnectedNeighbors(hoveredId)
        : new Set<string>();

      for (const node of sim.nodes.values()) {
        if (node.targetOpacity === 0) continue; // fading out

        if (node.id === selectedNodeId) {
          node.targetBrightness = 1.0;
        } else if (node.id === hoveredId) {
          node.targetBrightness = 1.0;
        } else if (connectedToHover.has(node.id)) {
          node.targetBrightness = 0.6;
        } else if (node.crossedOut) {
          node.targetBrightness = baseBrightness();
        } else {
          node.targetBrightness = rankBrightness(node.rank);
        }
      }

      // --- Rendering ---
      ctx.clearRect(0, 0, w, h);

      // Background
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      const activeNodes = nodesArr.filter((n) => n.opacity > 0.01);

      // Ambient constellation lines (proximity-based, decorative)
      for (let i = 0; i < activeNodes.length; i++) {
        for (let j = i + 1; j < activeNodes.length; j++) {
          const a = activeNodes[i];
          const b = activeNodes[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.24 * Math.min(a.opacity, b.opacity);
            ctx.strokeStyle = `rgba(80, 180, 140, ${alpha})`;
            ctx.lineWidth = 0.3;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Semantic edges
      for (const edge of sim.edges) {
        const source = sim.nodes.get(edge.source);
        const target = sim.nodes.get(edge.target);
        if (!source || !target) continue;
        if (source.opacity < 0.01 || target.opacity < 0.01) continue;

        const isHighlighted =
          source.id === hoveredId ||
          target.id === hoveredId ||
          source.id === selectedNodeId ||
          target.id === selectedNodeId;

        const alpha = Math.min(1, (isHighlighted ? 1.6 : 0.6)) * Math.min(source.opacity, target.opacity);
        ctx.strokeStyle = `rgba(80, 180, 140, ${alpha})`;
        ctx.lineWidth = isHighlighted ? 1 : 0.5;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        // Relationship label at midpoint
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const labelAlpha = Math.min(1, (isHighlighted ? 2.0 : 0.8)) * Math.min(source.opacity, target.opacity);
        ctx.fillStyle = `rgba(100, 200, 170, ${labelAlpha})`;
        ctx.font = '9px "JetBrains Mono", "Fira Code", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(edge.relationship, midX, midY);
      }

      // Nodes
      for (const node of activeNodes) {
        const { x, y, r, brightness, opacity } = node;
        const effectiveAlpha = opacity;

        // Glow for brighter nodes
        if (brightness > 0.4) {
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 8);
          if (brightness > 0.7) {
            grad.addColorStop(0, `rgba(100, 220, 180, ${brightness * 0.25 * effectiveAlpha})`);
          } else {
            grad.addColorStop(0, `rgba(80, 180, 150, ${brightness * 0.25 * effectiveAlpha})`);
          }
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, r * 8, 0, Math.PI * 2);
          ctx.fill();
        }

        // Dot
        if (node.crossedOut) {
          ctx.fillStyle = `rgba(160, 80, 80, ${brightness * effectiveAlpha})`;
        } else if (brightness > 0.7) {
          ctx.fillStyle = `rgba(140, 240, 200, ${brightness * effectiveAlpha})`;
        } else {
          ctx.fillStyle = `rgba(100, 200, 170, ${brightness * effectiveAlpha})`;
        }
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Red X for crossed-out nodes
        if (node.crossedOut) {
          const xSize = 8;
          ctx.strokeStyle = `rgba(212, 64, 64, ${0.8 * effectiveAlpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - xSize, y - xSize);
          ctx.lineTo(x + xSize, y + xSize);
          ctx.moveTo(x + xSize, y - xSize);
          ctx.lineTo(x - xSize, y + xSize);
          ctx.stroke();
        }

        // Label
        if (node.crossedOut) {
          ctx.fillStyle = `rgba(212, 64, 64, ${0.6 * effectiveAlpha})`;
        } else {
          ctx.fillStyle = `rgba(140, 240, 200, ${Math.min(1, brightness * 3.6) * effectiveAlpha})`;
        }
        ctx.font = '11px "JetBrains Mono", "Fira Code", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(node.label, x + r + 4, y - r - 2);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, [selectedNodeId]);

  // Mouse interaction handlers
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      simRef.current.mouseX = mx;
      simRef.current.mouseY = my;

      // Hit-test
      let found: string | null = null;
      for (const node of simRef.current.nodes.values()) {
        const dx = node.x - mx;
        const dy = node.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          found = node.id;
          break;
        }
      }
      simRef.current.hoveredNodeId = found;
      canvas.style.cursor = found ? "pointer" : "default";
    },
    []
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const sim = simRef.current;
      if (sim.hoveredNodeId) {
        onSelectNode(sim.hoveredNodeId);
      } else {
        onSelectNode(null);
      }
    },
    [onSelectNode]
  );

  const handleMouseLeave = useCallback(() => {
    simRef.current.hoveredNodeId = null;
    simRef.current.mouseX = -1000;
    simRef.current.mouseY = -1000;
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full rounded-xl border border-accent-secondary/40 overflow-hidden bg-bg-primary">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
        className="block w-full h-full"
      />
    </div>
  );
}
