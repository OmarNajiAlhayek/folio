from pydantic import BaseModel, Field


class SemanticSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    limit: int | None = Field(default=None, ge=1, le=30)


class SemanticSearchHitResponse(BaseModel):
    article_id: str
    snippet: str
    score: float


class SemanticSearchResponse(BaseModel):
    items: list[SemanticSearchHitResponse]
