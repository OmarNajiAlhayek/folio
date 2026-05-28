from pydantic import BaseModel, ConfigDict, Field


class SuggestKeywordsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    abstract: str | None = None
    title_ar: str | None = Field(default=None, alias="titleAr")
    abstract_ar: str | None = Field(default=None, alias="abstractAr")


class SuggestKeywordsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, ser_json_by_alias=True)

    keywords_en: list[str] = Field(default_factory=list, alias="keywordsEn")
    keywords_ar: list[str] = Field(default_factory=list, alias="keywordsAr")


class KeywordsStatusResponse(BaseModel):
    enabled: bool
