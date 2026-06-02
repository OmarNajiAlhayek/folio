from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class CheckReferencesRequest(_message.Message):
    __slots__ = ("reference_list", "inline_citations")
    REFERENCE_LIST_FIELD_NUMBER: _ClassVar[int]
    INLINE_CITATIONS_FIELD_NUMBER: _ClassVar[int]
    reference_list: _containers.RepeatedScalarFieldContainer[str]
    inline_citations: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, reference_list: _Optional[_Iterable[str]] = ..., inline_citations: _Optional[_Iterable[str]] = ...) -> None: ...

class CheckReferencesResponse(_message.Message):
    __slots__ = ("issues",)
    ISSUES_FIELD_NUMBER: _ClassVar[int]
    issues: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, issues: _Optional[_Iterable[str]] = ...) -> None: ...

class CopyeditStatus(_message.Message):
    __slots__ = ("enabled",)
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    enabled: bool
    def __init__(self, enabled: bool = ...) -> None: ...

class GetCopyeditStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
