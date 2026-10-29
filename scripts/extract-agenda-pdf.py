"""Bounded, read-only PDF text extraction. No OCR, network, or AI."""
import io, json, resource, sys, time


def public_reader(data):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data), strict=True)
    # Official packets may have AES permissions encryption with no opening password.
    # Never guess or accept a supplied password; only publicly readable documents.
    if reader.is_encrypted and not reader.decrypt(""):
        raise ValueError("Password-protected PDF requires manual review")
    return reader


def extract(data, max_pages, max_text, max_expanded):
    started = time.monotonic()
    reader = public_reader(data)
    pages, remaining, expanded = [], max_text, 0
    for index, page in enumerate(reader.pages):
        if index >= max_pages or remaining <= 0:
            break
        contents = page.get_contents()
        if contents is not None:
            stream_size = len(contents.get_data())
            expanded += stream_size
            if stream_size > 8_000_000 or expanded > max_expanded:
                raise ValueError("Expanded PDF content ceiling exceeded")
        text = (page.extract_text() or "")[:remaining]
        pages.append({"page": index + 1, "text": text})
        remaining -= len(text)
    usage = resource.getrusage(resource.RUSAGE_SELF)
    return {"pages": pages, "totalPages": len(reader.pages),
            "truncated": len(pages) < len(reader.pages) or remaining <= 0,
            "metrics": {"wallMs": round((time.monotonic()-started)*1000),
                        "cpuSeconds": usage.ru_utime+usage.ru_stime,
                        "peakRSSBytes": usage.ru_maxrss*1024, "expandedBytes": expanded}}


def main():
    if sys.platform != "linux":
        raise RuntimeError("Bounded PDF extraction requires the Linux maintenance worker")
    profile = sys.argv[1] if len(sys.argv) > 1 else "standard"
    if profile not in ("standard", "planning50"):
        raise ValueError("Unknown PDF resource profile")
    large = profile == "planning50"
    max_bytes, max_pages, max_text = (50_000_000, 200, 1_000_000) if large else (2_000_000, 50, 120_000)
    cpu, memory, max_expanded = (45, 1024 * 1024 * 1024, 64_000_000) if large else (10, 512 * 1024 * 1024, 32_000_000)
    resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
    resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    data = sys.stdin.buffer.read(max_bytes + 1)
    if len(data) > max_bytes or not data.startswith(b"%PDF-"):
        raise ValueError("PDF input is missing or exceeds the document ceiling")
    print(json.dumps(extract(data, max_pages, max_text, max_expanded)))


if __name__ == "__main__":
    main()
