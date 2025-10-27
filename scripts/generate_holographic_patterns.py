#!/usr/bin/env python3
"""
Generate dynasty-specific holographic foil patterns
for premium card effects (Yu-Gi-Oh! Ultimate Rare style)

Creates 3 unique holographic patterns:
- CYBER: Digital scan lines + hexagonal grid
- PRIMAL: Wood grain + organic cells
- COSMIC: Stars + nebula wisps
"""

from PIL import Image, ImageDraw
import numpy as np
import math
from pathlib import Path


# Pattern dimensions (match card size)
WIDTH, HEIGHT = 512, 768


def generate_cyber_holographic(output_path: Path):
    """
    CYBER holographic pattern: Digital scan lines + hexagonal grid
    Creates a futuristic, tech-inspired shimmer pattern
    """
    print(f"Generating CYBER holographic pattern...")

    # Create base image
    img = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Scan lines (horizontal)
    line_spacing = 8
    for y in range(0, HEIGHT, line_spacing):
        opacity = int(40 + 20 * math.sin(y / 50))  # Varying opacity
        color = (0, 212, 255, opacity)  # Cyan with varying alpha
        draw.line([(0, y), (WIDTH, y)], fill=color, width=1)

    # Hexagonal grid pattern
    hex_size = 30
    hex_height = hex_size * math.sqrt(3)

    for row in range(-1, int(HEIGHT / hex_height) + 2):
        for col in range(-1, int(WIDTH / (hex_size * 1.5)) + 2):
            # Offset every other row
            offset_x = hex_size * 0.75 if row % 2 == 1 else 0
            center_x = col * hex_size * 1.5 + offset_x
            center_y = row * hex_height

            # Draw hexagon outline
            points = []
            for i in range(6):
                angle = math.pi / 3 * i
                px = center_x + hex_size * 0.5 * math.cos(angle)
                py = center_y + hex_size * 0.5 * math.sin(angle)
                points.append((px, py))

            # Vary opacity based on position
            opacity = int(30 + 15 * math.sin((center_x + center_y) / 100))
            color = (0, 255, 255, opacity)  # Bright cyan
            draw.polygon(points, outline=color)

    # Diagonal accent lines (creates shimmer direction)
    for i in range(-HEIGHT, WIDTH, 60):
        opacity = int(50 + 30 * math.sin(i / 80))
        color = (255, 255, 255, opacity)  # White highlights
        draw.line([(i, 0), (i + HEIGHT, HEIGHT)], fill=color, width=2)

    img.save(output_path)
    print(f"  ✓ Saved: {output_path}")


def generate_primal_holographic(output_path: Path):
    """
    PRIMAL holographic pattern: Wood grain + organic cells
    Creates a natural, organic shimmer pattern
    """
    print(f"Generating PRIMAL holographic pattern...")

    # Create base image
    img = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    pixels = np.array(img)

    # Wood grain texture (Perlin-like noise)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            # Create wood grain pattern
            grain = math.sin(x / 20 + math.sin(y / 40) * 3) * 127 + 128
            grain += math.sin(y / 30) * 20  # Add vertical variation

            # Map to golden-green gradient
            r = int(127 + grain * 0.3)  # Golden brown
            g = int(100 + grain * 0.4)  # Earth green
            b = int(50)
            a = int(40 + grain * 0.15)  # Varying opacity

            pixels[y, x] = [r, g, b, a]

    img = Image.fromarray(pixels)
    draw = ImageDraw.Draw(img)

    # Organic cell pattern (Voronoi-like)
    cell_points = []
    for i in range(30):
        x = np.random.randint(0, WIDTH)
        y = np.random.randint(0, HEIGHT)
        cell_points.append((x, y))

    # Draw organic cells
    for cx, cy in cell_points:
        radius = np.random.randint(20, 50)
        # Draw irregular cell outline
        for angle in np.linspace(0, 2 * math.pi, 8):
            r_var = radius + np.random.randint(-10, 10)
            x1 = cx + r_var * math.cos(angle)
            y1 = cy + r_var * math.sin(angle)
            x2 = cx + r_var * math.cos(angle + math.pi / 4)
            y2 = cy + r_var * math.sin(angle + math.pi / 4)

            opacity = np.random.randint(30, 60)
            color = (255, 215, 0, opacity)  # Gold
            draw.line([(x1, y1), (x2, y2)], fill=color, width=1)

    # Add flowing accent lines (leaf veins)
    for i in range(10):
        start_x = np.random.randint(0, WIDTH)
        start_y = np.random.randint(0, HEIGHT)

        points = [(start_x, start_y)]
        for step in range(50):
            last_x, last_y = points[-1]
            # Organic curve
            angle = step / 10 + math.sin(step / 5) * 0.5
            new_x = last_x + math.cos(angle) * 10
            new_y = last_y + math.sin(angle) * 10

            if 0 <= new_x < WIDTH and 0 <= new_y < HEIGHT:
                points.append((new_x, new_y))

        if len(points) > 1:
            opacity = np.random.randint(40, 70)
            color = (127, 255, 0, opacity)  # Chartreuse
            draw.line(points, fill=color, width=2)

    img.save(output_path)
    print(f"  ✓ Saved: {output_path}")


