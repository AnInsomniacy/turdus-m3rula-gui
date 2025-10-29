import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ChakraProvider, ColorModeScript, extendTheme, Box, Flex, Grid, GridItem, HStack, VStack, Text, Button, Select, Input, useToast, Badge, Spinner, Divider, Progress, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, FormControl, FormLabel } from '@chakra-ui/react'
import { motion, AnimatePresence } from 'framer-motion'

const theme = extendTheme({ config: { initialColorMode: 'dark', useSystemColorMode: false } })
const MotionBox = motion(Box)

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

const App = () => {
  const toast = useToast()
  const confirm = useDisclosure()
  const createDlg = useDisclosure()
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
    createDlg.onOpen()
  }

  const doCreateProject = async () => {
    if (!createBase || !createName) return
    const data = { ipsw: '', blob: '', gen: '', chip, mode: mode === 'teth' ? 'Tethered' : 'Untethered' }
    const res = await window.api.createProject(createBase, createName, data)
    if (res && res.ok) {
      setProjectDir(res.dir)
      setIpsw(''); setBlob(''); setGen('')
      toast({ status: 'success', title: 'Project created' })
      createDlg.onClose()
      refreshFiles()
    } else {
      toast({ status: 'error', title: 'Create failed' })
    }
  }

  const saveProject = async () => {
    if (!projectDir) { toast({ status: 'warning', title: 'Select project first' }); return }
    const data = { ipsw, blob, gen, chip, mode: mode === 'teth' ? 'Tethered' : 'Untethered' }
    await window.api.saveProject(projectDir, data)
    await window.api.saveProject(projectDir, { shsh: blob, generator: gen })
    toast({ status: 'success', title: 'Saved' })
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
      {
        label: 'Get SHC (pre)',
        needs: () => projectDir && ipsw,
        run: async () => {
          const ok = await runChain([
            { name: 'turdusra1n', args: ['-D'] },
            { name: 'turdus_merula', args: ['--get-shcblock', ipsw] }
          ])
          await afterStep()
          const renamed = await renameLatest('shcblock_pre.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin'])
          return ok && renamed
        }
      },
      {
        label: 'Restore Device',
        needs: () => projectDir && ipsw && files.includes('shcblock_pre.bin'),
        run: async () => {
          const ok = await runChain([
            { name: 'turdusra1n', args: ['-D'] },
            { name: 'turdus_merula', args: ['-o', '--load-shcblock', 'shcblock_pre.bin', ipsw] }
          ])
          if (ok) await touch('restore_done')
          await afterStep()
          return ok
        }
      },
      {
        label: 'Get SHC (post)',
        needs: () => projectDir,
        run: async () => {
          const ok = await runChain([{ name: 'turdusra1n', args: ['-g'] }])
          await afterStep()
          const renamed = await renameLatest('shcblock_post.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin'])
          return ok && renamed
        }
      },
      {
        label: 'Get pteblock',
        needs: () => projectDir && files.includes('shcblock_post.bin') && files.some(n => n.endsWith('signed-SEP.img4')),
        run: async () => {
          const sep = files.find(n => n.endsWith('signed-SEP.img4'))
          const ok = await runChain([{ name: 'turdusra1n', args: ['-g', '-i', sep, '-C', 'shcblock_post.bin'] }])
          await afterStep()
          const renamed = await renameLatest('pteblock.bin', ['shcblock_pre.bin', 'shcblock_post.bin', 'pteblock.bin'])
          return ok && renamed
        }
      },
      {
        label: 'Boot Device',
        needs: () => projectDir && files.includes('pteblock.bin'),
        run: async () => {
          const ok = await runChain([{ name: 'turdusra1n', args: ['-TP', 'pteblock.bin'] }])
          await afterStep()
          return ok
        }
      }
    ],
    a10_teth: [
      {
        label: 'Restore Device',
        needs: () => projectDir && ipsw,
        run: async () => {
          const ok = await runChain([
            { name: 'turdusra1n', args: ['-D'] },
            { name: 'turdus_merula', args: ['-o', ipsw] }
          ])
          if (ok) await touch('restore_done')
          await afterStep()
          return ok
        }
      },
      {
        label: 'Boot Device',
        needs: () => projectDir && files.some(n => /iBoot.*\.img4$/.test(n)) && files.some(n => /signed-SEP\.img4$/.test(n)) && files.some(n => /target-SEP\.im4p$/.test(n)),
        run: async () => {
          const iboot = files.find(n => /iBoot.*\.img4$/.test(n))
          const sepSigned = files.find(n => /signed-SEP\.img4$/.test(n))
          const sepTarget = files.find(n => /target-SEP\.im4p$/.test(n))
          const ok = await runChain([{ name: 'turdusra1n', args: ['-t', iboot, '-i', sepSigned, '-p', sepTarget] }])
          await afterStep()
          return ok
        }
      }
    ],
    a9_unteth: [
      {
        label: 'Get SHC Block',
        needs: () => projectDir && ipsw,
        run: async () => {
          const ok = await runChain([
            { name: 'turdusra1n', args: ['-D'] },
            { name: 'turdus_merula', args: ['--get-shcblock', ipsw] }
          ])
          await afterStep()
          const renamed = await renameLatest('shcblock_unteth.bin', ['shcblock_unteth.bin'])
          return ok && renamed
        }
      },
      {
        label: 'Untethered Restore',
        needs: () => projectDir && ipsw && blob && gen,
        run: async () => {
          const ok = await runChain([
            { name: 'turdusra1n', args: ['-Db', gen] },
            { name: 'turdus_merula', args: ['-w', '--load-shsh', blob, '--load-shcblock', 'shcblock_unteth.bin', ipsw] }
          ])
          if (ok) await touch('restore_done')
          await afterStep()
          return ok
        }
      }
    ],
    a10_unteth: [
      {
        label: 'Untethered Restore',
        needs: () => projectDir && ipsw && blob && gen,
        run: async () => {
          const ok = await runChain([
            { name: 'turdusra1n', args: ['-Db', gen] },
            { name: 'turdus_merula', args: ['-w', '--load-shsh', blob, ipsw] }
          ])
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
    if (!steps[idx].needs()) { toast({ status: 'warning', title: 'Missing requirement' }); return }
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
      title: ok ? 'Step Succeeded' : 'Step Failed',
      body: isLast ? (ok ? 'Device boot completed' : 'Please re-enter DFU then retry') : 'Please re-enter DFU before next',
      buttons: ok ? (isLast ? ['Close'] : ['Next', 'Close']) : ['Retry', 'Close']
    })
    confirm.onOpen()
  }

  const onConfirm = async (b) => {
    confirm.onClose()
    if (b === 'Next') { if (nextIndex >= 0) await doExecute(nextIndex) }
    if (b === 'Retry') { if (lastIdx >= 0) await doExecute(lastIdx) }
  }

  const enter = async () => { await window.api.write('\n') }
  const stop = async () => { await window.api.kill() }

  useEffect(() => { if (projectDir) saveProject() }, [chip, mode])

  const completed = status.filter(s => s === StepStatus.SUCCESS).length
  const pct = steps.length ? Math.floor((completed / steps.length) * 100) : 0

  return (
    <>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ChakraProvider theme={theme}>
        <Box minH="100vh" bgGradient="linear(to-br, gray.900, gray.800)" color="gray.100">
          <Box pos="absolute" inset={0} pointerEvents="none" opacity={0.25}>
            <MotionBox pos="absolute" top="-20%" left="-10%" w="60vw" h="60vw" bg="teal.600" filter="blur(100px)" borderRadius="full" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 8, repeat: Infinity }} />
            <MotionBox pos="absolute" bottom="-30%" right="-10%" w="70vw" h="70vw" bg="purple.600" filter="blur(120px)" borderRadius="full" animate={{ scale: [1.05, 0.95, 1.05] }} transition={{ duration: 10, repeat: Infinity }} />
          </Box>

          <Flex
            as="header"
            px={6}
            py={3}
            align="center"
            position="sticky"
            top={0}
            zIndex={20}
            bg="blackAlpha.500"
            borderBottom="1px"
            borderColor="whiteAlpha.300"
            backdropFilter="auto"
            backdropBlur="10px"
            boxShadow="sm"
          >
            <Text fontWeight="bold">Turdus M3rula</Text>
            <Badge ml={3} colorScheme="purple">Electron</Badge>
            <Box flex={1} />
            <HStack spacing={3}>
              <Button size="sm" onClick={newProject} variant="solid" colorScheme="purple" bg="purple.500" _hover={{ bg: 'purple.400' }}>New</Button>
              <Button size="sm" onClick={openProject} variant="outline" colorScheme="purple">Open</Button>
              <Button size="sm" onClick={saveProject} colorScheme="purple">Save</Button>
            </HStack>
          </Flex>

          <Grid templateColumns={{ base: '1fr', md: '360px 1fr' }} gap={6} p={6}>
            <GridItem>
              <VStack spacing={4} align="stretch">
                <MotionBox p={4} bg="whiteAlpha.100" border="1px" borderColor="whiteAlpha.200" rounded="lg" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <Text mb={2} fontWeight="semibold">Device</Text>
                  <HStack>
                    <Select value={chip} onChange={(e) => setChip(e.target.value)} color="gray.100">
                      <option value="A9">A9</option>
                      <option value="A10">A10/A10X</option>
                    </Select>
                    <Select value={mode} onChange={(e) => setMode(e.target.value)} color="gray.100">
                      <option value="teth">Tethered</option>
                      <option value="unteth">Untethered</option>
                    </Select>
                  </HStack>
                  <Text mt={2} fontSize="sm" color="gray.300">{projectDir || 'No project selected'}</Text>
                </MotionBox>

                <MotionBox p={4} bg="whiteAlpha.100" border="1px" borderColor="whiteAlpha.200" rounded="lg" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <Text mb={2} fontWeight="semibold">Files</Text>
                  <VStack align="stretch" spacing={3}>
                    <HStack>
                      <Button onClick={() => pickFile(setIpsw, [{ name: 'IPSW', extensions: ['ipsw'] }])} variant="outline" colorScheme="purple" color="purple.300" borderColor="purple.300" _hover={{ color: 'purple.200', borderColor: 'purple.200' }}>IPSW</Button>
                      <Input value={ipsw} onChange={(e) => setIpsw(e.target.value)} placeholder="Path" bg="whiteAlpha.100" borderColor="whiteAlpha.300" color="gray.100" _placeholder={{ color: 'whiteAlpha.600' }} />
                    </HStack>
                    {mode === 'unteth' && (
                      <>
                        <HStack>
                          <Button onClick={pickBlob} variant="outline" colorScheme="purple">SHSH</Button>
                          <Input value={blob} onChange={(e) => setBlob(e.target.value)} placeholder="Path" bg="whiteAlpha.100" borderColor="whiteAlpha.300" color="gray.100" _placeholder={{ color: 'whiteAlpha.600' }} />
                        </HStack>
                        <Input value={gen} onChange={(e) => setGen(e.target.value)} placeholder="Generator" bg="whiteAlpha.100" borderColor="whiteAlpha.300" color="gray.100" _placeholder={{ color: 'whiteAlpha.600' }} />
                      </>
                    )}
                  </VStack>
                </MotionBox>

                <MotionBox p={4} bg="whiteAlpha.100" border="1px" borderColor="whiteAlpha.200" rounded="lg" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <Text mb={2} fontWeight="semibold">Steps</Text>
                  <VStack align="stretch" spacing={2}>
                    <AnimatePresence>
                      {steps.map((s, i) => {
                        const can = s.needs()
                        const st = status[i]
                        const isNext = i === nextIndex
                        return (
                          <MotionBox key={s.label} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.2 }} p={2} rounded="md" bg={isNext ? 'purple.700' : 'whiteAlpha.100'} border="1px" borderColor={isNext ? 'purple.400' : 'whiteAlpha.200'}>
                            <HStack>
                              <Badge colorScheme={st === StepStatus.SUCCESS ? 'green' : st === StepStatus.FAILED ? 'red' : isNext ? 'purple' : 'gray'}>{i + 1}</Badge>
                              <Text flex={1}>{s.label}</Text>
                              <Button size="sm" colorScheme={isNext ? 'purple' : 'gray'} isDisabled={!can || st === StepStatus.SUCCESS} onClick={() => doExecute(i)}>
                                {st === StepStatus.RUNNING ? <Spinner size="xs" /> : (isNext ? 'Run' : 'Play')}
                              </Button>
                            </HStack>
                          </MotionBox>
                        )
                      })}
                    </AnimatePresence>
                    <Progress value={pct} size="sm" colorScheme="purple" rounded="md" />
                  </VStack>
                </MotionBox>

                <MotionBox p={4} bg="whiteAlpha.100" border="1px" borderColor="whiteAlpha.200" rounded="lg" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <Text mb={2} fontWeight="semibold">Binaries</Text>
                  <VStack align="stretch" spacing={1} fontSize="sm" color="gray.300">
                    <Text>turdus_merula: {binMerula || 'not found'}</Text>
                    <Text>turdusra1n: {binRa1n || 'not found'}</Text>
                  </VStack>
                </MotionBox>

                <MotionBox p={4} bg="whiteAlpha.100" border="1px" borderColor="whiteAlpha.200" rounded="lg" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <Text mb={2} fontWeight="semibold">Files</Text>
                  <VStack align="stretch" spacing={1} fontSize="sm" color="gray.300" maxH="22vh" overflowY="auto">
                    {files.map(n => <Text key={n}>• {n}</Text>)}
                  </VStack>
                </MotionBox>
              </VStack>
            </GridItem>

            <GridItem>
              <VStack spacing={4} align="stretch">
                <MotionBox p={4} bg="whiteAlpha.100" border="1px" borderColor="whiteAlpha.200" rounded="lg" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <HStack>
                    <Button onClick={enter} variant="outline" colorScheme="purple" color="purple.300" borderColor="purple.300" _hover={{ color: 'purple.200', borderColor: 'purple.200' }}>Enter</Button>
                    <Button onClick={stop} variant="outline" colorScheme="red">Stop</Button>
                    <Button onClick={clear} variant="outline" colorScheme="purple" color="purple.300" borderColor="purple.300" _hover={{ color: 'purple.200', borderColor: 'purple.200' }}>Clear</Button>
                  </HStack>
                </MotionBox>

                <MotionBox p={0} bg="blackAlpha.800" border="1px" borderColor="whiteAlpha.200" rounded="lg" overflow="hidden" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <Box px={4} py={2} borderBottom="1px" borderColor="whiteAlpha.200" bg="whiteAlpha.100">
                    <Text fontWeight="semibold">Output</Text>
                  </Box>
                  <Box ref={logRef} p={4} fontFamily="mono" fontSize="sm" whiteSpace="pre-wrap" overflowY="auto" maxH="60vh" color="gray.100">
                    {lines.join('')}
                  </Box>
                </MotionBox>
              </VStack>
            </GridItem>
          </Grid>

          <Divider borderColor="whiteAlpha.300" />
          <Box py={4} textAlign="center" color="whiteAlpha.700" fontSize="sm">Ready</Box>
        </Box>

        <Modal isOpen={confirm.isOpen} onClose={confirm.onClose} isCentered>
          <ModalOverlay />
          <ModalContent bg="gray.800" color="gray.100">
            <ModalHeader>{confirmCfg.title}</ModalHeader>
            <ModalBody><Text>{confirmCfg.body}</Text></ModalBody>
            <ModalFooter>
              <HStack>
                {confirmCfg.buttons.map(b => (
                  <Button key={b} onClick={() => onConfirm(b)} colorScheme={b === 'Retry' ? 'red' : b === 'Next' ? 'purple' : 'gray'}>{b}</Button>
                ))}
              </HStack>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </ChakraProvider>
      <Modal isOpen={createDlg.isOpen} onClose={createDlg.onClose} isCentered>
        <ModalOverlay />
        <ModalContent bg="gray.800" color="gray.100">
          <ModalHeader>New Project</ModalHeader>
          <ModalBody>
            <VStack align="stretch" spacing={3}>
              <FormControl>
                <FormLabel>Location</FormLabel>
                <Input value={createBase} isReadOnly bg="whiteAlpha.100" borderColor="whiteAlpha.300" />
              </FormControl>
              <FormControl>
                <FormLabel>Name</FormLabel>
                <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="project" bg="whiteAlpha.100" borderColor="whiteAlpha.300" />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button onClick={doCreateProject} colorScheme="purple">Create</Button>
              <Button onClick={createDlg.onClose} variant="ghost" colorScheme="gray">Cancel</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  )
}

createRoot(document.getElementById('root')).render(<App />)
