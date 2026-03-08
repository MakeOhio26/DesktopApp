"use client";

import type { AirQualityMessage } from "@/lib/types";

interface LiveFeedProps {
  frame: { data: string; timestamp: number; frameId: number } | null;
  airQuality: Omit<AirQualityMessage, "type"> | null;
}

export default function LiveFeed({ frame, airQuality }: LiveFeedProps) {
  return (
    <div className="relative w-full h-full rounded-xl border border-accent-secondary/40 overflow-hidden bg-bg-surface">
      {/* Video frame */}
      {frame ? (
        <img
          src={`data:image/jpeg;base64,${frame.data}`}
          alt="Rover camera feed"
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full">
          <span className="text-text-secondary font-mono text-sm animate-pulse-feed">
            Waiting for feed...
          </span>
        </div>
      )}

      {/* Air quality HUD — top right */}
      {airQuality && (
        <div className="absolute top-3 right-3 bg-bg-primary/80 backdrop-blur-sm border border-accent-secondary/30 rounded-lg p-2.5 min-w-[140px]">
          <div className="text-[10px] font-mono text-accent-primary mb-1.5 tracking-wider">
            AIR QUALITY
          </div>
          <div className="space-y-0.5 text-[11px] font-mono">
            <div className="flex justify-between text-text-secondary">
              <span>PM2.5</span>
              <span className="text-text-primary">
                {airQuality.pm25.toFixed(1)} μg/m³
              </span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>CO₂</span>
              <span className="text-text-primary">
                {airQuality.co2.toFixed(0)} ppm
              </span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Temp</span>
              <span className="text-text-primary">
                {airQuality.temperature.toFixed(1)}°C
              </span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Humidity</span>
              <span className="text-text-primary">
                {airQuality.humidity.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Frame info — bottom left */}
      {frame && (
        <div className="absolute bottom-3 left-3 bg-bg-primary/70 backdrop-blur-sm rounded px-2 py-1">
          <span className="text-[10px] font-mono text-text-secondary">
            Frame {frame.frameId} · {new Date(frame.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}
