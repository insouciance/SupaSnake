#!/bin/bash
# Batch Recolor Script - ImageMagick Dynasty Variant Generator
# =============================================================
#
# Takes greyscale PNG templates and generates all dynasty color variants
# using ImageMagick's command-line tools for high-performance batch processing.
#
# Usage:
#   ./batch_recolor.sh --input <greyscale.png> --output <output_dir>
#   ./batch_recolor.sh --input-dir <input_dir> --output <output_dir>
#
# Examples:
#   # Recolor single file to all 10 dynasties
#   ./batch_recolor.sh \
#       --input assets/Collection_Cards/test/base_greyscale_painting.png \
#       --output build/dynasties
#
#   # Batch recolor all greyscale templates in directory
#   ./batch_recolor.sh \
#       --input-dir assets/greyscale_bases \
#       --output build/dynasties
#
#   # Recolor to specific dynasties only
#   ./batch_recolor.sh \
#       --input base.png \
#       --output build \
#       --dynasties "CYBER PRIMAL COSMIC"
#
# Requirements:
#   - ImageMagick 7.0+ (brew install imagemagick)
#   - jq (brew install jq) for JSON parsing
#
# Author: SupaSnake Development Team
# Date: 2025-10-24
# Version: 1.0

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/dynasty_colors.json"

# Default values
INPUT_FILE=""
INPUT_DIR=""
OUTPUT_DIR=""
DYNASTIES="all"
VERBOSE=false

# Function: Print usage
print_usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Batch recolor greyscale character templates to dynasty color palettes.

Options:
  -i, --input FILE          Single greyscale PNG input file
  -d, --input-dir DIR       Directory of greyscale PNG files
  -o, --output DIR          Output directory (required)
  -y, --dynasties LIST      Space-separated dynasty names (default: all)
  -c, --config FILE         Dynasty colors config file (default: ./dynasty_colors.json)
  -v, --verbose             Verbose output
  -h, --help                Show this help message

Examples:
  # Recolor single file to all dynasties
  $0 -i base.png -o build/dynasties

  # Recolor directory to specific dynasties
  $0 -d assets/greyscale_bases -o build -y "CYBER PRIMAL"

  # Verbose mode
  $0 -i base.png -o build -v

Supported Dynasties:
  MVP:       CYBER, PRIMAL, COSMIC
  Expansion: VOID, INFERNO, ABYSS, RADIANT, UMBRA, NEXUS, PRIME
EOF
}

# Function: Print error and exit
error_exit() {
    echo -e "${RED}Error: $1${NC}" >&2
    exit 1
}

# Function: Print success message
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Function: Print info message
info() {
    echo -e "${BLUE}→ $1${NC}"
}

