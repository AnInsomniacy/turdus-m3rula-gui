# Turdus M3rula GUI

A PyQt6-based graphical interface for [turdus merula](https://sep.lol), enabling iOS/iPadOS downgrades on A9-A10X devices without compatible SEP firmware requirements.

## Overview

This tool provides a streamlined workflow for downgrading iOS/iPadOS devices using the turdus merula command-line utility. It manages the multi-step process through an intuitive interface with project-based state management and automated file handling.

## Supported Devices

- **Chipsets**: A9, A10, A10X
- **iOS/iPadOS**: All versions previously supported by the device
- **Note**: A11 and newer processors are not supported

## Features

- **Dual Mode Support**: Tethered and untethered downgrade workflows
- **Project Management**: Persistent state tracking across sessions
- **File Organization**: Automatic handling of IPSW, SHSH blobs, and generated artifacts
- **Step-by-Step Guidance**: Sequential execution with progress tracking
- **Drag-and-Drop**: Quick file selection for IPSW and SHSH files
- **Real-time Output**: Live process monitoring with ANSI color support
- **Generator Extraction**: Automatic parsing from SHSH blobs

## Requirements

- Python 3.8+
- PyQt6
- macOS 10.12+ or Linux (amd64/arm64)
- `turdusra1n` binary
- `turdus_merula` binary

## Installation

1. Clone the repository:
```bash
git clone https://github.com/AnInsomniacy/turdus-m3rula-gui.git
cd turdus-m3rula-gui
```

2. Install dependencies:
```bash
pip install PyQt6
```

3. Ensure `turdusra1n` and `turdus_merula` binaries are in the project root directory.

## Usage

### Launch Application
```bash
python turdus_m3rula_gui.py
```

### Workflow

1. **Create/Open Project**: Initialize a working directory for state persistence
2. **Select Chip**: Choose A9 or A10 based on device chipset
3. **Choose Mode**:
   - **Tethered**: Requires re-boot assistance after each restart
   - **Untethered**: Permanent downgrade (requires SHSH blob)
4. **Load Files**:
   - IPSW: Target iOS firmware file
   - SHSH Blob: Only for untethered mode (generator auto-extracted)
5. **Execute Steps**: Follow sequential steps, entering DFU mode as prompted

### A9 Tethered Process
1. Get SHC block (pre-restore)
2. Restore device
3. Get SHC block (post-restore)
4. Get PTE block
5. Boot device

### A10 Tethered Process
1. Restore device
2. Boot device

### A9 Untethered Process
1. Get SHC block
2. Untethered restore

### A10 Untethered Process
1. Untethered restore

## Keyboard Shortcuts

- `Ctrl+L`: Clear output log
- `Return`: Send Enter to process

## Project Structure

Each project creates a `project.json` file storing:
- IPSW path
- SHSH blob path (untethered)
- Generator value (untethered)
- Chip selection

Generated artifacts (`.bin`, `.img4`, `.im4p`) are stored in the project directory.

## Notes

- **DFU Mode**: Required between steps; dialog prompts guide re-entry
- **A9 Stability**: Untethered restores may require multiple attempts
- **File Management**: Temporary subdirectories (`block/`, `image4/`) are automatically cleaned
- **SEP Firmware**: Place signed SEP files in project directory for tethered A9 step 4

## Disclaimer

This tool is provided for educational and research purposes. Downgrading iOS firmware may void warranties and cause device instability. Users assume all risks.

## Credits

- [turdus merula](https://sep.lol) by the original developers
- GUI implementation using PyQt6

## License

See individual component licenses for turdus merula and turdusra1n binaries.
