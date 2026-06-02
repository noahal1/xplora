/** Export utilities */

import type { Recommendation } from "../types";

/** Export recommendations as JSON download */
export function exportJSON(recommendations: Recommendation[], model: string, sourceInfo: string): void {
  if (recommendations.length === 0) return;

  const exportData = {
    export_time: new Date().toISOString(),
    model,
    source_info: sourceInfo,
    total_recommendations: recommendations.length,
    recommendations,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recommendations_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export recommendations as screenshot PNG */
export async function exportScreenshot(element: HTMLElement): Promise<void> {
  if (typeof html2canvas === "undefined") {
    throw new Error("截图库加载中，请稍后再试");
  }

  const canvas = await html2canvas(element, {
    backgroundColor: "#0a0a0f",
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const link = document.createElement("a");
  link.download = `recommendations_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
