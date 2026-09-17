"""Link published artwork to existing menus. Dry run unless --apply is supplied.

Uses the operator's ADC and the existing DB password in Secret Manager. Does not
create staff credentials or change prices, availability, or other menu fields.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.request import urlopen
import uuid

from google.cloud.sql.connector import Connector


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--environment", choices=["staging", "prod"], required=True)
    parser.add_argument("--region", default="asia-northeast3")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--menus", nargs="+", help="Link only these menu IDs")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    manifest = json.loads((root / "assets/menu/manifest.json").read_text())
    if args.menus:
        unknown = set(args.menus) - {entry["menuId"] for entry in manifest}
        if unknown:
            raise SystemExit(f"Unknown menu IDs: {sorted(unknown)}")
        manifest = [entry for entry in manifest if entry["menuId"] in args.menus]
    base = f"https://storage.googleapis.com/{args.project}-{args.environment}-menu-assets/menus/"
    ids = [entry["menuId"] for entry in manifest]
    if not ids or len(set(ids)) != len(ids):
        raise SystemExit("Manifest must contain unique menu IDs")
    for entry in manifest:
        if not re.fullmatch(r"[a-z0-9-]+/[a-f0-9]{16}\.webp", entry["path"]):
            raise SystemExit("Invalid image path")
        with urlopen(base + entry["path"], timeout=30) as response:
            if response.headers.get_content_type() != "image/webp":
                raise SystemExit(f"Unexpected content type: {entry['menuId']}")
            if hashlib.sha256(response.read()).hexdigest() != entry["sha256"]:
                raise SystemExit(f"Published image checksum mismatch: {entry['menuId']}")

    password = subprocess.check_output([
        "gcloud", "secrets", "versions", "access", "latest", f"--project={args.project}",
        f"--secret=qr-order-{args.environment}-db-password",
    ], text=True).rstrip("\n")
    with Connector(refresh_strategy="LAZY") as connector:
        connection = connector.connect(
            f"{args.project}:{args.region}:qr-order-{args.environment}", "pg8000",
            user="qr_order", password=password, db="qr_order", timeout=30,
        )
        try:
            cursor = connection.cursor()
            cursor.execute("SET LOCAL lock_timeout = '5s'")
            cursor.execute("SET LOCAL statement_timeout = '30s'")
            placeholders = ",".join(["%s"] * len(ids))
            cursor.execute(
                f"SELECT menu_id,name,image_url FROM menus WHERE menu_id IN ({placeholders}) ORDER BY menu_id FOR UPDATE",
                ids,
            )
            rows = {row[0]: row for row in cursor.fetchall()}
            if rows.keys() != set(ids):
                raise RuntimeError(f"Missing menu IDs: {sorted(set(ids) - rows.keys())}")
            changes = []
            for entry in manifest:
                menu_id, name, previous = rows[entry["menuId"]]
                url = base + entry["path"]
                if previous == url:
                    continue
                if previous and not previous.startswith(base):
                    raise RuntimeError(f"{menu_id} already has an image outside this managed bucket; inspect it before replacing")
                changes.append({"menuId": menu_id, "name": name, "before": previous, "after": url})
            print(json.dumps({"apply": args.apply, "changes": changes}, ensure_ascii=False, indent=2))
            if not args.apply or not changes:
                connection.rollback()
                return
            backup = root / ".local-data" / f"menu-images-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%fZ}.json"
            backup.parent.mkdir(parents=True, exist_ok=True)
            backup.write_text(json.dumps({"project": args.project, "environment": args.environment, "changes": changes}, ensure_ascii=False, indent=2) + "\n")
            for change in changes:
                cursor.execute("UPDATE menus SET image_url=%s,updated_at=now() WHERE menu_id=%s", (change["after"], change["menuId"]))
                cursor.execute("""
                    INSERT INTO audit_logs(log_id,actor_type,actor_id,action,entity_type,entity_id,from_value,to_value)
                    VALUES(%s,'SYSTEM','menu-images-deploy','MENU_IMAGE_UPDATED','MENU',%s,%s,%s)
                    """, (str(uuid.uuid4()), change["menuId"], change["before"], change["after"]))
                cursor.execute("""
                    INSERT INTO domain_events(event_id,event_type,entity_id,revision,payload)
                    VALUES(nextval('domain_events_event_id_seq'),'menu.updated',%s,currval('domain_events_event_id_seq'),
                           '{"action":"MENU_IMAGE_UPDATED"}'::jsonb) RETURNING event_id
                    """, (change["menuId"],))
                event_id = cursor.fetchone()[0]
                cursor.execute("SELECT pg_notify('qr_order_events',%s)", (str(event_id),))
            connection.commit()
            print(f"Linked {len(changes)} menu images. Previous URLs: {backup}")
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()


if __name__ == "__main__":
    main()
