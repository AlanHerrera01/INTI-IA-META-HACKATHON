from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from inti.domain.entities import Observation, VisionAnalysis


class CaptureRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str | None = Field(default=None, max_length=2048)
    width: int = Field(default=1440, ge=320, le=1920)
    height: int = Field(default=900, ge=240, le=1080)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    instruction: str = Field(
        default="Describe visible controls and the inventory UI state.",
        min_length=1,
        max_length=2000,
    )


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    model: str
    summary: str
    elements: list[str]
    ui_state: str
    response_id: str | None


class ObservationResponse(BaseModel):
    id: UUID
    timestamp: datetime
    source: str
    source_url: str
    page_title: str
    width: int
    height: int
    screenshot_url: str
    analysis_status: str
    analysis: AnalysisResponse | None

    @classmethod
    def from_entity(cls, observation: Observation) -> "ObservationResponse":
        return cls(
            id=observation.id,
            timestamp=observation.timestamp,
            source=observation.source,
            source_url=observation.source_url,
            page_title=observation.page_title,
            width=observation.width,
            height=observation.height,
            screenshot_url=f"/api/v1/observations/{observation.id}/screenshot",
            analysis_status="completed" if observation.analysis else "not_analyzed",
            analysis=cls.analysis_response(observation.analysis),
        )

    @staticmethod
    def analysis_response(value: VisionAnalysis | None) -> AnalysisResponse | None:
        return AnalysisResponse.model_validate(value) if value else None
