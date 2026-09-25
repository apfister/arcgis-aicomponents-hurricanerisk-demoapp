"""Publish one pinned-source Artifact; never configure or activate traffic."""
import hashlib
import json
import os
import subprocess
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID

ORIGIN = "https://nglabs.esrigcazure.com"
SOURCE = "abb7d335572bcb1d7118205228b99de8176b0caf"
APP = "2a9acadc-9644-4cfe-8343-c77079126034"
SLUG = "arcgis-aicomponents-hurricanerisk-demoapp"
RETAINED_DIGEST = "4e9b759af02fb206eca93d32e40220226d202d8de3f76faa01e322f74068c057"


def main():
    if (
        os.environ["NGL_SOURCE_COMMIT"] != SOURCE
        or os.environ["NGL_APPLICATION_ID"] != APP
        or os.environ["GITHUB_REF"] != "refs/heads/nglabs-hosting"
        or os.environ["GITHUB_REPOSITORY"] != f"apfister/{SLUG}"
    ):
        raise RuntimeError("Reviewed publication identity changed")
    publisher = str(UUID(os.environ["NGL_PUBLISHER_ID"]))
    source = Path("reviewed-source")
    revision = subprocess.run(
        ["git", "-C", str(source), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    if revision != SOURCE:
        raise RuntimeError("Reviewed application source changed")
    retained = Path("ngl-retained")
    original = json.loads((retained / "build-proof.json").read_text())
    expected = {
        "application_id": APP, "publisher_id": publisher,
        "source_repository": f"apfister/{SLUG}", "source_commit": SOURCE,
        "workflow_commit": "5412c4b7dbeac4f8a7b8429214517f20e5b12fd2",
        "run_id": "36150471752", "run_attempt": "1", "base_path": "/",
        "artifact_sha256": RETAINED_DIGEST, "artifact_bytes": 6538859,
    }
    if any(original.get(name) != value for name, value in expected.items()):
        raise RuntimeError("Retained build identity changed; no rebuild is permitted")
    archive_name = f"{SLUG}-{SOURCE[:12]}.tar.gz"
    retained_archive = retained / archive_name
    if retained_archive.is_symlink() or retained_archive.stat().st_size != 6538859:
        raise RuntimeError("Retained Artifact file changed")
    body = retained_archive.read_bytes()
    digest = hashlib.sha256(body).hexdigest()
    if digest != RETAINED_DIGEST:
        raise RuntimeError("Retained Artifact digest changed")
    output = Path("ngl-publication")
    output.mkdir(mode=0o700)
    archive = output / archive_name
    archive.write_bytes(body)
    (output / "original-build-proof.json").write_text(json.dumps(original, indent=2) + "\n")
    archive.with_suffix(archive.suffix + ".sha256").write_text(f"{digest}  {archive.name}\n")
    proof = {
        "application_id": APP, "publisher_id": publisher,
        "source_repository": os.environ["GITHUB_REPOSITORY"], "source_commit": SOURCE,
        "workflow_commit": os.environ["GITHUB_SHA"], "ref": os.environ["GITHUB_REF"],
        "run_id": os.environ["GITHUB_RUN_ID"], "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"],
        "base_path": "/", "oauth_callback": f"https://{SLUG}.nglabs.esrigcazure.com/",
        "artifact_sha256": digest, "artifact_bytes": len(body),
        "retained_build_run_id": "36150471752", "retained_build_run_attempt": "1",
        "rebuilt": False,
        "authenticated_acceptance": "deferred", "activation": False,
    }
    (output / "build-proof.json").write_text(json.dumps(proof, indent=2) + "\n")
    oidc_request = Request(
        os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&audience=" + quote(ORIGIN, safe=""),
        headers={"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]},
    )
    with urlopen(oidc_request, timeout=30) as response:
        token = json.load(response)["value"]
    request = Request(
        f"{ORIGIN}/api/hosted/applications/{APP}/publishers/{publisher}/artifacts",
        data=body, method="POST",
        headers={
            "Authorization": "Bearer " + token, "Content-Type": "application/gzip",
            "Content-Length": str(len(body)), "X-Artifact-SHA256": digest,
            "Idempotency-Key": "run-" + proof["run_id"] + "-attempt-" + proof["run_attempt"],
        },
    )
    try:
        with urlopen(request, timeout=330) as response:
            result = json.load(response)
            status = response.status
    except HTTPError as error:
        (output / "admission-failure.json").write_text(
            json.dumps({"http_status": error.code, "admitted": False}) + "\n"
        )
        raise RuntimeError(f"NGL admission rejected: HTTP {error.code}; no automatic retry") from None
    if status not in {200, 201} or not result.get("release", {}).get("id"):
        raise RuntimeError("NGL did not return an admitted Release")
    (output / "admission-receipt.json").write_text(json.dumps(result, indent=2) + "\n")
    print("Admitted Release:", result["release"]["id"])
    print("Artifact SHA256:", digest)
    print("Current and traffic are unchanged; Operator Activation remains required.")


if __name__ == "__main__":
    main()
