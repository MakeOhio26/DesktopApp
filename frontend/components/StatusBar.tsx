"use client";

interface StatusBarProps {
  connected: boolean;
  demoMode: boolean;
  onToggleDemoMode: () => void;
}

export default function StatusBar({
  connected,
  demoMode,
  onToggleDemoMode,
}: StatusBarProps) {
  const statusDot = demoMode
    ? "bg-demo-amber"
    : connected
      ? "bg-accent-primary"
      : "bg-error";

  const statusText = demoMode
    ? "Demo Mode"
    : connected
      ? "Connected"
      : "Disconnected";

  return (
    <div className="flex items-center justify-between px-5 py-2.5 bg-bg-panel border-b border-accent-secondary/30">
      {/* Left: connection status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2.5 h-2.5 rounded-full ${statusDot} ${
            demoMode ? "animate-pulse" : ""
          }`}
        />
        <span className="text-sm font-mono text-text-secondary">
          {statusText}
        </span>
      </div>

      {/* Center: title */}
      <h1 className="text-base font-semibold tracking-wide text-text-primary">
        Rover Mission Control
      </h1>

      {/* Right: demo toggle */}
      <button
        onClick={onToggleDemoMode}
        className={`px-3 py-1 text-xs font-mono rounded-full border transition-all duration-200 cursor-pointer ${
          demoMode
            ? "bg-demo-amber/20 border-demo-amber/50 text-demo-amber"
            : "bg-bg-surface border-accent-secondary/50 text-text-secondary hover:border-accent-primary/50 hover:text-text-primary"
        }`}
      >
        Demo
      </button>
    </div>
  );
}
