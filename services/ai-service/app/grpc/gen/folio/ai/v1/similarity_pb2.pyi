from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class UpsertArticleRequest(_message.Message):
    __slots__ = ("article_id", "abstract", "keywords", "category", "full_text")
    ARTICLE_ID_FIELD_NUMBER: _ClassVar[int]
    ABSTRACT_FIELD_NUMBER: _ClassVar[int]
    KEYWORDS_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FIELD_NUMBER: _ClassVar[int]
    FULL_TEXT_FIELD_NUMBER: _ClassVar[int]
    article_id: str
    abstract: str
    keywords: str
    category: str
    full_text: str
    def __init__(self, article_id: _Optional[str] = ..., abstract: _Optional[str] = ..., keywords: _Optional[str] = ..., category: _Optional[str] = ..., full_text: _Optional[str] = ...) -> None: ...

class UpsertArticleResponse(_message.Message):
    __slots__ = ("status",)
    STATUS_FIELD_NUMBER: _ClassVar[int]
    status: str
    def __init__(self, status: _Optional[str] = ...) -> None: ...

class RemoveArticleRequest(_message.Message):
    __slots__ = ("article_id",)
    ARTICLE_ID_FIELD_NUMBER: _ClassVar[int]
    article_id: str
    def __init__(self, article_id: _Optional[str] = ...) -> None: ...

class RemoveArticleResponse(_message.Message):
    __slots__ = ("status",)
    STATUS_FIELD_NUMBER: _ClassVar[int]
    status: str
    def __init__(self, status: _Optional[str] = ...) -> None: ...

class FindSimilarArticlesRequest(_message.Message):
    __slots__ = ("article_id", "limit", "similarity_threshold", "same_category_only")
    ARTICLE_ID_FIELD_NUMBER: _ClassVar[int]
    LIMIT_FIELD_NUMBER: _ClassVar[int]
    SIMILARITY_THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    SAME_CATEGORY_ONLY_FIELD_NUMBER: _ClassVar[int]
    article_id: str
    limit: int
    similarity_threshold: float
    same_category_only: bool
    def __init__(self, article_id: _Optional[str] = ..., limit: _Optional[int] = ..., similarity_threshold: _Optional[float] = ..., same_category_only: bool = ...) -> None: ...

class SimilarArticleHit(_message.Message):
    __slots__ = ("article_id", "abstract", "keywords", "category", "similarity")
    ARTICLE_ID_FIELD_NUMBER: _ClassVar[int]
    ABSTRACT_FIELD_NUMBER: _ClassVar[int]
    KEYWORDS_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FIELD_NUMBER: _ClassVar[int]
    SIMILARITY_FIELD_NUMBER: _ClassVar[int]
    article_id: str
    abstract: str
    keywords: str
    category: str
    similarity: float
    def __init__(self, article_id: _Optional[str] = ..., abstract: _Optional[str] = ..., keywords: _Optional[str] = ..., category: _Optional[str] = ..., similarity: _Optional[float] = ...) -> None: ...

class FindSimilarArticlesResponse(_message.Message):
    __slots__ = ("hits",)
    HITS_FIELD_NUMBER: _ClassVar[int]
    hits: _containers.RepeatedCompositeFieldContainer[SimilarArticleHit]
    def __init__(self, hits: _Optional[_Iterable[_Union[SimilarArticleHit, _Mapping]]] = ...) -> None: ...

class SemanticSearchRequest(_message.Message):
    __slots__ = ("query", "limit")
    QUERY_FIELD_NUMBER: _ClassVar[int]
    LIMIT_FIELD_NUMBER: _ClassVar[int]
    query: str
    limit: int
    def __init__(self, query: _Optional[str] = ..., limit: _Optional[int] = ...) -> None: ...

class SemanticSearchHit(_message.Message):
    __slots__ = ("article_id", "snippet", "score")
    ARTICLE_ID_FIELD_NUMBER: _ClassVar[int]
    SNIPPET_FIELD_NUMBER: _ClassVar[int]
    SCORE_FIELD_NUMBER: _ClassVar[int]
    article_id: str
    snippet: str
    score: float
    def __init__(self, article_id: _Optional[str] = ..., snippet: _Optional[str] = ..., score: _Optional[float] = ...) -> None: ...

class SemanticSearchResponse(_message.Message):
    __slots__ = ("hits",)
    HITS_FIELD_NUMBER: _ClassVar[int]
    hits: _containers.RepeatedCompositeFieldContainer[SemanticSearchHit]
    def __init__(self, hits: _Optional[_Iterable[_Union[SemanticSearchHit, _Mapping]]] = ...) -> None: ...

class SimilarityStatus(_message.Message):
    __slots__ = ("enabled", "chroma_path", "model_name", "default_threshold", "same_category_only")
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    CHROMA_PATH_FIELD_NUMBER: _ClassVar[int]
    MODEL_NAME_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    SAME_CATEGORY_ONLY_FIELD_NUMBER: _ClassVar[int]
    enabled: bool
    chroma_path: str
    model_name: str
    default_threshold: float
    same_category_only: bool
    def __init__(self, enabled: bool = ..., chroma_path: _Optional[str] = ..., model_name: _Optional[str] = ..., default_threshold: _Optional[float] = ..., same_category_only: bool = ...) -> None: ...

class GetSimilarityStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
