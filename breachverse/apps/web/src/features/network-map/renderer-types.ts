import type { PlayerView } from "@breachverse/protocol";

export interface NetworkRenderer {
  mount(container: HTMLElement): Promise<void>;
  render(view: PlayerView, selectedNodeId: string | null): void;
  destroy(): void;
}

export interface NetworkRendererOptions {
  onSelectNode: (nodeId: string) => void;
}

