#!/usr/bin/env python3
"""
Card Recoloring Script - Dynasty Variant Generator
===================================================

Takes a greyscale PNG character template and recolors it to match
a specified dynasty color palette.

Usage:
    python card_recoloring.py --input <greyscale.png> --dynasty <DYNASTY> --output <output.png>

Example:
    python card_recoloring.py \
        --input assets/Collection_Cards/test/base_greyscale_painting.png \
        --dynasty CYBER \
        --output build/CYBER-Alpha-character.png

Features:
    - Linear RGB interpolation between dynasty color keypoints
    - Preserves alpha channel transparency
    - Supports all 10 dynasties
    - High-quality output (no compression artifacts)

Requirements:
    - Python 3.7+
    - Pillow (PIL fork)
    - numpy

Author: SupaSnake Development Team
Date: 2025-10-24
Version: 1.0
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Tuple, Optional

import numpy as np
from PIL import Image


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """
    Convert hex color string to RGB tuple.

    Args:
        hex_color: Hex color string (e.g., "#1A7A8A")

    Returns:
        RGB tuple (r, g, b) with values 0-255

    Example:
        >>> hex_to_rgb("#1A7A8A")
        (26, 122, 138)
    """
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb: Tuple[int, int, int]) -> str:
    """
    Convert RGB tuple to hex color string.

    Args:
        rgb: RGB tuple (r, g, b) with values 0-255

    Returns:
        Hex color string (e.g., "#1A7A8A")

    Example:
        >>> rgb_to_hex((26, 122, 138))
        '#1A7A8A'
    """
    return f"#{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"


def load_dynasty_colors(config_path: Path) -> Dict:
    """
    Load dynasty color configuration from JSON file.

    Args:
        config_path: Path to dynasty_colors.json

    Returns:
        Dictionary containing all dynasty color configurations

    Raises:
        FileNotFoundError: If config file doesn't exist
        json.JSONDecodeError: If config file is invalid JSON
    """
    if not config_path.exists():
        raise FileNotFoundError(f"Dynasty colors config not found: {config_path}")

    with open(config_path, 'r') as f:
        config = json.load(f)

    return config


def create_color_map(dynasty_colors: Dict[str, str]) -> Dict[int, Tuple[int, int, int]]:
    """
    Create color map from dynasty color palette.

    Maps greyscale keypoint values (0, 64, 128, 192, 255) to dynasty colors.

    Args:
        dynasty_colors: Dictionary with keys: shadow, dark, primary, highlight, bright

    Returns:
        Dictionary mapping greyscale values to RGB tuples

    Example:
        >>> colors = {"shadow": "#0D3D47", "dark": "#1A7A8A", ...}
        >>> create_color_map(colors)
        {0: (13, 61, 71), 64: (26, 122, 138), ...}
    """
    return {
        0: hex_to_rgb(dynasty_colors['shadow']),
        64: hex_to_rgb(dynasty_colors['dark']),
        128: hex_to_rgb(dynasty_colors['primary']),
        192: hex_to_rgb(dynasty_colors['highlight']),
        255: hex_to_rgb(dynasty_colors['bright'])
    }


def interpolate_color(value: int, color_map: Dict[int, Tuple[int, int, int]]) -> Tuple[int, int, int]:
    """
    Interpolate RGB color for a given greyscale value.

    Uses linear interpolation between the two nearest keypoints in the color map.

    Args:
        value: Greyscale value (0-255)
        color_map: Dictionary mapping keypoint values to RGB tuples

    Returns:
        Interpolated RGB tuple

    Example:
        If value=96 (between keypoints 64 and 128):
        - 96 is 50% between 64 and 128
        - Return color that is 50% between color_map[64] and color_map[128]
    """
    # Get sorted keypoint values
    keypoints = sorted(color_map.keys())

    # If value exactly matches a keypoint, return that color
    if value in color_map:
        return color_map[value]

    # Find the two keypoints that bracket this value
    lower_key = max(k for k in keypoints if k <= value)
    upper_key = min(k for k in keypoints if k >= value)

    # Calculate interpolation factor (0.0 to 1.0)
    if upper_key == lower_key:
        return color_map[lower_key]

    factor = (value - lower_key) / (upper_key - lower_key)

    # Interpolate RGB values
    lower_rgb = np.array(color_map[lower_key])
    upper_rgb = np.array(color_map[upper_key])

    interpolated = lower_rgb + (upper_rgb - lower_rgb) * factor

    # Convert back to integers
    return tuple(int(c) for c in interpolated)


def recolor_image(greyscale_img: Image.Image, dynasty_colors: Dict[str, str]) -> Image.Image:
    """
    Recolor a greyscale image using dynasty color palette.

    Args:
        greyscale_img: PIL Image in greyscale or RGBA with greyscale RGB channels
        dynasty_colors: Dictionary with dynasty color palette

    Returns:
        Recolored PIL Image in RGBA mode

    Process:
        1. Extract greyscale values from image
        2. Map each greyscale value to dynasty color via interpolation
        3. Preserve alpha channel from original image
        4. Return new RGBA image
    """
    # Convert to RGBA if not already
    if greyscale_img.mode != 'RGBA':
        greyscale_img = greyscale_img.convert('RGBA')

    # Get image data as numpy array
    img_array = np.array(greyscale_img)

    # Extract RGB and alpha channels
    rgb_channels = img_array[:, :, :3]
    alpha_channel = img_array[:, :, 3]

    # Convert RGB to greyscale (average method)
    # This handles cases where input isn't pure greyscale
    greyscale_values = np.mean(rgb_channels, axis=2).astype(int)

    # Create color map
    color_map = create_color_map(dynasty_colors)

    # Create output RGB array
    height, width = greyscale_values.shape
    output_rgb = np.zeros((height, width, 3), dtype=np.uint8)

    # Map each greyscale value to dynasty color
    print(f"Recoloring {width}×{height} image...")

    # Vectorized approach: get unique greyscale values
    unique_values = np.unique(greyscale_values)

    # Create lookup table for all unique values
    lut = {}
    for value in unique_values:
        lut[value] = interpolate_color(value, color_map)

    # Apply lookup table to image
    for y in range(height):
        for x in range(width):
            grey_value = greyscale_values[y, x]
            output_rgb[y, x] = lut[grey_value]

    # Combine RGB with original alpha channel
    output_array = np.dstack((output_rgb, alpha_channel))

    # Convert back to PIL Image
    output_img = Image.fromarray(output_array, mode='RGBA')

    return output_img


def validate_dynasty(dynasty: str, config: Dict) -> bool:
    """
    Validate that dynasty exists in configuration.

    Args:
        dynasty: Dynasty name (e.g., "CYBER")
        config: Dynasty colors configuration dictionary

    Returns:
        True if dynasty exists, False otherwise
    """
    return dynasty in config['dynasties']


def main():
    """Main entry point for card recoloring script."""

    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description='Recolor greyscale character cards to dynasty color palettes',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Recolor base snake to CYBER dynasty
  python card_recoloring.py \\
      --input assets/Collection_Cards/test/base_greyscale_painting.png \\
      --dynasty CYBER \\
      --output build/CYBER-Alpha-character.png

  # Recolor expression head to PRIMAL dynasty
  python card_recoloring.py \\
      --input assets/heads/head-angry-greyscale.png \\
      --dynasty PRIMAL \\
      --output build/PRIMAL-head-angry.png

Supported Dynasties:
  MVP: CYBER, PRIMAL, COSMIC
  Expansion: VOID, INFERNO, ABYSS, RADIANT, UMBRA, NEXUS, PRIME
        """
    )

    parser.add_argument(
        '--input', '-i',
        type=Path,
        required=True,
        help='Path to greyscale PNG input file'
    )

    parser.add_argument(
        '--dynasty', '-d',
        type=str,
        required=True,
        help='Dynasty name (e.g., CYBER, PRIMAL, COSMIC)'
    )

    parser.add_argument(
        '--output', '-o',
        type=Path,
        required=True,
        help='Path to recolored PNG output file'
    )

    parser.add_argument(
        '--config', '-c',
        type=Path,
        default=Path(__file__).parent / 'dynasty_colors.json',
        help='Path to dynasty colors JSON config (default: ./dynasty_colors.json)'
    )

    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Verbose output (show color mappings)'
    )

    args = parser.parse_args()

    # Validate input file exists
    if not args.input.exists():
        print(f"Error: Input file not found: {args.input}", file=sys.stderr)
        sys.exit(1)

    # Load dynasty colors configuration
    try:
        config = load_dynasty_colors(args.config)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in config file: {e}", file=sys.stderr)
        sys.exit(1)

    # Validate dynasty name
    dynasty_upper = args.dynasty.upper()
    if not validate_dynasty(dynasty_upper, config):
        print(f"Error: Unknown dynasty '{args.dynasty}'", file=sys.stderr)
        print(f"Available dynasties: {', '.join(config['dynasties'].keys())}", file=sys.stderr)
        sys.exit(1)

    # Get dynasty colors
    dynasty_colors = config['dynasties'][dynasty_upper]['color_map']

    # Print configuration if verbose
    if args.verbose:
        print(f"\n{'='*60}")
        print(f"Dynasty Recoloring Configuration")
        print(f"{'='*60}")
        print(f"Input:    {args.input}")
        print(f"Output:   {args.output}")
        print(f"Dynasty:  {dynasty_upper}")
        print(f"\nColor Palette:")
        for key, hex_color in dynasty_colors.items():
            rgb = hex_to_rgb(hex_color)
            print(f"  {key:>10s}: {hex_color} = RGB{rgb}")
        print(f"{'='*60}\n")

    # Load input image
    print(f"Loading greyscale image: {args.input}")
    try:
        greyscale_img = Image.open(args.input)
    except Exception as e:
        print(f"Error: Failed to load image: {e}", file=sys.stderr)
        sys.exit(1)

    # Recolor image
    print(f"Applying {dynasty_upper} color palette...")
    try:
        recolored_img = recolor_image(greyscale_img, dynasty_colors)
    except Exception as e:
        print(f"Error: Failed to recolor image: {e}", file=sys.stderr)
        sys.exit(1)

    # Create output directory if needed
    args.output.parent.mkdir(parents=True, exist_ok=True)

    # Save output image
    print(f"Saving recolored image: {args.output}")
    try:
        recolored_img.save(args.output, format='PNG', compress_level=6)
    except Exception as e:
        print(f"Error: Failed to save image: {e}", file=sys.stderr)
        sys.exit(1)

    # Print success message
    file_size_kb = args.output.stat().st_size / 1024
    print(f"\n✓ Success! Recolored {dynasty_upper} variant saved ({file_size_kb:.1f} KB)")
    print(f"  {args.output}")


if __name__ == '__main__':
    main()
