#!/usr/bin/env python3

import re
import subprocess
import sys
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Callable

from PyQt6.QtCore import Qt, QProcess, pyqtSignal, QObject
from PyQt6.QtGui import QFont, QTextCursor, QDragEnterEvent, QDropEvent, QKeySequence, QShortcut
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QSplitter, QPushButton, QTextEdit, QLabel, QRadioButton,
    QButtonGroup, QGroupBox, QProgressBar, QFileDialog, QMessageBox,
    QTabWidget, QListWidget, QInputDialog
)


class Config:
    ROOT = Path(__file__).parent.absolute()
    RAIN = ROOT / "turdusra1n"
    MERULA = ROOT / "turdus_merula"


class AnsiConverter:
    ANSI_CODES = {
        '91': '#FF6B6B', '92': '#51CF66', '93': '#FFD93D',
        '94': '#4DABF7', '95': '#CC5DE8', '96': '#22B8CF',
        '97': '#F8F9FA', '0': '#E9ECEF', '1': 'bold', '2': 'dim'
    }

    @staticmethod
    def to_html(text: str) -> str:
        result = text
        result = re.sub(r'\033\[(\d+)m', lambda m: AnsiConverter._convert(m.group(1)), result)
        result = result.replace('\n', '<br>')
        return result

    @staticmethod
    def _convert(code: str) -> str:
        color = AnsiConverter.ANSI_CODES.get(code, '')
        if color.startswith('#'):
            return f'</span><span style="color: {color};">'
        elif color == 'bold':
            return '<b>'
        elif color == 'dim':
            return '<span style="opacity: 0.6;">'
        return '</span>'


class ProcessRunner(QObject):
    output_received = pyqtSignal(str, str)
    process_finished = pyqtSignal(bool, int)
    command_chain_finished = pyqtSignal(bool)

    def __init__(self):
        super().__init__()
        self.process: Optional[QProcess] = None
        self.is_running = False
        self.command_queue = []

    def run(self, command: str):
        if self.is_running:
            return False

        self.process = QProcess()
        self.process.readyReadStandardOutput.connect(self._on_stdout)
        self.process.readyReadStandardError.connect(self._on_stderr)
        self.process.finished.connect(self._on_finished)

        self.output_received.emit("CMD", f"$ {command}")
        self.is_running = True
        self.process.start("sh", ["-c", command])
        return True

    def run_chain(self, commands: List[str]):
        self.command_queue = commands[:]
        self.process_finished.connect(self._on_chain_step_finished)
        if self.command_queue:
            self.run(self.command_queue.pop(0))

    def _on_chain_step_finished(self, success: bool, exit_code: int):
        if not success:
            self.command_queue.clear()
            self.process_finished.disconnect(self._on_chain_step_finished)
            self.command_chain_finished.emit(False)
            return

        if self.command_queue:
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(100, lambda: self.run(self.command_queue.pop(0)))
        else:
            self.process_finished.disconnect(self._on_chain_step_finished)
            self.command_chain_finished.emit(True)

    def stop(self):
        if self.process and self.is_running:
            self.process.kill()
            self.process.waitForFinished(3000)
            self.is_running = False
        self.command_queue.clear()

    def send_input(self, text: str):
        if self.process and self.is_running:
            self.process.write((text + "\n").encode())

    def _on_stdout(self):
        if self.process:
            data = self.process.readAllStandardOutput().data().decode('utf-8', errors='ignore')
            self.output_received.emit("OUT", data)

    def _on_stderr(self):
        if self.process:
            data = self.process.readAllStandardError().data().decode('utf-8', errors='ignore')
            self.output_received.emit("ERR", data)

    def _on_finished(self, exit_code: int, exit_status):
        self.is_running = False
        success = exit_code == 0
        self.process_finished.emit(success, exit_code)


class StepStatus:
    PENDING = 0
    RUNNING = 1
    SUCCESS = 2
    FAILED = 3


class Step:
    def __init__(self, name: str, func: Callable):
        self.name = name
        self.func = func
        self.status = StepStatus.PENDING


class StepManager(QObject):
    step_changed = pyqtSignal(int, int)

    def __init__(self):
        super().__init__()
        self.steps: List[Step] = []
        self.current_step = -1

    def set_steps(self, steps: List[Step]):
        self.steps = steps
        self.current_step = -1
        for step in self.steps:
            step.status = StepStatus.PENDING

    def start_step(self, index: int):
        if 0 <= index < len(self.steps):
            self.current_step = index
            self.steps[index].status = StepStatus.RUNNING
            self.step_changed.emit(index, StepStatus.RUNNING)

    def complete_step(self, index: int, success: bool):
        if 0 <= index < len(self.steps):
            self.steps[index].status = StepStatus.SUCCESS if success else StepStatus.FAILED
            self.step_changed.emit(index, self.steps[index].status)


