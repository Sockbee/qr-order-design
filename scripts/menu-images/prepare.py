"""Encode the supplied menu artwork as WebP; preserve originals and aspect ratios."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import unicodedata

from PIL import Image

SOURCES = {
    "계란찜.png": "cheese-egg-custard",
    "닭발.png": "chicken-feet",
    "떡볶이.png": "tteokbokki-egg-fried-set",
    "마른안주.png": "dried-snack-platter",
    "믹스커피.png": "mix-coffee-highball",
    "바나나우유.png": "banana-milk-highball",
    "식혜.png": "frozen-sikhye",
    "얼박사.png": "eolbaksa",
    "제육.png": "spicy-pork",
    "주먹밥.png": "tuna-mayo-rice-ball",
    "짜계치.png": "jjapagetti-egg-cheese",
    "팥빙수.png": "red-bean-bingsu",
    "해장미역국밥.png": "seaweed-soup-rice",
    "소주.png": "soju",
    "맥주.png": "beer",
    "콜라.png": "cola",
    "사이다.png": "cider",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--menus", nargs="+", choices=sorted(SOURCES.values()),
                        help="Prepare only these menu IDs; otherwise use known images present in source")
    args = parser.parse_args()
    destination = Path(__file__).resolve().parents[2] / "assets/menu"
    source_files = {unicodedata.normalize("NFC", p.name): p for p in args.source.glob("*.png")}
    selected = {name: menu_id for name, menu_id in SOURCES.items()
                if menu_id in args.menus} if args.menus else {
                    name: menu_id for name, menu_id in SOURCES.items() if name in source_files}
    if not selected:
        raise SystemExit("No known menu images found")
    missing = selected.keys() - source_files.keys()
    if missing:
        raise SystemExit(f"Missing source images: {sorted(missing)}")
    manifest_path = destination / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    prepared = []
    for filename, menu_id in selected.items():
        source = source_files[filename]
        with Image.open(source) as original:
            rgba = original.convert("RGBA")
            encoded = io.BytesIO()
            rgba.save(encoded, "WEBP", quality=88, method=6, exact=True)
            data = encoded.getvalue()
            digest = hashlib.sha256(data).hexdigest()
            relative = f"{menu_id}/{digest[:16]}.webp"
            output = destination / relative
            output.parent.mkdir(parents=True, exist_ok=True)
            if output.exists() and output.read_bytes() != data:
                raise SystemExit(f"Content hash collision: {output}")
            output.write_bytes(data)
            with Image.open(output) as verified:
                assert verified.size == original.size
                assert verified.convert("RGBA").getchannel("A").tobytes() == rgba.getchannel("A").tobytes()
            prepared.append({
                "menuId": menu_id, "source": filename, "path": relative,
                "width": original.width, "height": original.height,
                "bytes": len(data), "sourceBytes": source.stat().st_size, "sha256": digest,
            })
    replacements = {entry["menuId"]: entry for entry in prepared}
    manifest = [replacements.pop(entry["menuId"], entry) for entry in manifest]
    manifest.extend(replacements.values())
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"Prepared {len(prepared)} images: {sum(m['sourceBytes'] for m in prepared):,} → {sum(m['bytes'] for m in prepared):,} bytes; manifest contains {len(manifest)} menus")


if __name__ == "__main__":
    main()
