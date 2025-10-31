const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

let win
let child

const isDev = !!process.env.VITE_DEV_SERVER_URL

const resolveBin = (name) => {
  const candidates = [
    path.join(process.resourcesPath || '', 'bin', name),
    path.join(__dirname, '..', 'bin', name),
    path.join(process.cwd(), name),
    path.join(process.cwd(), 'bin', name),
    path.join(process.cwd(), '..', name)
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {}
  }
  return null
}

const createWindow = () => {
  win = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })
  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

const ensureSingleInstance = () => {
  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) {
    app.quit()
    return false
  }
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  return true
}

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  if (!ensureSingleInstance()) return
  createWindow()
})

ipcMain.handle('dialog:open', async (_, opts) => {
  const res = await dialog.showOpenDialog(win, opts || { properties: ['openFile'] })
  if (res.canceled) return null
  return res.filePaths
})

ipcMain.handle('project:load', async (_, dir) => {
  try {
    const p = path.join(dir, 'project.json')
    if (!fs.existsSync(p)) return {}
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))
    return j
  } catch (e) {
    return { error: String(e) }
  }
})

ipcMain.handle('project:save', async (_, dir, data) => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(data, null, 2))
    return { ok: true }
  } catch (e) {
    return { error: String(e) }
  }
})

ipcMain.handle('project:create', async (_, baseDir, name, data) => {
  try {
    if (!baseDir || !name) return { error: 'invalid_args' }
    let target = path.join(baseDir, name)
    if (fs.existsSync(target)) {
      let i = 1
      while (fs.existsSync(`${target}-${i}`)) i++
      target = `${target}-${i}`
    }
    fs.mkdirSync(target, { recursive: true })
    fs.mkdirSync(path.join(target, 'block'), { recursive: true })
    fs.mkdirSync(path.join(target, 'image4'), { recursive: true })
    const content = data || { ipsw: '', blob: '', gen: '', chip: 'A9', mode: 'Tethered' }
    fs.writeFileSync(path.join(target, 'project.json'), JSON.stringify(content, null, 2))
    return { ok: true, dir: target }
  } catch (e) {
    return { error: String(e) }
  }
})

ipcMain.handle('cli:which', async (_, name) => {
  const p = resolveBin(name)
  return p || null
})

ipcMain.handle('cli:run', async (_, payload) => {
  if (child) return { error: 'already_running' }
  const name = payload && payload.name
  const args = (payload && payload.args) || []
  const cwd = (payload && payload.cwd) || process.cwd()
  const env = Object.assign({}, process.env, (payload && payload.env) || {})
  const bin = resolveBin(name)
  if (!bin) return { error: 'binary_not_found' }

  try {
    child = spawn(bin, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    if (!child || !child.pid) {
      child = null
      return { error: 'spawn_failed' }
    }

    const sendMessage = (channel, data) => {
      if (win && !win.isDestroyed() && win.webContents) {
        win.webContents.send(channel, data)
      }
    }

    sendMessage('cli:started', { pid: child.pid, bin, args })

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (data) => {
      sendMessage('cli:log', data)
    })

    child.stderr.on('data', (data) => {
      sendMessage('cli:log', data)
    })

    child.on('error', (err) => {
      sendMessage('cli:log', `[error] ${err.message}\n`)
      child = null
    })

    child.on('close', (code, signal) => {
      sendMessage('cli:exit', { code, signal })
      child = null
    })

    return { ok: true, pid: child.pid }
  } catch (e) {
    child = null
    return { error: String(e) }
  }
})

ipcMain.handle('cli:write', async (_, data) => {
  if (!child || !child.stdin || !child.stdin.writable) return { error: 'not_running' }
  try {
    child.stdin.write(data)
    return { ok: true }
  } catch (e) {
    return { error: String(e) }
  }
})

ipcMain.handle('cli:kill', async () => {
  if (!child) return { ok: true }
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'])
    } else {
      process.kill(child.pid, 'SIGTERM')
    }
    child = null
    return { ok: true }
  } catch (e) {
    child = null
    return { error: String(e) }
  }
})

ipcMain.handle('fs:exists', async (_, p) => {
  try { return fs.existsSync(p) } catch { return false }
})

ipcMain.handle('fs:list', async (_, dir) => {
  try {
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir)
    return entries.filter(n => !n.startsWith('.'))
  } catch (e) {
    return { error: String(e) }
  }
})

ipcMain.handle('fs:touch', async (_, dir, name) => {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const p = path.join(dir, name)
    fs.closeSync(fs.openSync(p, 'a'))
    return { ok: true }
  } catch (e) {
    return { error: String(e) }
  }
})

ipcMain.handle('fs:moveTempUp', async (_, dir) => {
  try {
    const moveAll = (sub) => {
      const p = path.join(dir, sub)
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        for (const name of fs.readdirSync(p)) {
          if (name.startsWith('.')) continue
          const src = path.join(p, name)
          const dst = path.join(dir, name)
          try { fs.renameSync(src, dst) } catch {}
        }
        try { fs.rmSync(p, { recursive: true, force: true }) } catch {}
      }
    }
    moveAll('block')
    moveAll('image4')
    return { ok: true }
  } catch (e) {
    return { error: String(e) }
  }
})

ipcMain.handle('fs:renameLatestBin', async (_, dir, targetName, exclude) => {
  try {
    if (!fs.existsSync(dir)) return { error: 'dir_missing' }
    const entries = fs.readdirSync(dir)
    const bins = entries
      .filter(n => n.endsWith('.bin'))
      .filter(n => !(exclude || []).includes(n))
      .map(n => ({ name: n, p: path.join(dir, n), m: fs.statSync(path.join(dir, n)).mtimeMs }))
    if (!bins.length) return { error: 'no_bin' }
    bins.sort((a, b) => b.m - a.m)
    const latest = bins[0]
    const dest = path.join(dir, targetName)
    if (!fs.existsSync(dest)) fs.renameSync(latest.p, dest)
    return { ok: true, renamed: latest.name, target: targetName }
  } catch (e) {
    return { error: String(e) }
  }
})

ipcMain.handle('blob:extractGen', async (_, file) => {
  try {
    const txt = fs.readFileSync(file, 'utf8')
    const xml = txt.match(/<key>generator<\/key>\s*<string>([^<]+)<\/string>/)
    if (xml) return xml[1]
    const json = txt.match(/"generator"\s*:\s*"([^"]+)"/)
    if (json) return json[1]
    const plain = txt.match(/generator\s*[:=]\s*([0-9a-fx]+)/i)
    if (plain) return plain[1]
    return 'UNKNOWN'
  } catch (e) {
    return 'UNKNOWN'
  }
})

ipcMain.handle('window:minimize', async () => {
  if (win) win.minimize()
  return { ok: true }
})

ipcMain.handle('window:maximize', async () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  }
  return { ok: true }
})

ipcMain.handle('window:close', async () => {
  if (win) win.close()
  return { ok: true }
})

ipcMain.handle('window:isMaximized', async () => {
  return win ? win.isMaximized() : false
})
