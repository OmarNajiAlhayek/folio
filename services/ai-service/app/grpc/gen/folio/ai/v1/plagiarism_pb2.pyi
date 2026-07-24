from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class DetectCorpusSimilarityRequest(_message.Message):
    __slots__ = ("submission_text", "threshold", "category")
    SUBMISSION_TEXT_FIELD_NUMBER: _ClassVar[int]
    THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FIELD_NUMBER: _ClassVar[int]
    submission_text: str
    threshold: float
    category: str
    def __init__(self, submission_text: _Optional[str] = ..., threshold: _Optional[float] = ..., category: _Optional[str] = ...) -> None: ...

class CorpusSimilarityMatch(_message.Message):
    __slots__ = ("submission_chunk_index", "submission_snippet", "source_article_id", "source_chunk_index", "matched_snippet", "similarity")
    SUBMISSION_CHUNK_INDEX_FIELD_NUMBER: _ClassVar[int]
    SUBMISSION_SNIPPET_FIELD_NUMBER: _ClassVar[int]
    SOURCE_ARTICLE_ID_FIELD_NUMBER: _ClassVar[int]
    SOURCE_CHUNK_INDEX_FIELD_NUMBER: _ClassVar[int]
    MATCHED_SNIPPET_FIELD_NUMBER: _ClassVar[int]
    SIMILARITY_FIELD_NUMBER: _ClassVar[int]
    submission_chunk_index: int
    submission_snippet: str
    source_article_id: str
    source_chunk_index: int
    matched_snippet: str
    similarity: float
    def __init__(self, submission_chunk_index: _Optional[int] = ..., submission_snippet: _Optional[str] = ..., source_article_id: _Optional[str] = ..., source_chunk_index: _Optional[int] = ..., matched_snippet: _Optional[str] = ..., similarity: _Optional[float] = ...) -> None: ...

class WebSimilarityMatch(_message.Message):
    __slots__ = ("query_snippet", "source_url", "matched_snippet", "similarity")
    QUERY_SNIPPET_FIELD_NUMBER: _ClassVar[int]
    SOURCE_URL_FIELD_NUMBER: _ClassVar[int]
    MATCHED_SNIPPET_FIELD_NUMBER: _ClassVar[int]
    SIMILARITY_FIELD_NUMBER: _ClassVar[int]
    query_snippet: str
    source_url: str
    matched_snippet: str
    similarity: float
    def __init__(self, query_snippet: _Optional[str] = ..., source_url: _Optional[str] = ..., matched_snippet: _Optional[str] = ..., similarity: _Optional[float] = ...) -> None: ...

class DetectCorpusSimilarityResponse(_message.Message):
    __slots__ = ("local_matches", "web_matches", "local_error", "web_error")
    LOCAL_MATCHES_FIELD_NUMBER: _ClassVar[int]
    WEB_MATCHES_FIELD_NUMBER: _ClassVar[int]
    LOCAL_ERROR_FIELD_NUMBER: _ClassVar[int]
    WEB_ERROR_FIELD_NUMBER: _ClassVar[int]
    local_matches: _containers.RepeatedCompositeFieldContainer[CorpusSimilarityMatch]
    web_matches: _containers.RepeatedCompositeFieldContainer[WebSimilarityMatch]
    local_error: str
    web_error: str
    def __init__(self, local_matches: _Optional[_Iterable[_Union[CorpusSimilarityMatch, _Mapping]]] = ..., web_matches: _Optional[_Iterable[_Union[WebSimilarityMatch, _Mapping]]] = ..., local_error: _Optional[str] = ..., web_error: _Optional[str] = ...) -> None: ...

class PlagiarismStatus(_message.Message):
    __slots__ = ("enabled",)
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    enabled: bool
    def __init__(self, enabled: bool = ...) -> None: ...

class GetPlagiarismStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
