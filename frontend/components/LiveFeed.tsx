"use client";

import { useRef, useEffect, useState } from "react";
import type { AirQualityMessage } from "@/lib/types";

interface LiveFeedProps {
  frame: { url: string; timestamp: number } | null;
  airQuality: Omit<AirQualityMessage, "type"> | null;
  subscribeToFrames?: (
    listener: (frame: { url: string; timestamp: number }) => void
  ) => () => void;
}

export default function LiveFeed({
  frame,
  airQuality,
  subscribeToFrames,
}: LiveFeedProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [hasFrame, setHasFrame] = useState(!!frame);
  const pendingFrameRef = useRef<{ url: string; timestamp: number } | null>(null);
  const rafRef = useRef<number>(0);

  // Live mode: subscribe to frame stream and update img.src directly
  useEffect(() => {
    if (!subscribeToFrames) return;

    const tick = () => {
      const pending = pendingFrameRef.current;
      if (pending) {
        pendingFrameRef.current = null;
        if (imgRef.current) {
          imgRef.current.src = pending.url;
        }
        if (timeRef.current) {
          timeRef.current.textContent = new Date(
            pending.timestamp
          ).toLocaleTimeString();
        }
        if (!hasFrame) setHasFrame(true);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const unsub = subscribeToFrames((f) => {
      pendingFrameRef.current = f;
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      unsub();
    };
  }, [subscribeToFrames, hasFrame]);

  // Demo mode: update from prop (already throttled at 100ms)
  useEffect(() => {
    if (subscribeToFrames) return; // live mode uses subscription
    if (frame && imgRef.current) {
      imgRef.current.src = frame.url;
      if (!hasFrame) setHasFrame(true);
    }
    if (frame && timeRef.current) {
      timeRef.current.textContent = new Date(
        frame.timestamp
      ).toLocaleTimeString();
    }
  }, [frame, subscribeToFrames, hasFrame]);

  return (
    <div className="relative w-full h-full rounded-xl border border-accent-secondary/40 overflow-hidden bg-bg-surface">
      {/* Video frame — img always mounted, hidden until first frame */}
      <img
        ref={imgRef}
        alt="Rover camera feed"
        className={`w-full h-full object-cover ${hasFrame ? "" : "hidden"}`}
      />
      {!hasFrame && (
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
      {hasFrame && (
        <div className="absolute bottom-3 left-3 bg-bg-primary/70 backdrop-blur-sm rounded px-2 py-1">
          <span
            ref={timeRef}
            className="text-[10px] font-mono text-text-secondary"
          />
        </div>
      )}
    </div>
  );
}
