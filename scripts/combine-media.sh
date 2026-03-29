#!/bin/bash
# ─────────────────────────────────────────────────────────
# Combine all ADVO media from ~/Downloads into /advo/media
# Deduplicates by filename, preserves originals
# ─────────────────────────────────────────────────────────

set -euo pipefail

SRC="$HOME/Downloads"
DEST="$(cd "$(dirname "$0")/.." && pwd)/media"

echo "Source: $SRC"
echo "Dest:   $DEST"
echo ""

# Create destination structure
mkdir -p "$DEST/photos"
mkdir -p "$DEST/videos"
mkdir -p "$DEST/graphics"
mkdir -p "$DEST/member-intros"

# Counters
copied_photos=0
copied_videos=0
copied_graphics=0
copied_intros=0
skipped=0

# ─── 1. ADVO Graphics (logos) ─────────────────────────
if [ -d "$SRC/ADVO Graphics" ]; then
  echo "→ Processing ADVO Graphics..."
  find "$SRC/ADVO Graphics" -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.svg" \) | while read -r f; do
    name=$(basename "$f")
    if [ ! -f "$DEST/graphics/$name" ]; then
      cp "$f" "$DEST/graphics/$name"
      ((copied_graphics++)) || true
      echo "  + graphics/$name"
    else
      ((skipped++)) || true
    fi
  done
fi

# ─── 2. ADVO member intro videos ─────────────────────
if [ -d "$SRC/ADVO" ]; then
  echo "→ Processing ADVO member intros..."
  find "$SRC/ADVO" -maxdepth 1 -type f \( -iname "*.mp4" -o -iname "*.mov" \) | while read -r f; do
    name=$(basename "$f")
    # Normalize filename: "Angelo Revelo.mp4" → "angelo-revelo.mp4"
    normalized=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')
    if [ ! -f "$DEST/member-intros/$normalized" ]; then
      cp "$f" "$DEST/member-intros/$normalized"
      ((copied_intros++)) || true
      echo "  + member-intros/$normalized"
    else
      ((skipped++)) || true
    fi
  done
fi

# ─── 3. ADVO Marketing folders (photos + videos) ─────
for dir in "$SRC/ADVO Marketing" "$SRC"/ADVO\ Marketing\ [0-9]*; do
  [ -d "$dir" ] || continue
  folder_name=$(basename "$dir")
  echo "→ Processing $folder_name..."

  # Photos
  find "$dir" -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) ! -name ".DS_Store" 2>/dev/null | while read -r f; do
    name=$(basename "$f")
    if [ ! -f "$DEST/photos/$name" ]; then
      cp "$f" "$DEST/photos/$name"
      echo "  + photos/$name"
    fi
  done

  # Videos
  find "$dir" -type f \( -iname "*.mov" -o -iname "*.mp4" \) ! -name ".DS_Store" 2>/dev/null | while read -r f; do
    name=$(basename "$f")
    if [ ! -f "$DEST/videos/$name" ]; then
      cp "$f" "$DEST/videos/$name"
      echo "  + videos/$name"
    fi
  done
done

# ─── Summary ─────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo "  Done! Media combined into: $DEST"
echo "═══════════════════════════════════════"
echo ""
photos=$(find "$DEST/photos" -type f 2>/dev/null | wc -l | tr -d ' ')
videos=$(find "$DEST/videos" -type f 2>/dev/null | wc -l | tr -d ' ')
graphics=$(find "$DEST/graphics" -type f 2>/dev/null | wc -l | tr -d ' ')
intros=$(find "$DEST/member-intros" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "  Photos:        $photos"
echo "  Videos:        $videos"
echo "  Graphics:      $graphics"
echo "  Member Intros: $intros"
echo ""

# Show disk usage
du -sh "$DEST/photos" "$DEST/videos" "$DEST/graphics" "$DEST/member-intros" 2>/dev/null
echo ""
du -sh "$DEST"
