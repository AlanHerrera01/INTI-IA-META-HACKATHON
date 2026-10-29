from inti.domain.entities import Observation
from inti.domain.exceptions import DependencyError
from inti.domain.planning import GroundingSource, VisualScene


class VisualGroundingAdapter:
    """Validates model coordinates; does not claim independent localization accuracy."""

    def validate(self, scene: VisualScene, observation: Observation) -> VisualScene:
        if (
            scene.observation_id != observation.id
            or scene.viewport.width != observation.width
            or scene.viewport.height != observation.height
        ):
            raise DependencyError("Scene does not match its screenshot viewport")
        for element in scene.elements:
            if element.source == GroundingSource.DOM_ASSISTED:
                raise DependencyError(
                    "DOM-assisted grounding is not enabled in screenshot-only mode"
                )
            if element.bounding_box:
                element.bounding_box.validate_viewport(scene.viewport)
        return scene
