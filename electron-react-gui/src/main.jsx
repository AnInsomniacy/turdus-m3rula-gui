import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const StepStatus = { PENDING: 'PENDING', RUNNING: 'RUNNING', SUCCESS: 'SUCCESS', FAILED: 'FAILED' }

const useLog = () => {
  const [lines, setLines] = useState([])
  useEffect(() => {
    const onLog = (m) => setLines((prev) => [...prev, String(m)])
    const onExit = (m) => setLines((prev) => [...prev, `\n[exit] code=${m.code} signal=${m.signal}\n`])
    window.api.onLog(onLog)
    window.api.onExit(onExit)
  }, [])
  return { lines, clear: () => setLines([]) }
}

const runOne = async (name, args, cwd) => {
  await window.api.run({ name, args, cwd })
  return new Promise((resolve) => {
    window.api.onceExit((m) => resolve(m && m.code === 0))
  })
}

const Modal = ({ isOpen, onClose, title, children, footer }) => {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-gradient-to-br from-gray-800 via-gray-900 to-black border border-purple-500/30 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-scale-in">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none"></div>
        <div className="relative px-6 py-4 border-b border-purple-500/20">
          <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{title}</h2>
        </div>
        <div className="relative px-6 py-6">{children}</div>
        {footer && <div className="relative px-6 py-4 border-t border-purple-500/20 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  )
}

const Button = ({ children, onClick, variant = 'solid', color = 'purple', size = 'md', disabled, className = '' }) => {
  const baseClass = 'font-semibold rounded-lg transition-all duration-200 flex items-center justify-center gap-2 transform active:scale-95 disabled:active:scale-100'
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : size === 'md' ? 'px-4 py-2 text-sm' : 'px-5 py-2.5'
  let variantClass = ''
  if (variant === 'solid') {
    if (color === 'purple') variantClass = 'bg-gradient-to-r from-purple-600 to-purple-700 text-white shadow-lg shadow-purple-500/30 hover:shadow-purple-500/50 hover:from-purple-500 hover:to-purple-600 disabled:from-gray-700 disabled:to-gray-800 disabled:shadow-none disabled:cursor-not-allowed'
    if (color === 'red') variantClass = 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:from-red-500 hover:to-red-600 disabled:from-gray-700 disabled:to-gray-800 disabled:shadow-none disabled:cursor-not-allowed'
    if (color === 'green') variantClass = 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:from-green-500 hover:to-green-600 disabled:from-gray-700 disabled:to-gray-800 disabled:shadow-none disabled:cursor-not-allowed'
    if (color === 'gray') variantClass = 'bg-gradient-to-r from-gray-700 to-gray-800 text-white hover:from-gray-600 hover:to-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
  } else if (variant === 'outline') {
    if (color === 'purple') variantClass = 'border-2 border-purple-500/50 text-purple-300 hover:bg-purple-500/10 hover:border-purple-400 hover:text-purple-200 disabled:opacity-40 disabled:cursor-not-allowed'
    if (color === 'red') variantClass = 'border-2 border-red-500/50 text-red-300 hover:bg-red-500/10 hover:border-red-400 hover:text-red-200 disabled:opacity-40 disabled:cursor-not-allowed'
  } else if (variant === 'ghost') {
    variantClass = 'text-gray-300 hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed'
  }
  return <button onClick={onClick} disabled={disabled} className={`${baseClass} ${sizeClass} ${variantClass} ${className}`}>{children}</button>
}

const Input = ({ value, onChange, placeholder, readOnly, className = '' }) => {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full px-3 py-2 bg-black/30 border border-purple-500/30 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/50 backdrop-blur-sm transition-all duration-200 ${readOnly ? 'cursor-not-allowed opacity-50' : 'hover:border-purple-400/40'} ${className}`}
    />
  )
}

const Select = ({ value, onChange, children, className = '' }) => {
  return (
    <select
      value={value}
      onChange={onChange}
      className={`w-full px-3 py-2 bg-black/30 border border-purple-500/30 rounded-lg text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400/50 backdrop-blur-sm transition-all duration-200 hover:border-purple-400/40 cursor-pointer ${className}`}
    >
      {children}
    </select>
  )
}

const Badge = ({ children, color = 'gray', className = '' }) => {
  const colorClass =
    color === 'purple' ? 'bg-purple-500/20 text-purple-300 border-purple-400/40' :
    color === 'green' ? 'bg-green-500/20 text-green-300 border-green-400/40' :
    color === 'red' ? 'bg-red-500/20 text-red-300 border-red-400/40' :
    'bg-gray-500/20 text-gray-400 border-gray-500/40'
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${colorClass} ${className}`}>{children}</span>
}

