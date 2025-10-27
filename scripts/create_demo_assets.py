#!/usr/bin/env python3
"""
Demo Asset Creation - Generate animation frames, parallax layers, effects
=========================================================================

Creates all assets needed for interactive card demo:
- 8-frame animation sprite sheets (breathing motion)
- 5-layer parallax depth separation
- Holographic overlay texture
- Composed 512×768 cards

Author: SupaSnake Development Team
Date: 2025-10-24
"""

import sys
from pathlib import Path
from typing import Tuple

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


def create_animation_frames(input_image_path: Path, output_dir: Path, dynasty: str) -> Path:
    """
    Create 8-frame animation with breathing motion.

    Args:
        input_image_path: Path to character PNG
        output_dir: Output directory for sprite sheet
        dynasty: Dynasty name (CYBER, PRIMAL, COSMIC)

    Returns:
        Path to sprite sheet
    """
    print(f"Creating animation frames for {dynasty}...")

    # Load input image
    img = Image.open(input_image_path).convert('RGBA')
    width, height = img.size

    # Animation parameters
    num_frames = 8
    breath_amplitude = 3  # pixels vertical movement
    blink_frame = 4  # Frame where eyes blink

    # Create frames
    frames = []
    for frame_num in range(num_frames):
        # Calculate breathing offset (sine wave)
        phase = (frame_num / num_frames) * 2 * np.pi
        y_offset = int(breath_amplitude * np.sin(phase))

        # Create frame canvas
        frame = Image.new('RGBA', (width, height), (0, 0, 0, 0))

        # Paste character with vertical offset
        frame.paste(img, (0, y_offset), img)

        # Add eye blink on frame 5 (index 4)
        if frame_num == blink_frame:
            # Create darkened version for eyes (simulate closed eyes)
            frame_array = np.array(frame)
            # Darken top 30% of image (where eyes are)
            eye_region_height = int(height * 0.3)
            frame_array[:eye_region_height, :, 3] = (frame_array[:eye_region_height, :, 3] * 0.3).astype(np.uint8)
            frame = Image.fromarray(frame_array)

        frames.append(frame)

    # Create sprite sheet (horizontal)
    sheet_width = width * num_frames
    sheet_height = height
    sprite_sheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))

    # Paste frames horizontally
    for i, frame in enumerate(frames):
        sprite_sheet.paste(frame, (i * width, 0), frame)

    # Save sprite sheet
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{dynasty}-Alpha-Animated-sheet.png"
    sprite_sheet.save(output_path, format='PNG')

    file_size = output_path.stat().st_size / 1024
    print(f"✓ Created animation sprite sheet: {output_path} ({file_size:.1f} KB)")

    return output_path


def create_parallax_layers(input_image_path: Path, output_dir: Path, dynasty: str) -> list[Path]:
    """
    Separate character into 5 depth layers for parallax effect.

    Layers (back to front):
    1. Ground shadow
    2. Body lower coils
    3. Body upper coils
    4. Head
    5. Eyes/highlights

    Args:
        input_image_path: Path to character PNG
        output_dir: Output directory for layers
        dynasty: Dynasty name

    Returns:
        List of paths to layer files
    """
    print(f"Creating parallax layers for {dynasty}...")

    # Load input image
    img = Image.open(input_image_path).convert('RGBA')
    width, height = img.size
    img_array = np.array(img)

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    layers = []

    # Layer 1: Ground shadow (bottom 10%)
    layer1 = np.zeros_like(img_array)
    shadow_start = int(height * 0.9)
    layer1[shadow_start:, :] = img_array[shadow_start:, :]
    # Darken and blur to create shadow effect
    layer1_img = Image.fromarray(layer1)
    layer1_img = layer1_img.filter(ImageFilter.GaussianBlur(radius=10))
    layer1_path = output_dir / f"{dynasty}-Alpha-layer-1-shadow.png"
    layer1_img.save(layer1_path, format='PNG')
    layers.append(layer1_path)
    print(f"  Layer 1: Ground shadow")

    # Layer 2: Body lower coils (bottom 40-70%)
    layer2 = np.zeros_like(img_array)
    lower_start = int(height * 0.4)
    lower_end = int(height * 0.9)
    layer2[lower_start:lower_end, :] = img_array[lower_start:lower_end, :]
    layer2_path = output_dir / f"{dynasty}-Alpha-layer-2-body-lower.png"
    Image.fromarray(layer2).save(layer2_path, format='PNG')
    layers.append(layer2_path)
    print(f"  Layer 2: Body lower coils")

    # Layer 3: Body upper coils (top 40-70%)
    layer3 = np.zeros_like(img_array)
    upper_start = int(height * 0.2)
    upper_end = int(height * 0.6)
    layer3[upper_start:upper_end, :] = img_array[upper_start:upper_end, :]
    layer3_path = output_dir / f"{dynasty}-Alpha-layer-3-body-upper.png"
    Image.fromarray(layer3).save(layer3_path, format='PNG')
    layers.append(layer3_path)
    print(f"  Layer 3: Body upper coils")

    # Layer 4: Head (top 30%)
    layer4 = np.zeros_like(img_array)
    head_end = int(height * 0.4)
    layer4[:head_end, :] = img_array[:head_end, :]
    layer4_path = output_dir / f"{dynasty}-Alpha-layer-4-head.png"
    Image.fromarray(layer4).save(layer4_path, format='PNG')
    layers.append(layer4_path)
    print(f"  Layer 4: Head")

    # Layer 5: Eyes/highlights (brightest pixels in top 25%)
    layer5 = np.zeros_like(img_array)
    eye_region = int(height * 0.25)
    eye_area = img_array[:eye_region, :]
    # Extract only very bright pixels (highlights)
    brightness = np.mean(eye_area[:, :, :3], axis=2)
    bright_mask = brightness > 200
    layer5[:eye_region, :][bright_mask] = eye_area[bright_mask]
    layer5_path = output_dir / f"{dynasty}-Alpha-layer-5-eyes.png"
    Image.fromarray(layer5).save(layer5_path, format='PNG')
    layers.append(layer5_path)
    print(f"  Layer 5: Eyes/highlights")

    print(f"✓ Created {len(layers)} parallax layers")
    return layers


