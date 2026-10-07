#!/usr/bin/env python3
"""Generate Bodo and Kashmiri catalogues with AI4Bharat IndicTrans2.

Google's translation product does not currently carry these two scheduled
languages. IndicTrans2 is MIT-licensed, built specifically for all 22 scheduled
Indian languages, and runs only as a maintainer tool; no model ships to users.
"""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parents[1]
MODEL_REPOSITORY = "remiai3/TRANSLATION_MODELS"
MODEL_SUBDIRECTORY = "indictrans2-en-indic-dist-200M-ONNX-int8"
TARGETS = {"brx": "brx_Deva", "ks": "kas_Arab"}
PROTECTED_TERMS = [
    "DukaanOS",
    "WhatsApp",
    "Supabase",
    "WebAuthn",
    "PBKDF2",
    "Content-Security-Policy",
    "UPI",
    "IFSC",
    "HSTS",
    "MIME",
    "CSV",
    "PDF",
    "GST",
    "SKU",
    "EAN-13",
    "EAN-8",
    "Code 128",
    "QR",
    "SMS",
    "PIN",
]
SLOT_PATTERN = re.compile(r"\{\{(\d+)\}\}")


def protect(source: str) -> tuple[str, list[str]]:
    value = source
    terms: list[str] = []
    for term in PROTECTED_TERMS:
        if term not in value:
            continue
        token = f"ZXQJT{len(terms)}JQXZ"
        value = value.replace(term, token)
        terms.append(term)
    return value, terms


def restore(translated: str, terms: list[str]) -> str:
    value = translated
    omitted: list[str] = []
    for index, term in enumerate(terms):
        token = re.compile(f"ZXQJT{index}JQXZ", re.IGNORECASE)
        if token.search(value):
            value = token.sub(term, value)
        else:
            omitted.append(term)
    value = " ".join(value.split()).strip()
    return f"{value} · {' · '.join(omitted)}" if omitted else value


def repair_slots(source: str, translated: str) -> str:
    expected = SLOT_PATTERN.findall(source)
    expected_set = set(expected)
    seen: set[str] = set()

    def keep_once(match: re.Match[str]) -> str:
        index = match.group(1)
        if index not in expected_set or index in seen:
            return ""
        seen.add(index)
        return match.group(0)

    value = SLOT_PATTERN.sub(keep_once, translated)
    value = " ".join(value.split()).strip()
    omitted = [index for index in expected if index not in seen]
    if omitted:
        value += " · " + " · ".join(f"{{{{{index}}}}}" for index in omitted)
    return value


def slot_signature(value: str) -> str:
    return ",".join(sorted(SLOT_PATTERN.findall(value)))


def main() -> None:
    source_catalogue = json.loads((ROOT / "locales" / "en.json").read_text())
    sources = sorted(source_catalogue, key=lambda item: item.casefold())
    protected = [protect(source) for source in sources]

    print(f"Downloading the public IndicTrans2 INT8 bundle for {len(sources)} phrases…", flush=True)
    snapshot = Path(
        snapshot_download(
            repo_id=MODEL_REPOSITORY,
            allow_patterns=[f"{MODEL_SUBDIRECTORY}/*"],
        )
    )
    model_directory = snapshot / MODEL_SUBDIRECTORY
    module_spec = importlib.util.spec_from_file_location(
        "dukaanos_indictrans_onnx",
        model_directory / "translate.py",
    )
    if module_spec is None or module_spec.loader is None:
        raise RuntimeError("Could not load the IndicTrans2 ONNX inference helper")
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    model = module.IndicTransONNX(model_directory)

    output_directory = ROOT / "public" / "locales"
    output_directory.mkdir(parents=True, exist_ok=True)

    for code, target in TARGETS.items():
        translated_all: list[str] = []
        for index, (value, _) in enumerate(protected, start=1):
            translated_all.append(
                model.translate(
                    value,
                    src_lang="eng_Latn",
                    tgt_lang=target,
                    max_new_tokens=256,
                )
            )
            if index % 50 == 0 or index == len(sources):
                print(f"[{code}] {index}/{len(sources)} phrases", flush=True)

        if len(translated_all) != len(sources):
            raise RuntimeError(f"[{code}] model returned {len(translated_all)}/{len(sources)} phrases")

        catalogue: dict[str, str] = {}
        changed = 0
        for index, source in enumerate(sources):
            translated = repair_slots(source, restore(translated_all[index], protected[index][1]))
            if not translated:
                raise RuntimeError(f"[{code}] empty translation for: {source}")
            if slot_signature(source) != slot_signature(translated):
                raise RuntimeError(f"[{code}] dynamic slots changed for: {source}\nReceived: {translated}")
            catalogue[source] = translated
            if source.casefold() != translated.casefold():
                changed += 1

        if changed / len(sources) < 0.55:
            raise RuntimeError(f"[{code}] only {changed}/{len(sources)} phrases changed")

        destination = output_directory / f"{code}.json"
        destination.write_text(json.dumps(catalogue, ensure_ascii=False, indent=2) + "\n")
        print(f"[{code}] wrote {len(sources)} phrases ({changed} translated)", flush=True)


if __name__ == "__main__":
    main()
