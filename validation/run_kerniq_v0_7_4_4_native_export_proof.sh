#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "controlled native export proof is supported only on macOS" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64)
    runtime_arch="aarch64"
    python_url="https://github.com/astral-sh/python-build-standalone/releases/download/20260718/cpython-3.12.13%2B20260718-aarch64-apple-darwin-install_only.tar.gz"
    python_sha256="62aeee6161d57303a71a138b75fd5cc6fb8c89c4b1d9c7f0a052d89fa0b6652b"
    ;;
  x86_64)
    runtime_arch="x86_64"
    python_url="https://github.com/astral-sh/python-build-standalone/releases/download/20260718/cpython-3.12.13%2B20260718-x86_64-apple-darwin-install_only.tar.gz"
    python_sha256="10b47148de86f9d87ba6e96a3db606ced90a206a3454d7d6d8fa68536a05d81f"
    ;;
  *)
    echo "unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

agentfuse_url="https://codeload.github.com/MkaliezZ/dhms-engine/tar.gz/ec4b5842339dccfba0db62df7541920759203bc9"
agentfuse_sha256="1659d81d39aab382d550c33c3b6a42b24254f584055eb15d8168f17200e323c3"
temp_base="${TMPDIR:-/tmp}"
temp_base="${temp_base%/}"
proof_root="$(mktemp -d "${temp_base}/kerniq_v0_7_4_4_native_export_proof.XXXXXX")"

cleanup() {
  case "${proof_root}" in
    "${temp_base}"/kerniq_v0_7_4_4_native_export_proof.*)
      rm -rf -- "${proof_root}"
      ;;
    *)
      echo "refusing to clean unexpected proof root" >&2
      ;;
  esac
}
trap cleanup EXIT

cache="${KERNIQ_V0_7_4_4_ARCHIVE_CACHE:-${temp_base}/kerniq-v0-7-4-4-archive-cache}"
profile="${proof_root}/managed-profile"
project="${proof_root}/project"
manifest="${proof_root}/manifest.json"
selection="${proof_root}/selection.json"
evidence="${repo_root}/validation/evidence/kerniq_v0_7_4_4_native_export_proof.json"
mkdir -p "${cache}" "${repo_root}/validation/evidence"

download_verified() {
  local url="$1"
  local expected="$2"
  local output="$3"
  local actual
  if [[ -f "${output}" ]]; then
    actual="$(shasum -a 256 "${output}" | awk '{print $1}')"
    if [[ "${actual}" == "${expected}" ]]; then
      return
    fi
  fi
  curl --fail --location --retry 3 --continue-at - --output "${output}" "${url}"
  actual="$(shasum -a 256 "${output}" | awk '{print $1}')"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "archive digest mismatch for ${output##*/}" >&2
    exit 1
  fi
}

download_verified \
  "${python_url}" \
  "${python_sha256}" \
  "${cache}/python-macos-${runtime_arch}.tar.gz"
download_verified \
  "${agentfuse_url}" \
  "${agentfuse_sha256}" \
  "${cache}/agentfuse-source.tar.gz"

(
  cd "${repo_root}/apps/desktop/src-tauri"
  KERNIQ_PREPARE_SMOKE_PROFILE="${profile}" \
    KERNIQ_RUNTIME_DIGEST_CACHE="${cache}" \
    cargo test --locked \
      managed_python::tests::prepare_verified_real_smoke_profile_from_cache \
      -- --ignored --exact --nocapture
)

(
  cd "${repo_root}"
  pnpm --filter @qodex/coding-pack-runtime build
  node validation/generate_kerniq_v0_7_4_4_fixture.mjs \
    "${project}" \
    "${manifest}" \
    "${selection}"
)

base_commit="$(git -C "${repo_root}" rev-parse origin/main)"
os_version="$(sw_vers -productVersion)"
(
  cd "${repo_root}/apps/desktop/src-tauri"
  KERNIQ_RUN_V0_7_4_4_NATIVE_EXPORT_PROOF=1 \
    KERNIQ_V0_7_4_4_PROOF_ROOT="${proof_root}" \
    KERNIQ_V0_7_4_4_PROJECT="${project}" \
    KERNIQ_V0_7_4_4_MANIFEST="${manifest}" \
    KERNIQ_V0_7_4_4_SELECTION="${selection}" \
    KERNIQ_V0_7_4_4_MANAGED_PROFILE="${profile}" \
    KERNIQ_V0_7_4_4_EVIDENCE_OUTPUT="${evidence}" \
    KERNIQ_V0_7_4_4_REPOSITORY_COMMIT="${base_commit}" \
    KERNIQ_V0_7_4_4_OS_VERSION="${os_version}" \
    KERNIQ_V0_7_4_4_SOURCE_ARCHIVE_SHA256="${agentfuse_sha256}" \
    cargo test --locked \
      coding_pack_database::controlled_native_proof::controlled_real_native_export_proof \
      -- --ignored --exact --nocapture
)

echo "controlled native export proof passed; evidence written to validation/evidence"
