import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import type { PlayerView, VisibleNode } from "@breachverse/protocol";
import type { NetworkRenderer, NetworkRendererOptions } from "./renderer-types.js";

const TEAM_COLOR = { RED: 0xe45b49, BLUE: 0x66a7c5 } as const;

function statusColor(node: VisibleNode, role: PlayerView["role"]): number {
  if (node.status === "ISOLATED") return 0xd6a84d;
  if (node.status === "ACCESS" || node.status === "CONFIRMED") return 0xe45b49;
  if (node.status === "SUSPICIOUS") return 0xe8904f;
  return role === "BLUE" ? 0x66a7c5 : 0x9da794;
}

export class PixiNetworkRenderer implements NetworkRenderer {
  private application: Application | null = null;
  private world = new Container();
  private edges = new Container();
  private nodes = new Container();
  private effects = new Container();
  private renderedEventSequence = 0;
  private dragging = false;
  private dragOrigin = { x: 0, y: 0 };

  constructor(private readonly options: NetworkRendererOptions) {}

  async mount(container: HTMLElement): Promise<void> {
    const application = new Application();
    await application.init({
      resizeTo: container,
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resolution: Math.max(1, Math.min(2.5, window.devicePixelRatio || 1)),
      roundPixels: true,
    });
    this.application = application;
    container.appendChild(application.canvas);
    this.world.addChild(this.edges, this.nodes, this.effects);
    application.stage.addChild(this.world);
    this.world.position.set(0, 10);

    application.stage.eventMode = "static";
    application.stage.hitArea = new Rectangle(0, 0, application.screen.width, application.screen.height);
    application.stage.on("pointerdown", (event) => {
      this.dragging = true;
      this.dragOrigin = { x: event.global.x - this.world.x, y: event.global.y - this.world.y };
    });
    application.stage.on("pointermove", (event) => {
      if (!this.dragging) return;
      this.world.position.set(event.global.x - this.dragOrigin.x, event.global.y - this.dragOrigin.y);
    });
    application.stage.on("pointerup", () => { this.dragging = false; });
    application.stage.on("pointerupoutside", () => { this.dragging = false; });

    application.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  render(view: PlayerView, selectedNodeId: string | null): void {
    const application = this.application;
    if (!application) return;
    application.stage.hitArea = new Rectangle(0, 0, application.screen.width, application.screen.height);
    this.edges.removeChildren().forEach((child) => child.destroy());
    this.nodes.removeChildren().forEach((child) => child.destroy({ children: true }));

    const byId = new Map(view.nodes.map((node) => [node.id, node]));
    for (const edge of view.edges) {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) continue;
      const graphic = new Graphics();
      graphic.moveTo(from.position.x, from.position.y);
      graphic.lineTo(to.position.x, to.position.y);
      graphic.stroke({ color: edge.state === "BLOCKED" ? 0x8d493f : 0x586052, width: edge.state === "BLOCKED" ? 3 : 2, alpha: 0.8 });
      this.edges.addChild(graphic);
    }

    for (const node of view.nodes) {
      const group = new Container();
      group.position.set(node.position.x, node.position.y);
      group.eventMode = "static";
      group.cursor = "pointer";
      group.on("pointerdown", (event) => {
        event.stopPropagation();
        this.options.onSelectNode(node.id);
      });

      const color = statusColor(node, view.role);
      const selected = node.id === selectedNodeId;
      const plate = new Graphics();
      plate.roundRect(-65, -31, 130, 62, 8)
        .fill({ color: selected ? 0x2d342c : 0x1a201b, alpha: 1 })
        .stroke({ color: selected ? TEAM_COLOR[view.role] : color, width: selected ? 3 : 1.5, alpha: selected ? 1 : 0.75 });
      const signal = new Graphics();
      signal.circle(-50, -15, 4).fill({ color, alpha: 1 });
      if (node.status === "SUSPICIOUS" || node.status === "ACCESS" || node.status === "CONFIRMED") {
        signal.circle(-50, -15, 8).stroke({ color, width: 1, alpha: 0.55 });
      }
      const title = new Text({
        text: node.id,
        style: { fontFamily: "IBM Plex Mono, Cascadia Code, monospace", fontSize: 13, fontWeight: "700", fill: 0xf1f3e9, letterSpacing: 0.6 },
      });
      title.position.set(-40, -24);
      const subtitle = new Text({
        text: `${node.kind.replaceAll("_", " ")}  /  ${node.status}`,
        style: { fontFamily: "IBM Plex Mono, Cascadia Code, monospace", fontSize: 9, fontWeight: "600", fill: color, letterSpacing: 0.25 },
      });
      subtitle.position.set(-52, 7);
      group.addChild(plate, signal, title, subtitle);
      this.nodes.addChild(group);
    }

    const newest = view.events.at(-1);
    if (newest && newest.sequence > this.renderedEventSequence) {
      this.renderedEventSequence = newest.sequence;
      if (newest.nodeId) this.pulseNode(byId.get(newest.nodeId), newest.tone === "DANGER" ? 0xe45b49 : TEAM_COLOR[view.role]);
    }
  }

  destroy(): void {
    if (!this.application) return;
    this.application.canvas.removeEventListener("wheel", this.handleWheel);
    this.application.destroy(true, { children: true });
    this.application = null;
  }

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const application = this.application;
    if (!application) return;
    const rect = application.canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const previousScale = this.world.scale.x;
    const nextScale = Math.max(0.55, Math.min(1.65, previousScale * (event.deltaY < 0 ? 1.08 : 0.92)));
    const worldX = (pointerX - this.world.x) / previousScale;
    const worldY = (pointerY - this.world.y) / previousScale;
    this.world.scale.set(nextScale);
    this.world.position.set(pointerX - worldX * nextScale, pointerY - worldY * nextScale);
  };

  private pulseNode(node: VisibleNode | undefined, color: number): void {
    const application = this.application;
    if (!application || !node) return;
    const ring = new Graphics();
    ring.position.set(node.position.x, node.position.y);
    this.effects.addChild(ring);
    let elapsed = 0;
    const tick = (): void => {
      elapsed += application.ticker.deltaTime;
      const progress = Math.min(1, elapsed / 42);
      ring.clear();
      ring.circle(0, 0, 28 + progress * 30).stroke({ color, width: 3 - progress * 2, alpha: 1 - progress });
      if (progress >= 1) {
        application.ticker.remove(tick);
        ring.destroy();
      }
    };
    application.ticker.add(tick);
  }
}
