#!/usr/bin/env python3
"""
VS Code Icon Recoloring Script

This script takes a VS Code icon and creates a recolored version based on user-provided RGB values.
The blue parts of the original icon will be replaced with the specified color.

Usage:
    python recolor-vscode-icon.py <input_icon> <output_icon> <r> <g> <b>
    python recolor-vscode-icon.py icon.png new_icon.png 255 0 128

Requirements:
    - Pillow (PIL) for image processing
"""

import sys
import argparse
from pathlib import Path
from PIL import Image
import colorsys


def hex_to_rgb(hex_color):
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def rgb_to_hsv(r, g, b):
    """Convert RGB to HSV."""
    return colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)


def hsv_to_rgb(h, s, v):
    """Convert HSV to RGB."""
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return (int(r * 255), int(g * 255), int(b * 255))


def is_blue_pixel(pixel, tolerance=30):
    """
    Determine if a pixel is predominantly blue.
    VS Code's blue is typically around RGB(0, 122, 204) or similar blues.
    """
    r, g, b = pixel[:3]

    # Check if it's a blue-ish pixel
    # Blue should be dominant, and not too dark/light
    if b > r and b > g and b > 100:
        return True

    # Check for specific VS Code blue ranges
    vscode_blues = [
        (0, 122, 204),  # Primary VS Code blue
        (37, 99, 235),  # Another common blue
        (59, 130, 246),  # Lighter blue variant
    ]

    for blue_r, blue_g, blue_b in vscode_blues:
        if (
            abs(r - blue_r) < tolerance
            and abs(g - blue_g) < tolerance
            and abs(b - blue_b) < tolerance
        ):
            return True

    return False


