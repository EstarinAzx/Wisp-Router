"""Read-only source evidence for the Traycer host build investigated in #217.

No host code is executed. Only its constant string table is decoded. This is a
version-pinned inspection aid, not a compatibility or GUI acceptance test.
"""

import argparse
import ast
import hashlib
import json
from pathlib import Path
import re


HOST_SHA256 = "53c6cbb6035116dda4c8b5f7777c44cedde79584ac61e13580221c9bd398155c"


def decode(binary):
    if hashlib.sha256(binary).hexdigest() != HOST_SHA256:
        raise ValueError("Unrecognized host build; repeat the investigation for this version.")
    start = binary.index(b"'use strict';const e3w=k;")
    length = int.from_bytes(binary[start - 8:start], "little")
    source = binary[start:start + length].decode("utf-8")
    begin = source.index("function Z(){const uVx=") + len("function Z(){const uVx=")
    end = source.index("];Z=function()", begin) + 1
    strings = ast.literal_eval(source[begin:end])
    # The pinned bundle's initial rotation expression resolves to 223. Check it
    # independently before replacing references; never run the bundle or eval JS.
    lookup = lambda index: strings[(index - 0x72 + 223) % len(strings)]
    number = lambda index: int(re.match(r"^[+-]?\d+", lookup(index))[0])
    rotation_check = (
        number(0x815f) * (number(0x38b4) / 2) - number(0xa1c1) / 3
        + number(0x2dc9) / 4 - number(0x108b7) / 5 - number(0xabcf) / 6
        + number(0x1135c) / 7 * (-number(0x1036e) / 8) + number(0x3389) / 9
    )
    assert rotation_check == 0x37c21 and lookup(0x1860) == "node:url"
    aliases = {"e3w", "k"}
    assignments = re.findall(r"\b(\w+)\s*=\s*(\w+)\b", source)
    while True:
        expanded = aliases | {left for left, right in assignments if right in aliases}
        if expanded == aliases:
            break
        aliases = expanded
    source = source[:begin] + "[]" + source[end:]
    source = re.sub(
        r"\b(\w+)\((0x[0-9a-f]+)\)",
        lambda m: json.dumps(lookup(int(m[2], 16))) if m[1] in aliases else m[0],
        source,
    )
    source = re.sub(
        r"\\x([0-9a-fA-F]{2})",
        lambda m: chr(int(m[1], 16)) if 32 <= int(m[1], 16) < 127
        and int(m[1], 16) not in (34, 39, 92) else m[0],
        source,
    )
    assert '"model/list"' in source and '"connectWithSpawnEnv"' in source
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("host_exe", type=Path)
    parser.add_argument("--find", help="Literal decoded-source anchor to inspect (all matches).")
    args = parser.parse_args()
    try:
        source = decode(args.host_exe.read_bytes())
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")
    anchors = [args.find] if args.find is not None else [
        'async["listModels"](Q){const iFJ=', 'q4A=d["object"]',
        'async["listModels"](Q,q)', 'function XQI(',
        'function q9t(', 'async function UC(', 'async function OEo(',
        'async function Deo(', 'async function qSo(',
        'async["connectOnce"]', 'let G=[...BXe()', '"thread/start",',
    ]
    if any(not anchor or anchor not in source for anchor in anchors):
        parser.exit(1, "An evidence anchor is missing or empty.\n")
    print(json.dumps({"host_sha256": HOST_SHA256, "verdict": "STATIC EVIDENCE ONLY"}))
    for anchor in anchors:
        for match in re.finditer(re.escape(anchor), source):
            offset = match.start()
            print(json.dumps({"anchor": anchor, "decoded_character_offset": offset,
                              "excerpt": source[offset:offset + 1800]}))


if __name__ == "__main__":
    main()
