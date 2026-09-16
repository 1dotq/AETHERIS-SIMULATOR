import type { NodeId, WorldState } from "@breachverse/domain";

export function adjacentNodeIds(world: WorldState, nodeId: NodeId): NodeId[] {
  return world.edges
    .filter((edge) => edge.from === nodeId || edge.to === nodeId)
    .map((edge) => edge.from === nodeId ? edge.to : edge.from)
    .sort();
}

export function isAdjacentToFoothold(world: WorldState, targetNodeId: NodeId): boolean {
  if (world.nodes[targetNodeId]?.isolated) return false;
  return world.red.footholdNodeIds.some((footholdId) => {
    if (world.nodes[footholdId]?.isolated) return false;
    return adjacentNodeIds(world, footholdId).includes(targetNodeId);
  });
}

export function isInitialAccessTarget(world: WorldState, targetNodeId: NodeId): boolean {
  return world.red.footholdNodeIds.length === 0
    && !world.nodes[targetNodeId]?.isolated
    && adjacentNodeIds(world, "INTERNET").includes(targetNodeId);
}

export function isReachableForRed(world: WorldState, nodeId: NodeId): boolean {
  if (world.nodes[nodeId]?.isolated) return false;
  if (world.red.footholdNodeIds.includes(nodeId)) return true;
  if (world.red.footholdNodeIds.length === 0) return adjacentNodeIds(world, "INTERNET").includes(nodeId);
  return isAdjacentToFoothold(world, nodeId);
}

