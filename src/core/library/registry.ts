import type { ComponentDefinition } from "./types";

const definitions = new Map<string, ComponentDefinition>();

export function registerComponent(def: ComponentDefinition): void {
  if (definitions.has(def.type)) {
    throw new Error(`중복 등록된 부품 타입: ${def.type}`);
  }
  definitions.set(def.type, def);
}

export function getComponentDefinition(type: string): ComponentDefinition {
  const def = definitions.get(type);
  if (!def) throw new Error(`등록되지 않은 부품 타입: ${type}`);
  return def;
}

export function hasComponentDefinition(type: string): boolean {
  return definitions.has(type);
}

export function listComponentDefinitions(): ComponentDefinition[] {
  return [...definitions.values()];
}

/** 팔레트용: category → 부품 목록 */
export function listByCategory(): Map<string, ComponentDefinition[]> {
  const groups = new Map<string, ComponentDefinition[]>();
  for (const def of definitions.values()) {
    const group = groups.get(def.category) ?? [];
    group.push(def);
    groups.set(def.category, group);
  }
  return groups;
}
