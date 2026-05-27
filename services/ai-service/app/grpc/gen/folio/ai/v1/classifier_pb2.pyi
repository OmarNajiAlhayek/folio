from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Iterable as _Iterable, Mapping as _Mapping, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class ClassifyArticleRequest(_message.Message):
    __slots__ = ("title", "keywords", "abstract")
    TITLE_FIELD_NUMBER: _ClassVar[int]
    KEYWORDS_FIELD_NUMBER: _ClassVar[int]
    ABSTRACT_FIELD_NUMBER: _ClassVar[int]
    title: str
    keywords: str
    abstract: str
    def __init__(self, title: _Optional[str] = ..., keywords: _Optional[str] = ..., abstract: _Optional[str] = ...) -> None: ...

class ClassifyAbstractRequest(_message.Message):
    __slots__ = ("abstract",)
    ABSTRACT_FIELD_NUMBER: _ClassVar[int]
    abstract: str
    def __init__(self, abstract: _Optional[str] = ...) -> None: ...

class ClassifyResponse(_message.Message):
    __slots__ = ("top_label", "top_confidence", "probabilities")
    class ProbabilitiesEntry(_message.Message):
        __slots__ = ("key", "value")
        KEY_FIELD_NUMBER: _ClassVar[int]
        VALUE_FIELD_NUMBER: _ClassVar[int]
        key: str
        value: float
        def __init__(self, key: _Optional[str] = ..., value: _Optional[float] = ...) -> None: ...
    TOP_LABEL_FIELD_NUMBER: _ClassVar[int]
    TOP_CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    PROBABILITIES_FIELD_NUMBER: _ClassVar[int]
    top_label: str
    top_confidence: float
    probabilities: _containers.ScalarMap[str, float]
    def __init__(self, top_label: _Optional[str] = ..., top_confidence: _Optional[float] = ..., probabilities: _Optional[_Mapping[str, float]] = ...) -> None: ...

class ClassifierStatus(_message.Message):
    __slots__ = ("enabled", "model_path", "device", "labels_count", "weights_loaded", "model_configured")
    ENABLED_FIELD_NUMBER: _ClassVar[int]
    MODEL_PATH_FIELD_NUMBER: _ClassVar[int]
    DEVICE_FIELD_NUMBER: _ClassVar[int]
    LABELS_COUNT_FIELD_NUMBER: _ClassVar[int]
    WEIGHTS_LOADED_FIELD_NUMBER: _ClassVar[int]
    MODEL_CONFIGURED_FIELD_NUMBER: _ClassVar[int]
    enabled: bool
    model_path: str
    device: str
    labels_count: int
    weights_loaded: bool
    model_configured: bool
    def __init__(self, enabled: bool = ..., model_path: _Optional[str] = ..., device: _Optional[str] = ..., labels_count: _Optional[int] = ..., weights_loaded: bool = ..., model_configured: bool = ...) -> None: ...

class ClassifierLabels(_message.Message):
    __slots__ = ("labels",)
    LABELS_FIELD_NUMBER: _ClassVar[int]
    labels: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, labels: _Optional[_Iterable[str]] = ...) -> None: ...

class GetClassifierStatusRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class GetClassifierLabelsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...