def generate_cosmic_holographic(output_path: Path):
    """
    COSMIC holographic pattern: Stars + nebula wisps
    Creates a celestial, ethereal shimmer pattern
    """
    print(f"Generating COSMIC holographic pattern...")

    # Create base image with dark nebula
    img = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    pixels = np.array(img)

    # Nebula wisps (gradient clouds)
    for y in range(HEIGHT):
        for x in range(WIDTH):
            # Create swirling nebula pattern
            dist_from_center = math.sqrt((x - WIDTH/2)**2 + (y - HEIGHT/2)**2)
            angle = math.atan2(y - HEIGHT/2, x - WIDTH/2)

            # Spiral pattern
            spiral = math.sin(angle * 3 + dist_from_center / 100) * 127 + 128
            nebula = math.sin(x / 80 + y / 60) * 50 + 100

            # Purple-violet gradient
            r = int(176 + spiral * 0.3)  # Violet
            g = int(38 + nebula * 0.2)   # Low green
            b = int(200 + spiral * 0.2)  # Blue-violet
            a = int(30 + nebula * 0.15)  # Wispy opacity

            pixels[y, x] = [r, g, b, a]

    img = Image.fromarray(pixels)
    draw = ImageDraw.Draw(img)

    # Add stars (various sizes)
    for i in range(150):
        x = np.random.randint(0, WIDTH)
        y = np.random.randint(0, HEIGHT)
        size = np.random.choice([1, 1, 1, 2, 2, 3])  # Mostly small stars
        opacity = np.random.randint(100, 255)

        # Star colors (white to violet)
        if np.random.random() < 0.8:
            color = (255, 255, 255, opacity)  # White
        else:
            color = (200, 100, 255, opacity)  # Violet

        # Draw star (circle for simplicity)
        draw.ellipse([x-size, y-size, x+size, y+size], fill=color)

        # Add small cross sparkle to larger stars
        if size >= 2:
            draw.line([(x-size*2, y), (x+size*2, y)], fill=color, width=1)
            draw.line([(x, y-size*2), (x, y+size*2)], fill=color, width=1)

    # Add nebula accent streaks (cosmic dust lanes)
    for i in range(15):
        start_x = np.random.randint(0, WIDTH)
        start_y = np.random.randint(0, HEIGHT)

        angle = np.random.uniform(0, 2 * math.pi)
        length = np.random.randint(100, 300)

        end_x = start_x + length * math.cos(angle)
        end_y = start_y + length * math.sin(angle)

        opacity = np.random.randint(40, 80)
        # Pink-purple cosmic dust
        color = (255, 100, 200, opacity)
        draw.line([(start_x, start_y), (end_x, end_y)], fill=color, width=3)

    img.save(output_path)
    print(f"  ✓ Saved: {output_path}")


def main():
    """Generate all holographic patterns"""
    print("\n=== Generating Holographic Foil Patterns ===\n")

    # Create output directory
    output_dir = Path("build/demo/holographic")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate patterns
    generate_cyber_holographic(output_dir / "holographic-cyber.png")
    generate_primal_holographic(output_dir / "holographic-primal.png")
    generate_cosmic_holographic(output_dir / "holographic-cosmic.png")

    print("\n=== ✓ Holographic Patterns Complete ===\n")
    print(f"Generated 3 dynasty-specific patterns in: {output_dir}")
    print("\nUsage:")
    print("  - CYBER: Digital/futuristic shimmer")
    print("  - PRIMAL: Organic/natural shimmer")
    print("  - COSMIC: Celestial/ethereal shimmer")
    print("\nThese patterns will be animated with CSS for foil effects.")


if __name__ == "__main__":
    main()
