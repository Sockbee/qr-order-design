#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <api-base-url> <staff-token> <staff-members.csv>" >&2
  exit 2
fi

api_base_url=${1%/}
staff_token=$2
staff_members_csv=$3

if [[ ! -f "$staff_members_csv" ]]; then
  echo "Staff members CSV not found: $staff_members_csv" >&2
  exit 2
fi

json_body=$(node -e 'const fs=require("fs"); process.stdout.write(JSON.stringify({csv:fs.readFileSync(process.argv[1],"utf8")}))' "$staff_members_csv")
curl --fail-with-body \
  -X POST \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${staff_token}" \
  --data "$json_body" \
  "${api_base_url}/api/v1/admin/staff-members/import"
