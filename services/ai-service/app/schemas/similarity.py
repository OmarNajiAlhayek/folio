from pydantic import BaseModel, Field


class SimilarityStatusResponse(BaseModel):
    enabled: bool
    chroma_path: str
    model_name: str
    default_threshold: float
    same_category_only: bool


class UpsertArticleRequest(BaseModel):
    article_id: str = Field(min_length=1, max_length=64)
    abstract: str = Field(min_length=1)
    keywords: str = ""
    category: str = ""
    full_text: str = ""


class FindSimilarRequest(BaseModel):
    article_id: str = Field(min_length=1, max_length=64)
    limit: int | None = Field(default=None, ge=1, le=20)
    similarity_threshold: float | None = Field(default=None, ge=0.0, le=1.0)
    same_category_only: bool | None = None


class SimilarArticleResponse(BaseModel):
    article_id: str
    abstract: str
    keywords: str
    category: str
    similarity: float


class FindSimilarResponse(BaseModel):
    items: list[SimilarArticleResponse]
