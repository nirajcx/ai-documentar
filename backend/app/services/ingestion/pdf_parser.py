"""PDF parsing runs in a disposable process with CPU, memory and wall-time limits."""

import json
import subprocess
import sys
from io import BytesIO

from pypdf import PdfReader

MAX_BYTES = 25 * 1024 * 1024
MAX_TEXT = 5_000_000


def extract_pages(pdf_bytes: bytes) -> list[tuple[int, str]]:
    if not pdf_bytes or len(pdf_bytes) > MAX_BYTES or not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("Upload a valid PDF no larger than 25 MB.")
    reader = PdfReader(BytesIO(pdf_bytes))
    if reader.is_encrypted:
        raise ValueError("Password-protected PDFs are not supported.")
    if not 1 <= len(reader.pages) <= 500:
        raise ValueError("PDF must contain between 1 and 500 pages.")
    pages = []
    total = 0
    for number, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        total += len(text)
        if total > MAX_TEXT:
            raise ValueError("PDF extracted text exceeds the processing limit.")
        pages.append((number, text))
    return pages


def parse_safely(data: bytes) -> list[tuple[int, str]]:
    try:
        result = subprocess.run(
            [sys.executable, "-m", "app.services.ingestion.pdf_parser"],
            input=data,
            capture_output=True,
            timeout=60,
            check=True,
        )
        return [(n, text) for n, text in json.loads(result.stdout)]
    except (subprocess.SubprocessError, ValueError) as exc:
        raise ValueError("PDF is invalid, encrypted, or exceeds parsing limits.") from exc


if __name__ == "__main__":
    import resource

    resource.setrlimit(resource.RLIMIT_CPU, (45, 45))
    # Linux supports address-space limits reliably; macOS does not.
    if sys.platform == "linux":
        resource.setrlimit(resource.RLIMIT_AS, (1024**3, 1024**3))
    print(json.dumps(extract_pages(sys.stdin.buffer.read(MAX_BYTES + 1))))
