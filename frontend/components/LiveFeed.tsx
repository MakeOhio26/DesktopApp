"use client";

import { useRef, useEffect, useState } from "react";
import type { AirQualityReading } from "@/lib/types";

interface LiveFeedProps {
  frame: { url: string; timestamp: number } | null;
  airQuality: AirQualityReading | null;
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
  const [hasLiveFrame, setHasLiveFrame] = useState(false);
  const pendingFrameRef = useRef<{ url: string; timestamp: number } | null>(null);
  const rafRef = useRef<number>(0);
  const hasFrame = subscribeToFrames ? hasLiveFrame : !!frame;
  const warningActive = (airQuality?.co2 ?? 0) > 1000;
  const co2Trend = airQuality?.co2Trend ?? null;

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
        setHasLiveFrame(true);
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
      setHasLiveFrame(false);
    };
  }, [subscribeToFrames]);

  // Demo mode: update from prop (already throttled at 100ms)
  useEffect(() => {
    if (subscribeToFrames) return; // live mode uses subscription
    if (frame && imgRef.current) {
      imgRef.current.src = frame.url;
    }
    if (frame && timeRef.current) {
      timeRef.current.textContent = new Date(
        frame.timestamp
      ).toLocaleTimeString();
    }
  }, [frame, subscribeToFrames]);

  return (
    <div
      className={`relative w-full h-full rounded-xl border overflow-hidden bg-bg-surface transition-[border-color,box-shadow] duration-300 ${
        warningActive
          ? "border-error/70 shadow-[0_0_0_1px_rgba(212,64,64,0.55),0_0_28px_rgba(212,64,64,0.4),inset_0_0_28px_rgba(212,64,64,0.28)]"
          : "border-accent-secondary/40 shadow-none"
      }`}
    >
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
        <div className="absolute top-3 right-3 z-10 min-w-[220px] rounded-lg border border-white/10 bg-neutral-700/90 p-3 shadow-lg backdrop-blur-sm">
          <div className="mb-2 text-[10px] font-mono tracking-[0.24em] text-neutral-200/80">
            AIR QUALITY
          </div>
          <div className="mb-3 rounded-md border border-white/8 bg-black/15 px-3 py-2">
            <div className="mb-1 text-[10px] font-mono tracking-[0.22em] text-neutral-300/75">
              CO₂ LIVE
            </div>
            <div className="flex items-end gap-2 font-mono">
              <span className="text-[28px] leading-none text-white">
                {airQuality.co2.toFixed(0)}
              </span>
              <span className="mb-0.5 text-xs uppercase tracking-wide text-neutral-300/70">
                ppm
              </span>
              {co2Trend && (
                <span
                  className={`mb-0.5 text-lg leading-none ${
                    co2Trend === "up" ? "text-error" : "text-accent-primary"
                  }`}
                  aria-label={co2Trend === "up" ? "CO2 rising" : "CO2 falling"}
                  title={co2Trend === "up" ? "CO2 rising" : "CO2 falling"}
                >
                  {co2Trend === "up" ? "↑" : "↓"}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-1 text-[11px] font-mono">
            <div className="flex justify-between text-neutral-200/70">
              <span>PM2.5</span>
              <span className="text-white">
                {airQuality.pm25.toFixed(1)} μg/m³
              </span>
            </div>
            <div className="flex justify-between text-neutral-200/70">
              <span>PM10</span>
              <span className="text-white">
                {airQuality.pm10.toFixed(1)} μg/m³
              </span>
            </div>
            <div className="flex justify-between text-neutral-200/70">
              <span>Temp</span>
              <span className="text-white">
                {airQuality.temperature.toFixed(1)}°C
              </span>
            </div>
            <div className="flex justify-between text-neutral-200/70">
              <span>Humidity</span>
              <span className="text-white">
                {airQuality.humidity.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Frame info — bottom left */}
      {hasFrame && (
        <div className="absolute bottom-3 left-3 z-10 bg-bg-primary/70 backdrop-blur-sm rounded px-2 py-1">
          <span
            ref={timeRef}
            className="text-[10px] font-mono text-text-secondary"
          />
        </div>
      )}
    </div>
  );
}
