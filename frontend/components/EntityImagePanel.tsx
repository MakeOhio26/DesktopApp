"use client";

import { useState } from "react";

interface EntityImagePanelProps {
  entity: string | null;
  images: string[];
  loading: boolean;
  open: boolean;
  onClose: () => void;
}

export default function EntityImagePanel({
  entity,
  images,
  loading,
  open,
  onClose,
}: EntityImagePanelProps) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  if (!open || !entity) return null;

  return (
    <>
      <aside className="absolute inset-y-0 left-0 z-20 w-full max-w-sm border-r border-accent-secondary/40 bg-bg-panel/95 shadow-[12px_0_40px_rgba(0,0,0,0.45)] backdrop-blur-md sm:w-1/4">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-accent-secondary/30 px-4 py-3">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent-primary/80">
                Entity Frames
              </div>
              <h2 className="text-sm font-semibold text-text-primary">{entity}</h2>
            </div>
            <button
              onClick={onClose}
              className="cursor-pointer rounded-full border border-accent-secondary/40 px-2.5 py-1 text-xs font-mono text-text-secondary transition-colors duration-200 hover:border-accent-primary/40 hover:text-text-primary"
            >
              Close
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            {loading ? (
              <div className="rounded-xl border border-accent-secondary/30 bg-bg-surface px-4 py-6 text-center text-sm font-mono text-text-secondary">
                Loading images...
              </div>
            ) : images.length === 0 ? (
              <div className="rounded-xl border border-accent-secondary/30 bg-bg-surface px-4 py-6 text-center text-sm text-text-secondary">
                No stored images for this entity.
              </div>
            ) : (
              <div className="space-y-3">
                {images.slice(0, 5).map((image, index) => (
                  <button
                    key={`${entity}-${index}`}
                    onClick={() => setExpandedImage(image)}
                    className="block w-full cursor-pointer overflow-hidden rounded-xl border border-accent-secondary/30 bg-bg-surface text-left transition-all duration-200 hover:border-accent-primary/40 hover:shadow-[0_0_30px_rgba(45,212,160,0.08)]"
                  >
                    <img
                      src={`data:image/jpeg;base64,${image}`}
                      alt={`${entity} capture ${index + 1}`}
                      className="h-40 w-full object-cover"
                    />
                    <div className="border-t border-accent-secondary/20 px-3 py-2 text-xs font-mono text-text-secondary">
                      Capture {index + 1}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {expandedImage && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 px-6 py-10 backdrop-blur-sm"
          onClick={() => setExpandedImage(null)}
        >
          <div
            className="relative max-h-full w-full max-w-6xl overflow-hidden rounded-2xl border border-accent-secondary/30 bg-bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.7)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              onClick={() => setExpandedImage(null)}
              className="absolute right-4 top-4 z-10 cursor-pointer rounded-full bg-bg-primary/80 px-3 py-1.5 text-sm font-mono text-text-primary backdrop-blur-sm"
            >
              X
            </button>
            <img
              src={`data:image/jpeg;base64,${expandedImage}`}
              alt={`${entity} expanded`}
              className="max-h-[85vh] w-full object-contain bg-black"
            />
          </div>
        </div>
      )}
    </>
  );
}
