import { registerPneumaticLibrary } from "./pneumatic";
import { registerElectricLibrary } from "./electric";
import { registerHydraulicLibrary } from "./hydraulic";

/** 전체 부품 라이브러리 등록. 앱/테스트 시작 시 1회 호출. */
export function registerLibraries(): void {
  registerPneumaticLibrary();
  registerHydraulicLibrary();
  registerElectricLibrary();
}
