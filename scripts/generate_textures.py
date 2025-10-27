#!/usr/bin/env python3
"""
Generate subtle texture overlays for card backgrounds.
Based on AAA research findings: textures should be barely visible (5-10% opacity).
"""

import os
from PIL import Image, ImageDraw
import numpy as np
import random

# Output directory
OUTPUT_DIR = "build/demo/textures"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Texture dimensions (match card size)
WIDTH, HEIGHT = 512, 768


def generate_digital_grid(output_path):
    """
    Generate subtle digital grid pattern for CYBER dynasty.

    Pattern: Faint circuit board traces (1px lines, 5% opacity when applied).
    Style: Geometric, technological, organized.
    """
    print(f"Generating CYBER digital grid texture...")

    # Create image with transparency
    img = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Grid spacing (larger = more subtle)
    grid_spacing = 32

    # Very faint white lines (will be applied at 5% opacity in composition)
    line_color = (255, 255, 255, 30)  # 30/255 ≈ 12% opacity

    # Vertical lines
    for x in range(0, WIDTH, grid_spacing):
        # Vary line thickness slightly for organic feel
        if random.random() < 0.3:  # 30% of lines slightly offset
            offset = random.randint(-2, 2)
            draw.line([(x + offset, 0), (x + offset, HEIGHT)], fill=line_color, width=1)
        else:
            draw.line([(x, 0), (x, HEIGHT)], fill=line_color, width=1)

    # Horizontal lines
    for y in range(0, HEIGHT, grid_spacing):
        if random.random() < 0.3:
            offset = random.randint(-2, 2)
            draw.line([(0, y + offset), (WIDTH, y + offset)], fill=line_color, width=1)
        else:
            draw.line([(0, y), (WIDTH, y)], fill=line_color, width=1)

    # Add occasional circuit-like connections
    for _ in range(15):
        x = random.randint(0, WIDTH)
        y = random.randint(0, HEIGHT)
        # Small L-shaped connectors
        length = random.randint(10, 30)
        draw.line([(x, y), (x + length, y)], fill=line_color, width=1)
        draw.line([(x + length, y), (x + length, y + length)], fill=line_color, width=1)

    img.save(output_path, 'PNG')
    print(f"  ✓ Saved: {output_path}")
    print(f"  → Apply at 5% opacity for subtle effect")


def generate_organic_paper(output_path):
    """
    Generate organic paper/canvas texture for PRIMAL dynasty.

    Pattern: Linen weave/canvas grain (8% opacity when applied).
    Style: Natural, textured, irregular.
    """
    print(f"Generating PRIMAL organic paper texture...")

    # Create base noise using numpy
    # Use lower frequency noise for paper grain
    np.random.seed(42)  # Consistent pattern
    noise = np.random.rand(HEIGHT, WIDTH) * 255

    # Apply Gaussian-like blur by averaging nearby pixels (simple convolution)
    # This creates a more organic, paper-like texture
    kernel_size = 3
    blurred = np.zeros_like(noise)
    for i in range(kernel_size, HEIGHT - kernel_size):
        for j in range(kernel_size, WIDTH - kernel_size):
            blurred[i, j] = np.mean(noise[i-kernel_size:i+kernel_size+1, j-kernel_size:j+kernel_size+1])

    # Normalize to 0-255 range
    blurred = ((blurred - blurred.min()) / (blurred.max() - blurred.min()) * 255).astype(np.uint8)

    # Create image from noise
    img = Image.fromarray(blurred, mode='L')

    # Convert to RGBA with low opacity (will be applied at 8% in composition)
    img_rgba = Image.new('RGBA', (WIDTH, HEIGHT))

    # Create texture with varying opacity based on noise
    pixels = img_rgba.load()
    gray_pixels = img.load()

    for y in range(HEIGHT):
        for x in range(WIDTH):
            gray_value = gray_pixels[x, y]
            # Map gray value to subtle opacity variation
            # Center around 20 alpha (8% of 255), vary by ±10
            alpha = int(20 + (gray_value - 128) / 12.8)
            alpha = max(10, min(30, alpha))  # Clamp to 10-30 range
            pixels[x, y] = (255, 255, 255, alpha)

    img_rgba.save(output_path, 'PNG')
    print(f"  ✓ Saved: {output_path}")
    print(f"  → Apply at 8% opacity for subtle canvas grain")


