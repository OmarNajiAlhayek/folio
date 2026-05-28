from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class SuggestKeywordsRequest(_message.Message):
    __slots__ = ("title", "abstract", "title_ar", "abstract_ar")
    TITLE_FIELD_NUMBER: _ClassVar[int]
    ABSTRACT_FIELD_NUMBER: _ClassVar[int]
    TITLE_AR_FIELD_NUMBER: _ClassVar[int]
    ABSTRACT_AR_FIELD_NUMBER: _ClassVar[int]
    title: str
    abstract: str
    title_ar: str
    abstract_ar: str
    def __init__(self, title: _Optional[str] = ..., abstract: _Optional[str] = ..., title_ar: _Optional[str] = ..., abstract_ar: _Optional[str] = ...) -> None: ...

class SuggestKeywordsResponse(_message.Message):
    __slots__ = ("keywords_en", "keywords_ar")
    KEYWORDS_EN_FIELD_NUMBER: _ClassVar[int]
    KEYWORDS_AR_FIELD_NUMBER: _ClassVar[int]
    keywords_en: _containers.RepeatedScalarFieldContainer[str]
    keywords_ar: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, keywords_en: _Optional[_Iterable[str]] = ..., keywords_ar: _Optional[_Iterable[str]] = ...) -> None: ...

class KeywordStatus(_message.Message):
    __slots__ = ("enabled",)
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    enabled: bool
    def __init__(self, enabled: bool = ...) -> None: ...

class GetKeywordStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
