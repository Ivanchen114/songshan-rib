#!/usr/bin/env python3
"""Audit W1-W18 downloadable DOCX/PDF assets for classroom-safe publishing."""

from __future__ import annotations

import argparse
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from pypdf import PdfReader


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A4 = (595.28, 841.89)


def audit_docx(path: Path) -> list[str]:
    errors: list[str] = []
    required = {"[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml"}
    try:
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
            if bad:
                errors.append(f"DOCX CRC failed: {bad}")
            missing = required - set(archive.namelist())
            if missing:
                errors.append(f"DOCX missing: {sorted(missing)}")
            if not missing:
                ET.fromstring(archive.read("[Content_Types].xml"))
                ET.fromstring(archive.read("_rels/.rels"))
                ET.fromstring(archive.read("word/document.xml"))
                styles = ET.fromstring(archive.read("word/styles.xml"))
                normal = styles.find(f".//{{{W_NS}}}style[@{{{W_NS}}}styleId='Normal']")
                if normal is None:
                    errors.append("DOCX has no Normal base style")
    except (zipfile.BadZipFile, ET.ParseError) as exc:
        errors.append(f"DOCX structure error: {exc}")
    return errors


def audit_pdf(path: Path) -> list[str]:
    errors: list[str] = []
    reader = PdfReader(path)
    if not reader.pages:
        return ["PDF has no pages"]
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    radicals = sum(0x2F00 <= ord(char) <= 0x2FDF for char in text)
    if radicals:
        errors.append(f"PDF contains {radicals} Kangxi-radical code points")
    if "\ufffd" in text:
        errors.append("PDF contains Unicode replacement characters")
    if len(text.strip()) < 40:
        errors.append("PDF text layer is unexpectedly short")
    for number, page in enumerate(reader.pages, 1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        if abs(width - A4[0]) > 1 or abs(height - A4[1]) > 1:
            errors.append(f"PDF page {number} is not A4: {width:.2f} x {height:.2f} pt")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", nargs="?", type=Path, default=Path(__file__).resolve().parents[1] / "worksheets")
    args = parser.parse_args()
    failures = 0
    for week in range(1, 19):
        week_errors: list[str] = []
        for extension, audit in (("docx", audit_docx), ("pdf", audit_pdf)):
            path = args.directory / f"W{week}.{extension}"
            if not path.is_file():
                week_errors.append(f"missing {path.name}")
            else:
                week_errors.extend(audit(path))
        if week_errors:
            failures += 1
            print(f"W{week}: FAIL")
            for error in week_errors:
                print(f"  - {error}")
        else:
            print(f"W{week}: PASS")
    if failures:
        raise SystemExit(f"worksheet audit failed for {failures} week(s)")
    print("worksheet audit passed: 18 DOCX + 18 PDF")


if __name__ == "__main__":
    main()
