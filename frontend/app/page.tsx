"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRoverConnection } from "@/lib/useRoverConnection";
import { LLM_HIGHLIGHT_DURATION } from "@/lib/constants";
import StatusBar from "@/components/StatusBar";
import GraphViewer from "@/components/GraphViewer";
import LiveFeed from "@/components/LiveFeed";
import MissionAssistant from "@/components/MissionAssistant";

export default function Dashboard() {
  const { state, setDemoMode, selectNode, subscribeToFrames } = useRoverConnection();
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggleDemoMode = useCallback(() => {
    setDemoMode(!state.demoMode);
  }, [state.demoMode, setDemoMode]);

  const handleHighlightNodes = useCallback((nodeIds: string[]) => {
    setHighlightedNodeIds(nodeIds);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedNodeIds([]);
    }, LLM_HIGHLIGHT_DURATION);
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-primary">
      {/* Top status bar */}
      <StatusBar
        connected={state.connected}
        demoMode={state.demoMode}
        onToggleDemoMode={handleToggleDemoMode}
      />

      {/* Main content */}
      <div className="flex flex-1 min-h-0 p-2 gap-2">
        {/* Left section — 75% */}
        <div className="flex flex-col flex-[3] min-w-0 gap-2">
          {/* Graph viewer — top half */}
          <div className="flex-1 min-h-0">
            <GraphViewer
              nodes={state.graph.nodes}
              edges={state.graph.edges}
              selectedNodeId={state.selectedNodeId}
              onSelectNode={selectNode}
            />
          </div>

          {/* Live feed — bottom half */}
          <div className="flex-1 min-h-0">
            <LiveFeed
              frame={state.latestFrame}
              airQuality={state.airQuality}
              subscribeToFrames={state.demoMode ? undefined : subscribeToFrames}
            />
          </div>
        </div>

        {/* Right panel — 25% */}
        <div className="flex-1 min-w-0 ml-1.5">
          <MissionAssistant
            graph={state.graph}
            selectedNodeId={state.selectedNodeId}
            onHighlightNodes={handleHighlightNodes}
          />
        </div>
      </div>
    </div>
  );
}