def generate_nebula_subtle(output_path):
    """
    Generate subtle nebula/star field for COSMIC dynasty.

    Pattern: Scattered stars and faint nebula wisps (10% opacity when applied).
    Style: Ethereal, cosmic, mysterious.
    """
    print(f"Generating COSMIC nebula texture...")

    # Create image with transparency
    img = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Generate star field
    num_stars = 80
    for _ in range(num_stars):
        x = random.randint(0, WIDTH)
        y = random.randint(0, HEIGHT)

        # Vary star size (most small, few larger)
        size = random.choices([1, 2, 3], weights=[70, 25, 5])[0]

        # Vary brightness
        brightness = random.randint(180, 255)
        alpha = random.randint(40, 100)

        if size == 1:
            # Single pixel star
            draw.point((x, y), fill=(brightness, brightness, brightness, alpha))
        elif size == 2:
            # Small cross
            draw.point((x, y), fill=(brightness, brightness, brightness, alpha))
            draw.point((x+1, y), fill=(brightness, brightness, brightness, alpha//2))
            draw.point((x-1, y), fill=(brightness, brightness, brightness, alpha//2))
            draw.point((x, y+1), fill=(brightness, brightness, brightness, alpha//2))
            draw.point((x, y-1), fill=(brightness, brightness, brightness, alpha//2))
        else:
            # Larger star with glow
            draw.ellipse([x-1, y-1, x+1, y+1], fill=(brightness, brightness, brightness, alpha))
            draw.ellipse([x-2, y-2, x+2, y+2], fill=(brightness, brightness, brightness, alpha//3))

    # Add subtle nebula wisps using noise
    np.random.seed(123)
    noise = np.random.rand(HEIGHT // 4, WIDTH // 4)

    # Blur the noise to create nebula-like clouds
    # Resize to full resolution
    noise_img = Image.fromarray((noise * 255).astype(np.uint8), mode='L')
    noise_img = noise_img.resize((WIDTH, HEIGHT), Image.Resampling.BILINEAR)

    # Apply as very faint purple/blue tint
    pixels = img.load()
    noise_pixels = noise_img.load()

    for y in range(HEIGHT):
        for x in range(WIDTH):
            noise_value = noise_pixels[x, y]
            if noise_value > 200:  # Only brightest 20% becomes nebula
                # Faint purple/violet glow
                alpha = int((noise_value - 200) / 55 * 25)  # 0-25 alpha
                r_existing, g_existing, b_existing, a_existing = pixels[x, y]
                # Blend with existing (stars)
                pixels[x, y] = (
                    min(255, r_existing + 180),
                    min(255, g_existing + 150),
                    min(255, b_existing + 255),
                    min(255, a_existing + alpha)
                )

    img.save(output_path, 'PNG')
    print(f"  ✓ Saved: {output_path}")
    print(f"  → Apply at 10% opacity for subtle cosmic atmosphere")


def main():
    """Generate all texture assets."""
    print("=" * 60)
    print("Generating Subtle Texture Overlays")
    print("Based on AAA Card Standards Research")
    print("=" * 60)
    print()

    # Generate CYBER texture
    digital_grid_path = os.path.join(OUTPUT_DIR, "digital-grid.png")
    generate_digital_grid(digital_grid_path)
    print()

    # Generate PRIMAL texture
    organic_paper_path = os.path.join(OUTPUT_DIR, "organic-paper.png")
    generate_organic_paper(organic_paper_path)
    print()

    # Generate COSMIC texture
    nebula_subtle_path = os.path.join(OUTPUT_DIR, "nebula-subtle.png")
    generate_nebula_subtle(nebula_subtle_path)
    print()

    print("=" * 60)
    print("✓ All textures generated successfully")
    print("=" * 60)
    print()
    print("Usage in card composition:")
    print("  CYBER:  Composite digital-grid.png at 5% opacity over background")
    print("  PRIMAL: Composite organic-paper.png at 8% opacity over background")
    print("  COSMIC: Composite nebula-subtle.png at 10% opacity over background")
    print()
    print("These textures provide subtle visual interest without being obvious.")
    print("Premium quality = restraint and polish.")


if __name__ == "__main__":
    main()