def create_holographic_overlay(output_path: Path, size: Tuple[int, int] = (512, 768)) -> Path:
    """
    Create holographic rainbow gradient overlay for foil effect.

    Args:
        output_path: Output file path
        size: Image dimensions (width, height)

    Returns:
        Path to overlay image
    """
    print("Creating holographic overlay texture...")

    width, height = size

    # Create rainbow gradient at 45-degree angle
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Create diagonal rainbow stripes
    num_stripes = 20
    colors = [
        (255, 0, 0, 128),    # Red
        (255, 165, 0, 128),  # Orange
        (255, 255, 0, 128),  # Yellow
        (0, 255, 0, 128),    # Green
        (0, 255, 255, 128),  # Cyan
        (0, 0, 255, 128),    # Blue
        (128, 0, 255, 128),  # Purple
    ]

    stripe_width = width // num_stripes
    for i in range(num_stripes * 2):  # Extra for diagonal coverage
        color_idx = i % len(colors)
        color = colors[color_idx]

        # Draw diagonal stripe
        x_start = i * stripe_width - height
        points = [
            (x_start, 0),
            (x_start + stripe_width, 0),
            (x_start + stripe_width + height, height),
            (x_start + height, height)
        ]
        draw.polygon(points, fill=color)

    # Apply blur for smooth holographic effect
    img = img.filter(ImageFilter.GaussianBlur(radius=15))

    # Save
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format='PNG')

    file_size = output_path.stat().st_size / 1024
    print(f"✓ Created holographic overlay: {output_path} ({file_size:.1f} KB)")

    return output_path