class LogViewer(QTextEdit):
    def __init__(self):
        super().__init__()
        self.setReadOnly(True)
        self.setFont(QFont("Menlo", 9))
        self.setStyleSheet("QTextEdit { background-color: #1e1e1e; color: #d4d4d4; border: 1px solid #3e3e3e; }")

    def append_log(self, log_type: str, text: str):
        cursor = self.textCursor()
        cursor.movePosition(QTextCursor.MoveOperation.End)

        if log_type == "CMD":
            html = f'<span style="color: #4EC9B0; font-weight: bold;">{text}</span><br>'
        elif log_type == "ERR":
            html = f'<span style="color: #F48771;">{AnsiConverter.to_html(text)}</span>'
        else:
            html = AnsiConverter.to_html(text)

        cursor.insertHtml(html)
        self.setTextCursor(cursor)
        self.ensureCursorVisible()


class StepButton(QPushButton):
    def __init__(self, step_num: int, name: str):
        super().__init__(f"○ {step_num}. {name}")
        self.step_num = step_num
        self.name = name
        self.setMinimumHeight(26)
        self.is_next = False

    def update_status(self, status: int, is_next: bool = False):
        icons = {
            StepStatus.PENDING: "○",
            StepStatus.RUNNING: "⏸",
            StepStatus.SUCCESS: "✓",
            StepStatus.FAILED: "✗"
        }
        self.is_next = is_next

        # Use arrow for next step instead of circle
        if is_next and status == StepStatus.PENDING:
            icon = "→"
        else:
            icon = icons.get(status, "○")

        self.setText(f"{icon} {self.step_num}. {self.name}")


