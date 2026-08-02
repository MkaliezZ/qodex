#!/usr/bin/env bash
set -euo pipefail

readonly CODEWHALE_REPOSITORY="https://github.com/Hmbown/CodeWhale.git"
readonly CODEWHALE_COMMIT="4f2c97b0d75c039a9b6069ebcf210cc499583376"
readonly SOURCE_ARCHIVE_SHA256="61b6c3ed704b732085fc7d7fe7c60e6061b97296ddc6d923e19270a5ca465f69"
readonly PROOF_EXECUTABLE_SHA256="88b9dc2f82e6aa55fe8c168b7ad7573e834d7af164960835f1ccda7a4559189f"

readonly MANAGED_ROOT="${KERNIQ_CODEWHALE_MANAGED_ROOT:-${TMPDIR%/}/kerniq-codewhale-spike-4f2c97b0}"
readonly SOURCE_DIR="$MANAGED_ROOT/source"
readonly ARCHIVE_PATH="$MANAGED_ROOT/codewhale-$CODEWHALE_COMMIT.tar"
readonly TARGET_DIR="$MANAGED_ROOT/target"
readonly EXECUTABLE_PATH="$TARGET_DIR/debug/codewhale-tui"

sha256_file() {
  shasum -a 256 "$1" | awk '{print $1}'
}

verify_digest() {
  local path="$1"
  local expected="$2"
  local actual
  actual="$(sha256_file "$path")"
  if [[ "$actual" != "$expected" ]]; then
    printf 'digest mismatch for %s\nexpected: %s\nactual:   %s\n' "$path" "$expected" "$actual" >&2
    return 1
  fi
}

mkdir -p "$MANAGED_ROOT"

if [[ ! -d "$SOURCE_DIR/.git" ]]; then
  git init --quiet "$SOURCE_DIR"
  git -C "$SOURCE_DIR" remote add origin "$CODEWHALE_REPOSITORY"
fi

if [[ "$(git -C "$SOURCE_DIR" remote get-url origin)" != "$CODEWHALE_REPOSITORY" ]]; then
  printf 'managed source remote does not match pinned CodeWhale repository\n' >&2
  exit 1
fi

if ! git -C "$SOURCE_DIR" cat-file -e "$CODEWHALE_COMMIT^{commit}" 2>/dev/null; then
  git -C "$SOURCE_DIR" fetch --depth=1 origin "$CODEWHALE_COMMIT"
fi

git -C "$SOURCE_DIR" checkout --quiet --detach "$CODEWHALE_COMMIT"
test "$(git -C "$SOURCE_DIR" rev-parse HEAD)" = "$CODEWHALE_COMMIT"
if [[ -n "$(git -C "$SOURCE_DIR" status --porcelain --untracked-files=all)" ]]; then
  printf 'managed CodeWhale source is dirty; refusing to build or verify it\n' >&2
  exit 1
fi

git -C "$SOURCE_DIR" archive \
  --format=tar \
  --prefix=CodeWhale-4f2c97b0/ \
  "$CODEWHALE_COMMIT" > "$ARCHIVE_PATH"
verify_digest "$ARCHIVE_PATH" "$SOURCE_ARCHIVE_SHA256"

if [[ ! -x "$EXECUTABLE_PATH" ]]; then
  CARGO_TARGET_DIR="$TARGET_DIR" cargo build \
    --locked \
    --manifest-path "$SOURCE_DIR/Cargo.toml" \
    -p codewhale-tui \
    --bin codewhale-tui
fi

verify_digest "$EXECUTABLE_PATH" "$PROOF_EXECUTABLE_SHA256"

printf 'CODEWHALE_REPOSITORY=%s\n' "${CODEWHALE_REPOSITORY%.git}"
printf 'CODEWHALE_SOURCE_COMMIT=%s\n' "$CODEWHALE_COMMIT"
printf 'CODEWHALE_SOURCE_ARCHIVE_SHA256=sha256:%s\n' "$SOURCE_ARCHIVE_SHA256"
printf 'CODEWHALE_EXECUTABLE_SHA256=sha256:%s\n' "$PROOF_EXECUTABLE_SHA256"
printf 'CODEWHALE_EXECUTABLE_PATH=%s\n' "$EXECUTABLE_PATH"
