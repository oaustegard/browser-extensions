#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configure git
git config --global user.name "github-actions[bot]"
git config --global user.email "github-actions[bot]@users.noreply.github.com"

echo -e "${GREEN}Starting extension release process...${NC}"

# Determine version
if [ "${GITHUB_EVENT_NAME}" = "workflow_dispatch" ] && [ -n "${WORKFLOW_DISPATCH_VERSION:-}" ]; then
    VERSION="${WORKFLOW_DISPATCH_VERSION}"
    echo -e "${YELLOW}Using manually specified version: ${VERSION}${NC}"
else
    # Extract version from manifest.json
    VERSION=$(grep -Po '"version"\s*:\s*"\K[^"]+' manifest.json)
    echo -e "${GREEN}Detected version from manifest.json: ${VERSION}${NC}"
fi

# Validate version format (semantic versioning)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${RED}Error: Invalid version format '$VERSION'. Expected semantic versioning (e.g., 1.0.0)${NC}"
    exit 1
fi

EXTENSION_NAME="bookmarklet-runner-extension"
TAG="v${VERSION}"
RELEASE_TITLE="Bookmarklet Runner Extension v${VERSION}"
ZIP_FILE="${EXTENSION_NAME}-v${VERSION}.zip"

echo -e "${GREEN}Release details:${NC}"
echo "  Extension: ${EXTENSION_NAME}"
echo "  Version: ${VERSION}"
echo "  Tag: ${TAG}"
echo "  ZIP file: ${ZIP_FILE}"

# Check if release already exists
if gh release view "${TAG}" &>/dev/null; then
    echo -e "${YELLOW}Release ${TAG} already exists. Skipping.${NC}"
    exit 0
fi

# Create temporary directory for packaging
TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

echo -e "${GREEN}Creating extension package...${NC}"

# Copy extension files to temp directory
mkdir -p "${TEMP_DIR}/${EXTENSION_NAME}"

# Copy all necessary files for the extension
# NOTE: The following files are in the repo but excluded from releases:
#   - AGENTS.md (agent development guide)
#   - CLAUDE.md (Claude-specific entry point)
#   - README.md (included in release notes, not in ZIP)
#   - LICENSE (included in release notes, not in ZIP)
#   - demo-bookmarklets/ (demo files, referenced via default config)
#   - .github/ (workflow and scripts)
#   - .git/ (version control)
#   - *.zip (generated release files)
cp manifest.json "${TEMP_DIR}/${EXTENSION_NAME}/"
cp popup.html popup.js "${TEMP_DIR}/${EXTENSION_NAME}/"
cp options.html options.js options.css "${TEMP_DIR}/${EXTENSION_NAME}/"
cp -r icons "${TEMP_DIR}/${EXTENSION_NAME}/"

# Copy documentation files (but don't include them in the actual extension ZIP)
cp README.md "${TEMP_DIR}/" 2>/dev/null || true
cp LICENSE "${TEMP_DIR}/" 2>/dev/null || true

# Create ZIP file from the extension directory
cd "${TEMP_DIR}"
zip -r "${ZIP_FILE}" "${EXTENSION_NAME}" -x "*.DS_Store" "*.git*"
cd -

# Move ZIP to current directory
mv "${TEMP_DIR}/${ZIP_FILE}" .

echo -e "${GREEN}Package created: ${ZIP_FILE}${NC}"

# Generate release notes
echo -e "${GREEN}Generating release notes...${NC}"

RELEASE_NOTES=$(cat <<EOF
# ${RELEASE_TITLE}

## Installation

1. Download the \`${ZIP_FILE}\` file below
2. Extract the ZIP file to a folder on your computer
3. Open Chrome and navigate to \`chrome://extensions/\`
4. Enable "Developer mode" in the top right
5. Click "Load unpacked" and select the extracted \`${EXTENSION_NAME}\` folder

## About

$(cat README.md 2>/dev/null | head -20 || echo "Chrome extension for running bookmarklets from GitHub repositories.")

## Recent Changes

\`\`\`
$(git log --oneline -10 --pretty=format:"%h - %s")
\`\`\`

---

**Full Changelog**: https://github.com/${GITHUB_REPOSITORY}/compare/$(git describe --tags --abbrev=0 ${TAG}^ 2>/dev/null || echo "HEAD")...${TAG}
EOF
)

# Create GitHub release
echo -e "${GREEN}Creating GitHub release...${NC}"

echo "${RELEASE_NOTES}" | gh release create "${TAG}" \
    --title "${RELEASE_TITLE}" \
    --notes-file - \
    "${ZIP_FILE}"

echo -e "${GREEN}✓ Release ${TAG} created successfully!${NC}"
echo -e "${GREEN}  Download URL: https://github.com/${GITHUB_REPOSITORY}/releases/tag/${TAG}${NC}"

# Clean up the ZIP file from the working directory
rm -f "${ZIP_FILE}"

echo -e "${GREEN}Release process completed successfully!${NC}"