def compose_card(
    character_path: Path,
    output_path: Path,
    dynasty: str,
    card_name: str,
    rarity: str,
    stats: dict
) -> Path:
    """
    Compose character onto 512×768 card template.

    Args:
        character_path: Path to character PNG
        output_path: Output card path
        dynasty: Dynasty name (CYBER, PRIMAL, COSMIC)
        card_name: Character name (e.g., "CYBER-Alpha")
        rarity: Rarity level (Common, Rare, Epic, Legendary)
        stats: Dictionary with speed, special, gen, cost

    Returns:
        Path to composed card
    """
    print(f"Composing card: {card_name}...")

    # Card dimensions
    card_width = 512
    card_height = 768

    # Create card canvas
    card = Image.new('RGBA', (card_width, card_height), (255, 255, 255, 255))

    # Dynasty-specific background gradients
    dynasty_colors = {
        'CYBER': {
            'start': (10, 42, 63),
            'end': (26, 77, 92),
            'accent': (0, 243, 255)
        },
        'PRIMAL': {
            'start': (42, 26, 15),
            'end': (77, 53, 32),
            'accent': (127, 255, 0)
        },
        'COSMIC': {
            'start': (26, 10, 46),
            'end': (61, 26, 92),
            'accent': (176, 38, 255)
        }
    }

    colors = dynasty_colors.get(dynasty, dynasty_colors['CYBER'])

    # Create radial gradient background
    gradient = Image.new('RGB', (card_width, card_height))
    gradient_array = np.zeros((card_height, card_width, 3), dtype=np.uint8)

    center_x, center_y = card_width // 2, card_height // 3
    max_dist = np.sqrt(center_x**2 + center_y**2)

    for y in range(card_height):
        for x in range(card_width):
            dist = np.sqrt((x - center_x)**2 + (y - center_y)**2)
            ratio = min(dist / max_dist, 1.0)

            # Interpolate colors
            r = int(colors['start'][0] + (colors['end'][0] - colors['start'][0]) * ratio)
            g = int(colors['start'][1] + (colors['end'][1] - colors['start'][1]) * ratio)
            b = int(colors['start'][2] + (colors['end'][2] - colors['start'][2]) * ratio)

            gradient_array[y, x] = [r, g, b]

    gradient = Image.fromarray(gradient_array, mode='RGB')
    card.paste(gradient, (0, 0))

    # Load and scale character
    character = Image.open(character_path).convert('RGBA')
    char_width, char_height = 400, 450

    # Scale character to fit
    character.thumbnail((char_width, char_height), Image.Resampling.LANCZOS)

    # Position character (centered in portrait area)
    portrait_top = 77
    portrait_height = 460
    char_x = (card_width - character.width) // 2
    char_y = portrait_top + (portrait_height - character.height) // 2

    # Apply drop shadow
    # Create shadow mask from character alpha
    shadow_mask = character.split()[3]  # Alpha channel
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(radius=10))

    # Create shadow as separate layer
    shadow = Image.new('RGBA', character.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    # Fill with black at 30% opacity
    shadow_pixels = np.array(shadow)
    shadow_pixels[:, :, :3] = 0  # Black
    shadow_pixels[:, :, 3] = (np.array(shadow_mask) * 0.3).astype(np.uint8)  # 30% alpha
    shadow = Image.fromarray(shadow_pixels)

    # Paste shadow offset slightly
    card.paste(shadow, (char_x + 10, char_y + 10), shadow)
    # Paste character on top
    card.paste(character, (char_x, char_y), character)

    # Add text overlays (simple rectangles for demo)
    draw = ImageDraw.Draw(card)

    # Header bar (simplified - would use proper fonts in production)
    draw.rectangle([(0, 0), (card_width, 77)], fill=(0, 0, 0, 180))
    draw.text((20, 30), f"{dynasty}", fill=(255, 255, 255, 255))
    draw.text((card_width - 100, 30), f"{rarity}", fill=(255, 255, 255, 255))

    # Footer bar
    footer_top = 537
    draw.rectangle([(0, footer_top), (card_width, card_height)], fill=(0, 0, 0, 200))
    draw.text((card_width // 2 - 100, footer_top + 30), card_name, fill=(255, 255, 255, 255))
    draw.text((30, footer_top + 80), f"Speed: +{stats['speed']}%", fill=(255, 255, 255, 255))
    draw.text((30, footer_top + 110), f"Special: {stats['special']}", fill=(255, 255, 255, 255))
    draw.text((30, footer_top + 160), f"Gen {stats['gen']} • DNA: {stats['cost']} • {rarity}", fill=(200, 200, 200, 255))

    # Save card
    output_path.parent.mkdir(parents=True, exist_ok=True)
    card.save(output_path, format='PNG')

    file_size = output_path.stat().st_size / 1024
    print(f"✓ Created card: {output_path} ({file_size:.1f} KB)")

    return output_path


def main():
    """Generate all demo assets."""
    print("="*60)
    print("Demo Asset Generation")
    print("="*60)
    print()

    # Paths
    base_dir = Path(__file__).parent.parent
    demo_dir = base_dir / 'build' / 'demo'
    characters_dir = demo_dir / 'characters'
    animated_dir = demo_dir / 'cards' / 'animated'
    parallax_dir = demo_dir / 'cards' / 'parallax'
    effects_dir = demo_dir / 'effects'
    standard_dir = demo_dir / 'cards' / 'standard'

    dynasties = ['CYBER', 'PRIMAL', 'COSMIC']

    # Card stats (same for all variants in demo)
    stats = {
        'speed': 15,
        'special': 'Digital Dash',
        'gen': 3,
        'cost': 500
    }

    # Generate assets for each dynasty
    for dynasty in dynasties:
        print(f"\n{'='*60}")
        print(f"Processing {dynasty} Dynasty")
        print(f"{'='*60}")

        character_path = characters_dir / f"{dynasty}-Alpha.png"

        if not character_path.exists():
            print(f"✗ Character not found: {character_path}")
            continue

        # 1. Create animation sprite sheet
        create_animation_frames(character_path, animated_dir, dynasty)

        # 2. Create parallax layers
        create_parallax_layers(character_path, parallax_dir, dynasty)

        # 3. Compose standard card
        compose_card(
            character_path,
            standard_dir / f"{dynasty}-Alpha-Common-Standard.png",
            dynasty,
            f"{dynasty}-Alpha",
            "Common",
            stats
        )

    # 4. Create holographic overlay (once)
    create_holographic_overlay(effects_dir / "holographic-overlay.png")

    print(f"\n{'='*60}")
    print("✓ Demo asset generation complete!")
    print(f"{'='*60}")
    print(f"\nGenerated assets:")
    print(f"  - 3 animated sprite sheets (8 frames each)")
    print(f"  - 15 parallax depth layers (5 per dynasty)")
    print(f"  - 3 standard quality cards")
    print(f"  - 1 holographic overlay texture")
    print(f"\nOutput directory: {demo_dir}")


if __name__ == '__main__':
    main()