const Spinner = () => {
  return (
    <div className="relative w-4 h-4">
      <div className="absolute inset-0 border-2 border-purple-500/20 rounded-full"></div>
      <div className="absolute inset-0 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  )
}

const Toast = ({ message, type = 'info', show, onClose }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 3000)
      return () => clearTimeout(timer)
    }
  }, [show, onClose])
  if (!show) return null
  const bgClass =
    type === 'success' ? 'from-green-600 to-green-700' :
    type === 'error' ? 'from-red-600 to-red-700' :
    type === 'warning' ? 'from-yellow-600 to-yellow-700' :
    'from-blue-600 to-blue-700'
  return (
    <div className="fixed top-4 right-4 z-50 animate-slide-down">
      <div className={`bg-gradient-to-r ${bgClass} text-white px-4 py-2 rounded-lg shadow-2xl flex items-center gap-2 min-w-[200px] border border-white/20`}>
        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  )
}

const App = () => {
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' })
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirmCfg, setConfirmCfg] = useState({ title: '', body: '', buttons: [] })
  const [createBase, setCreateBase] = useState('')
  const [createName, setCreateName] = useState('')
  const [projectDir, setProjectDir] = useState('')
  const [chip, setChip] = useState('A9')
  const [mode, setMode] = useState('teth')
  const [ipsw, setIpsw] = useState('')
  const [blob, setBlob] = useState('')
  const [gen, setGen] = useState('')
  const [running, setRunning] = useState(false)
  const [binMerula, setBinMerula] = useState('')
  const [binRa1n, setBinRa1n] = useState('')
  const [files, setFiles] = useState([])
  const { lines, clear } = useLog()
  const logRef = useRef(null)

  const showToast = (message, type = 'info') => setToast({ show: true, message, type })

  useEffect(() => { window.api.onStarted(() => setRunning(true)); window.api.onExit(() => setRunning(false)) }, [])
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [lines])
  useEffect(() => { window.api.which('turdus_merula').then(setBinMerula); window.api.which('turdusra1n').then(setBinRa1n) }, [])

  const refreshFiles = async () => { if (!projectDir) return; const list = await window.api.list(projectDir); if (Array.isArray(list)) setFiles(list) }
  useEffect(() => { refreshFiles() }, [projectDir])

  const openProject = async () => {
    const r = await window.api.openDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (!r || !r[0]) return
    const dir = r[0]
    setProjectDir(dir)
    const j = await window.api.loadProject(dir)
    if (j && !j.error) {
      const jIpsw = j.ipsw || j.IPSW || ''
      const jBlob = j.blob || j.shsh || ''
      const jGen = j.gen || j.generator || ''
      setIpsw(jIpsw)
      setBlob(jBlob)
      setChip(j.chip && j.chip !== 'A9' ? 'A10' : 'A9')
      if (jBlob && (!jGen || jGen === 'UNKNOWN')) {
        const g = await window.api.extractGen(jBlob)
        setGen(g || 'UNKNOWN')
      } else {
        setGen(jGen || '')
      }
    }
    refreshFiles()
  }

  const newProject = async () => {
    const r = await window.api.openDialog({ properties: ['openDirectory', 'createDirectory'] })
    if (!r || !r[0]) return
    setCreateBase(r[0])
    setCreateName('project')
    setCreateOpen(true)
  }

  const doCreateProject = async () => {
    if (!createBase || !createName) return
    const data = { ipsw: '', blob: '', gen: '', chip, mode: mode === 'teth' ? 'Tethered' : 'Untethered' }
    const res = await window.api.createProject(createBase, createName, data)
    if (res && res.ok) {
      setProjectDir(res.dir)
      setIpsw(''); setBlob(''); setGen('')
      showToast('Project created', 'success')
      setCreateOpen(false)
      refreshFiles()
    } else {
      showToast('Create failed', 'error')
    }
  }

  const saveProject = async () => {
    if (!projectDir) { showToast('Select project first', 'warning'); return }
    const data = { ipsw, blob, gen, chip, mode: mode === 'teth' ? 'Tethered' : 'Untethered' }
    await window.api.saveProject(projectDir, data)
    await window.api.saveProject(projectDir, { shsh: blob, generator: gen })
    showToast('Saved', 'success')
  }

  const pickFile = async (setter, filters) => {
    const r = await window.api.openDialog({ properties: ['openFile'], filters })
    if (!r || !r[0]) return
    setter(r[0])
  }

  const pickBlob = async () => {
    const r = await window.api.openDialog({ properties: ['openFile'], filters: [{ name: 'SHSH', extensions: ['shsh2', 'shsh', 'plist', 'json'] }] })
    if (!r || !r[0]) return
    setBlob(r[0])
    const g = await window.api.extractGen(r[0])
    setGen(g || 'UNKNOWN')
  }

  useEffect(() => {
    const autoFill = async () => {
      if (!blob) return
      const ok = await window.api.exists(blob)
      if (!ok) return
      if (!gen || gen === 'UNKNOWN') {
        const g = await window.api.extractGen(blob)
        if (g) setGen(g)
      }
    }
    autoFill()
  }, [blob])

  const afterStep = async () => { await window.api.moveTempUp(projectDir); await refreshFiles() }
  const renameLatest = async (target, exclude) => {
    const res = await window.api.renameLatestBin(projectDir, target, exclude)
    return res && !res.error
  }
  const touch = async (name) => { await window.api.touch(projectDir, name) }
  const runChain = async (items) => {
    for (const it of items) {
      const ok = await runOne(it.name, it.args || [], projectDir)
      if (!ok) return false
    }
    return true
  }

  const stepDefs = useMemo(() => ({
    a9_teth: [
      { label: 'Get SHC (pre)', needs: () => projectDir && ipsw, run: async () => { const ok = await runChain([{ name: 'turdusra1n', args: ['-D'] }, { name: 'turdus_merula', args: ['--get-shcblock', ipsw] }]); await afterStep(); const renamed = await renameLatest('shcblock_pre.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin']); return ok && renamed } },
      { label: 'Restore Device', needs: () => projectDir && ipsw && files.includes('shcblock_pre.bin'), run: async () => { const ok = await runChain([{ name: 'turdusra1n', args: ['-D'] }, { name: 'turdus_merula', args: ['-o', '--load-shcblock', 'shcblock_pre.bin', ipsw] }]); if (ok) await touch('restore_done'); await afterStep(); return ok } },
      { label: 'Get SHC (post)', needs: () => projectDir, run: async () => { const ok = await runChain([{ name: 'turdusra1n', args: ['-g'] }]); await afterStep(); const renamed = await renameLatest('shcblock_post.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin']); return ok && renamed } },
      { label: 'Get pteblock', needs: () => projectDir && files.includes('shcblock_post.bin') && files.some(n => n.endsWith('signed-SEP.img4')), run: async () => { const sep = files.find(n => n.endsWith('signed-SEP.img4')); const ok = await runChain([{ name: 'turdusra1n', args: ['-g', '-i', sep, '-C', 'shcblock_post.bin'] }]); await afterStep(); const renamed = await renameLatest('pteblock.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin']); return ok && renamed } },
      { label: 'Boot Device', needs: () => projectDir && files.includes('pteblock.bin'), run: async () => { const ok = await runChain([{ name: 'turdusra1n', args: ['-TP', 'pteblock.bin'] }]); await afterStep(); return ok } }
    ],
    a10_teth: [
      { label: 'Restore Device', needs: () => projectDir && ipsw, run: async () => { const ok = await runChain([{ name: 'turdusra1n', args: ['-D'] }, { name: 'turdus_merula', args: ['-o', ipsw] }]); if (ok) await touch('restore_done'); await afterStep(); return ok } },
      { label: 'Boot Device', needs: () => projectDir && files.some(n => /iBoot.*\.img4$/.test(n)) && files.some(n => /signed-SEP\.img4$/.test(n)) && files.some(n => /target-SEP\.im4p$/.test(n)), run: async () => { const iboot = files.find(n => /iBoot.*\.img4$/.test(n)); const sepSigned = files.find(n => /signed-SEP\.img4$/.test(n)); const sepTarget = files.find(n => /target-SEP\.im4p$/.test(n)); const ok = await runChain([{ name: 'turdusra1n', args: ['-t', iboot, '-i', sepSigned, '-p', sepTarget] }]); await afterStep(); return ok } }
    ],
    a9_unteth: [
      { label: 'Get SHC Block', needs: () => projectDir && ipsw, run: async () => { const ok = await runChain([{ name: 'turdusra1n', args: ['-D'] }, { name: 'turdus_merula', args: ['--get-shcblock', ipsw] }]); await afterStep(); const renamed = await renameLatest('shcblock_unteth.bin', ['shcblock_unteth.bin']); return ok && renamed } },
      { label: 'Untethered Restore', needs: () => projectDir && ipsw && blob && gen, run: async () => { const ok = await runChain([{ name: 'turdusra1n', args: ['-Db', gen] }, { name: 'turdus_merula', args: ['-w', '--load-shsh', blob, '--load-shcblock', 'shcblock_unteth.bin', ipsw] }]); if (ok) await touch('restore_done'); await afterStep(); return ok } }
    ],
    a10_unteth: [
      { label: 'Untethered Restore', needs: () => projectDir && ipsw && blob && gen, run: async () => { const ok = await runChain([{ name: 'turdusra1n', args: ['-Db', gen] }, { name: 'turdus_merula', args: ['-w', '--load-shsh', blob, ipsw] }]); if (ok) await touch('restore_done'); await afterStep(); return ok } }
    ]
  }), [projectDir, ipsw, blob, gen, files])

  const steps = useMemo(() => {
    if (mode === 'teth' && chip === 'A9') return stepDefs.a9_teth
    if (mode === 'teth' && chip !== 'A9') return stepDefs.a10_teth
    if (mode === 'unteth' && chip === 'A9') return stepDefs.a9_unteth
    return stepDefs.a10_unteth
  }, [mode, chip, stepDefs])

  const [status, setStatus] = useState(steps.map(() => StepStatus.PENDING))
  const [lastIdx, setLastIdx] = useState(-1)
  useEffect(() => { setStatus(steps.map(() => StepStatus.PENDING)) }, [steps])

  const nextIndex = useMemo(() => {
    for (let i = 0; i < status.length; i++) {
      if (status[i] === StepStatus.PENDING) {
        if (i === 0 || status.slice(0, i).every(s => s === StepStatus.SUCCESS)) return i
      }
    }
    return -1
  }, [status])

  const doExecute = async (idx) => {
    if (idx < 0 || idx >= steps.length) return
    if (!steps[idx].needs()) { showToast('Missing requirements', 'warning'); return }
    const ns = [...status]
    ns[idx] = StepStatus.RUNNING
    setStatus(ns)
    setLastIdx(idx)
    const ok = await steps[idx].run()
    const ns2 = [...ns]
    ns2[idx] = ok ? StepStatus.SUCCESS : StepStatus.FAILED
    setStatus(ns2)
    const isLast = idx === steps.length - 1
    setConfirmCfg({
      title: ok ? 'Success' : 'Failed',
      body: isLast ? (ok ? 'Device boot completed' : 'Re-enter DFU and retry') : 'Re-enter DFU before next',
      buttons: ok ? (isLast ? ['Close'] : ['Next', 'Close']) : ['Retry', 'Close']
    })
    setConfirmOpen(true)
  }

  const onConfirm = async (b) => {
    setConfirmOpen(false)
    if (b === 'Next') { if (nextIndex >= 0) await doExecute(nextIndex) }
    if (b === 'Retry') { if (lastIdx >= 0) await doExecute(lastIdx) }
  }

  const enter = async () => { await window.api.write('\n') }
  const stop = async () => { await window.api.kill() }

  useEffect(() => { if (projectDir) saveProject() }, [chip, mode])

  const completed = status.filter(s => s === StepStatus.SUCCESS).length
  const pct = steps.length ? Math.floor((completed / steps.length) * 100) : 0

  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-gray-100 flex flex-col overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-pink-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl animate-blob-slow"></div>
      </div>

      <header className="relative z-20 px-4 py-3 bg-black/40 border-b border-purple-500/30 backdrop-blur-xl flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shadow-purple-500/50">
            <span className="text-lg font-black">T</span>
          </div>
          <h1 className="text-xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">Turdus M3rula</h1>
          <Badge color="purple">Electron</Badge>
        </div>
        <div className="flex-1"></div>
        <div className="flex gap-2">
          <Button size="sm" onClick={newProject} variant="solid" color="purple">New</Button>
          <Button size="sm" onClick={openProject} variant="outline" color="purple">Open</Button>
          <Button size="sm" onClick={saveProject} color="purple">Save</Button>
        </div>
      </header>

      <div className="relative flex-1 flex overflow-hidden">
        <div className="w-80 bg-gradient-to-b from-gray-800/50 to-gray-900/50 border-r border-purple-500/20 backdrop-blur-sm overflow-y-auto flex flex-col">
          <div className="p-3 space-y-3 flex-1">
            <div className="p-3 bg-black/30 border border-purple-500/20 rounded-lg animate-slide-up">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-pulse"></div>
                <h3 className="text-xs font-bold text-purple-300">DEVICE</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <Select value={chip} onChange={(e) => setChip(e.target.value)}>
                  <option value="A9">A9</option>
                  <option value="A10">A10/A10X</option>
                </Select>
                <Select value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="teth">Tethered</option>
                  <option value="unteth">Untethered</option>
                </Select>
              </div>
              <div className="px-2 py-1.5 bg-black/40 rounded border border-purple-500/10">
                <p className="text-xs text-purple-300 font-mono truncate">{projectDir || 'No project'}</p>
              </div>
            </div>

            <div className="p-3 bg-black/30 border border-purple-500/20 rounded-lg animate-slide-up" style={{ animationDelay: '50ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                <h3 className="text-xs font-bold text-blue-300">FILES</h3>
              </div>
              <div className="space-y-2">
                <div className="flex gap-1">
                  <Button onClick={() => pickFile(setIpsw, [{ name: 'IPSW', extensions: ['ipsw'] }])} variant="outline" color="purple" size="sm" className="w-16 shrink-0">IPSW</Button>
                  <Input value={ipsw} onChange={(e) => setIpsw(e.target.value)} placeholder="Path..." />
                </div>
                {mode === 'unteth' && (
                  <div className="space-y-2 animate-slide-down">
                    <div className="flex gap-1">
                      <Button onClick={pickBlob} variant="outline" color="purple" size="sm" className="w-16 shrink-0">SHSH</Button>
                      <Input value={blob} onChange={(e) => setBlob(e.target.value)} placeholder="Path..." />
                    </div>
                    <Input value={gen} onChange={(e) => setGen(e.target.value)} placeholder="Generator" />
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 bg-black/30 border border-purple-500/20 rounded-lg animate-slide-up" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                  <h3 className="text-xs font-bold text-green-300">STEPS</h3>
                </div>
                <div className="text-xs text-gray-400">{completed}/{steps.length}</div>
              </div>
              <div key={`${chip}-${mode}`} className="space-y-1.5 mb-2">
                {steps.map((s, i) => {
                  const can = s.needs()
                  const st = status[i]
                  const isNext = i === nextIndex
                  return (
                    <div key={s.label} className={`p-2 rounded border transition-all animate-slide-down ${isNext ? 'bg-purple-600/20 border-purple-400/50' : 'bg-black/20 border-purple-500/10'}`} style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="flex items-center gap-2">
                        <Badge color={st === StepStatus.SUCCESS ? 'green' : st === StepStatus.FAILED ? 'red' : isNext ? 'purple' : 'gray'}>
                          {st === StepStatus.RUNNING ? <Spinner /> : i + 1}
                        </Badge>
                        <span className="flex-1 text-xs font-medium truncate">{s.label}</span>
                        <Button size="sm" color={isNext ? 'purple' : 'gray'} disabled={!can || st === StepStatus.SUCCESS || st === StepStatus.RUNNING} onClick={() => doExecute(i)}>
                          {st === StepStatus.RUNNING ? <Spinner /> : '▶'}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="relative h-2 bg-black/40 rounded-full overflow-hidden border border-purple-500/20">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 transition-all duration-700 rounded-full" style={{ width: `${pct}%` }}>
                  <div className="absolute inset-0 animate-shimmer"></div>
                </div>
              </div>
            </div>

            <div className="p-3 bg-black/30 border border-purple-500/20 rounded-lg animate-slide-up" style={{ animationDelay: '150ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                <h3 className="text-xs font-bold text-yellow-300">BINARIES</h3>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between px-2 py-1 bg-black/20 rounded">
                  <span className="text-gray-400">turdus_merula</span>
                  <span className={binMerula ? 'text-green-400' : 'text-red-400'}>{binMerula ? '✓' : '✗'}</span>
                </div>
                <div className="flex justify-between px-2 py-1 bg-black/20 rounded">
                  <span className="text-gray-400">turdusra1n</span>
                  <span className={binRa1n ? 'text-green-400' : 'text-red-400'}>{binRa1n ? '✓' : '✗'}</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-black/30 border border-purple-500/20 rounded-lg animate-slide-up" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full"></div>
                  <h3 className="text-xs font-bold text-cyan-300">FILES</h3>
                </div>
                <span className="text-xs text-gray-400">{files.length}</span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-0.5 text-xs">
                {files.length === 0 ? (
                  <p className="text-gray-500 italic text-center py-2">Empty</p>
                ) : (
                  files.map(n => (
                    <div key={n} className="px-2 py-0.5 bg-black/20 rounded hover:bg-black/30 transition-colors truncate">
                      <span className="text-gray-300">📄 {n}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-900/30 to-black/30 backdrop-blur-sm overflow-hidden">
          <div className="p-3 border-b border-purple-500/20 bg-black/20 flex items-center gap-2 shrink-0">
            <Button onClick={enter} variant="outline" color="purple" size="sm">Enter</Button>
            <Button onClick={stop} variant="outline" color="red" size="sm">Stop</Button>
            <Button onClick={clear} variant="outline" color="purple" size="sm">Clear</Button>
            {running && (
              <div className="ml-auto flex items-center gap-2 px-2 py-1 bg-green-500/20 border border-green-500/30 rounded animate-pulse">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                <span className="text-xs font-bold text-green-300">RUNNING</span>
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col p-3 overflow-hidden">
            <div className="flex-1 bg-black/60 rounded-lg border border-purple-500/20 overflow-hidden flex flex-col">
              <div className="px-3 py-2 border-b border-purple-500/20 bg-black/20 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                  <h3 className="text-xs font-bold text-red-300">CONSOLE OUTPUT</h3>
                </div>
                <span className="text-xs text-gray-500">{lines.length} lines</span>
              </div>
              <div ref={logRef} className="flex-1 p-3 font-mono text-xs whitespace-pre-wrap overflow-y-auto">
                {lines.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-gray-600">
                    <div className="text-center">
                      <div className="text-3xl mb-1">📟</div>
                      <p className="text-xs">Awaiting execution...</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-300 leading-relaxed">{lines.join('')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={confirmCfg.title} footer={
        <div className="flex gap-2">
          {confirmCfg.buttons.map(b => (
            <Button key={b} onClick={() => onConfirm(b)} color={b === 'Retry' ? 'red' : b === 'Next' ? 'purple' : 'gray'} size="sm">{b}</Button>
          ))}
        </div>
      }>
        <p className="text-sm text-gray-300">{confirmCfg.body}</p>
      </Modal>

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Project" footer={
        <div className="flex gap-2">
          <Button onClick={doCreateProject} color="purple" size="sm">Create</Button>
          <Button onClick={() => setCreateOpen(false)} variant="ghost" size="sm">Cancel</Button>
        </div>
      }>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-purple-300 mb-1">Location</label>
            <Input value={createBase} readOnly />
          </div>
          <div>
            <label className="block text-xs font-bold text-purple-300 mb-1">Name</label>
            <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="project" />
          </div>
        </div>
      </Modal>

      <Toast message={toast.message} type={toast.type} show={toast.show} onClose={() => setToast({ ...toast, show: false })} />
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
