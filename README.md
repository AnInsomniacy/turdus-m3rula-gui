# Turdus M3rula GUI

Modern cross-platform desktop application for iOS/iPadOS device restoration and downgrade operations using the [turdus merula](https://sep.lol) toolchain. Built with Electron, React, and Tailwind CSS.

![Application Screenshot](https://github.com/user-attachments/assets/9f44b624-56a8-4420-95be-3a3f69bb65bf)

## Overview

Turdus M3rula GUI provides a streamlined interface for executing complex iOS restoration workflows on A9-A10X chipsets. The application orchestrates multi-step downgrade procedures with persistent project management, automated file handling, and real-time process monitoring.

## Supported Hardware

- **Chipsets**: A9, A10, A10X
- **iOS/iPadOS**: All firmware versions compatible with target device
- **Platforms**: macOS 10.12+, Linux (x64/arm64)

> **Note**: A11 and newer chipsets are not supported by the underlying turdus merula toolchain.

## Key Features

### Workflow Management
- **Dual-mode operations**: Tethered and untethered restore procedures
- **Project persistence**: State tracking with automatic session recovery
- **Progress visualization**: Step-by-step execution with completion indicators
- **Intelligent validation**: Prerequisite checks before step execution

### File Handling
- **Automatic directory structure**: Project scaffolding with required subdirectories
- **Generator extraction**: SHSH blob parsing with automatic generator detection
- **Artifact management**: Binary file organization and latest-file renaming
- **Temporary cleanup**: Post-execution file consolidation

### User Experience
- **Real-time console**: ANSI-colored terminal output with auto-scroll
- **Modal transitions**: Smooth animations for success/failure dialogs
- **Custom window controls**: Frameless window with minimize/maximize/close
- **Responsive layout**: Adaptive sidebar and content panels

## Technical Stack

- **Runtime**: Electron 30.0.0
- **UI Framework**: React 18.3.1
- **Styling**: Tailwind CSS 3.4.17
- **Build Tool**: Vite 5.4.8
- **Terminal Processing**: ansi-to-html for ANSI escape sequence rendering

## Prerequisites

### Required Binaries
Place the following executables in the `bin/` directory:
- `turdusra1n`: DFU mode handler and device communication
- `turdus_merula`: Core restoration engine

### System Requirements
- **Node.js**: 16.x or later
- **npm**: 8.x or later
- **macOS**: 10.12+ with IOKit USB backend
- **Linux**: libusb-1.0 development headers

## Installation

```bash
git clone https://github.com/AnInsomniacy/turdus-m3rula-gui.git
cd turdus-m3rula-gui
npm install
```

## Usage

### Development Mode
```bash
npm run dev
```
Launches Vite dev server on port 5173 with hot module replacement.

### Production Build
```bash
npm run build
```
Generates optimized renderer bundle and packages Electron application as DMG (macOS) or AppImage/deb (Linux).

### Project Workflow

1. **Initialize Project**
   - Click "New Project" or "Open Project" on launch modal
   - Select parent directory for new projects
   - Existing projects auto-create missing `block/` and `image4/` subdirectories

2. **Configure Device**
   - Select chipset: A9 or A10/A10X
   - Choose mode: Tethered or Untethered

3. **Load Assets**
   - **IPSW**: Target firmware file
   - **SHSH Blob** (untethered only): Generator auto-extracted on load
   - **Generator** (untethered only): Manual override if extraction fails

4. **Execute Steps**
   - Click next available step or use "Next" button after completion
   - Follow DFU mode prompts between steps
   - Monitor console output for process status

## Restoration Procedures

### A9 Tethered (5 Steps)
1. **Get SHC (pre)**: Extract secure hash chain before restore
2. **Restore Device**: Flash firmware with pre-restore SHC
3. **Get SHC (post)**: Extract post-restore secure hash chain
4. **Get pteblock**: Generate page table entry block using signed SEP
5. **Boot Device**: Execute tethered boot sequence

### A10/A10X Tethered (2 Steps)
1. **Restore Device**: Flash firmware without SHC requirements
2. **Boot Device**: Execute tethered boot with iBoot and SEP files

### A9 Untethered (2 Steps)
1. **Get SHC Block**: Extract secure hash chain for untethered restore
2. **Untethered Restore**: Flash firmware with SHSH blob validation

### A10/A10X Untethered (1 Step)
1. **Untethered Restore**: Direct restore using SHSH blob

## Project Structure

```
project-directory/
├── project.json           # Configuration and state
├── block/                 # Temporary block artifacts
├── image4/                # Temporary Image4 files
├── shcblock_pre.bin       # A9 pre-restore SHC
├── shcblock_post.bin      # A9 post-restore SHC
├── pteblock.bin           # A9 page table entry block
├── shcblock_unteth.bin    # A9 untethered SHC
├── restore_done           # Restore completion marker
└── boot_done              # Boot completion marker
```

### Configuration Schema (`project.json`)
```json
{
  "ipsw": "/path/to/firmware.ipsw",
  "blob": "/path/to/shsh2.shsh",
  "gen": "0x1111111111111111",
  "chip": "A9",
  "mode": "Tethered",
  "completedSteps": [0, 1, 2]
}
```

## Credits

- **turdus merula**: Core restoration engine by [sep.lol team](https://sep.lol)
- **turdusra1n**: DFU mode handler and USB communication layer
- **GUI Implementation**: Electron/React interface by project contributors
