from dataclasses import dataclass

PROCESSING_VERSION = "page-char-v1"


@dataclass
class Chunk:
    position: int
    page_start: int
    page_end: int
    content: str


def chunk_pages(pages: list[tuple[int, str]], size=1800, overlap=250) -> list[Chunk]:
    """Character windows, kept within a PDF page; positions and pages are one-based."""
    if size <= 0 or not 0 <= overlap < size:
        raise ValueError("Overlap must be nonnegative and smaller than chunk size")
    result = []
    for number, raw in pages:
        text = " ".join(raw.split())
        start = 0
        while start < len(text):
            end = min(start + size, len(text))
            result.append(Chunk(len(result) + 1, number, number, text[start:end]))
            if end == len(text):
                break
            start = end - overlap
    return result
