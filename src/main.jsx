import React, {useEffect, useMemo, useRef, useState} from 'react'
import {createRoot} from 'react-dom/client'
import AnsiToHtml from 'ansi-to-html'
import {Modal, Button, Input, CustomSelect, Badge, Spinner, Toast} from './components'
import './index.css'

const ansiConverter = new AnsiToHtml()
const StepStatus = {PENDING: 'pending', RUNNING: 'running', SUCCESS: 'success', FAILED: 'failed'}

const useLog = () => {
    const [lines, setLines] = useState([])
    useEffect(() => {
        const onLog = (m) => setLines((prev) => [...prev, String(m)])
        const onExit = (m) => setLines((prev) => [...prev, `\n[exit] code=${m.code} signal=${m.signal}\n`])
        window.api.onLog(onLog)
        window.api.onExit(onExit)
    }, [])
    return {lines, clear: () => setLines([])}
}

const runOne = async (name, args, cwd) => {
    const result = await window.api.run({name, args, cwd})
    if (result && result.error) {
        return false
    }
    return new Promise((resolve) => {
        window.api.onceExit((m) => resolve(m && m.code === 0))
    })
}

const App = () => {
    const [toast, setToast] = useState({show: false, message: '', type: 'info'})
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [initModalOpen, setInitModalOpen] = useState(true)
    const [createOpen, setCreateOpen] = useState(false)
    const [aboutOpen, setAboutOpen] = useState(false)
    const [confirmCfg, setConfirmCfg] = useState({title: '', body: '', buttons: [], error: false, nextStep: -1})
    const [createName, setCreateName] = useState('')
    const [createChip, setCreateChip] = useState('A9')
    const [createMode, setCreateMode] = useState('teth')
    const [projectDir, setProjectDir] = useState('')
    const [chip, setChip] = useState('A9')
    const [mode, setMode] = useState('teth')
    const [ipsw, setIpsw] = useState('')
    const [blob, setBlob] = useState('')
    const [gen, setGen] = useState('')
    const [running, setRunning] = useState(false)
    const [files, setFiles] = useState([])
    const [isMaximized, setIsMaximized] = useState(false)
    const [completedSteps, setCompletedSteps] = useState([])
    const {lines, clear} = useLog()
    const logRef = useRef(null)

    const showToast = (message, type = 'info') => setToast({show: true, message, type})

    useEffect(() => {
        window.api.onStarted(() => setRunning(true))
        window.api.onExit(() => setRunning(false))
    }, [])

    useEffect(() => {
        if (logRef.current) {
            const el = logRef.current
            el.scrollTop = el.scrollHeight
        }
    }, [lines])

    useEffect(() => {
        window.api.windowIsMaximized().then(setIsMaximized)
    }, [])

    const handleMinimize = () => window.api.windowMinimize()
    const handleMaximize = async () => {
        await window.api.windowMaximize()
        setIsMaximized(await window.api.windowIsMaximized())
    }
    const handleClose = () => window.api.windowClose()

    const refreshFiles = async () => {
        if (!projectDir) return
        const list = await window.api.list(projectDir)
        if (Array.isArray(list)) setFiles(list)
    }

    useEffect(() => {
        refreshFiles()
    }, [projectDir])

    const detectCompletedSteps = useMemo(() => {
        const completed = []
        if (!projectDir) return completed

        if (mode === 'teth' && chip === 'A9') {
            if (files.includes('shcblock_pre.bin')) completed.push(0)
            if (files.includes('restore_done')) completed.push(1)
            if (files.includes('shcblock_post.bin')) completed.push(2)
            if (files.includes('pteblock.bin')) completed.push(3)
            if (files.includes('boot_done')) completed.push(4)
        } else if (mode === 'teth' && chip !== 'A9') {
            if (files.includes('restore_done')) completed.push(0)
            if (files.includes('boot_done')) completed.push(1)
        } else if (mode === 'unteth' && chip === 'A9') {
            if (files.includes('shcblock_unteth.bin')) completed.push(0)
            if (files.includes('restore_done')) completed.push(1)
        } else if (mode === 'unteth' && chip !== 'A9') {
            if (files.includes('restore_done')) completed.push(0)
        }

        return completed
    }, [files, chip, mode, projectDir])

    useEffect(() => {
        setCompletedSteps(detectCompletedSteps)
    }, [detectCompletedSteps])

    const loadProjectConfig = async (dir) => {
        const j = await window.api.loadProject(dir)
        if (j && !j.error) {
            setIpsw(j.ipsw || '')
            setBlob(j.blob || j.shsh || '')
            setGen(j.gen || j.generator || '')
            setChip(j.chip || 'A9')
            setMode(j.mode === 'Untethered' ? 'unteth' : 'teth')
            if (j.blob && (!j.gen || j.gen === 'UNKNOWN')) {
                const g = await window.api.extractGen(j.blob)
                setGen(g || 'UNKNOWN')
            }
        }
    }

    const saveProjectConfig = async (stepsToSave = completedSteps) => {
        if (!projectDir) return
        const data = {
            ipsw,
            blob,
            gen,
            chip,
            mode: mode === 'teth' ? 'Tethered' : 'Untethered',
            completedSteps: stepsToSave
        }
        await window.api.saveProject(projectDir, data)
    }

    const openProject = async () => {
        const r = await window.api.openDialog({properties: ['openDirectory']})
        if (!r || !r[0]) return
        const dir = r[0]
        setProjectDir(dir)
        await loadProjectConfig(dir)
        refreshFiles()
        setInitModalOpen(false)
    }

    const newProject = () => {
        const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6}).*/, '$1_$2')
        const modeText = createMode === 'teth' ? 'Tethered' : 'Untethered'
        const defaultName = `${createChip}_${modeText}_${timestamp}`
        setCreateName(defaultName)
        setCreateOpen(true)
    }

    useEffect(() => {
        if (createOpen) {
            const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6}).*/, '$1_$2')
            const modeText = createMode === 'teth' ? 'Tethered' : 'Untethered'
            const defaultName = `${createChip}_${modeText}_${timestamp}`
            setCreateName(defaultName)
        }
    }, [createChip, createMode, createOpen])

    const doCreateProject = async () => {
        if (!createName) return
        const r = await window.api.openDialog({properties: ['openDirectory', 'createDirectory']})
        if (!r || !r[0]) return
        const parentDir = r[0]
        const data = {ipsw: '', blob: '', gen: '', chip: createChip, mode: createMode === 'teth' ? 'Tethered' : 'Untethered'}
        const res = await window.api.createProject(parentDir, createName, data)
        if (res && res.ok) {
            setProjectDir(res.dir)
            setChip(createChip)
            setMode(createMode)
            setIpsw('')
            setBlob('')
            setGen('')
            showToast('Project created', 'success')
            setCreateOpen(false)
            setInitModalOpen(false)
            refreshFiles()
        } else {
            showToast('Create failed', 'error')
        }
    }

    const pickFile = async (setter, filters) => {
        const r = await window.api.openDialog({properties: ['openFile'], filters})
        if (!r || !r[0]) return
        setter(r[0])
    }

    const pickBlob = async () => {
        const r = await window.api.openDialog({
            properties: ['openFile'],
            filters: [{name: 'SHSH', extensions: ['shsh2', 'shsh', 'plist', 'json']}]
        })
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

    const afterStep = async () => {
        await window.api.moveTempUp(projectDir)
        await refreshFiles()
    }

    const renameLatest = async (target, exclude) => {
        const res = await window.api.renameLatestBin(projectDir, target, exclude)
        return res && !res.error
    }

    const touch = async (name) => {
        await window.api.touch(projectDir, name)
    }

    const runChain = async (items) => {
        for (const it of items) {
            const ok = await runOne(it.name, it.args || [], projectDir)
            if (!ok) {
                await window.api.kill()
                return false
            }
        }
        return true
    }

    const stepDefs = useMemo(() => ({
        a9_teth: [
            {
                label: 'Get SHC (pre)', run: async () => {
                    const ok = await runChain([{name: 'turdusra1n', args: ['-D']}, {name: 'turdus_merula', args: ['--get-shcblock', ipsw]}])
                    await afterStep()
                    const renamed = await renameLatest('shcblock_pre.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin'])
                    return ok && renamed
                }
            },
            {
                label: 'Restore Device', run: async () => {
                    const ok = await runChain([{name: 'turdusra1n', args: ['-D']}, {name: 'turdus_merula', args: ['-o', '--load-shcblock', 'shcblock_pre.bin', ipsw]}])
                    if (ok) await touch('restore_done')
                    await afterStep()
                    return ok
                }
            },
            {
                label: 'Get SHC (post)', run: async () => {
                    const ok = await runChain([{name: 'turdusra1n', args: ['-g']}])
                    await afterStep()
                    const renamed = await renameLatest('shcblock_post.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin'])
                    return ok && renamed
                }
            },
            {
                label: 'Get pteblock', run: async () => {
                    const sep = files.find(n => n.endsWith('signed-SEP.img4'))
                    const ok = await runChain([{name: 'turdusra1n', args: ['-g', '-i', sep, '-C', 'shcblock_post.bin']}])
                    await afterStep()
                    const renamed = await renameLatest('pteblock.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin'])
                    return ok && renamed
                }
            },
            {
                label: 'Boot Device', run: async () => {
                    const ok = await runChain([{name: 'turdusra1n', args: ['-TP', 'pteblock.bin']}])
                    if (ok) await touch('boot_done')
                    await afterStep()
                    return ok
                }
            }
        ],
        a10_teth: [
            {
                label: 'Restore Device', run: async () => {
                    const ok = await runChain([{name: 'turdusra1n', args: ['-D']}, {name: 'turdus_merula', args: ['-o', ipsw]}])
                    if (ok) await touch('restore_done')
                    await afterStep()
                    return ok
                }
            },
            {
                label: 'Boot Device', run: async () => {
                    const iboot = files.find(n => /iBoot.*\.img4$/.test(n))
                    const sepSigned = files.find(n => /signed-SEP\.img4$/.test(n))
                    const sepTarget = files.find(n => /target-SEP\.im4p$/.test(n))
                    const ok = await runChain([{name: 'turdusra1n', args: ['-t', iboot, '-i', sepSigned, '-p', sepTarget]}])
                    if (ok) await touch('boot_done')
                    await afterStep()
                    return ok
                }
            }
        ],
        a9_unteth: [
            {
                label: 'Get SHC Block', run: async () => {
                    const ok = await runChain([{name: 'turdusra1n', args: ['-D']}, {name: 'turdus_merula', args: ['--get-shcblock', ipsw]}])
                    await afterStep()
                    const renamed = await renameLatest('shcblock_unteth.bin', ['shcblock_unteth.bin'])
                    return ok && renamed
                }
            },
            {
                label: 'Untethered Restore', run: async () => {
                    const ok = await runChain([{name: 'turdusra1n', args: ['-Db', gen]}, {name: 'turdus_merula', args: ['-w', '--load-shsh', blob, '--load-shcblock', 'shcblock_unteth.bin', ipsw]}])
                    if (ok) await touch('restore_done')
                    await afterStep()
                    return ok
                }
            }
        ],
        a10_unteth: [
            {
                label: 'Untethered Restore', run: async () => {
                    const ok = await runChain([{name: 'turdusra1n', args: ['-Db', gen]}, {name: 'turdus_merula', args: ['-w', '--load-shsh', blob, ipsw]}])
                    if (ok) await touch('restore_done')
                    await afterStep()
                    return ok
                }
            }
        ]
    }), [projectDir, ipsw, blob, gen, files])

    const steps = useMemo(() => {
        if (mode === 'teth' && chip === 'A9') return stepDefs.a9_teth
        if (mode === 'teth' && chip !== 'A9') return stepDefs.a10_teth
        if (mode === 'unteth' && chip === 'A9') return stepDefs.a9_unteth
        return stepDefs.a10_unteth
    }, [mode, chip, stepDefs])

    const [status, setStatus] = useState(steps.map(() => StepStatus.PENDING))

    useEffect(() => {
        setStatus(steps.map((_, i) => completedSteps.includes(i) ? StepStatus.SUCCESS : StepStatus.PENDING))
    }, [steps])

    useEffect(() => {
        setStatus(prev => prev.map((st, i) => {
            if (completedSteps.includes(i)) return StepStatus.SUCCESS
            if (st === StepStatus.RUNNING || st === StepStatus.FAILED) return st
            return StepStatus.PENDING
        }))
    }, [completedSteps])

    const canExecuteStep = (idx) => {
        if (!projectDir || !ipsw) return false
        if (mode === 'unteth' && (!blob || !gen)) return false
        if (idx === 0) return true
        for (let i = 0; i < idx; i++) {
            if (!completedSteps.includes(i)) return false
        }
        return true
    }

    const calculateNextIndex = () => {
        for (let i = 0; i < steps.length; i++) {
            if (completedSteps.includes(i)) continue
            if (canExecuteStep(i)) return i
        }
        return -1
    }

    const nextIndex = useMemo(() => calculateNextIndex(), [completedSteps, steps, projectDir, ipsw, blob, gen, mode])

    const doExecute = async (idx) => {
        const ns = [...status]
        ns[idx] = StepStatus.RUNNING
        setStatus(ns)
        let ok = false
        try {
            ok = await steps[idx].run()
        } catch (e) {
            console.error('Step execution error:', e)
            ok = false
        }
        const ns2 = [...ns]
        ns2[idx] = ok ? StepStatus.SUCCESS : StepStatus.FAILED
        setStatus(ns2)

        await refreshFiles()
        await new Promise(resolve => setTimeout(resolve, 300))

        let nextStep = -1
        const newCompleted = ok ? [...completedSteps, idx] : completedSteps
        if (ok) {
            setCompletedSteps(newCompleted)
            await saveProjectConfig(newCompleted)
            for (let i = 0; i < steps.length; i++) {
                if (newCompleted.includes(i)) continue
                if (i === 0 || newCompleted.includes(i - 1)) {
                    nextStep = i
                    break
                }
            }
        }
        const isLast = idx === steps.length - 1
        setConfirmCfg({
            title: ok ? 'Success' : 'Failed',
            body: isLast ? (ok ? 'Device boot completed' : 'Re-enter DFU and retry') : 'Re-enter DFU before next',
            buttons: ok ? (isLast ? ['Close'] : ['Next', 'Close']) : ['Retry', 'Close'],
            error: !ok,
            nextStep: ok ? nextStep : idx
        })
        setConfirmOpen(true)
    }

    const onConfirm = async (b) => {
        const targetStep = confirmCfg.nextStep
        setConfirmOpen(false)
        if (b === 'Next' || b === 'Retry') {
            if (targetStep >= 0) {
                await doExecute(targetStep)
            }
        }
    }

    const enter = async () => {
        await window.api.write('\n')
    }

    const stop = async () => {
        await window.api.kill()
    }

    useEffect(() => {
        if (projectDir) saveProjectConfig(completedSteps)
    }, [ipsw, blob, gen])

    const completed = completedSteps.length
    const allCompleted = completed === steps.length && steps.length > 0

    const lineCount = lines.length > 0 ? lines.join('').split('\n').length : 0

    const chipDisplay = chip === 'A9' ? 'A9(X)' : 'A10(X)'
    const modeDisplay = mode === 'teth' ? 'Tethered' : 'Untethered'

    const chipOptions = [
        {value: 'A9', label: 'A9(X)'},
        {value: 'A10', label: 'A10(X)'}
    ]

    const modeOptions = [
        {value: 'teth', label: 'Tethered'},
        {value: 'unteth', label: 'Untethered'}
    ]

    return (
        <div className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-10">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse"></div>
                <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
                <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-teal-600 rounded-full mix-blend-multiply filter blur-3xl animate-pulse" style={{animationDelay: '4s'}}></div>
            </div>

            <header className="relative z-20 px-4 py-3 bg-slate-900/80 border-b border-cyan-500/20 backdrop-blur-xl flex items-center gap-4 shrink-0" style={{WebkitAppRegion: 'drag'}}>
                <div className="flex items-center gap-2">
                    <img src="./logo.png" alt="Logo" className="w-8 h-8 rounded-lg shadow-lg shadow-cyan-500/50"/>
                    <h1 className="text-xl font-black text-cyan-400">Turdus M3rula GUI</h1>
                    <Badge color="cyan">iOS/iPadOS Downgrade</Badge>
                </div>
                <div className="flex-1"></div>
                <div className="flex gap-2" style={{WebkitAppRegion: 'no-drag'}}>
                    <Button size="sm" onClick={newProject} variant="solid" color="cyan">New</Button>
                    <Button size="sm" onClick={openProject} variant="outline" color="cyan">Open</Button>
                </div>
                <div className="flex gap-2 ml-2" style={{WebkitAppRegion: 'no-drag'}}>
                    <button onClick={() => setAboutOpen(true)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-cyan-600 border border-cyan-500/30 hover:border-cyan-500 transition-all duration-200 group">
                        <svg className="w-5 h-5 text-cyan-400 group-hover:text-white transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                            <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
                <div className="flex gap-1 ml-1" style={{WebkitAppRegion: 'no-drag'}}>
                    <button onClick={handleMinimize} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all duration-200">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                    </button>
                    <button onClick={handleMaximize} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all duration-200">
                        {isMaximized ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                <rect x="8" y="4" width="11" height="11" rx="1"/>
                                <path d="M5 8h3v11h11v3H5z" fill="currentColor" opacity="0.4"/>
                            </svg>
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                <rect x="5" y="5" width="14" height="14" rx="1"/>
                            </svg>
                        )}
                    </button>
                    <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 hover:border-red-500/50 transition-all duration-200">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <line x1="6" y1="6" x2="18" y2="18" strokeWidth="2" strokeLinecap="round"/>
                            <line x1="18" y1="6" x2="6" y2="18" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>
            </header>

            <div className="relative flex-1 flex overflow-hidden">
                <div className="w-80 bg-slate-900/50 border-r border-cyan-500/20 backdrop-blur-sm overflow-y-auto flex flex-col">
                    <div className="p-3 space-y-3 flex-1">
                        <div className="p-3 bg-slate-800/50 border border-cyan-500/20 rounded-lg hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></div>
                                <h3 className="text-xs font-bold text-cyan-400">DEVICE</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                <Input value={chipDisplay} readOnly/>
                                <Input value={modeDisplay} readOnly/>
                            </div>
                            <div className="px-2 py-1.5 bg-slate-900/50 rounded border border-cyan-500/10">
                                <p className="text-xs text-cyan-300 font-mono truncate">{projectDir || 'No project'}</p>
                            </div>
                        </div>

                        <div className="p-3 bg-slate-800/50 border border-cyan-500/20 rounded-lg hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-200">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                                <h3 className="text-xs font-bold text-blue-400">FILES</h3>
                            </div>
                            <div className="space-y-2">
                                <div className="flex gap-1">
                                    <Button onClick={() => pickFile(setIpsw, [{name: 'IPSW', extensions: ['ipsw']}])} variant="outline" color="cyan" size="sm" className="w-16 shrink-0">IPSW</Button>
                                    <Input value={ipsw} onChange={(e) => setIpsw(e.target.value)} placeholder="Path..."/>
                                </div>
                                <div className={`overflow-hidden transition-all duration-300 ${mode === 'unteth' ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                                    <div className="space-y-2">
                                        <div className="flex gap-1">
                                            <Button onClick={pickBlob} variant="outline" color="cyan" size="sm" className="w-16 shrink-0">SHSH</Button>
                                            <Input value={blob} onChange={(e) => setBlob(e.target.value)} placeholder="Path..."/>
                                        </div>
                                        <Input value={gen} onChange={(e) => setGen(e.target.value)} placeholder="Generator"/>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-3 bg-slate-800/50 border border-cyan-500/20 rounded-lg hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-200">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                                    <h3 className="text-xs font-bold text-green-400">WORKFLOW</h3>
                                </div>
                                <div className="text-xs text-slate-400">{completed}/{steps.length}</div>
                            </div>
                            <div className={`overflow-hidden transition-all duration-300 ${allCompleted ? 'max-h-20 opacity-100 mb-2' : 'max-h-0 opacity-0 mb-0'}`}>
                                <div className="p-2 bg-green-500/20 border border-green-500/40 rounded text-center">
                                    <span className="text-xs font-bold text-green-300">All Steps Completed</span>
                                </div>
                            </div>
                            <div key={`${chip}-${mode}`} className="space-y-1.5 mb-2">
                                {steps.map((s, i) => {
                                    const canExec = canExecuteStep(i)
                                    const st = status[i]
                                    const isNext = i === nextIndex
                                    const isCompleted = completedSteps.includes(i)
                                    const isFailed = st === StepStatus.FAILED
                                    const isAnyRunning = status.some(s => s === StepStatus.RUNNING)
                                    return (
                                        <div
                                            key={`${s.label}-${i}`}
                                            className={`p-2 rounded border transition-all duration-200 ${
                                                isFailed ? 'bg-red-600/20 border-red-400/50 shadow-lg shadow-red-500/20' :
                                                isNext ? 'bg-cyan-600/20 border-cyan-400/50 shadow-lg shadow-cyan-500/20 scale-105' :
                                                isCompleted ? 'bg-green-600/10 border-green-500/30' :
                                                'bg-slate-900/30 border-slate-700/30'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Badge color={st === StepStatus.SUCCESS ? 'green' : st === StepStatus.FAILED ? 'red' : st === StepStatus.RUNNING ? 'yellow' : isNext ? 'cyan' : 'gray'}>
                                                    {i + 1}
                                                </Badge>
                                                <span className="flex-1 text-xs font-medium truncate">{s.label}</span>
                                                <Button size="sm" color={isNext ? 'cyan' : 'gray'} disabled={isAnyRunning} onClick={() => doExecute(i)}>
                                                    {st === StepStatus.RUNNING ? <Spinner/> : '▶'}
                                                </Button>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col bg-slate-900/30 backdrop-blur-sm overflow-hidden">
                    <div className="p-3 border-b border-cyan-500/20 bg-slate-900/50 flex items-center gap-2 shrink-0">
                        <Button onClick={enter} variant="outline" color="cyan" size="sm">Enter</Button>
                        <Button onClick={stop} variant="outline" color="red" size="sm">Stop</Button>
                        <Button onClick={clear} variant="outline" color="cyan" size="sm">Clear</Button>
                        <div className={`ml-auto flex items-center gap-2 px-2 py-1 bg-green-500/20 border border-green-500/30 rounded transition-all duration-300 ${running ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs font-bold text-green-300">RUNNING</span>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col p-3 overflow-hidden">
                        <div className="flex-1 bg-slate-900/60 rounded-lg border border-cyan-500/20 overflow-hidden flex flex-col">
                            <div className="px-3 py-2 border-b border-cyan-500/20 bg-slate-900/50 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></div>
                                    <h3 className="text-xs font-bold text-cyan-400">CONSOLE OUTPUT</h3>
                                </div>
                                <span className="text-xs text-slate-500">{lineCount} lines</span>
                            </div>
                            <div ref={logRef} className="flex-1 p-3 font-mono text-xs whitespace-pre-wrap overflow-y-auto">
                                {lines.length === 0 ? (
                                    <div className="flex items-center justify-center h-full text-slate-600">
                                        <div className="text-center">
                                            <svg className="w-12 h-12 mx-auto mb-2 text-cyan-500/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="1.5"/>
                                                <path d="M8 21h8M12 17v4" strokeWidth="1.5" strokeLinecap="round"/>
                                                <path d="M7 7h.01M7 10h.01M7 13h.01" strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                            <p className="text-xs">Awaiting execution...</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{__html: ansiConverter.toHtml(lines.join(''))}}/>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Modal isOpen={initModalOpen} onClose={() => {}} title="Welcome to Turdus M3rula GUI" canClose={false} footer={
                <div className="flex gap-2 w-full justify-between">
                    <Button onClick={handleClose} variant="outline" color="red" size="sm">Exit</Button>
                    <div className="flex gap-2">
                        <Button onClick={newProject} color="cyan" size="sm">New Project</Button>
                        <Button onClick={openProject} variant="outline" color="cyan" size="sm">Open Project</Button>
                    </div>
                </div>
            }>
                <div className="text-center py-4">
                    <div className="relative w-20 h-20 mx-auto mb-4">
                        <svg className="absolute left-0 top-2 w-10 h-14 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                            <rect x="5" y="2" width="14" height="20" rx="2"/>
                            <path d="M9 18h6" strokeLinecap="round"/>
                        </svg>
                        <svg className="absolute right-0 top-0 w-14 h-16 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                            <rect x="3" y="2" width="18" height="20" rx="2"/>
                            <circle cx="12" cy="19" r="0.5" fill="currentColor"/>
                        </svg>
                    </div>
                    <p className="text-sm text-slate-300 mb-2">Create or open a project to start</p>
                    <p className="text-xs text-slate-500">iOS/iPadOS device restore and downgrade tool</p>
                </div>
            </Modal>

            <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={confirmCfg.title} error={confirmCfg.error} footer={
                <div className="flex gap-2">
                    {confirmCfg.buttons.map(b => (
                        <Button key={b} onClick={() => onConfirm(b)} color={b === 'Retry' ? 'red' : b === 'Next' ? 'cyan' : 'gray'} size="sm">{b}</Button>
                    ))}
                </div>
            }>
                <p className="text-sm text-slate-300">{confirmCfg.body}</p>
            </Modal>

            <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="New Project" footer={
                <div className="flex gap-2">
                    <Button onClick={doCreateProject} color="cyan" size="sm">Create</Button>
                    <Button onClick={() => setCreateOpen(false)} variant="ghost" size="sm">Cancel</Button>
                </div>
            }>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-cyan-400 mb-1">Chip</label>
                        <CustomSelect value={createChip} onChange={setCreateChip} options={chipOptions}/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-cyan-400 mb-1">Mode</label>
                        <CustomSelect value={createMode} onChange={setCreateMode} options={modeOptions}/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-cyan-400 mb-1">Project Name</label>
                        <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Enter project name"/>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={aboutOpen} onClose={() => setAboutOpen(false)} title="About" footer={
                <Button onClick={() => setAboutOpen(false)} color="cyan" size="sm">Close</Button>
            }>
                <div className="space-y-4 text-sm">
                    <div className="flex items-center gap-3">
                        <img src="./logo.png" alt="Logo" className="w-12 h-12 rounded-lg shadow-lg shadow-cyan-500/30"/>
                        <div>
                            <h3 className="text-base font-bold text-cyan-400">Turdus M3rula GUI</h3>
                            <p className="text-xs text-slate-400">Version 1.0.3</p>
                        </div>
                    </div>
                    <div className="border-t border-cyan-500/20 pt-3">
                        <p className="text-slate-300 leading-relaxed">GUI for turdus merula - iOS/iPadOS downgrade tool for A9-A10X devices</p>
                    </div>
                    <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">Author:</span>
                            <span className="text-cyan-300">AnInsomniacy</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">GitHub:</span>
                            <button
                                onClick={() => window.api.openExternal('https://github.com/AnInsomniacy')}
                                className="text-cyan-400 hover:text-cyan-300 transition-colors duration-200 cursor-pointer hover:underline"
                            >
                                github.com/AnInsomniacy
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">Core Engine:</span>
                            <span className="text-slate-300">turdus_merula v1.1</span>
                        </div>
                    </div>
                </div>
            </Modal>

            <Toast message={toast.message} type={toast.type} show={toast.show} onClose={() => setToast({...toast, show: false})}/>
        </div>
    )
}

const container = document.getElementById('root')
if (!container._reactRoot) {
    container._reactRoot = createRoot(container)
}
container._reactRoot.render(<App/>)
