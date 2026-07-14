import type { CircuitDocument } from "../model/types";
import { parseDocument, serializeDocument } from "../model/schema";

/**
 * 문서 저장소 어댑터 (Phase 9).
 * 로컬(브라우저) 구현이 기본. 향후 백엔드(REST)는 이 인터페이스의 서버 구현으로 붙인다 —
 * 실제 서버 도입은 "백엔드 없음" 고정 결정 변경이므로 사용자 확인 필요 (ROADMAP Phase 9).
 */

export interface StoredDocumentMeta {
  /** 저장 이름 (키) */
  name: string;
  savedAt: string;
  componentCount: number;
}

export interface DocumentStorage {
  list(): StoredDocumentMeta[];
  /** 저장 성공 여부 — 용량 초과·사생활 보호 모드 등 실패를 호출자가 안내 (codex-review M7) */
  save(name: string, doc: CircuitDocument): boolean;
  load(name: string): CircuitDocument | null;
  delete(name: string): void;
}

const STORAGE_KEY = "hyd.circuits.v1";

interface StorageShape {
  [name: string]: { savedAt: string; componentCount: number; json: string };
}

/** localStorage 유사 인터페이스 (테스트에서 주입 가능) */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class LocalDocumentStorage implements DocumentStorage {
  constructor(private kv: KeyValueStore) {}

  /** 저장소 값도 외부 경계 — 항목 단위로 구조를 검증해 손상 항목은 격리한다 (codex-review M8) */
  private read(): StorageShape {
    let raw: unknown;
    try {
      raw = JSON.parse(this.kv.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      return {};
    }
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const shape: StorageShape = {};
    for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).savedAt === "string" &&
        typeof (entry as Record<string, unknown>).componentCount === "number" &&
        typeof (entry as Record<string, unknown>).json === "string"
      ) {
        shape[name] = entry as StorageShape[string];
      }
    }
    return shape;
  }

  private write(shape: StorageShape): void {
    this.kv.setItem(STORAGE_KEY, JSON.stringify(shape));
  }

  list(): StoredDocumentMeta[] {
    return Object.entries(this.read())
      .map(([name, entry]) => ({
        name,
        savedAt: entry.savedAt,
        componentCount: entry.componentCount,
      }))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  save(name: string, doc: CircuitDocument): boolean {
    try {
      const shape = this.read();
      shape[name] = {
        savedAt: new Date().toISOString(),
        componentCount: doc.components.length,
        json: serializeDocument(doc),
      };
      this.write(shape);
      return true;
    } catch {
      return false; // 용량 초과, 저장소 권한 제한 등
    }
  }

  load(name: string): CircuitDocument | null {
    const entry = this.read()[name];
    if (!entry) return null;
    const result = parseDocument(entry.json);
    return result.ok && result.document ? result.document : null;
  }

  delete(name: string): void {
    try {
      const shape = this.read();
      delete shape[name];
      this.write(shape);
    } catch {
      /* 저장소 접근 실패 — 삭제는 조용히 무시 */
    }
  }
}

/** 브라우저 기본 저장소 (localStorage 미지원 환경에서는 null) */
export function createBrowserStorage(): DocumentStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return new LocalDocumentStorage(localStorage);
  } catch {
    return null;
  }
}