# Function: Print warning message
warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Function: Check if ImageMagick is installed
check_imagemagick() {
    if ! command -v magick &> /dev/null; then
        error_exit "ImageMagick not found. Install with: brew install imagemagick"
    fi

    # Check version
    local version=$(magick --version | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
    if [ -z "$version" ]; then
        warning "Could not detect ImageMagick version"
    elif [ $(echo "$version < 7.0" | bc -l 2>/dev/null || echo 0) -eq 1 ]; then
        warning "ImageMagick 7.0+ recommended (found version $version)"
    fi
}

# Function: Check if jq is installed
check_jq() {
    if ! command -v jq &> /dev/null; then
        error_exit "jq not found. Install with: brew install jq"
    fi
}

# Function: Load dynasty color from config
get_dynasty_color() {
    local dynasty=$1
    local color_key=$2  # shadow, dark, primary, highlight, bright

    local color=$(jq -r ".dynasties.${dynasty}.color_map.${color_key}" "$CONFIG_FILE")

    if [ "$color" = "null" ]; then
        error_exit "Dynasty $dynasty or color $color_key not found in config"
    fi

    echo "$color"
}

# Function: Recolor single file to dynasty palette
recolor_to_dynasty() {
    local input_file=$1
    local dynasty=$2
    local output_file=$3

    if [ "$VERBOSE" = true ]; then
        info "Recoloring $input_file → $dynasty"
    fi

    # Get dynasty colors
    local shadow=$(get_dynasty_color "$dynasty" "shadow")
    local dark=$(get_dynasty_color "$dynasty" "dark")
    local primary=$(get_dynasty_color "$dynasty" "primary")
    local highlight=$(get_dynasty_color "$dynasty" "highlight")
    local bright=$(get_dynasty_color "$dynasty" "bright")

    if [ "$VERBOSE" = true ]; then
        echo "  Shadow:    $shadow"
        echo "  Dark:      $dark"
        echo "  Primary:   $primary"
        echo "  Highlight: $highlight"
        echo "  Bright:    $bright"
    fi

    # Create color lookup table (LUT)
    # Map greyscale keypoints to dynasty colors
    # Format: "greyscale_value target_color"
    local lut=$(mktemp).txt
    cat > "$lut" <<EOF
0 $shadow
64 $dark
128 $primary
192 $highlight
255 $bright
EOF

    # Apply recoloring using ImageMagick
    # Strategy: Use -clut (Color LookUp Table) for efficient recoloring
    #
    # Process:
    # 1. Load greyscale image
    # 2. Separate alpha channel
    # 3. Convert RGB to greyscale (if not already)
    # 4. Apply color lookup table (interpolates between keypoints)
    # 5. Recombine with alpha channel
    # 6. Save output

    magick "$input_file" \
        -colorspace sRGB \
        \( +clone -alpha extract -write mpr:alpha +delete \) \
        -alpha off \
        -colorspace Gray \
        \( +clone -sparse-color barycentric \
            "0,0 $shadow 0,$((255*25/100)) $dark 0,$((255*50/100)) $primary 0,$((255*75/100)) $highlight 0,255 $bright" \
           -interpolate bilinear -size 256x1 -fx "p{i,0}" \
           -scale 1x256\! \) \
        -clut \
        mpr:alpha -alpha on -compose copy-opacity -composite \
        -colorspace sRGB \
        "$output_file"

    # Clean up temporary LUT file
    rm -f "$lut"

    if [ ! -f "$output_file" ]; then
        error_exit "Failed to create output file: $output_file"
    fi

    # Get file size
    local size=$(du -h "$output_file" | cut -f1)

    if [ "$VERBOSE" = true ]; then
        success "Created $output_file ($size)"
    fi
}

# Function: Get list of dynasties to process
get_dynasties_list() {
    if [ "$DYNASTIES" = "all" ]; then
        # Get all dynasty names from config
        jq -r '.dynasties | keys[]' "$CONFIG_FILE"
    else
        # Use user-specified list
        echo "$DYNASTIES" | tr ' ' '\n'
    fi
}

# Function: Get base filename without extension
get_basename() {
    local filepath=$1
    local filename=$(basename "$filepath")
    echo "${filename%.*}"
}

# Function: Process single input file
process_file() {
    local input_file=$1

    if [ ! -f "$input_file" ]; then
        error_exit "Input file not found: $input_file"
    fi

    # Get base name
    local base_name=$(get_basename "$input_file")

    # Create output directory if needed
    mkdir -p "$OUTPUT_DIR"

    info "Processing: $base_name"

    # Get list of dynasties
    local dynasties_list=$(get_dynasties_list)
    local total=$(echo "$dynasties_list" | wc -l | tr -d ' ')
    local current=0

    # Process each dynasty
    while IFS= read -r dynasty; do
        current=$((current + 1))

        # Create output filename
        local output_file="$OUTPUT_DIR/${dynasty}-${base_name}.png"

        # Progress indicator
        if [ "$VERBOSE" = false ]; then
            echo -ne "  [$current/$total] $dynasty... \r"
        fi

        # Recolor to dynasty
        recolor_to_dynasty "$input_file" "$dynasty" "$output_file"

    done <<< "$dynasties_list"

    if [ "$VERBOSE" = false ]; then
        echo -ne "\r\033[K"  # Clear line
    fi

    success "Generated $total dynasty variants for $base_name"
}

# Function: Process directory of files
process_directory() {
    local input_dir=$1

    if [ ! -d "$input_dir" ]; then
        error_exit "Input directory not found: $input_dir"
    fi

    # Find all PNG files
    local png_files=$(find "$input_dir" -maxdepth 1 -name "*.png" -o -name "*greyscale*.png")
    local file_count=$(echo "$png_files" | wc -l | tr -d ' ')

    if [ -z "$png_files" ]; then
        error_exit "No PNG files found in $input_dir"
    fi

    info "Found $file_count greyscale PNG files in $input_dir"

    # Process each file
    local processed=0
    while IFS= read -r file; do
        if [ -n "$file" ]; then
            processed=$((processed + 1))
            echo ""
            info "File $processed/$file_count"
            process_file "$file"
        fi
    done <<< "$png_files"

    echo ""
    success "Batch processing complete: $processed files processed"
}

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -i|--input)
            INPUT_FILE="$2"
            shift 2
            ;;
        -d|--input-dir)
            INPUT_DIR="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -y|--dynasties)
            DYNASTIES="$2"
            shift 2
            ;;
        -c|--config)
            CONFIG_FILE="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            print_usage
            exit 0
            ;;
        *)
            error_exit "Unknown option: $1\nRun '$0 --help' for usage information."
            ;;
    esac
done

# Validate arguments
if [ -z "$OUTPUT_DIR" ]; then
    error_exit "Output directory required (-o/--output). Run '$0 --help' for usage."
fi

if [ -z "$INPUT_FILE" ] && [ -z "$INPUT_DIR" ]; then
    error_exit "Either input file (-i) or input directory (-d) required. Run '$0 --help' for usage."
fi

if [ -n "$INPUT_FILE" ] && [ -n "$INPUT_DIR" ]; then
    error_exit "Cannot specify both input file (-i) and input directory (-d). Choose one."
fi

if [ ! -f "$CONFIG_FILE" ]; then
    error_exit "Config file not found: $CONFIG_FILE"
fi

# Check dependencies
check_imagemagick
check_jq

# Print configuration
echo "========================================"
echo "Batch Dynasty Recoloring"
echo "========================================"
echo "Config:  $CONFIG_FILE"
if [ -n "$INPUT_FILE" ]; then
    echo "Input:   $INPUT_FILE"
else
    echo "Input:   $INPUT_DIR"
fi
echo "Output:  $OUTPUT_DIR"
if [ "$DYNASTIES" = "all" ]; then
    echo "Dynasties: All (10 dynasties)"
else
    echo "Dynasties: $DYNASTIES"
fi
echo "========================================"
echo ""

# Process files
if [ -n "$INPUT_FILE" ]; then
    process_file "$INPUT_FILE"
else
    process_directory "$INPUT_DIR"
fi

# Final summary
echo ""
echo "========================================"
success "Batch recoloring complete!"
echo "Output directory: $OUTPUT_DIR"
echo "========================================"
