import { useEffect, useRef } from "react";
import type { PlayerView } from "@breachverse/protocol";
import { PixiNetworkRenderer } from "./PixiNetworkRenderer.js";

interface NetworkMapProps {
  view: PlayerView;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function NetworkMap({ view, selectedNodeId, onSelectNode }: NetworkMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiNetworkRenderer | null>(null);
  const latestRef = useRef({ view, selectedNodeId });
  latestRef.current = { view, selectedNodeId };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const renderer = new PixiNetworkRenderer({ onSelectNode });
    rendererRef.current = renderer;
    void renderer.mount(container).then(() => {
      if (cancelled) return;
      renderer.render(latestRef.current.view, latestRef.current.selectedNodeId);
    });
    return () => {
      cancelled = true;
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [onSelectNode]);

  useEffect(() => {
    rendererRef.current?.render(view, selectedNodeId);
  }, [view, selectedNodeId]);

  return <div className="network-map" ref={containerRef} aria-label="Interactive organization network map" />;
}
