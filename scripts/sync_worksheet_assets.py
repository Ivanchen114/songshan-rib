#!/usr/bin/env python3
"""Copy canonical weekly workbooks into the website and normalize PDF objects."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("weeks", nargs="+", type=int)
    args = parser.parse_args()
    site = Path(__file__).resolve().parents[1]
    course = Path(__file__).resolve().parents[2]
    target = site / "worksheets"

    for week in args.weeks:
        source_dir = course / f"W{week}"
        docx = source_dir / f"W{week}_學生歷程本_SOIL紙本.docx"
        pdf = source_dir / f"W{week}_學生歷程本_SOIL紙本.pdf"
        shutil.copy2(docx, target / f"W{week}.docx")

        reader = PdfReader(pdf)
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        writer.add_metadata({
            "/Title": f"閱讀理解與表達 W{week} 學生學習單",
            "/Author": "臺北市立松山高中",
            "/Subject": "閱讀理解與表達學生歷程本",
        })
        with (target / f"W{week}.pdf").open("wb") as handle:
            writer.write(handle)
        print(f"W{week}: DOCX + PDF synced")


if __name__ == "__main__":
    main()