def recolor_icon(
    input_path,
    output_path,
    target_rgb,
    tolerance=30,
    preserve_brightness=True,
    desktop_mode=False,
):
    """
    Recolor the VS Code icon by replacing blue pixels with the target color.

    Args:
        input_path: Path to input icon
        output_path: Path for output icon
        target_rgb: Target RGB color tuple (r, g, b)
        tolerance: Color matching tolerance
        preserve_brightness: Whether to preserve original brightness
        desktop_mode: Whether to include larger sizes for desktop use
    """
    try:
        # Open the image
        img = Image.open(input_path)

        # Convert to RGBA if not already
        if img.mode != "RGBA":
            img = img.convert("RGBA")

        # Get image data
        pixels = img.load()
        width, height = img.size

        # Target color components
        target_r, target_g, target_b = target_rgb
        target_h, target_s, target_v = rgb_to_hsv(target_r, target_g, target_b)

        print(f"Processing {width}x{height} image...")
        print(f"Target color: RGB{target_rgb}")

        modified_pixels = 0

        # Process each pixel
        for x in range(width):
            for y in range(height):
                pixel = pixels[x, y]

                # Skip transparent pixels
                if len(pixel) == 4 and pixel[3] == 0:
                    continue

                # Check if this is a blue pixel we want to recolor
                if is_blue_pixel(pixel, tolerance):
                    if preserve_brightness:
                        # Preserve the original brightness and saturation
                        orig_r, orig_g, orig_b = pixel[:3]
                        orig_h, orig_s, orig_v = rgb_to_hsv(orig_r, orig_g, orig_b)

                        # Use target hue but preserve original saturation and value
                        new_r, new_g, new_b = hsv_to_rgb(target_h, orig_s, orig_v)
                    else:
                        # Use target color directly
                        new_r, new_g, new_b = target_rgb

                    # Preserve alpha channel
                    if len(pixel) == 4:
                        pixels[x, y] = (new_r, new_g, new_b, pixel[3])
                    else:
                        pixels[x, y] = (new_r, new_g, new_b)

                    modified_pixels += 1

        print(f"Modified {modified_pixels} pixels")

        # Determine output format based on file extension
        output_ext = output_path.lower().split(".")[-1]

        # Save the result
        if output_ext == "ico":
            # For ICO files, create multiple sizes
            if desktop_mode:
                # Desktop icons: include original size if it's large, plus standard sizes
                original_size = img.size
                sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

                # If original image is larger than 256x256, include it as the largest size
                if original_size[0] > 256 or original_size[1] > 256:
                    # Add 512x512 and original size for high-res displays
                    if original_size[0] >= 512 and original_size[1] >= 512:
                        sizes.extend([(512, 512)])
                    # Add the original size (but cap at reasonable limit for ICO files)
                    max_size = min(original_size[0], original_size[1], 1024)
                    if max_size > 256:
                        sizes.append((max_size, max_size))
            else:
                # Standard sizes for smaller icons
                sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]

            print(f"Creating ICO with sizes: {sizes}")
            images = []

            for size in sizes:
                if img.size != size:
                    resized_img = img.resize(size, Image.Resampling.LANCZOS)
                    images.append(resized_img)
                else:
                    images.append(img.copy())

            # Save as ICO with multiple sizes
            images[0].save(
                output_path,
                format="ICO",
                sizes=[(im.size[0], im.size[1]) for im in images],
            )
        else:
            img.save(output_path)

        print(f"Recolored icon saved to: {output_path}")

        return True

    except Exception as e:
        print(f"Error processing image: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Recolor VS Code icons by replacing blue with a custom RGB color",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Recolor to red (PNG output)
  python recolor-vscode-icon.py vscode.png vscode-red.png 255 0 0
  
  # Recolor to purple (ICO output)
  python recolor-vscode-icon.py vscode.png vscode-purple.ico 128 0 128
  
  # Recolor to green with hex input (desktop ICO with large sizes)
  python recolor-vscode-icon.py vscode.png vscode-green.ico #00FF00 --desktop
  
  # Recolor to brown for desktop use (includes 128x128 and 256x256 sizes)
  python recolor-vscode-icon.py vscode.png vscode-brown.ico #b14b0b --desktop
  
  # Recolor to brown with hex input (ICO output)
  python recolor-vscode-icon.py vscode.png vscode-brown.ico #b14b0b
  
  # Recolor using --hex option (ICO output)
  python recolor-vscode-icon.py vscode.png vscode-blue.ico --hex #0066CC
  
  # Adjust tolerance for color matching
  python recolor-vscode-icon.py vscode.png vscode-orange.png 255 165 0 --tolerance 50
        """,
    )

    parser.add_argument("input", help="Input icon file (PNG, ICO, etc.)")
    parser.add_argument(
        "output",
        help="Output icon file (PNG, ICO, etc.) - format determined by extension",
    )

    # Color input options
    parser.add_argument(
        "color",
        nargs="*",
        metavar="COLOR",
        help="Color input: either 3 RGB values (255 0 0) or hex code (#FF0000 or #b14b0b)",
    )
    parser.add_argument("--hex", help="Hex color code (e.g., #FF0000 or #b14b0b)")

    # Optional parameters
    parser.add_argument(
        "--tolerance",
        type=int,
        default=30,
        help="Color matching tolerance (default: 30)",
    )
    parser.add_argument(
        "--desktop",
        action="store_true",
        help="Generate larger icon sizes optimized for desktop use (includes 128x128 and 256x256)",
    )
    parser.add_argument(
        "--no-preserve-brightness",
        action="store_true",
        help="Don't preserve original brightness/saturation",
    )

    args = parser.parse_args()

    # Validate input file
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file '{args.input}' not found")
        return 1

    # Validate color input - must have either color args or --hex
    if args.color and args.hex:
        print("Error: Please provide either color values OR --hex option, not both")
        return 1

    if not args.color and not args.hex:
        print(
            "Error: Please provide color input: either RGB values (R G B) or hex code (#FF0000)"
        )
        return 1

    # Determine target RGB
    if args.color:
        # Check if it's a hex color (single argument starting with #)
        if len(args.color) == 1 and args.color[0].startswith("#"):
            try:
                target_rgb = hex_to_rgb(args.color[0])
            except ValueError:
                print(f"Error: Invalid hex color '{args.color[0]}'")
                return 1
        # Check if it's RGB values (3 numeric arguments)
        else:
            try:
                rgb_values = [int(x) for x in args.color]
            except ValueError:
                print("Error: RGB values must be numbers")
                return 1

            if len(rgb_values) != 3:
                print(
                    "Error: RGB requires exactly 3 values (R G B) or use hex format (#FF0000)"
                )
                return 1

            target_rgb = tuple(rgb_values)
            # Validate RGB values
            for i, val in enumerate(["R", "G", "B"]):
                if not 0 <= rgb_values[i] <= 255:
                    print(f"Error: {val} value must be between 0 and 255")
                    return 1
    else:
        try:
            target_rgb = hex_to_rgb(args.hex)
        except ValueError:
            print(f"Error: Invalid hex color '{args.hex}'")
            return 1

    # Process the image
    preserve_brightness = not args.no_preserve_brightness

    success = recolor_icon(
        input_path,
        args.output,
        target_rgb,
        tolerance=args.tolerance,
        preserve_brightness=preserve_brightness,
        desktop_mode=args.desktop,
    )

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
