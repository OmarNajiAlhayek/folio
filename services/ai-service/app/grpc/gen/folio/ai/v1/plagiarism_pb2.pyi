from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class DetectCorpusSimilarityRequest(_message.Message):
    __slots__ = ("submission_text", "threshold", "category", "submission_id")
    SUBMISSION_TEXT_FIELD_NUMBER: _ClassVar[int]
    THRESHOLD_FIELD_NUMBER: _ClassVar[int]
    CATEGORY_FIELD_NUMBER: _ClassVar[int]
    SUBMISSION_ID_FIELD_NUMBER: _ClassVar[int]
    submission_text: str
    threshold: float
    category: str
    submission_id: str
    def __init__(self, submission_text: _Optional[str] = ..., threshold: _Optional[float] = ..., category: _Optional[str] = ..., submission_id: _Optional[str] = ...) -> None: ...

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

class ExactMatchSpan(_message.Message):
    __slots__ = ("submission_start_token", "submission_end_token", "submission_snippet", "matched_snippet", "token_length", "quoted")
    SUBMISSION_START_TOKEN_FIELD_NUMBER: _ClassVar[int]
    SUBMISSION_END_TOKEN_FIELD_NUMBER: _ClassVar[int]
    SUBMISSION_SNIPPET_FIELD_NUMBER: _ClassVar[int]
    MATCHED_SNIPPET_FIELD_NUMBER: _ClassVar[int]
    TOKEN_LENGTH_FIELD_NUMBER: _ClassVar[int]
    QUOTED_FIELD_NUMBER: _ClassVar[int]
    submission_start_token: int
    submission_end_token: int
    submission_snippet: str
    matched_snippet: str
    token_length: int
    quoted: bool
    def __init__(self, submission_start_token: _Optional[int] = ..., submission_end_token: _Optional[int] = ..., submission_snippet: _Optional[str] = ..., matched_snippet: _Optional[str] = ..., token_length: _Optional[int] = ..., quoted: bool = ...) -> None: ...

class ExactMatchSource(_message.Message):
    __slots__ = ("doc_id", "source_kind", "source_ref", "title", "source_url", "submission_id", "matched_tokens", "overlap_ratio", "spans")
    DOC_ID_FIELD_NUMBER: _ClassVar[int]
    SOURCE_KIND_FIELD_NUMBER: _ClassVar[int]
    SOURCE_REF_FIELD_NUMBER: _ClassVar[int]
    TITLE_FIELD_NUMBER: _ClassVar[int]
    SOURCE_URL_FIELD_NUMBER: _ClassVar[int]
    SUBMISSION_ID_FIELD_NUMBER: _ClassVar[int]
    MATCHED_TOKENS_FIELD_NUMBER: _ClassVar[int]
    OVERLAP_RATIO_FIELD_NUMBER: _ClassVar[int]
    SPANS_FIELD_NUMBER: _ClassVar[int]
    doc_id: str
    source_kind: str
    source_ref: str
    title: str
    source_url: str
    submission_id: str
    matched_tokens: int
    overlap_ratio: float
    spans: _containers.RepeatedCompositeFieldContainer[ExactMatchSpan]
    def __init__(self, doc_id: _Optional[str] = ..., source_kind: _Optional[str] = ..., source_ref: _Optional[str] = ..., title: _Optional[str] = ..., source_url: _Optional[str] = ..., submission_id: _Optional[str] = ..., matched_tokens: _Optional[int] = ..., overlap_ratio: _Optional[float] = ..., spans: _Optional[_Iterable[_Union[ExactMatchSpan, _Mapping]]] = ...) -> None: ...

class ExactMatchReport(_message.Message):
    __slots__ = ("total_tokens", "matched_tokens", "overall_ratio", "quoted_tokens", "reference_tokens_skipped", "sources")
    TOTAL_TOKENS_FIELD_NUMBER: _ClassVar[int]
    MATCHED_TOKENS_FIELD_NUMBER: _ClassVar[int]
    OVERALL_RATIO_FIELD_NUMBER: _ClassVar[int]
    QUOTED_TOKENS_FIELD_NUMBER: _ClassVar[int]
    REFERENCE_TOKENS_SKIPPED_FIELD_NUMBER: _ClassVar[int]
    SOURCES_FIELD_NUMBER: _ClassVar[int]
    total_tokens: int
    matched_tokens: int
    overall_ratio: float
    quoted_tokens: int
    reference_tokens_skipped: int
    sources: _containers.RepeatedCompositeFieldContainer[ExactMatchSource]
    def __init__(self, total_tokens: _Optional[int] = ..., matched_tokens: _Optional[int] = ..., overall_ratio: _Optional[float] = ..., quoted_tokens: _Optional[int] = ..., reference_tokens_skipped: _Optional[int] = ..., sources: _Optional[_Iterable[_Union[ExactMatchSource, _Mapping]]] = ...) -> None: ...

class DetectCorpusSimilarityResponse(_message.Message):
    __slots__ = ("local_matches", "web_matches", "local_error", "web_error", "exact_matches", "exact_error")
    LOCAL_MATCHES_FIELD_NUMBER: _ClassVar[int]
    WEB_MATCHES_FIELD_NUMBER: _ClassVar[int]
    LOCAL_ERROR_FIELD_NUMBER: _ClassVar[int]
    WEB_ERROR_FIELD_NUMBER: _ClassVar[int]
    EXACT_MATCHES_FIELD_NUMBER: _ClassVar[int]
    EXACT_ERROR_FIELD_NUMBER: _ClassVar[int]
    local_matches: _containers.RepeatedCompositeFieldContainer[CorpusSimilarityMatch]
    web_matches: _containers.RepeatedCompositeFieldContainer[WebSimilarityMatch]
    local_error: str
    web_error: str
    exact_matches: ExactMatchReport
    exact_error: str
    def __init__(self, local_matches: _Optional[_Iterable[_Union[CorpusSimilarityMatch, _Mapping]]] = ..., web_matches: _Optional[_Iterable[_Union[WebSimilarityMatch, _Mapping]]] = ..., local_error: _Optional[str] = ..., web_error: _Optional[str] = ..., exact_matches: _Optional[_Union[ExactMatchReport, _Mapping]] = ..., exact_error: _Optional[str] = ...) -> None: ...

class PlagiarismStatus(_message.Message):
    __slots__ = ("enabled",)
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    enabled: bool
    def __init__(self, enabled: bool = ...) -> None: ...

class GetPlagiarismStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
