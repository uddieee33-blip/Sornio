#!/usr/bin/env python3
"""Generate Bodo and Kashmiri catalogues with AI4Bharat IndicTrans2.

Google's translation product does not currently carry these two scheduled
languages. IndicTrans2 is MIT-licensed, built specifically for all 22 scheduled
Indian languages, and runs only as a maintainer tool; no model ships to users.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import torch
from IndicTransToolkit import IndicProcessor
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
# Public, byte-identical mirror of AI4Bharat's gated checkpoint. The model card
# and config retain the original attribution and MIT licence.
MODEL_NAME = "Raghavan/indictrans2-en-indic-dist-200M"
BATCH_SIZE = int(os.environ.get("INDIC_BATCH_SIZE", "12"))
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

    torch.set_num_threads(max(1, os.cpu_count() or 2))
    print(f"Loading {MODEL_NAME} for {len(sources)} phrases…", flush=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME, trust_remote_code=True)
    model.eval()
    processor = IndicProcessor(inference=True)

    output_directory = ROOT / "public" / "locales"
    output_directory.mkdir(parents=True, exist_ok=True)

    for code, target in TARGETS.items():
        translated_all: list[str] = []
        batch_count = (len(sources) + BATCH_SIZE - 1) // BATCH_SIZE
        for start in range(0, len(sources), BATCH_SIZE):
            batch_number = start // BATCH_SIZE + 1
            batch = [item[0] for item in protected[start : start + BATCH_SIZE]]
            prepared = processor.preprocess_batch(
                batch,
                src_lang="eng_Latn",
                tgt_lang=target,
                visualize=False,
            )
            inputs = tokenizer(
                prepared,
                padding="longest",
                truncation=True,
                max_length=256,
                return_tensors="pt",
            )
            with torch.inference_mode():
                generated = model.generate(
                    **inputs,
                    use_cache=True,
                    min_length=0,
                    max_length=256,
                    num_beams=1,
                    num_return_sequences=1,
                )
            decoded = tokenizer.batch_decode(
                generated,
                skip_special_tokens=True,
                clean_up_tokenization_spaces=True,
            )
            translated_all.extend(processor.postprocess_batch(decoded, lang=target))
            if batch_number % 10 == 0 or batch_number == batch_count:
                print(f"[{code}] {batch_number}/{batch_count} batches", flush=True)

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
