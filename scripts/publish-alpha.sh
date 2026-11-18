#!/usr/bin/env bash
set -euo pipefail

version=$(jq -er '.version | select(test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))' src-tauri/tauri.conf.json)
tag="v$version-alpha.1"
asset="Waymark_${version}_x64-setup.exe"
installer="installer/$asset"
test -s "$installer"
test -s "$installer.sig"

# Compare with the published feed before uploading anything. A retry can finish
# advancing the feed after the release has already been uploaded.
feed_sha=
if refs=$(gh api "repos/$GH_REPO/git/matching-refs/heads/update-feed" --jq '.[] | select(.ref=="refs/heads/update-feed") | .ref'); then
  if [[ -n "$refs" ]]; then
    entry=$(gh api "repos/$GH_REPO/contents/latest.json?ref=update-feed")
    feed_sha=$(jq -er .sha <<< "$entry")
    current=$(jq -r .content <<< "$entry" | base64 -d | jq -er .version)
    if [[ $(printf '%s\n%s\n' "$current" "$version" | sort -V | tail -1) != "$version" ]]; then
      echo "The alpha feed already points to a newer version ($current)." >&2
      exit 1
    fi
  fi
else
  exit 1
fi

digest="sha256:$(sha256sum "$installer" | cut -d ' ' -f 1)"
if ! gh release view "$tag" --json tagName >/dev/null 2>&1; then
  gh release create "$tag" "$installer" "$installer.sig" --target "$GITHUB_SHA" \
    --prerelease --title "Waymark $version Alpha" \
    --notes "Windows x64 preview. Install once to use Settings → Updates for future builds."
fi
target=$(gh api "repos/$GH_REPO/git/ref/tags/$tag" --jq .object.sha)
[[ "$target" == "$GITHUB_SHA" ]]
release=$(gh api "repos/$GH_REPO/releases/tags/$tag")
jq -e --arg asset "$asset" --arg digest "$digest" '.draft == false and .prerelease and
  any(.assets[]; .name == $asset and .state == "uploaded" and .digest == $digest)' <<< "$release" >/dev/null

jq -n --arg version "$version" --arg url "https://github.com/$GH_REPO/releases/download/$tag/$asset" \
  --arg signature "$(cat "$installer.sig")" \
  '{version:$version,platforms:{"windows-x86_64":{url:$url,signature:$signature}}}' > latest.json

if [[ -z "$refs" ]]; then
  # Create the initial branch and manifest together so an interrupted run can be retried.
  blob=$(gh api "repos/$GH_REPO/git/blobs" -f content="$(base64 -w0 latest.json)" -f encoding=base64 --jq .sha)
  tree=$(jq -n --arg blob "$blob" '{tree:[{path:"latest.json",mode:"100644",type:"blob",sha:$blob}]}' |
    gh api "repos/$GH_REPO/git/trees" --input - --jq .sha)
  commit=$(jq -n --arg tree "$tree" --arg tag "$tag" '{message:("Publish " + $tag),tree:$tree,parents:[]}' |
    gh api "repos/$GH_REPO/git/commits" --input - --jq .sha)
  gh api "repos/$GH_REPO/git/refs" -f ref=refs/heads/update-feed -f sha="$commit" --jq .ref
else
  jq -n --arg sha "$feed_sha" --arg tag "$tag" --arg content "$(base64 -w0 latest.json)" \
    '{message:("Publish " + $tag),content:$content,branch:"update-feed",sha:$sha}' |
    gh api -X PUT "repos/$GH_REPO/contents/latest.json" --input - --jq .commit.sha
fi
