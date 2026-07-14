import { beforeAll, describe, expect, it } from "vitest";
import { registerLibraries } from "../../library";
import { createEmptyDocument } from "../../model/types";
import { addComponent } from "../../model/operations";
import { LocalDocumentStorage, type KeyValueStore } from "../index";

beforeAll(() => {
  registerLibraries();
});

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe("로컬 문서 저장소 (Phase 9)", () => {
  it("저장 → 목록 → 불러오기 → 삭제가 동작한다", () => {
    const storage = new LocalDocumentStorage(memoryStore());
    let doc = createEmptyDocument("내 회로");
    doc = addComponent(doc, "pneu.source", { x: 100, y: 100 }).doc;

    storage.save("내 회로", doc);
    const list = storage.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("내 회로");
    expect(list[0].componentCount).toBe(1);

    const loaded = storage.load("내 회로");
    expect(loaded).toEqual(doc);

    storage.delete("내 회로");
    expect(storage.list()).toHaveLength(0);
    expect(storage.load("내 회로")).toBeNull();
  });

  it("같은 이름으로 저장하면 덮어쓴다", () => {
    const storage = new LocalDocumentStorage(memoryStore());
    const doc1 = createEmptyDocument("A");
    const doc2 = addComponent(createEmptyDocument("A"), "pneu.source", { x: 0, y: 0 }).doc;
    storage.save("A", doc1);
    storage.save("A", doc2);
    expect(storage.list()).toHaveLength(1);
    expect(storage.load("A")?.components).toHaveLength(1);
  });

  it("손상된 저장 데이터에도 안전하다", () => {
    const kv = memoryStore();
    kv.setItem("hyd.circuits.v1", "{broken");
    const storage = new LocalDocumentStorage(kv);
    expect(storage.list()).toEqual([]);
  });
});

describe("review-3 P1: 예약어 저장 이름 거부", () => {
  it('save("__proto__")는 false를 반환하고 목록에 나타나지 않는다', () => {
    const storage = new LocalDocumentStorage(memoryStore());
    const doc = createEmptyDocument("x");
    for (const name of ["__proto__", "constructor", "prototype"]) {
      expect(storage.save(name, doc)).toBe(false);
    }
    expect(storage.list()).toHaveLength(0);
  });
});
