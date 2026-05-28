from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ReviewerProfile(_message.Message):
    __slots__ = ("reviewer_id", "affiliation", "review_keywords", "display_name")
    REVIEWER_ID_FIELD_NUMBER: _ClassVar[int]
    AFFILIATION_FIELD_NUMBER: _ClassVar[int]
    REVIEW_KEYWORDS_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    reviewer_id: str
    affiliation: str
    review_keywords: str
    display_name: str
    def __init__(self, reviewer_id: _Optional[str] = ..., affiliation: _Optional[str] = ..., review_keywords: _Optional[str] = ..., display_name: _Optional[str] = ...) -> None: ...

class ReviewHistoryRow(_message.Message):
    __slots__ = ("reviewer_id", "submission_id", "abstract", "keywords")
    REVIEWER_ID_FIELD_NUMBER: _ClassVar[int]
    SUBMISSION_ID_FIELD_NUMBER: _ClassVar[int]
    ABSTRACT_FIELD_NUMBER: _ClassVar[int]
    KEYWORDS_FIELD_NUMBER: _ClassVar[int]
    reviewer_id: str
    submission_id: str
    abstract: str
    keywords: str
    def __init__(self, reviewer_id: _Optional[str] = ..., submission_id: _Optional[str] = ..., abstract: _Optional[str] = ..., keywords: _Optional[str] = ...) -> None: ...

class SuggestReviewersRequest(_message.Message):
    __slots__ = ("query_text", "limit", "candidate_ids", "exclude_reviewer_ids", "index_profiles", "index_history", "use_cross_encoder")
    QUERY_TEXT_FIELD_NUMBER: _ClassVar[int]
    LIMIT_FIELD_NUMBER: _ClassVar[int]
    CANDIDATE_IDS_FIELD_NUMBER: _ClassVar[int]
    EXCLUDE_REVIEWER_IDS_FIELD_NUMBER: _ClassVar[int]
    INDEX_PROFILES_FIELD_NUMBER: _ClassVar[int]
    INDEX_HISTORY_FIELD_NUMBER: _ClassVar[int]
    USE_CROSS_ENCODER_FIELD_NUMBER: _ClassVar[int]
    query_text: str
    limit: int
    candidate_ids: _containers.RepeatedScalarFieldContainer[str]
    exclude_reviewer_ids: _containers.RepeatedScalarFieldContainer[str]
    index_profiles: _containers.RepeatedCompositeFieldContainer[ReviewerProfile]
    index_history: _containers.RepeatedCompositeFieldContainer[ReviewHistoryRow]
    use_cross_encoder: bool
    def __init__(self, query_text: _Optional[str] = ..., limit: _Optional[int] = ..., candidate_ids: _Optional[_Iterable[str]] = ..., exclude_reviewer_ids: _Optional[_Iterable[str]] = ..., index_profiles: _Optional[_Iterable[_Union[ReviewerProfile, _Mapping]]] = ..., index_history: _Optional[_Iterable[_Union[ReviewHistoryRow, _Mapping]]] = ..., use_cross_encoder: bool = ...) -> None: ...

class ReviewerSuggestionHit(_message.Message):
    __slots__ = ("reviewer_id", "final_score", "bio_score", "history_score", "ce_bio_score", "ce_history_score", "used_cross_encoder")
    REVIEWER_ID_FIELD_NUMBER: _ClassVar[int]
    FINAL_SCORE_FIELD_NUMBER: _ClassVar[int]
    BIO_SCORE_FIELD_NUMBER: _ClassVar[int]
    HISTORY_SCORE_FIELD_NUMBER: _ClassVar[int]
    CE_BIO_SCORE_FIELD_NUMBER: _ClassVar[int]
    CE_HISTORY_SCORE_FIELD_NUMBER: _ClassVar[int]
    USED_CROSS_ENCODER_FIELD_NUMBER: _ClassVar[int]
    reviewer_id: str
    final_score: float
    bio_score: float
    history_score: float
    ce_bio_score: float
    ce_history_score: float
    used_cross_encoder: bool
    def __init__(self, reviewer_id: _Optional[str] = ..., final_score: _Optional[float] = ..., bio_score: _Optional[float] = ..., history_score: _Optional[float] = ..., ce_bio_score: _Optional[float] = ..., ce_history_score: _Optional[float] = ..., used_cross_encoder: bool = ...) -> None: ...

class SuggestReviewersResponse(_message.Message):
    __slots__ = ("hits",)
    HITS_FIELD_NUMBER: _ClassVar[int]
    hits: _containers.RepeatedCompositeFieldContainer[ReviewerSuggestionHit]
    def __init__(self, hits: _Optional[_Iterable[_Union[ReviewerSuggestionHit, _Mapping]]] = ...) -> None: ...