class ProjectState:
    def __init__(self):
        self.root_dir: Optional[Path] = None
        self.ipsw: Optional[str] = None
        self.blob: Optional[str] = None
        self.gen: Optional[str] = None
        self.chip: str = "A9"

    def save(self):
        if not self.root_dir:
            return
        state_file = self.root_dir / "project.json"
        data = {
            "ipsw": str(self.ipsw) if self.ipsw else None,
            "blob": str(self.blob) if self.blob else None,
            "gen": self.gen,
            "chip": self.chip
        }
        state_file.write_text(json.dumps(data, indent=2))

    def load(self, root_dir: Path):
        self.root_dir = root_dir
        state_file = root_dir / "project.json"
        if state_file.exists():
            data = json.loads(state_file.read_text())
            self.ipsw = data.get("ipsw")
            self.blob = data.get("blob")
            self.gen = data.get("gen")
            self.chip = data.get("chip", "A9")
        else:
            # Create new project.json with default values
            self.ipsw = None
            self.blob = None
            self.gen = None
            self.chip = "A9"
            self.save()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Turdus M3rula GUI")
        self.setGeometry(100, 100, 950, 650)

        self.state = ProjectState()
        self.runner = ProcessRunner()
        self.step_manager = StepManager()
        self.current_mode = "teth"
        self.is_executing = False
        self.current_step_callback = None

        self.runner.output_received.connect(self.on_output)
        self.runner.process_finished.connect(self.on_process_finished)
        self.runner.command_chain_finished.connect(self.on_command_chain_finished)
        self.step_manager.step_changed.connect(self.on_step_changed)

        self.init_ui()
        self.apply_shortcuts()
        self.setAcceptDrops(True)
        self.load_steps()

    def init_ui(self):
        central = QWidget()
        self.setCentralWidget(central)

        main_layout = QHBoxLayout()
        splitter = QSplitter(Qt.Orientation.Horizontal)

        left_panel = self.create_left_panel()
        right_panel = self.create_right_panel()

        splitter.addWidget(left_panel)
        splitter.addWidget(right_panel)
        splitter.setSizes([240, 710])

        main_layout.addWidget(splitter)
        central.setLayout(main_layout)

        self.statusBar().showMessage("Ready")

    def create_left_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout()
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        chip_group = self.create_chip_group()
        layout.addWidget(chip_group)

        mode_group = self.create_mode_group()
        layout.addWidget(mode_group)

        project_group = self.create_project_group()
        layout.addWidget(project_group)

        file_group = self.create_file_group()
        layout.addWidget(file_group)

        self.step_group = QGroupBox("Steps")
        self.step_layout = QVBoxLayout()
        self.step_layout.setContentsMargins(4, 6, 4, 4)
        self.step_layout.setSpacing(2)
        self.step_group.setLayout(self.step_layout)
        layout.addWidget(self.step_group)

        control_group = self.create_control_group()
        layout.addWidget(control_group)

        status_group = self.create_status_group()
        layout.addWidget(status_group)

        layout.addStretch()

        panel.setLayout(layout)
        panel.setMaximumWidth(240)

        return panel

    def create_chip_group(self) -> QGroupBox:
        group = QGroupBox("Chip")
        layout = QHBoxLayout()
        layout.setContentsMargins(4, 6, 4, 4)
        layout.setSpacing(2)

        self.chip_group = QButtonGroup()

        rb_a9 = QRadioButton("A9")
        rb_a9.toggled.connect(lambda checked: self.on_chip_changed("A9") if checked else None)
        self.chip_group.addButton(rb_a9, 0)
        layout.addWidget(rb_a9)
        rb_a9.setChecked(True)

        rb_a10 = QRadioButton("A10")
        rb_a10.toggled.connect(lambda checked: self.on_chip_changed("A10") if checked else None)
        self.chip_group.addButton(rb_a10, 1)
        layout.addWidget(rb_a10)

        group.setLayout(layout)
        return group

    def create_mode_group(self) -> QGroupBox:
        group = QGroupBox("Mode")
        layout = QHBoxLayout()
        layout.setContentsMargins(4, 6, 4, 4)
        layout.setSpacing(2)

        self.mode_group = QButtonGroup()

        rb_teth = QRadioButton("Tethered")
        rb_teth.toggled.connect(lambda checked: self.on_mode_changed("teth") if checked else None)
        self.mode_group.addButton(rb_teth, 0)
        layout.addWidget(rb_teth)
        rb_teth.setChecked(True)

        rb_unteth = QRadioButton("Untethered")
        rb_unteth.toggled.connect(lambda checked: self.on_mode_changed("unteth") if checked else None)
        self.mode_group.addButton(rb_unteth, 1)
        layout.addWidget(rb_unteth)

        group.setLayout(layout)
        return group

    def create_project_group(self) -> QGroupBox:
        group = QGroupBox("Project")
        layout = QVBoxLayout()
        layout.setContentsMargins(4, 6, 4, 4)
        layout.setSpacing(3)

        self.project_label = QLabel("No project loaded")
        self.project_label.setStyleSheet("font-size: 8pt; color: #888;")
        self.project_label.setWordWrap(True)
        layout.addWidget(self.project_label)

        btn_layout = QHBoxLayout()
        open_btn = QPushButton("📁 Open")
        open_btn.clicked.connect(self.open_project)
        create_btn = QPushButton("✨ Create")
        create_btn.clicked.connect(self.create_project)
        btn_layout.addWidget(open_btn)
        btn_layout.addWidget(create_btn)
        layout.addLayout(btn_layout)

        group.setLayout(layout)
        return group

    def create_file_group(self) -> QGroupBox:
        group = QGroupBox("Files")
        layout = QVBoxLayout()
        layout.setContentsMargins(4, 6, 4, 4)
        layout.setSpacing(3)

        ipsw_layout = QHBoxLayout()
        ipsw_btn = QPushButton("📁 IPSW")
        ipsw_btn.setMaximumHeight(26)
        ipsw_btn.clicked.connect(self.select_ipsw)
        self.ipsw_label = QLabel("---")
        self.ipsw_label.setStyleSheet("font-size: 8pt; color: #888;")
        ipsw_layout.addWidget(ipsw_btn, 1)
        ipsw_layout.addWidget(self.ipsw_label, 2)
        layout.addLayout(ipsw_layout)

        self.blob_widget = QWidget()
        blob_layout = QHBoxLayout()
        blob_layout.setContentsMargins(0, 0, 0, 0)
        blob_btn = QPushButton("📁 SHSH")
        blob_btn.setMaximumHeight(26)
        blob_btn.clicked.connect(self.select_blob)
        self.blob_label = QLabel("---")
        self.blob_label.setStyleSheet("font-size: 8pt; color: #888;")
        blob_layout.addWidget(blob_btn, 1)
        blob_layout.addWidget(self.blob_label, 2)
        self.blob_widget.setLayout(blob_layout)
        self.blob_widget.setVisible(False)
        layout.addWidget(self.blob_widget)

        group.setLayout(layout)
        return group

    def create_control_group(self) -> QGroupBox:
        group = QGroupBox("Control")
        layout = QHBoxLayout()
        layout.setContentsMargins(4, 6, 4, 4)
        layout.setSpacing(3)

        self.enter_btn = QPushButton("⏎ Enter")
        self.enter_btn.setMinimumHeight(32)
        self.enter_btn.clicked.connect(self.send_enter)
        layout.addWidget(self.enter_btn)

        self.stop_btn = QPushButton("⏹ Stop")
        self.stop_btn.setMinimumHeight(32)
        self.stop_btn.clicked.connect(self.stop_execution)
        layout.addWidget(self.stop_btn)

        group.setLayout(layout)
        return group

    def create_status_group(self) -> QGroupBox:
        group = QGroupBox("Status")
        layout = QVBoxLayout()
        layout.setContentsMargins(4, 6, 4, 4)
        layout.setSpacing(3)

        self.mode_label = QLabel("A9 Tethered")
        self.mode_label.setStyleSheet("font-size: 9pt;")
        layout.addWidget(self.mode_label)

        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        self.progress_bar.setMaximumHeight(18)
        layout.addWidget(self.progress_bar)

        self.current_label = QLabel("Idle")
        self.current_label.setStyleSheet("font-size: 8pt; color: #888;")
        self.current_label.setWordWrap(True)
        layout.addWidget(self.current_label)

        group.setLayout(layout)
        return group

    def create_right_panel(self) -> QWidget:
        panel = QWidget()
        layout = QVBoxLayout()
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(4)

        output_label = QLabel("Output")
        output_label.setStyleSheet("font-weight: bold;")
        layout.addWidget(output_label)

        self.log_viewer = LogViewer()
        layout.addWidget(self.log_viewer, 7)

        detail_label = QLabel("Details")
        detail_label.setStyleSheet("font-weight: bold;")
        layout.addWidget(detail_label)

        self.tab_widget = QTabWidget()
        self.tab_widget.setMaximumHeight(150)

        self.cmd_history = QListWidget()
        self.cmd_history.setStyleSheet("background-color: #2d2d2d; color: #d4d4d4; font-size: 9pt;")
        self.tab_widget.addTab(self.cmd_history, "History")

        self.file_list = QListWidget()
        self.file_list.setStyleSheet("background-color: #2d2d2d; color: #d4d4d4; font-size: 9pt;")
        self.tab_widget.addTab(self.file_list, "Files")

        self.sys_log = QTextEdit()
        self.sys_log.setReadOnly(True)
        self.sys_log.setStyleSheet("background-color: #2d2d2d; color: #d4d4d4; font-size: 9pt;")
        self.tab_widget.addTab(self.sys_log, "System")

        layout.addWidget(self.tab_widget, 3)

        panel.setLayout(layout)
        return panel

    def apply_shortcuts(self):
        QShortcut(QKeySequence("Ctrl+L"), self).activated.connect(self.log_viewer.clear)
        QShortcut(QKeySequence("Return"), self).activated.connect(self.send_enter)

    def on_chip_changed(self, chip: str):
        self.state.chip = chip
        self.state.save()
        self.update_status_label()
        self.load_steps()

    def on_mode_changed(self, mode: str):
        self.current_mode = mode

        if hasattr(self, 'mode_label'):
            self.update_status_label()

        if hasattr(self, 'blob_widget'):
            self.blob_widget.setVisible(mode == "unteth")

        self.load_steps()

    def update_status_label(self):
        if hasattr(self, 'mode_label'):
            mode_text = "Tethered" if self.current_mode == "teth" else "Untethered"
            self.mode_label.setText(f"{self.state.chip} {mode_text}")

    def open_project(self):
        dir_path = QFileDialog.getExistingDirectory(self, "Select Project Directory")
        if dir_path:
            self.load_project(Path(dir_path))

    def create_project(self):
        # Build default name: CPU_Mode_Timestamp
        mode_text = "Tethered" if self.current_mode == "teth" else "Untethered"
        default_name = f"{self.state.chip}_{mode_text}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        name, ok = QInputDialog.getText(self, "Create Project", "Project name:", text=default_name)
        if ok and name:
            parent_dir = QFileDialog.getExistingDirectory(self, "Select Parent Directory")
            if parent_dir:
                project_dir = Path(parent_dir) / name
                project_dir.mkdir(parents=True, exist_ok=True)
                self.load_project(project_dir)

    def load_project(self, project_dir: Path):
        # Check if project.json exists before loading
        project_json = project_dir / "project.json"
        is_new_project = not project_json.exists()

        self.state.load(project_dir)
        self.project_label.setText(str(project_dir.name))
        self.project_label.setStyleSheet("font-size: 8pt; color: #51CF66;")

        if self.state.ipsw and Path(self.state.ipsw).exists():
            self.ipsw_label.setText(Path(self.state.ipsw).name)
            self.ipsw_label.setStyleSheet("font-size: 8pt; color: #51CF66;")

        if self.state.blob and Path(self.state.blob).exists():
            self.blob_label.setText(Path(self.state.blob).name)
            self.blob_label.setStyleSheet("font-size: 8pt; color: #51CF66;")

        if is_new_project:
            self.log_system(f"Created new project: {project_dir}")
        else:
            self.log_system(f"Loaded existing project: {project_dir}")

        for i, btn in enumerate(self.chip_group.buttons()):
            if (i == 0 and self.state.chip == "A9") or (i == 1 and self.state.chip == "A10"):
                btn.setChecked(True)
                break

        self.detect_progress()
        self.refresh_files()
        self.update_step_buttons_state()

    def detect_progress(self):
        if not self.state.root_dir:
            return

        # Find the first pending step to mark as next
        next_step_index = -1

        for i, step in enumerate(self.step_manager.steps):
            if self.current_mode == "teth":
                if self.state.chip == "A9":
                    if i == 0 and (self.state.root_dir / "shcblock_pre.bin").exists():
                        step.status = StepStatus.SUCCESS
                    elif i == 1 and (self.state.root_dir / "restore_done").exists():
                        step.status = StepStatus.SUCCESS
                    elif i == 2 and (self.state.root_dir / "shcblock_post.bin").exists():
                        step.status = StepStatus.SUCCESS
                    elif i == 3 and (self.state.root_dir / "pteblock.bin").exists():
                        step.status = StepStatus.SUCCESS
                else:
                    if i == 0 and (self.state.root_dir / "restore_done").exists():
                        step.status = StepStatus.SUCCESS
            else:
                # Untethered mode
                if self.state.chip == "A9":
                    if i == 0 and (self.state.root_dir / "shcblock_unteth.bin").exists():
                        step.status = StepStatus.SUCCESS
                    elif i == 1 and (self.state.root_dir / "restore_done").exists():
                        step.status = StepStatus.SUCCESS
                else:
                    # A10 untethered
                    if i == 0 and (self.state.root_dir / "restore_done").exists():
                        step.status = StepStatus.SUCCESS

            # Find first pending step
            if next_step_index == -1 and step.status == StepStatus.PENDING:
                next_step_index = i

            if hasattr(self, 'step_buttons') and i < len(self.step_buttons):
                is_next = (i == next_step_index)
                self.step_buttons[i].update_status(step.status, is_next)

        self.update_progress()

    def load_steps(self):
        if not hasattr(self, 'step_layout'):
            return

        while self.step_layout.count():
            child = self.step_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        if self.current_mode == "teth":
            if self.state.chip == "A9":
                steps = [
                    Step("Get SHC (pre)", self.step_a9_teth_get_shc_pre),
                    Step("Restore Device", self.step_a9_teth_restore),
                    Step("Get SHC (post)", self.step_a9_teth_get_shc_post),
                    Step("Get pteblock", self.step_a9_teth_get_pte),
                    Step("Boot Device", self.step_a9_teth_boot)
                ]
            else:
                steps = [
                    Step("Restore Device", self.step_a10_teth_restore),
                    Step("Boot Device", self.step_a10_teth_boot)
                ]
        else:
            # Untethered mode
            if self.state.chip == "A9":
                steps = [
                    Step("Get SHC Block", self.step_a9_unteth_get_shc),
                    Step("Untethered Restore", self.step_a9_unteth_restore)
                ]
            else:
                steps = [
                    Step("Untethered Restore", self.step_a10_unteth_restore)
                ]

        self.step_manager.set_steps(steps)

        self.step_buttons = []
        for i, step in enumerate(steps):
            btn = StepButton(i + 1, step.name)
            btn.clicked.connect(lambda checked, idx=i: self.execute_step(idx))
            self.step_layout.addWidget(btn)
            self.step_buttons.append(btn)

        self.update_step_buttons_state()

    def update_step_buttons_state(self):
        if not hasattr(self, 'step_buttons'):
            return

        if self.current_mode == "teth":
            enabled = bool(self.state.ipsw)
        else:
            enabled = bool(self.state.ipsw and self.state.blob and self.state.gen)

        for btn in self.step_buttons:
            btn.setEnabled(enabled)

    def select_ipsw(self):
        if not self.state.root_dir:
            QMessageBox.warning(self, "No Project", "Please open or create a project first")
            return

        file_path, _ = QFileDialog.getOpenFileName(self, "Select IPSW", "", "IPSW Files (*.ipsw)")
        if file_path:
            self.state.ipsw = file_path
            self.state.save()
            self.ipsw_label.setText(Path(file_path).name)
            self.ipsw_label.setStyleSheet("font-size: 8pt; color: #51CF66;")
            self.log_system(f"Selected IPSW: {Path(file_path).name}")
            self.update_step_buttons_state()

    def select_blob(self):
        if not self.state.root_dir:
            QMessageBox.warning(self, "No Project", "Please open or create a project first")
            return

        file_path, _ = QFileDialog.getOpenFileName(self, "Select Blob", "", "SHSH Files (*.shsh2 *.shsh)")
        if file_path:
            self.state.blob = file_path
            self.state.gen = self.extract_generator(file_path)
            self.state.save()
            self.blob_label.setText(Path(file_path).name)
            self.blob_label.setStyleSheet("font-size: 8pt; color: #51CF66;")
            self.log_system(f"Selected Blob: {Path(file_path).name}")
            if self.state.gen:
                self.log_system(f"Generator: {self.state.gen}")
            self.update_step_buttons_state()

    def extract_generator(self, blob_path: str) -> str:
        try:
            result = subprocess.run(
                f"cat '{blob_path}' | grep -A 1 'generator'",
                shell=True, capture_output=True, text=True
            )
            match = re.search(r'<string>(.+?)</string>', result.stdout)
            return match.group(1) if match else "UNKNOWN"
        except:
            return "UNKNOWN"

    def refresh_files(self):
        if not self.state.root_dir:
            return

        self.file_list.clear()
        self.file_list.addItem(f"Project: {self.state.root_dir.name}")
        self.file_list.addItem("")

        for f in sorted(self.state.root_dir.glob("*.bin")):
            self.file_list.addItem(f"  📄 {f.name}")

        for f in sorted(self.state.root_dir.glob("*.img4")):
            self.file_list.addItem(f"  🔐 {f.name}")

        for f in sorted(self.state.root_dir.glob("*.im4p")):
            self.file_list.addItem(f"  🔐 {f.name}")

        if (self.state.root_dir / "restore_done").exists():
            self.file_list.addItem("  ✓ restore_done")

    def execute_step(self, index: int):
        if index >= len(self.step_manager.steps):
            return

        step = self.step_manager.steps[index]
        self.step_manager.start_step(index)
        self.current_label.setText(f"{step.name}...")
        self.log_system(f"Step {index + 1}: {step.name}")

        self.is_executing = True

        # Ensure block/ and image4/ directories exist before running commands
        if self.state.root_dir:
            (self.state.root_dir / "block").mkdir(exist_ok=True)
            (self.state.root_dir / "image4").mkdir(exist_ok=True)

        try:
            step.func()
        except Exception as e:
            self.log_system(f"Error: {str(e)}")
            self.step_manager.complete_step(index, False)
            self.is_executing = False

        self.update_progress()

    def on_command_chain_finished(self, success: bool):
        self.is_executing = False

        # First, move files from subdirectories to project root
        self.move_temp_files()

        # Then execute callback to rename files
        current_idx = self.step_manager.current_step
        if current_idx >= 0:
            if self.current_step_callback:
                final_success = self.current_step_callback(success)
                self.step_manager.complete_step(current_idx, final_success)
                self.current_step_callback = None
            else:
                self.step_manager.complete_step(current_idx, success)

        self.update_progress()
        self.refresh_files()

        # Show result dialog with options
        self.show_step_result_dialog(success)

    def show_step_result_dialog(self, success: bool):
        """Show dialog with step result and next action options"""
        current_idx = self.step_manager.current_step
        if current_idx < 0 or current_idx >= len(self.step_manager.steps):
            return

        step_name = self.step_manager.steps[current_idx].name
        is_last_step = (current_idx == len(self.step_manager.steps) - 1)

        # Create message box
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle("Step Result")

        if success:
            msg_box.setIcon(QMessageBox.Icon.Information)

            # If it's the last step (Boot Device), show completion message
            if is_last_step:
                msg_box.setText(f"✓ Step completed successfully!\n\n{step_name}\n\nDevice boot completed!")
                # Only show Close button for last step
                close_btn = msg_box.addButton("Close", QMessageBox.ButtonRole.AcceptRole)
                next_btn = None
            else:
                msg_box.setText(
                    f"✓ Step completed successfully!\n\n{step_name}\n\nPlease re-enter DFU mode before next step.")
                # Success: Next Step | Close
                next_btn = msg_box.addButton("Next Step", QMessageBox.ButtonRole.AcceptRole)
                close_btn = msg_box.addButton("Close", QMessageBox.ButtonRole.RejectRole)
        else:
            msg_box.setIcon(QMessageBox.Icon.Warning)
            msg_box.setText(f"✗ Step failed!\n\n{step_name}\n\nPlease re-enter DFU mode before retry.")
            # Failure: Retry | Close
            retry_btn = msg_box.addButton("Retry", QMessageBox.ButtonRole.AcceptRole)
            close_btn = msg_box.addButton("Close", QMessageBox.ButtonRole.RejectRole)

        msg_box.exec()

        # Handle button click
        clicked = msg_box.clickedButton()

        if success:
            if next_btn and clicked == next_btn:
                self.log_system("User chose: Next Step")
                # Execute next step if available
                next_idx = current_idx + 1
                if next_idx < len(self.step_manager.steps):
                    self.execute_step(next_idx)
                else:
                    self.log_system("All steps completed!")
            else:  # close_btn
                self.log_system("User chose: Close")
        else:
            if clicked == retry_btn:
                self.log_system("User chose: Retry (Please re-enter DFU mode)")
                # Re-execute current step
                if current_idx >= 0:
                    self.execute_step(current_idx)
            else:  # close_btn
                self.log_system("User chose: Close")

    def move_temp_files(self):
        """Move files from block/ and image4/ subdirectories to project root"""
        if not self.state.root_dir:
            return

        # Move files from block/ subdirectory
        block_dir = self.state.root_dir / "block"
        if block_dir.exists() and block_dir.is_dir():
            for f in block_dir.glob("*"):
                if f.is_file() and not f.name.startswith('.'):
                    target = self.state.root_dir / f.name
                    shutil.move(str(f), str(target))
                    self.log_system(f"Moved from block/: {f.name}")
            # Remove block directory and all contents
            shutil.rmtree(block_dir, ignore_errors=True)

        # Move files from image4/ subdirectory
        image4_dir = self.state.root_dir / "image4"
        if image4_dir.exists() and image4_dir.is_dir():
            for f in image4_dir.glob("*"):
                if f.is_file() and not f.name.startswith('.'):
                    target = self.state.root_dir / f.name
                    shutil.move(str(f), str(target))
                    self.log_system(f"Moved from image4/: {f.name}")
            # Remove image4 directory and all contents
            shutil.rmtree(image4_dir, ignore_errors=True)

    def send_enter(self):
        self.runner.send_input("")
        self.log_system("Sent: ENTER")

    def stop_execution(self):
        self.runner.stop()
        self.is_executing = False
        self.log_system("Stopped")

    def on_output(self, log_type: str, text: str):
        self.log_viewer.append_log(log_type, text)
        if log_type == "CMD":
            self.cmd_history.addItem(f"$ {text}")

    def on_process_finished(self, success: bool, exit_code: int):
        status = "OK" if success else "FAIL"
        self.log_system(f"Process {status} (code: {exit_code})")

    def on_step_changed(self, index: int, status: int):
        # Find the next pending step
        next_step_index = -1
        for i, step in enumerate(self.step_manager.steps):
            if step.status == StepStatus.PENDING:
                next_step_index = i
                break

        # Update all step buttons to show which is next
        for i, btn in enumerate(self.step_buttons):
            is_next = (i == next_step_index)
            btn.update_status(self.step_manager.steps[i].status, is_next)

    def update_progress(self):
        total = len(self.step_manager.steps)
        completed = sum(1 for s in self.step_manager.steps if s.status == StepStatus.SUCCESS)
        if total > 0:
            percentage = int((completed / total) * 100)
            self.progress_bar.setValue(percentage)
            self.statusBar().showMessage(f"{completed}/{total} ({percentage}%)")

    def step_a9_teth_get_shc_pre(self):
        if not self.state.ipsw or not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need IPSW and project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        cmd1 = f"{Config.RAIN} -D"
        cmd2 = f"cd '{self.state.root_dir}' && {Config.MERULA} --get-shcblock '{self.state.ipsw}'"

        def on_complete(success):
            if success:
                # Check if shcblock_pre.bin already exists (correctly named)
                target = self.state.root_dir / "shcblock_pre.bin"
                if target.exists():
                    self.log_system(f"Saved: shcblock_pre.bin")
                    return True

                # Otherwise look for any .bin file to rename
                blocks = list(self.state.root_dir.glob("*.bin"))
                if blocks:
                    latest = max(blocks, key=lambda p: p.stat().st_mtime)
                    shutil.move(str(latest), str(target))
                    self.log_system(f"Renamed {latest.name} to shcblock_pre.bin")
                    return True
                else:
                    self.log_system("Error: No .bin file found")
                    return False
            return success

        self.current_step_callback = on_complete
        self.runner.run_chain([cmd1, cmd2])

    def step_a9_teth_restore(self):
        if not self.state.ipsw or not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need IPSW and project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        shc_pre = self.state.root_dir / "shcblock_pre.bin"
        if not shc_pre.exists():
            QMessageBox.warning(self, "Missing", "Need shcblock_pre.bin")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        cmd1 = f"{Config.RAIN} -D"
        cmd2 = f"cd '{self.state.root_dir}' && {Config.MERULA} -o --load-shcblock '{shc_pre}' '{self.state.ipsw}'"

        def on_complete(success):
            if success:
                (self.state.root_dir / "restore_done").touch()
            return success

        self.current_step_callback = on_complete
        self.runner.run_chain([cmd1, cmd2])

    def step_a9_teth_get_shc_post(self):
        if not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        cmd = f"cd '{self.state.root_dir}' && {Config.RAIN} -g"

        def on_complete(success):
            if success:
                # Check if shcblock_post.bin already exists (correctly named)
                target = self.state.root_dir / "shcblock_post.bin"
                if target.exists():
                    self.log_system(f"Saved: shcblock_post.bin")
                    return True

                # Look for new .bin files (excluding pre-existing ones)
                blocks = list(self.state.root_dir.glob("*.bin"))
                blocks = [b for b in blocks if b.name not in ["shcblock_pre.bin", "shcblock_post.bin"]]
                if blocks:
                    latest = max(blocks, key=lambda p: p.stat().st_mtime)
                    shutil.move(str(latest), str(target))
                    self.log_system(f"Renamed {latest.name} to shcblock_post.bin")
                    return True
                else:
                    self.log_system("Error: No new .bin file found")
                    return False
            return success

        self.current_step_callback = on_complete
        self.runner.run_chain([cmd])

    def step_a9_teth_get_pte(self):
        if not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        shc_post = self.state.root_dir / "shcblock_post.bin"
        if not shc_post.exists():
            QMessageBox.warning(self, "Missing", "Need shcblock_post.bin")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        # Look for SEP file in project directory
        seps = list(self.state.root_dir.glob("*signed-SEP.img4"))
        if not seps:
            QMessageBox.warning(self, "Missing", "No signed-SEP.img4 file in project directory")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        sep = seps[0]
        cmd = f"cd '{self.state.root_dir}' && {Config.RAIN} -g -i '{sep}' -C '{shc_post}'"

        def on_complete(success):
            if success:
                # Check if pteblock.bin already exists (correctly named)
                target = self.state.root_dir / "pteblock.bin"
                if target.exists():
                    self.log_system(f"Saved: pteblock.bin")
                    return True

                # Look for new .bin files (excluding pre-existing ones)
                blocks = list(self.state.root_dir.glob("*.bin"))
                blocks = [b for b in blocks if b.name not in ["shcblock_pre.bin", "shcblock_post.bin", "pteblock.bin"]]
                if blocks:
                    latest = max(blocks, key=lambda p: p.stat().st_mtime)
                    shutil.move(str(latest), str(target))
                    self.log_system(f"Renamed {latest.name} to pteblock.bin")
                    return True
                else:
                    self.log_system("Error: No new .bin file found")
                    return False
            return success

        self.current_step_callback = on_complete
        self.runner.run_chain([cmd])

    def step_a9_teth_boot(self):
        if not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        pte = self.state.root_dir / "pteblock.bin"
        if not pte.exists():
            QMessageBox.warning(self, "Missing", "Need pteblock.bin")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        cmd = f"{Config.RAIN} -TP '{pte}'"
        self.runner.run_chain([cmd])

    def step_a10_teth_restore(self):
        if not self.state.ipsw or not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need IPSW and project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        cmd1 = f"{Config.RAIN} -D"
        cmd2 = f"cd '{self.state.root_dir}' && {Config.MERULA} -o '{self.state.ipsw}'"

        def on_complete(success):
            if success:
                (self.state.root_dir / "restore_done").touch()
            return success

        self.current_step_callback = on_complete
        self.runner.run_chain([cmd1, cmd2])

    def step_a10_teth_boot(self):
        if not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        iboot_files = list(self.state.root_dir.glob("*iBoot*.img4"))
        sep_signed_files = list(self.state.root_dir.glob("*signed-SEP.img4"))
        sep_target_files = list(self.state.root_dir.glob("*target-SEP.im4p"))

        if not iboot_files or not sep_signed_files or not sep_target_files:
            QMessageBox.warning(self, "Missing", "Need iBoot.img4, signed-SEP.img4, target-SEP.im4p")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        iboot = iboot_files[0]
        sep_signed = sep_signed_files[0]
        sep_target = sep_target_files[0]

        cmd = f"{Config.RAIN} -t '{iboot}' -i '{sep_signed}' -p '{sep_target}'"

        self.runner.run_chain([cmd])

    def step_a9_unteth_get_shc(self):
        """A9 Untethered Step 1: Get shcblock"""
        if not self.state.ipsw or not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need IPSW and project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        cmd1 = f"{Config.RAIN} -D"
        cmd2 = f"cd '{self.state.root_dir}' && {Config.MERULA} --get-shcblock '{self.state.ipsw}'"

        def on_complete(success):
            if success:
                # Check if shcblock file exists (correctly named)
                target = self.state.root_dir / "shcblock_unteth.bin"
                if target.exists():
                    self.log_system(f"Saved: shcblock_unteth.bin")
                    return True

                # Otherwise look for any .bin file to rename
                blocks = list(self.state.root_dir.glob("*.bin"))
                if blocks:
                    latest = max(blocks, key=lambda p: p.stat().st_mtime)
                    shutil.move(str(latest), str(target))
                    self.log_system(f"Renamed {latest.name} to shcblock_unteth.bin")
                    return True
                else:
                    self.log_system("Error: No .bin file found")
                    return False
            return success

        self.current_step_callback = on_complete
        self.runner.run_chain([cmd1, cmd2])

    def step_a9_unteth_restore(self):
        """A9 Untethered Step 2: Restore with shcblock and blob"""
        if not self.state.ipsw or not self.state.blob or not self.state.gen or not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need IPSW/Blob/Gen/Project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        shc_block = self.state.root_dir / "shcblock_unteth.bin"
        if not shc_block.exists():
            QMessageBox.warning(self, "Missing", "Need shcblock_unteth.bin")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        self.log_system("Note: A9 may fail, retry if needed")

        cmd1 = f"{Config.RAIN} -Db {self.state.gen}"
        cmd2 = f"cd '{self.state.root_dir}' && {Config.MERULA} -w --load-shsh '{self.state.blob}' --load-shcblock '{shc_block}' '{self.state.ipsw}'"

        def on_complete(success):
            if success:
                (self.state.root_dir / "restore_done").touch()
            return success

        self.current_step_callback = on_complete
        self.runner.run_chain([cmd1, cmd2])

    def step_a10_unteth_restore(self):
        """A10 Untethered: Direct restore with blob"""
        if not self.state.ipsw or not self.state.blob or not self.state.gen or not self.state.root_dir:
            QMessageBox.warning(self, "Missing", "Need IPSW/Blob/Gen/Project")
            self.step_manager.complete_step(self.step_manager.current_step, False)
            self.is_executing = False
            return

        cmd1 = f"{Config.RAIN} -Db {self.state.gen}"
        cmd2 = f"cd '{self.state.root_dir}' && {Config.MERULA} -w --load-shsh '{self.state.blob}' '{self.state.ipsw}'"

        def on_complete(success):
            if success:
                (self.state.root_dir / "restore_done").touch()
            return success

        self.current_step_callback = on_complete
        self.runner.run_chain([cmd1, cmd2])

    def log_system(self, message: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.sys_log.append(f"[{timestamp}] {message}")

    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()

    def dropEvent(self, event: QDropEvent):
        for url in event.mimeData().urls():
            path = url.toLocalFile()
            if path.endswith('.ipsw'):
                self.state.ipsw = path
                self.state.save()
                self.ipsw_label.setText(Path(path).name)
                self.ipsw_label.setStyleSheet("font-size: 8pt; color: #51CF66;")
                self.log_system(f"Dropped: {Path(path).name}")
            elif path.endswith('.shsh2') or path.endswith('.shsh'):
                self.state.blob = path
                self.state.gen = self.extract_generator(path)
                self.state.save()
                self.blob_label.setText(Path(path).name)
                self.blob_label.setStyleSheet("font-size: 8pt; color: #51CF66;")
                self.log_system(f"Dropped: {Path(path).name}")

    def closeEvent(self, event):
        if self.is_executing:
            reply = QMessageBox.question(
                self, "Exit",
                "Execution in progress. Quit?",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )

            if reply == QMessageBox.StandardButton.No:
                event.ignore()
                return

            self.runner.stop()

        event.accept()


def main():
    app = QApplication(sys.argv)
    app.setStyle("Fusion")

    window = MainWindow()
    window.show()

    sys.exit(app.exec())


if __name__ == "__main__":
    main()
