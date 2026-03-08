"use client";

import type { GraphNode } from "@/lib/types";

interface NodeTooltipProps {
  node: GraphNode;
  canvasX: number;
  canvasY: number;
  onClose: () => void;
}

export default function NodeTooltip({
  node,
  canvasX,
  canvasY,
  onClose,
}: NodeTooltipProps) {
  return (
    <div
      className="absolute z-10 pointer-events-auto min-w-[180px]"
      style={{
        left: canvasX + 16,
        top: canvasY - 8,
      }}
    >
      <div className="bg-bg-surface border border-accent-secondary rounded-lg p-3 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-accent-primary">
            {node.label}
          </span>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-xs ml-3 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-1 text-xs font-mono text-text-secondary">
          <div className="flex justify-between">
            <span>Category</span>
            <span className="text-text-primary">{node.category}</span>
          </div>
          <div className="flex justify-between">
            <span>Confidence</span>
            <span className="text-text-primary">
              {(node.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between">
            <span>First seen</span>
            <span className="text-text-primary">
              Frame {node.first_seen_frame}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Last seen</span>
            <span className="text-text-primary">
              Frame {node.last_seen_frame}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Position</span>
            <span className="text-text-primary">
              ({node.position.x.toFixed(1)}, {node.position.y.toFixed(1)})
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
