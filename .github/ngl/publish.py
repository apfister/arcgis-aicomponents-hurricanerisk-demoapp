"""Publish one pinned-source Artifact; never configure or activate traffic."""
import gzip
import hashlib
import io
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID

ORIGIN = "https://nglabs.esrigcazure.com"
SOURCE = "abb7d335572bcb1d7118205228b99de8176b0caf"
APP = "2a9acadc-9644-4cfe-8343-c77079126034"
SLUG = "arcgis-aicomponents-hurricanerisk-demoapp"


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
    dist = source / "dist"
    index = dist / "index.html"
    if not index.is_file() or not index.stat().st_size or "/apps/" in index.read_text():
        raise RuntimeError("Root-relative static entrypoint required")
    manifest = {
        "schema_version": 1, "kind": "static", "application_id": APP,
        "browser_profile": "arcgis-maps", "configuration": [],
        "external_resources": [{"kind": "connect", "origin": "https://disasters.geoplatform.gov"}],
        "metadata": {"display_name": "Florida Hurricane Risk Explorer"},
    }
    files = {"manifest.json": (json.dumps(manifest, sort_keys=True) + "\n").encode()}
    for path in sorted(dist.rglob("*")):
        if path.is_symlink() or not (path.is_file() or path.is_dir()):
            raise RuntimeError("Unsupported static build entry")
        if path.is_file():
            name = "site/" + path.relative_to(dist).as_posix()
            if any(not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_.-]*", part) for part in name.split("/")):
                raise RuntimeError("Unsupported static path")
            files[name] = path.read_bytes()
    if len(files) > 4096 or sum(map(len, files.values())) > 256 * 1024**2:
        raise RuntimeError("Static Artifact exceeds admission limits")
    output = Path("ngl-publication")
    output.mkdir(mode=0o700)
    archive = output / f"{SLUG}-{SOURCE[:12]}.tar.gz"
    with archive.open("wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", filename="", mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as bundle:
            for name, body in files.items():
                entry = tarfile.TarInfo(name)
                entry.size, entry.mode, entry.mtime = len(body), 0o644, 0
                bundle.addfile(entry, io.BytesIO(body))
    body = archive.read_bytes()
    if len(body) > 64 * 1024**2:
        raise RuntimeError("Compressed Artifact exceeds admission limit")
    digest = hashlib.sha256(body).hexdigest()
    archive.with_suffix(archive.suffix + ".sha256").write_text(f"{digest}  {archive.name}\n")
    proof = {
        "application_id": APP, "publisher_id": publisher,
        "source_repository": os.environ["GITHUB_REPOSITORY"], "source_commit": SOURCE,
        "workflow_commit": os.environ["GITHUB_SHA"], "ref": os.environ["GITHUB_REF"],
        "run_id": os.environ["GITHUB_RUN_ID"], "run_attempt": os.environ["GITHUB_RUN_ATTEMPT"],
        "base_path": "/", "oauth_callback": f"https://{SLUG}.nglabs.esrigcazure.com/",
        "artifact_sha256": digest, "artifact_bytes": len(body),
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
