#!/usr/bin/env python3
"""Remove console.log statements from TypeScript files."""

import re
import sys


def remove_console_logs(content):
    """Remove all console.log statements, handling multi-line cases."""

    # Pattern to match console.log with proper parenthesis balancing
    # This handles both single-line and multi-line console.log statements
    result = []
    lines = content.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]

        # Check if this line starts a console.log statement
        stripped = line.lstrip()
        if stripped.startswith("console.log("):
            # Find the matching closing parenthesis
            indent = line[: len(line) - len(stripped)]
            paren_count = 0
            in_console_log = False
            j = i

            while j < len(lines):
                current_line = lines[j]
                for char in current_line:
                    if char == "(":
                        paren_count += 1
                        in_console_log = True
                    elif char == ")":
                        paren_count -= 1
                        if in_console_log and paren_count == 0:
                            # Found the end of console.log
                            # Skip all lines from i to j inclusive
                            i = j + 1
                            break
                else:
                    # Didn't break, continue to next line
                    j += 1
                    continue
                break
        else:
            result.append(line)
            i += 1

    return "\n".join(result)


def main():
    if len(sys.argv) != 2:
        print("Usage: remove_console_logs.py <file>")
        sys.exit(1)

    filepath = sys.argv[1]

    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    modified_content = remove_console_logs(content)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(modified_content)

    print(f"Removed console.log statements from {filepath}")


if __name__ == "__main__":
    main()
