import type { Observation } from "../../types/api";
import type { VisualElement, VisualScene } from "../../types/planning";

export function percentBounds(
  element: VisualElement,
  scene: VisualScene,
  observation: Observation,
) {
  const box = element.bounding_box;
  if (
    !element.visible ||
    !box ||
    scene.observation_id !== observation.id ||
    scene.viewport.width !== observation.width ||
    scene.viewport.height !== observation.height
  )
    return null;
  const width = box.coordinate_system === "pixels" ? observation.width : 1000;
  const height = box.coordinate_system === "pixels" ? observation.height : 1000;
  if (
    ![box.x, box.y, box.width, box.height, width, height].every(
      Number.isFinite,
    ) ||
    width <= 0 ||
    height <= 0 ||
    box.x < 0 ||
    box.y < 0 ||
    box.width <= 0 ||
    box.height <= 0 ||
    box.x + box.width > width ||
    box.y + box.height > height
  )
    return null;
  return {
    left: `${(box.x / width) * 100}%`,
    top: `${(box.y / height) * 100}%`,
    width: `${(box.width / width) * 100}%`,
    height: `${(box.height / height) * 100}%`,
  };
}
