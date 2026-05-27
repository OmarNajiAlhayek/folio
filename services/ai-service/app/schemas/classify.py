from pydantic import BaseModel, Field


class ClassifyAbstractRequest(BaseModel):
    abstract: str = Field(min_length=1)


class ClassifyArticleRequest(BaseModel):
    title: str = ""
    keywords: str = ""
    abstract: str = Field(min_length=1)


class ClassifyResponse(BaseModel):
    top_label: str
    top_confidence: float = Field(description="Confidence percentage (0–100)")
    probabilities: dict[str, float]


class ClassifierStatusResponse(BaseModel):
    enabled: bool
    model_path: str | None
    device: str | None
    labels_count: int
    weights_loaded: bool
    model_configured: bool


class ClassifierLabelsResponse(BaseModel):
    labels: list[str]
