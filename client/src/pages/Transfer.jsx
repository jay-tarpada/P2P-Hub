import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import QRCode from 'qrcode'
import DashboardHeader from '../components/DashboardHeader'
import { useTransfer } from '../contexts/TransferContext'
import { putFile, getFile, deleteFile } from '../utils/idb'

function QR({ text }) {
    const [dataUrl, setDataUrl] = useState('')
    useEffect(() => {
        let mounted = true
        if (text) {
            QRCode.toDataURL(text, { width: 224, margin: 1 })
                .then(url => { if (mounted) setDataUrl(url) })
                .catch(() => setDataUrl(''))
        } else {
            setDataUrl('')
        }
        return () => { mounted = false }
    }, [text])
    if (!text) return null
    return (
        <img src={dataUrl} alt="QR" className="w-56 h-56 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white" />
    )
}

export default function Transfer() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { state, setState, socketRef, pcRef, dcRef, transferApprovedRef } = useTransfer()

    const [fileMeta, setFileMeta] = useState(state.fileMeta)
    const [fileObj, setFileObj] = useState(state.fileObj)
    // Multiple files support
    const [fileQueue, setFileQueue] = useState([]) // Array of {file, meta, status: 'pending'|'sending'|'completed'|'failed'}
    const [currentFileIndex, setCurrentFileIndex] = useState(-1)
    const [overallProgress, setOverallProgress] = useState(0)
    const [pendingFiles, setPendingFiles] = useState([]) // Receiver: files that sender will send (from transfer-request)
    const [link, setLink] = useState(state.link || '')
    const [status, setStatus] = useState('Idle')
    const [sendProgress, setSendProgress] = useState(0)
    const [receiveProgress, setReceiveProgress] = useState(0)
    const [receivedFile, setReceivedFile] = useState(null)
    const [receivedFiles, setReceivedFiles] = useState([]) // Array of received files
    const [encEnabled, setEncEnabled] = useState(false)
    const [encError, setEncError] = useState('')
    // Realtime stats
    const [sendStats, setSendStats] = useState({ bytes: 0, total: 0, speed: 0 })
    const [recvStats, setRecvStats] = useState({ bytes: 0, total: 0, speed: 0 })
    const sendStatsRef = useRef({ lastBytes: 0, lastTime: 0, speed: 0 })
    const recvStatsRef = useRef({ lastBytes: 0, lastTime: 0, speed: 0 })
    const [fatalError, setFatalError] = useState('')
    const [fatalStack, setFatalStack] = useState('')
    const [copied, setCopied] = useState(false)
    const [toast, setToast] = useState({ show: false, title: '', message: '' })

    const expectedRef = useRef(null)
    const buffersRef = useRef([])
    const roomIdRef = useRef(state.roomId || null)

    // Encryption state
    const keyStrRef = useRef(state.keyStr || null) // base64url key string
    const cryptoKeyRef = useRef(null) // CryptoKey for AES-GCM
    const useEncRef = useRef(false)
    const phaseRef = useRef('idle')
    const [waitingApproval, setWaitingApproval] = useState(false)
    const [approvalModal, setApprovalModal] = useState({ open: false, info: null })
    // Negotiation guards to avoid duplicate SDP application
    const remoteAnswerSetRef = useRef(false)
    const senderPeerJoinedHandledRef = useRef(false)
    const receiverOfferHandledRef = useRef(false)
    const offerInFlightRef = useRef(false)

    // Sending control state/refs
    const sendingRef = useRef(false)
    const pausedRef = useRef(false)
    const cancelRef = useRef(false)
    const offsetRef = useRef(0)
    const seqRef = useRef(0)
    const resumeResolversRef = useRef([])
    const [isSending, setIsSending] = useState(false)
    const [isPaused, setIsPaused] = useState(false)
    const [hasStartedSend, setHasStartedSend] = useState(false)
    // If receiver cancels, hide sender's send controls until a new file is picked
    const [peerCanceled, setPeerCanceled] = useState(false)

    // Receiver control state
    const [isReceiving, setIsReceiving] = useState(false)
    const [isPausedRx, setIsPausedRx] = useState(false)
    const [needsSaveLocation, setNeedsSaveLocation] = useState(false)
    const pendingMetaRef = useRef(null)
    // Track if receiver initiated a cancel to display correct status after acknowledgment
    const rxCancelInitiatedRef = useRef(false)
    const [hasStartedReceive, setHasStartedReceive] = useState(false)

    // Resumable transfer tracking
    const lastAckOffsetRef = useRef(0)
    const lastAckSentAtRef = useRef(0)
    const lastAckBytesRef = useRef(0)
    const lastDownloadedKeyRef = useRef(null)
    // Streaming receiver for large files
    const writerRef = useRef(null)
    const fileHandleRef = useRef(null)
    const isStreamingRef = useRef(false)
    const writtenRef = useRef(0)
    const manifestSaveAtRef = useRef(0)
    const [pathType, setPathType] = useState('') // "Direct" or "Relayed"

    // Password protection
    const [password, setPassword] = useState('')
    const [passwordEnabled, setPasswordEnabled] = useState(false)
    const [passwordHash, setPasswordHash] = useState('')
    const [showPasswordModal, setShowPasswordModal] = useState(false)
    const [passwordInput, setPasswordInput] = useState('')
    const [passwordError, setPasswordError] = useState('')
    const [showPasswordInput, setShowPasswordInput] = useState(false)

    const isSender = !id

    const publicHost = import.meta.env.VITE_PUBLIC_HOST || window.location.origin;
    // Unified API base for REST and Socket.IO; in dev, empty string uses Vite proxy
    const API_BASE = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '').trim()
    const socketBase = API_BASE || (import.meta.env.DEV ? undefined : undefined)
    const buildLink = (transferId) => `${publicHost}/transfer/${transferId}`
    const createId = () => Math.random().toString(36).slice(2, 10)

    // Simple SHA-256 hash for password
    const hashPassword = async (pwd) => {
        const encoder = new TextEncoder()
        const data = encoder.encode(pwd)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }

    // Helpers: base64url <-> bytes
    const bytesToBase64Url = (bytes) => {
        let binary = ''
        const len = bytes.byteLength
        const arr = new Uint8Array(bytes)
        for (let i = 0; i < len; i++) binary += String.fromCharCode(arr[i])
        const base64 = btoa(binary).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
        return base64
    }
    const base64UrlToBytes = (str) => {
        const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4)
        const binary = atob(base64)
        const len = binary.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
        return bytes.buffer
    }

    const importKey = async (keyStr) => {
        try {
            const wc = window.crypto
            if (!('isSecureContext' in window && window.isSecureContext) || !(wc && wc.subtle)) {
                setEncError('Encryption requires HTTPS or localhost. Falling back to unencrypted transfer.')
                useEncRef.current = false
                setEncEnabled(false)
                return
            }
            const raw = base64UrlToBytes(keyStr)
            const key = await wc.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
            cryptoKeyRef.current = key
            useEncRef.current = true
            setEncEnabled(true)
            setEncError('')
        } catch (e) {
            console.error('Failed to import key', e)
            setEncError('Invalid encryption key in link')
            useEncRef.current = false
            setEncEnabled(false)
        }
    }

    const ensureKeyForSender = async () => {
        // Generate a 32-byte random key and keep it until page refresh
        if (cryptoKeyRef.current) return
        const wc = window.crypto
        if (!('isSecureContext' in window && window.isSecureContext) || !(wc && wc.subtle)) {
            // No WebCrypto support in this context
            useEncRef.current = false
            setEncEnabled(false)
            return
        }
        const raw = wc.getRandomValues(new Uint8Array(32))
        const key = await wc.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
        cryptoKeyRef.current = key
        keyStrRef.current = bytesToBase64Url(raw)
        // persist keyStr in context
        setState(prev => ({ ...prev, keyStr: keyStrRef.current }))
        useEncRef.current = true
        setEncEnabled(true)
    }

    const encryptBytes = async (plainBuf, seqNum) => {
        const wc = window.crypto
        if (!useEncRef.current || !cryptoKeyRef.current || !(wc && wc.subtle)) return { frame: plainBuf, marker: 0 }
        const iv = wc.getRandomValues(new Uint8Array(12))
        const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKeyRef.current, plainBuf)
        // Frame format: [marker=2][seq(4 bytes BE)][iv(12)][ciphertext]
        const seq = new Uint8Array(4)
        new DataView(seq.buffer).setUint32(0, seqNum)
        const header = new Uint8Array(1 + 4 + 12)
        header[0] = 2
        header.set(seq, 1)
        header.set(iv, 5)
        const out = new Uint8Array(header.byteLength + ct.byteLength)
        out.set(header, 0)
        out.set(new Uint8Array(ct), header.byteLength)
        return { frame: out.buffer, marker: 2 }
    }

    const decryptFrame = async (buf) => {
        const view = new Uint8Array(buf)
        if (view.length < 1) return { plain: buf, enc: false }
        const marker = view[0]
        if (marker !== 2) return { plain: buf, enc: false }
        const seq = new DataView(view.buffer, 1, 4).getUint32(0)
        const iv = view.slice(5, 17)
        const ct = view.slice(17).buffer
        const wc = window.crypto
        const plain = await wc.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKeyRef.current, ct)
        return { plain, enc: true, seq }
    }

    const createPeer = () => {
        try {
            if (typeof window === 'undefined' || typeof window.RTCPeerConnection === 'undefined') {
                throw new Error('WebRTC not supported in this browser')
            }
        } catch (e) {
            setFatalError(e?.message || 'WebRTC not supported')
            throw e
        }
        const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
        const turnUrl = import.meta.env.VITE_TURN_URL
        const turnUser = import.meta.env.VITE_TURN_USERNAME
        const turnCred = import.meta.env.VITE_TURN_CREDENTIAL
        if (turnUrl && turnUser && turnCred) {
            iceServers.push({ urls: turnUrl, username: turnUser, credential: turnCred })
        }
        let pc
        try {
            pc = new RTCPeerConnection({ iceServers })
        } catch (e) {
            setFatalError(e?.message || 'Failed to create RTCPeerConnection')
            throw e
        }
        pc.onconnectionstatechange = () => {
            const st = pc.connectionState
            setStatus(st)
            // If sender loses connection during an active or approved session, try to re-offer
            if (!id && (st === 'disconnected' || st === 'failed')) {
                setStatus('Connection lost — retrying…')
                setTimeout(() => { try { ensureSenderOffer() } catch { } }, 500)
            }
            // Receiver will wait for a new offer automatically
        }
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socketRef.current?.emit('ice-candidate', { candidate: e.candidate, roomId: roomIdRef.current })
            }
        }
        pc.ondatachannel = (e) => {
            const ch = e.channel
            attachDataChannel(ch)
        }
        pcRef.current = pc
        return pc
    }

    const ensureSenderOffer = async (force = false) => {
        if (id) return
        try {
            const s = socketRef.current
            if (!s) return
            let pc = pcRef.current
            if (!pc) {
                pc = createPeer()
            }
            // Ensure data channel exists and attached
            if (!dcRef.current || dcRef.current.readyState === 'closed') {
                const ch = pc.createDataChannel('file')
                attachDataChannel(ch)
            }
            // Avoid duplicate offers
            if (!force) {
                if (offerInFlightRef.current) return
                if (pc.signalingState === 'have-local-offer') return
            }
            offerInFlightRef.current = true
            remoteAnswerSetRef.current = false
            phaseRef.current = 'sender:ensure-offer'
            // If not stable and forcing, try rollback to start a clean negotiation
            if (force && pc.signalingState !== 'stable') {
                try { await pc.setLocalDescription({ type: 'rollback' }) } catch { }
            }
            const offer = await pc.createOffer({ iceRestart: true })
            await pc.setLocalDescription(offer)
            phaseRef.current = 'sender:emit-offer'
            s.emit('offer', { roomId: roomIdRef.current, sdp: offer })
        } catch (e) {
            console.warn('ensureSenderOffer failed', e)
        } finally {
            offerInFlightRef.current = false
        }
    }

    const attachDataChannel = (ch) => {
        dcRef.current = ch
        ch.binaryType = 'arraybuffer'
        ch.onopen = () => {
            setStatus('Connected')
            // If receiver had partial data, request resume from offset
            if (id && expectedRef.current && expectedRef.current.received > 0) {
                try { ch.send(JSON.stringify({ type: 'resume-from', offset: expectedRef.current.received })) } catch { }
            }
        }
        ch.onclose = () => {
            setStatus('Disconnected')
            // Stop any ongoing transfer gracefully
            sendingRef.current = false
            pausedRef.current = false
            cancelRef.current = true
            setIsSending(false)
            setIsPaused(false)
            setHasStartedSend(false)
            // Reset receiver side states as well
            setIsReceiving(false)
            setIsPausedRx(false)
            setHasStartedReceive(false)
        }
        ch.onmessage = async (e) => {
            if (typeof e.data === 'string') {
                try {
                    const msg = JSON.parse(e.data)
                    if (msg.type === 'file-meta') {
                        expectedRef.current = { name: msg.name, size: msg.size, received: 0 }
                        pendingMetaRef.current = msg
                        setHasStartedReceive(false)
                        // try restore manifest
                        try {
                            const mraw = localStorage.getItem(`transfer:rx:${roomIdRef.current}`)
                            if (mraw) {
                                const man = JSON.parse(mraw)
                                if (man && man.name === msg.name && man.size === msg.size && Number.isFinite(man.written)) {
                                    expectedRef.current.received = Math.max(0, man.written)
                                    writtenRef.current = expectedRef.current.received
                                }
                            }
                        } catch { }
                        buffersRef.current = []
                        setReceiveProgress(0)
                        // Show save location button instead of auto-prompting
                        if ('showSaveFilePicker' in window && msg.size > 10 * 1024 * 1024) {
                            // For large files (>10MB), require save location
                            setNeedsSaveLocation(true)
                            setStatus('Choose save location to start receiving…')
                            // Tell sender to pause until we're ready
                            try {
                                dcRef.current?.send(JSON.stringify({ type: 'pause-req' }))
                            } catch { }
                        } else {
                            // For small files, start receiving immediately (in-memory)
                            setStatus('Receiving…')
                            setIsReceiving(true)
                            setIsPausedRx(false)
                            // Try resume if applicable
                            try {
                                if (expectedRef.current.received > 0 && dcRef.current?.readyState === 'open') {
                                    dcRef.current.send(JSON.stringify({ type: 'resume-from', offset: expectedRef.current.received }))
                                    setStatus('Resuming…')
                                }
                            } catch { }
                        }
                    } else if (msg.type === 'file-meta-enc') {
                        if (!cryptoKeyRef.current) {
                            setEncError('Missing encryption key')
                            return
                        }
                        // Decrypt meta
                        const iv = base64UrlToBytes(msg.iv)
                        const data = base64UrlToBytes(msg.data)
                        const wc = window.crypto
                        const plain = await wc.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, cryptoKeyRef.current, data)
                        const text = new TextDecoder().decode(plain)
                        const meta = JSON.parse(text)
                        expectedRef.current = { name: meta.name, size: meta.size, received: 0 }
                        pendingMetaRef.current = meta
                        setHasStartedReceive(false)
                        // restore manifest
                        try {
                            const mraw = localStorage.getItem(`transfer:rx:${roomIdRef.current}`)
                            if (mraw) {
                                const man = JSON.parse(mraw)
                                if (man && man.name === meta.name && man.size === meta.size && Number.isFinite(man.written)) {
                                    expectedRef.current.received = Math.max(0, man.written)
                                    writtenRef.current = expectedRef.current.received
                                }
                            }
                        } catch { }
                        buffersRef.current = []
                        setReceiveProgress(0)
                        // Show save location button for large encrypted files
                        if ('showSaveFilePicker' in window && meta.size > 10 * 1024 * 1024) {
                            setNeedsSaveLocation(true)
                            setStatus('Choose save location to start receiving (encrypted)…')
                            // Tell sender to pause until we're ready
                            try {
                                dcRef.current?.send(JSON.stringify({ type: 'pause-req' }))
                            } catch { }
                        } else {
                            setStatus('Receiving (encrypted)…')
                            setIsReceiving(true)
                            setIsPausedRx(false)
                            // Request resume if applicable
                            try {
                                if (expectedRef.current.received > 0 && dcRef.current?.readyState === 'open') {
                                    dcRef.current.send(JSON.stringify({ type: 'resume-from', offset: expectedRef.current.received }))
                                    setStatus('Resuming…')
                                }
                            } catch { }
                        }
                    } else if (msg.type === 'pause') {
                        setStatus('Paused by sender…')
                        setIsPausedRx(true)
                    } else if (msg.type === 'resume') {
                        setStatus('Resuming…')
                        setIsPausedRx(false)
                    } else if (msg.type === 'cancel') {
                        // Sender signaled cancel. If receiver initiated, show 'Canceled' instead.
                        if (id && rxCancelInitiatedRef.current) {
                            setStatus('Canceled')
                            rxCancelInitiatedRef.current = false
                        } else {
                            setStatus('Sender canceled the transfer')
                        }
                        expectedRef.current = null
                        buffersRef.current = []
                        setReceiveProgress(0)
                        setReceivedFile(null)
                        setIsReceiving(false)
                        setIsPausedRx(false)
                    } else if (msg.type === 'pause-req') {
                        // Receiver asked to pause, sender should handle by pausing and notifying
                        if (isSender) pauseSending()
                    } else if (msg.type === 'resume-req') {
                        if (isSender) resumeSending()
                    } else if (msg.type === 'cancel-req') {
                        if (isSender) {
                            // Receiver requested cancellation — stop sending and hide send controls (but keep link/QR and file info)
                            setSendProgress(0)
                            setHasStartedSend(false)
                            sendStatsRef.current = { lastBytes: 0, lastTime: 0, speed: 0 }
                            setSendStats({ bytes: 0, total: fileObj?.size || 0, speed: 0 })
                            try { cancelSending() } catch { }
                            setStatus('Receiver canceled the transfer')
                            // Only hide the send button/progress UI
                            setPeerCanceled(true)
                        }
                    } else if (msg.type === 'ack') {
                        // Sender-side: update last acknowledged offset
                        if (!id) {
                            lastAckOffsetRef.current = Math.max(lastAckOffsetRef.current, msg.offset || 0)
                        }
                    } else if (msg.type === 'resume-from') {
                        // Receiver requested resuming from an offset
                        if (!id) {
                            const off = Math.max(0, Math.min((fileObj?.size || 0), msg.offset || 0))
                            offsetRef.current = off
                            const CHUNK = 64 * 1024
                            seqRef.current = Math.floor(off / CHUNK)
                            // Don't auto-start - receiver is ready, but sender should click Send button
                        }
                    } else if (msg.type === 'file-complete') {
                        const blob = new Blob(buffersRef.current)
                        const receivedName = expectedRef.current?.name || 'file'
                        const receivedSize = expectedRef.current?.size || 0

                        if (isStreamingRef.current && writerRef.current) {
                            try { await writerRef.current.close() } catch { }
                            writerRef.current = null
                            isStreamingRef.current = false
                            try { localStorage.removeItem(`transfer:rx:${roomIdRef.current}`) } catch { }

                            // Add to received files list
                            const newFile = { name: receivedName, size: receivedSize, url: null }
                            setReceivedFiles(prev => [...prev, newFile])
                            setReceivedFile(newFile)
                        } else {
                            const url = URL.createObjectURL(blob)
                            const newFile = { name: receivedName, size: blob.size, url }

                            // Add to received files list
                            setReceivedFiles(prev => [...prev, newFile])
                            setReceivedFile(newFile)
                        }

                        expectedRef.current = null
                        buffersRef.current = []
                        setReceiveProgress(100)
                        setStatus('Transfer complete')
                        setIsReceiving(false)
                        setIsPausedRx(false)
                        setHasStartedReceive(false)

                        // Toast on receiver
                        try {
                            setToast({ show: true, title: 'Transfer complete', message: `${receivedName} received` })
                            setTimeout(() => setToast({ show: false, title: '', message: '' }), 3000)
                        } catch { }

                        // Reset progress for next file
                        setTimeout(() => {
                            setReceiveProgress(0)
                            setStatus('Waiting for next file...')
                        }, 1000)
                    }
                } catch { }
                return
            }
            if (expectedRef.current) {
                // Don't process chunks if waiting for save location
                if (needsSaveLocation) {
                    return // Ignore chunks until user picks save location
                }
                try {
                    let buf = e.data
                    if (buf instanceof Blob) {
                        buf = await buf.arrayBuffer()
                    }
                    if (useEncRef.current && cryptoKeyRef.current) {
                        const { plain, enc } = await decryptFrame(buf)
                        buf = enc ? plain : buf
                    }
                    if (!hasStartedReceive) setHasStartedReceive(true)
                    const chunkSize = buf.byteLength || (buf instanceof ArrayBuffer ? buf.byteLength : 0)
                    if (isStreamingRef.current && writerRef.current) {
                        try {
                            await writerRef.current.write(new Uint8Array(buf))
                            writtenRef.current += chunkSize
                            expectedRef.current.received = writtenRef.current
                            const now = Date.now()
                            if (now - (manifestSaveAtRef.current || 0) >= 1000) {
                                try { localStorage.setItem(`transfer:rx:${roomIdRef.current}`, JSON.stringify({ name: expectedRef.current.name, size: expectedRef.current.size, written: writtenRef.current, ts: now })) } catch { }
                                manifestSaveAtRef.current = now
                            }
                        } catch {
                            isStreamingRef.current = false
                            writerRef.current = null
                            buffersRef.current.push(buf)
                            expectedRef.current.received += chunkSize
                        }
                    } else {
                        buffersRef.current.push(buf)
                        expectedRef.current.received += chunkSize
                    }
                    const pct = Math.min(100, Math.floor((expectedRef.current.received / expectedRef.current.size) * 100))
                    setReceiveProgress(pct)
                    // Update receive stats
                    const now = Date.now()
                    const bytes = expectedRef.current.received
                    if (expectedRef.current.size) setRecvStats({ bytes, total: expectedRef.current.size, speed: recvStatsRef.current.speed })
                    {
                        const last = recvStatsRef.current.lastTime || 0
                        const elapsedMs = now - last
                        if (elapsedMs >= 1000) {
                            const delta = bytes - (recvStatsRef.current.lastBytes || 0)
                            recvStatsRef.current.speed = elapsedMs > 0 ? (delta / (elapsedMs / 1000)) : 0
                            recvStatsRef.current.lastBytes = bytes
                            recvStatsRef.current.lastTime = now
                            setRecvStats(s => ({ ...s, speed: recvStatsRef.current.speed }))
                        }
                    }
                    if (pct > 0 && pct < 100) setStatus('Receiving…')
                    if (!isReceiving) setIsReceiving(true)
                    // Throttled ACKs to enable resume after disruptions
                    const lastBytes = lastAckBytesRef.current || 0
                    if ((expectedRef.current.received - lastBytes) >= 256 * 1024 || (now - (lastAckSentAtRef.current || 0)) >= 500) {
                        try {
                            dcRef.current?.send(JSON.stringify({ type: 'ack', offset: expectedRef.current.received }))
                            lastAckBytesRef.current = expectedRef.current.received
                            lastAckSentAtRef.current = now
                        } catch { }
                    }
                } catch (err) {
                    console.error('Failed to process incoming chunk', err)
                }
            }
        }
    }

    useEffect(() => {
        // Ensure socket is created and room joined
        if (id) {
            ; (async () => {
                if (!socketRef.current) {
                    phaseRef.current = 'receiver:socket-connect'
                    const s = io(socketBase, { withCredentials: true })
                    socketRef.current = s
                }
                const s = socketRef.current
                const roomId = id

                // Check if room requires password (preflight)
                try {
                    const checkUrl = (API_BASE ? `${API_BASE}` : '') + `/api/transfer/${roomId}/check`
                    const resp = await fetch(checkUrl, { credentials: 'include' })
                    const data = await resp.json()

                    if (data.requiresPassword && !passwordHash) {
                        // Show password modal
                        setShowPasswordModal(true)
                        setStatus('Password required')
                        return
                    }
                } catch (err) {
                    console.warn('Failed to check room password:', err)
                }

                phaseRef.current = 'receiver:join-room'
                s.emit('join-room', { roomId, passwordHash: passwordHash || undefined })
                roomIdRef.current = roomId
                setState(prev => ({ ...prev, roomId }))
                const built = buildLink(id)
                setLink(built)
                setState(prev => ({ ...prev, link: built }))
                setStatus('Preparing connection…')

                // If a request was pending before refresh, auto re-send it
                try {
                    const pendingRaw = localStorage.getItem('transfer:pending')
                    const pending = pendingRaw ? JSON.parse(pendingRaw) : null
                    if (pending && pending.roomId === roomId && !receivedFile) {
                        setWaitingApproval(true)
                        const info = {
                            userAgent: navigator.userAgent,
                            platform: navigator.platform,
                            language: navigator.language,
                        }
                        socketRef.current?.emit('transfer-request', { roomId: roomIdRef.current, info, passwordHash: passwordHash || undefined })
                    }
                } catch { }

                // Parse key from hash, e.g. #k=...
                const hash = window.location.hash || ''
                const m = hash.match(/k=([^&]+)/)
                if (m && m[1]) {
                    keyStrRef.current = m[1]
                    setState(prev => ({ ...prev, keyStr: m[1] }))
                    importKey(m[1])
                } else {
                    setEncEnabled(false)
                }
            })()
        } else if (!id && fileMeta) {
            if (!socketRef.current) {
                try {
                    phaseRef.current = 'sender:socket-connect'
                    const s = io(socketBase, { withCredentials: true })
                    socketRef.current = s
                } catch (e) {
                    console.error('Sender socket connect failed:', e)
                    setFatalError(e?.message || 'Failed to connect')
                    return
                }
            }
            const s = socketRef.current
            // Room id
            roomIdRef.current = state.roomId || String(createId())
            setState(prev => ({ ...prev, roomId: roomIdRef.current }))
            try {
                localStorage.setItem('transfer:session', JSON.stringify({ roomId: roomIdRef.current, keyStr: state.keyStr || keyStrRef.current || null }))
            } catch { }
            phaseRef.current = 'sender:join-room'
            try {
                if (typeof s.emit !== 'function') throw new Error('socket.emit is not a function')
                s.emit('join-room', { roomId: roomIdRef.current, passwordHash: passwordHash || undefined })
            } catch (e) {
                console.error('emit join-room failed', e)
                setFatalError(e?.message || 'Failed during join-room emit')
                setFatalStack(e?.stack || '')
                return
            }
            // If an approval request was pending before refresh, restore the modal
            try {
                const pendingRaw = localStorage.getItem('transfer:approval')
                const pending = pendingRaw ? JSON.parse(pendingRaw) : null
                if (pending && pending.roomId === roomIdRef.current) {
                    setApprovalModal({ open: true, info: pending.info || null })
                    // We may have refreshed; proactively (re)create an offer
                    ensureSenderOffer()
                }
            } catch { }
            ; (async () => {
                try {
                    phaseRef.current = 'sender:ensure-key'
                    if (!state.keyStr) {
                        await ensureKeyForSender()
                    } else {
                        await importKey(state.keyStr)
                    }
                } catch (e) {
                    console.warn('ensure/import key failed:', e)
                }
                phaseRef.current = 'sender:build-link'
                const base = buildLink(roomIdRef.current)
                const full = (useEncRef.current && (keyStrRef.current || state.keyStr)) ? `${base}#k=${keyStrRef.current || state.keyStr}` : base
                setLink(full)
                setState(prev => ({ ...prev, link: full }))
                try { localStorage.setItem('transfer:session', JSON.stringify({ roomId: roomIdRef.current, keyStr: keyStrRef.current || state.keyStr || null })) } catch { }
            })()
            setStatus('Waiting for receiver to join...')
        }
    }, [id, fileMeta, passwordHash])

    // Attach socket event listeners for receiver
    useEffect(() => {
        if (!id) return
        const s = socketRef.current
        if (!s) return
        const onConnect = () => {
            try {
                if (roomIdRef.current) {
                    s.emit('join-room', { roomId: roomIdRef.current })
                }
                if (expectedRef.current && expectedRef.current.received > 0) {
                    setStatus('Reconnected — resuming…')
                } else if (waitingApproval) {
                    setStatus('Reconnected — waiting for sender approval…')
                    const info = { userAgent: navigator.userAgent, platform: navigator.platform, language: navigator.language }
                    s.emit('transfer-request', { roomId: roomIdRef.current, info })
                } else {
                    setStatus('Reconnected — waiting for sender…')
                }
            } catch { }
        }
        const onDisconnect = () => {
            setStatus('Network disconnected — retrying…')
        }
        const onPeerLeft = () => {
            // Sender left - notify user
            setStatus('Sender disconnected')
        }
        const onPeerJoined = () => { }
        const onOffer = async ({ from, sdp }) => {
            phaseRef.current = 'receiver:on-offer'
            const pc = pcRef.current || createPeer()
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp))
            } catch (err) {
                if (err?.name !== 'InvalidStateError') {
                    setFatalError(err?.message || 'Failed to set remote offer')
                }
                return
            }
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            s.emit('answer', { to: from, sdp: answer })
        }
        const onAnswer = async () => { }
        const onIce = async ({ from, candidate }) => {
            if (!pcRef.current) return
            if (from && from === s.id) return
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)) } catch { }
        }
        const onAccepted = () => {
            // Keep waitingApproval true until files start transferring
            setStatus('Approved by sender — waiting for files…')
            try { const p = localStorage.getItem('transfer:pending'); if (p) localStorage.removeItem('transfer:pending') } catch { }
        }
        const onDeclined = ({ reason }) => {
            setWaitingApproval(false)
            setFatalError(reason || 'Sender declined the transfer')
            try { const p = localStorage.getItem('transfer:pending'); if (p) localStorage.removeItem('transfer:pending') } catch { }
        }
        const onTransferError = ({ reason, requiresPassword }) => {
            if (requiresPassword) {
                setPasswordError(reason || 'Incorrect password')
                setShowPasswordModal(true)
                setPasswordInput('')
            } else {
                setFatalError(reason || 'Transfer error')
            }
            setWaitingApproval(false)
        }
        const onTransferCanceled = ({ by }) => {
            // Handle sender-canceled fallback (before DataChannel is open)
            if (by === 'sender' || !by) {
                setStatus('Sender canceled the transfer')
                expectedRef.current = null
                buffersRef.current = []
                setReceiveProgress(0)
                setReceivedFile(null)
                setIsReceiving(false)
                setIsPausedRx(false)
                setWaitingApproval(false)
            }
        }
        s.on('connect', onConnect)
        s.on('disconnect', onDisconnect)
        s.on('peer-left', onPeerLeft)
        s.on('peer-joined', onPeerJoined)
        s.on('offer', onOffer)
        s.on('answer', onAnswer)
        s.on('ice-candidate', onIce)
        s.on('transfer-accepted', onAccepted)
        s.on('transfer-declined', onDeclined)
        s.on('transfer-error', onTransferError)
        s.on('transfer-canceled', onTransferCanceled)
        return () => {
            s.off('connect', onConnect)
            s.off('disconnect', onDisconnect)
            s.off('peer-left', onPeerLeft)
            s.off('peer-joined', onPeerJoined)
            s.off('offer', onOffer)
            s.off('answer', onAnswer)
            s.off('ice-candidate', onIce)
            s.off('transfer-accepted', onAccepted)
            s.off('transfer-declined', onDeclined)
            s.off('transfer-error', onTransferError)
            s.off('transfer-canceled', onTransferCanceled)
        }
    }, [id, socketRef.current])

    // Attach socket event listeners for sender
    useEffect(() => {
        if (id) return
        const s = socketRef.current
        if (!s) return
        const onConnect = () => {
            try {
                if (roomIdRef.current) {
                    s.emit('join-room', { roomId: roomIdRef.current })
                }
                setStatus('Reconnected — checking link…')
                if (fileMeta) {
                    // If we have a file and were sending or approved, try to (re)offer
                    ensureSenderOffer()
                }
            } catch { }
        }
        const onDisconnect = () => {
            setStatus('Network disconnected — retrying…')
        }
        const onPeerLeft = () => {
            // Receiver left - reset negotiation flags so a new receiver can connect
            senderPeerJoinedHandledRef.current = 0  // Reset timestamp
            receiverOfferHandledRef.current = false
            remoteAnswerSetRef.current = false
            offerInFlightRef.current = false
            // Also reset approval - new receiver needs to request approval
            transferApprovedRef.current = false
            setApprovalModal({ open: false, info: null })
            setStatus('Receiver left — waiting for new connection…')
        }
        const onPeerJoined = () => {
            (async () => {
                phaseRef.current = 'sender:on-peer-joined'
                // Allow handling even if previously handled - new receiver needs new offer
                // Only block duplicate handling within same connection
                const now = Date.now()
                if (senderPeerJoinedHandledRef.current && (now - (senderPeerJoinedHandledRef.current || 0)) < 2000) return
                senderPeerJoinedHandledRef.current = now
                const pc = pcRef.current || createPeer()
                const ch = pc.createDataChannel('file')
                attachDataChannel(ch)
                phaseRef.current = 'sender:create-offer'
                const offer = await pc.createOffer()
                await pc.setLocalDescription(offer)
                phaseRef.current = 'sender:emit-offer'
                s.emit('offer', { roomId: roomIdRef.current, sdp: offer })
            })()
        }
        const onOffer = async () => { }
        const onAnswer = async ({ sdp }) => {
            // Allow forced re-offers to apply again
            try {
                await pcRef.current?.setRemoteDescription(new RTCSessionDescription(sdp))
                remoteAnswerSetRef.current = true
            } catch (err) {
                if (err?.name === 'InvalidStateError') {
                    // Already stable/answered; ignore
                    remoteAnswerSetRef.current = true
                    return
                }
                setFatalError(err?.message || 'Failed to set remote answer')
            }
        }
        const onIce = async ({ from, candidate }) => {
            if (!pcRef.current) return
            if (from && from === s.id) return
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)) } catch { }
        }
        const onTransferRequest = ({ from, info }) => {
            setApprovalModal({ open: true, info: info || null })
            try { localStorage.setItem('transfer:approval', JSON.stringify({ roomId: roomIdRef.current, info: info || null, ts: Date.now() })) } catch { }
            // Ensure we (re)create an offer after refresh or if negotiation was lost
            ensureSenderOffer()
        }
        s.on('connect', onConnect)
        s.on('disconnect', onDisconnect)
        s.on('peer-left', onPeerLeft)
        s.on('peer-joined', onPeerJoined)
        s.on('offer', onOffer)
        s.on('answer', onAnswer)
        s.on('ice-candidate', onIce)
        s.on('transfer-request', onTransferRequest)
        return () => {
            s.off('connect', onConnect)
            s.off('disconnect', onDisconnect)
            s.off('peer-left', onPeerLeft)
            s.off('peer-joined', onPeerJoined)
            s.off('offer', onOffer)
            s.off('answer', onAnswer)
            s.off('ice-candidate', onIce)
            s.off('transfer-request', onTransferRequest)
        }
    }, [id, socketRef.current])

    const onPickFile = (files) => {
        try {
            if (!files || !files.length) return

            // Support multiple files
            const fileList = Array.from(files)
            const queue = fileList.map(f => ({
                file: f,
                meta: { name: f.name, size: f.size },
                status: 'pending'
            }))

            setFileQueue(queue)
            setCurrentFileIndex(-1)

            // Set first file as current for backward compatibility
            const f = fileList[0]
            setFileObj(f)
            setFileMeta({ name: f.name, size: f.size })

            // Re-enable send controls after selecting new files
            setPeerCanceled(false)
            setState(prev => ({ ...prev, fileObj: f, fileMeta: { name: f.name, size: f.size } }))

            // Calculate overall progress
            setOverallProgress(0)

            // Persist for reload recovery (save first file for now)
            try {
                putFile('transfer:file', f)
                localStorage.setItem('transfer:meta', JSON.stringify({ name: f.name, size: f.size }))
            } catch { }
        } catch (e) {
            setFatalError(e?.message || 'Unexpected error while selecting file')
        }
    }

    const sendFile = async () => {
        try {
            const ch = dcRef.current
            if (!ch || ch.readyState !== 'open') {
                alert('Connection is not ready. Ask your friend to open the link and wait for Data channel open.')
                return
            }
            if (!fileObj) {
                alert('Pick a file first')
                return
            }
            // Persist progress reset in context if needed
            // Send meta (encrypted if enabled)
            const resumeStart = Math.max(offsetRef.current || 0, lastAckOffsetRef.current || 0)
            const firstStart = resumeStart === 0
            if (firstStart) {
                if (useEncRef.current && cryptoKeyRef.current) {
                    const metaPlain = new TextEncoder().encode(JSON.stringify({ name: fileObj.name, size: fileObj.size }))
                    const wc = window.crypto
                    const iv = wc.getRandomValues(new Uint8Array(12))
                    const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKeyRef.current, metaPlain)
                    ch.send(JSON.stringify({ type: 'file-meta-enc', iv: bytesToBase64Url(iv), data: bytesToBase64Url(ct) }))
                } else {
                    ch.send(JSON.stringify({ type: 'file-meta', name: fileObj.name, size: fileObj.size }))
                }
                offsetRef.current = 0
                seqRef.current = 0
            } else {
                // Resume from last acknowledged offset
                offsetRef.current = resumeStart
                const CHUNK = 64 * 1024
                seqRef.current = Math.floor(resumeStart / CHUNK)
            }
            const CHUNK = 64 * 1024
            if (!sendingRef.current) {
                // initialize controls only on first start
                // keep the current offsets as set above
            }
            setHasStartedSend(false)
            cancelRef.current = false
            pausedRef.current = false
            sendingRef.current = true
            setIsSending(true)
            setIsPaused(false)
            ch.bufferedAmountLowThreshold = 1_000_000
            while (offsetRef.current < fileObj.size) {
                if (cancelRef.current) break
                // Pause handling
                if (pausedRef.current) {
                    await new Promise(res => { resumeResolversRef.current.push(res) })
                    if (cancelRef.current) break
                }
                const slice = fileObj.slice(offsetRef.current, Math.min(offsetRef.current + CHUNK, fileObj.size))
                const buf = await slice.arrayBuffer()
                if (ch.bufferedAmount > ch.bufferedAmountLowThreshold) {
                    await new Promise(res => {
                        const onLow = () => { ch.removeEventListener('bufferedamountlow', onLow); res() }
                        ch.addEventListener('bufferedamountlow', onLow)
                    })
                }
                // Encrypt if enabled
                if (useEncRef.current && cryptoKeyRef.current) {
                    const { frame } = await encryptBytes(buf, seqRef.current++)
                    ch.send(frame)
                } else {
                    ch.send(buf)
                }
                if (!hasStartedSend) setHasStartedSend(true)
                offsetRef.current += CHUNK
                setSendProgress(Math.min(100, Math.floor((offsetRef.current / fileObj.size) * 100)))
                // Update send stats
                const now = Date.now()
                const bytes = offsetRef.current
                if (fileObj?.size) setSendStats({ bytes, total: fileObj.size, speed: sendStatsRef.current.speed })
                {
                    const last = sendStatsRef.current.lastTime || 0
                    const elapsedMs = now - last
                    if (elapsedMs >= 1000) {
                        const delta = bytes - (sendStatsRef.current.lastBytes || 0)
                        sendStatsRef.current.speed = elapsedMs > 0 ? (delta / (elapsedMs / 1000)) : 0
                        sendStatsRef.current.lastBytes = bytes
                        sendStatsRef.current.lastTime = now
                        setSendStats(s => ({ ...s, speed: sendStatsRef.current.speed }))
                    }
                }
            }
            if (!cancelRef.current) {
                ch.send(JSON.stringify({ type: 'file-complete' }))
                // Set progress to 100% on completion
                setSendProgress(100)
                setStatus('Transfer complete! ✓')
                // Toast on sender
                try {
                    setToast({ show: true, title: 'Transfer complete', message: `${fileObj?.name || 'File'} sent successfully` })
                    setTimeout(() => setToast({ show: false, title: '', message: '' }), 3000)
                } catch { }
            } else {
                // notify receiver cancellation
                try { ch.send(JSON.stringify({ type: 'cancel' })) } catch { }
            }
            sendingRef.current = false
            setIsSending(false)
            setHasStartedSend(false)
        } catch (e) {
            console.error('sendFile failed:', e)
            setFatalError(e?.message || 'Failed to send file')
        }
    }

    const pauseSending = () => {
        if (!sendingRef.current || pausedRef.current) return
        pausedRef.current = true
        setIsPaused(true)
        setStatus('Paused')
        try { dcRef.current?.send(JSON.stringify({ type: 'pause' })) } catch { }
    }

    const sendAllFiles = async () => {
        if (fileQueue.length === 0) {
            alert('No files selected')
            return
        }

        const ch = dcRef.current
        if (!ch || ch.readyState !== 'open') {
            alert('Connection is not ready. Ask your friend to open the link and wait for Data channel open.')
            return
        }

        try {
            let completedCount = 0
            const totalFiles = fileQueue.length

            for (let i = 0; i < fileQueue.length; i++) {
                if (cancelRef.current) break

                setCurrentFileIndex(i)
                const { file, meta } = fileQueue[i]

                // Update queue status
                setFileQueue(prev => prev.map((item, idx) =>
                    idx === i ? { ...item, status: 'sending' } : item
                ))

                // Set current file
                setFileObj(file)
                setFileMeta(meta)
                setStatus(`Sending file ${i + 1} of ${totalFiles}: ${meta.name}`)

                // Send this file
                await sendSingleFile(file, meta, ch)

                if (!cancelRef.current) {
                    completedCount++
                    // Update queue status
                    setFileQueue(prev => prev.map((item, idx) =>
                        idx === i ? { ...item, status: 'completed' } : item
                    ))

                    // Update overall progress
                    setOverallProgress(Math.floor((completedCount / totalFiles) * 100))
                }
            }

            if (!cancelRef.current && completedCount === totalFiles) {
                setStatus(`All files transferred! (${completedCount}/${totalFiles})`)
                setToast({ show: true, title: 'All files sent!', message: `${totalFiles} file(s) transferred successfully` })
                setTimeout(() => setToast({ show: false, title: '', message: '' }), 3000)
            }

            setCurrentFileIndex(-1)
        } catch (e) {
            console.error('sendAllFiles failed:', e)
            setFatalError(e?.message || 'Failed to send files')
        }
    }

    const sendSingleFile = async (file, meta, ch) => {
        // Reset offsets for this file
        offsetRef.current = 0
        seqRef.current = 0
        lastAckOffsetRef.current = 0
        sendStatsRef.current = { lastBytes: 0, lastTime: 0, speed: 0 }
        setSendProgress(0)

        // Send meta (encrypted if enabled)
        if (useEncRef.current && cryptoKeyRef.current) {
            const metaPlain = new TextEncoder().encode(JSON.stringify({ name: meta.name, size: meta.size }))
            const wc = window.crypto
            const iv = wc.getRandomValues(new Uint8Array(12))
            const ct = await wc.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKeyRef.current, metaPlain)
            ch.send(JSON.stringify({ type: 'file-meta-enc', iv: bytesToBase64Url(iv), data: bytesToBase64Url(ct) }))
        } else {
            ch.send(JSON.stringify({ type: 'file-meta', name: meta.name, size: meta.size }))
        }

        const CHUNK = 64 * 1024
        sendingRef.current = true
        setIsSending(true)
        setHasStartedSend(true)
        ch.bufferedAmountLowThreshold = 1_000_000

        while (offsetRef.current < file.size) {
            if (cancelRef.current) break

            // Pause handling
            if (pausedRef.current) {
                await new Promise(res => { resumeResolversRef.current.push(res) })
                if (cancelRef.current) break
            }

            const slice = file.slice(offsetRef.current, Math.min(offsetRef.current + CHUNK, file.size))
            const buf = await slice.arrayBuffer()

            if (ch.bufferedAmount > ch.bufferedAmountLowThreshold) {
                await new Promise(res => {
                    const onLow = () => { ch.removeEventListener('bufferedamountlow', onLow); res() }
                    ch.addEventListener('bufferedamountlow', onLow)
                })
            }

            // Encrypt if enabled
            if (useEncRef.current && cryptoKeyRef.current) {
                const { frame } = await encryptBytes(buf, seqRef.current++)
                ch.send(frame)
            } else {
                ch.send(buf)
            }

            offsetRef.current += CHUNK
            setSendProgress(Math.min(100, Math.floor((offsetRef.current / file.size) * 100)))

            // Update send stats
            const now = Date.now()
            const bytes = offsetRef.current
            if (file?.size) setSendStats({ bytes, total: file.size, speed: sendStatsRef.current.speed })
            {
                const last = sendStatsRef.current.lastTime || 0
                const elapsedMs = now - last
                if (elapsedMs >= 1000) {
                    const delta = bytes - (sendStatsRef.current.lastBytes || 0)
                    sendStatsRef.current.speed = elapsedMs > 0 ? (delta / (elapsedMs / 1000)) : 0
                    sendStatsRef.current.lastBytes = bytes
                    sendStatsRef.current.lastTime = now
                    setSendStats(s => ({ ...s, speed: sendStatsRef.current.speed }))
                }
            }
        }

        if (!cancelRef.current) {
            ch.send(JSON.stringify({ type: 'file-complete' }))
            setSendProgress(100)
            // Small delay between files
            await new Promise(resolve => setTimeout(resolve, 500))
        }

        sendingRef.current = false
        setIsSending(false)
        setHasStartedSend(false)
    }

    const resumeSending = () => {
        if (!sendingRef.current || !pausedRef.current) return
        pausedRef.current = false
        setIsPaused(false)
        setStatus('Resuming…')
        try { dcRef.current?.send(JSON.stringify({ type: 'resume' })) } catch { }
        const resolvers = resumeResolversRef.current.splice(0)
        resolvers.forEach(r => { try { r() } catch { } })
    }

    const cancelSending = () => {
        if (!sendingRef.current) return
        cancelRef.current = true
        pausedRef.current = false
        setIsPaused(false)
        setIsSending(false)
        setHasStartedSend(false)
        setSendProgress(0)
        sendStatsRef.current = { lastBytes: 0, lastTime: 0, speed: 0 }
        setSendStats({ bytes: 0, total: fileObj?.size || 0, speed: 0 })
        setStatus('Canceling…')
        try { dcRef.current?.send(JSON.stringify({ type: 'cancel' })) } catch { }
        // Fallback via Socket when DataChannel isn't open yet
        try { socketRef.current?.emit('transfer-canceled', { roomId: roomIdRef.current, by: 'sender' }) } catch { }
    }

    const chooseSaveLocation = async () => {
        if (!pendingMetaRef.current || !('showSaveFilePicker' in window)) return
        try {
            const meta = pendingMetaRef.current
            const handle = await window.showSaveFilePicker({ suggestedName: meta.name })
            const writable = await handle.createWritable()
            if (writtenRef.current > 0) {
                try { await writable.seek(writtenRef.current) } catch { }
            }
            writerRef.current = writable
            isStreamingRef.current = true
            fileHandleRef.current = handle
            setNeedsSaveLocation(false)
            setStatus('Receiving…')
            setIsReceiving(true)
            setIsPausedRx(false)
            setWaitingApproval(false)
            // Tell sender to resume now that we're ready
            try {
                dcRef.current?.send(JSON.stringify({ type: 'resume-req' }))
            } catch { }
            // Start receiving - send resume-from if we have partial progress
            try {
                if (expectedRef.current.received > 0 && dcRef.current?.readyState === 'open') {
                    dcRef.current.send(JSON.stringify({ type: 'resume-from', offset: expectedRef.current.received }))
                    setStatus('Resuming…')
                }
            } catch { }
        } catch (err) {
            // User canceled or error - fallback to in-memory
            console.warn('Save location canceled, falling back to in-memory:', err)
            isStreamingRef.current = false
            writerRef.current = null
            fileHandleRef.current = null
            setNeedsSaveLocation(false)
            setStatus('Receiving…')
            setIsReceiving(true)
            setIsPausedRx(false)
            setWaitingApproval(false)
            // Tell sender to resume
            try {
                dcRef.current?.send(JSON.stringify({ type: 'resume-req' }))
            } catch { }
            try {
                if (expectedRef.current.received > 0 && dcRef.current?.readyState === 'open') {
                    dcRef.current.send(JSON.stringify({ type: 'resume-from', offset: expectedRef.current.received }))
                    setStatus('Resuming…')
                }
            } catch { }
        }
    }

    const copy = async () => {
        if (!link) return
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(link)
            } else {
                // Fallback for older/insecure contexts
                const ta = document.createElement('textarea')
                ta.value = link
                ta.style.position = 'fixed'
                ta.style.top = '-1000px'
                document.body.appendChild(ta)
                ta.focus()
                ta.select()
                try { document.execCommand('copy') } catch { }
                document.body.removeChild(ta)
            }
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            // No-op; we could surface a toast here if needed
        }
    }

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, []);

    // Restore existing session state on mount (for sender side)
    useEffect(() => {
        (async () => {
            if (id) return
            if (state.fileMeta && state.link && state.roomId) {
                // Use context values for quick restore
                setFileMeta(state.fileMeta)
                setLink(state.link)
                roomIdRef.current = state.roomId
                if (state.keyStr) {
                    keyStrRef.current = state.keyStr
                    importKey(state.keyStr)
                }
                // If the heavy Blob wasn't preserved in context, rehydrate from IndexedDB
                if (state.fileObj) {
                    setFileObj(state.fileObj)
                    // Rebuild visible list for consistency when navigating back
                    try {
                        setFileQueue([{ file: state.fileObj, meta: state.fileMeta, status: 'pending' }])
                        setCurrentFileIndex(-1)
                        setOverallProgress(0)
                    } catch { }
                } else {
                    try {
                        const blob = await getFile('transfer:file')
                        if (blob) {
                            setFileObj(blob)
                            // also reflect into context for future navigations
                            setState(prev => ({ ...prev, fileObj: blob }))
                            // Rebuild visible list so the file appears under "Selected Files"
                            try {
                                setFileQueue([{ file: blob, meta: state.fileMeta, status: 'pending' }])
                                setCurrentFileIndex(-1)
                                setOverallProgress(0)
                            } catch { }
                        }
                    } catch { }
                }
                return
            }
            // Fallback to persisted storage for full refresh
            try {
                const metaRaw = localStorage.getItem('transfer:meta')
                const sessRaw = localStorage.getItem('transfer:session')
                const meta = metaRaw ? JSON.parse(metaRaw) : null
                const sess = sessRaw ? JSON.parse(sessRaw) : null
                const blob = await getFile('transfer:file')
                if (meta && blob && sess && sess.roomId) {
                    setFileMeta(meta)
                    setFileObj(blob)
                    setState(prev => ({ ...prev, fileMeta: meta, fileObj: blob }))
                    roomIdRef.current = sess.roomId
                    setState(prev => ({ ...prev, roomId: sess.roomId }))
                    // Rebuild the visible selected files list
                    try {
                        setFileQueue([{ file: blob, meta, status: 'pending' }])
                        setCurrentFileIndex(-1)
                        setOverallProgress(0)
                    } catch { }
                    if (sess.keyStr) {
                        keyStrRef.current = sess.keyStr
                        setState(prev => ({ ...prev, keyStr: sess.keyStr }))
                        await importKey(sess.keyStr)
                    }
                    const built = `${window.location.origin}/transfer/${sess.roomId}` + (sess.keyStr ? `#k=${sess.keyStr}` : '')
                    setLink(built)
                    setState(prev => ({ ...prev, link: built }))
                }
            } catch { }
        })()
    }, [id, state])

    // Global error capture to avoid white screen
    useEffect(() => {
        const onErr = (e) => {
            setFatalError(e?.message || 'Unexpected error')
            setFatalStack(e?.error?.stack || '')
        }
        const onRej = (e) => {
            const msg = e?.reason?.message || (typeof e?.reason === 'string' ? e.reason : '') || 'Unexpected error'
            setFatalError(msg)
            setFatalStack(e?.reason?.stack || '')
        }
        window.addEventListener('error', onErr)
        window.addEventListener('unhandledrejection', onRej)
        return () => {
            window.removeEventListener('error', onErr)
            window.removeEventListener('unhandledrejection', onRej)
        }
    }, [])

    // Auto-download on receiver when file completes
    useEffect(() => {
        if (!id) return // only receiver
        if (!receivedFile || !receivedFile.url) return
        const key = `${receivedFile.name || 'file'}::${receivedFile.url}`
        if (lastDownloadedKeyRef.current === key) return
        lastDownloadedKeyRef.current = key
        try {
            const a = document.createElement('a')
            a.href = receivedFile.url
            a.download = receivedFile.name || 'file'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            // Note: we intentionally do not revokeObjectURL here to keep the manual download link working as a fallback.
        } catch { }
    }, [id, receivedFile])

    // Connection path indicator (Direct vs Relayed)
    useEffect(() => {
        let t
        const poll = async () => {
            const pc = pcRef.current
            if (!pc) return
            try {
                const stats = await pc.getStats()
                let selectedPairId = null
                stats.forEach(report => {
                    if (report.type === 'transport' && report.selectedCandidatePairId) {
                        selectedPairId = report.selectedCandidatePairId
                    }
                })
                if (!selectedPairId) {
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.nominated) selectedPairId = report.id
                    })
                }
                if (selectedPairId) {
                    let pair = null
                    let local = null
                    let remote = null
                    stats.forEach(r => { if (r.type === 'candidate-pair' && r.id === selectedPairId) pair = r })
                    if (pair) {
                        stats.forEach(r => { if (r.id === pair.localCandidateId) local = r })
                        stats.forEach(r => { if (r.id === pair.remoteCandidateId) remote = r })
                        const localType = local?.candidateType
                        const remoteType = remote?.candidateType
                        if (localType === 'relay' || remoteType === 'relay') setPathType('Relayed')
                        else if (localType && remoteType) setPathType('Direct')
                    }
                }
            } catch { }
        }
        t = setInterval(poll, 4000)
        return () => { if (t) clearInterval(t) }
    }, [pcRef.current])

    return (
        <div className="min-h-screen bg-gradient-to-br from-zinc-50 via-zinc-100 to-zinc-200 dark:from-zinc-900 dark:via-brand-bg dark:to-zinc-950 text-zinc-900 dark:text-brand-text-primary font-sans antialiased transition-colors duration-300 relative">
            {/* Toast */}
            {toast.show && (
                <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                    <div className="pointer-events-auto px-4 py-3 rounded-xl shadow-xl border border-emerald-200/60 dark:border-emerald-800/50 bg-emerald-50/90 dark:bg-emerald-900/40 backdrop-blur-md animate-[toastIn_0.25s_ease-out]">
                        <div className="flex items-start gap-3">
                            <div className="mt-0.5 text-emerald-600 dark:text-emerald-300">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </div>
                            <div>
                                <div className="font-semibold text-emerald-800 dark:text-emerald-200">{toast.title}</div>
                                <div className="text-sm text-emerald-700/80 dark:text-emerald-300/80">{toast.message}</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
                <div className="absolute w-96 h-96 bg-gradient-to-br from-purple-400/30 to-pink-400/30 dark:from-purple-600/20 dark:to-pink-600/20 rounded-full blur-3xl" style={{ top: '-5%', right: '10%' }} />
                <div className="absolute w-[500px] h-[500px] bg-gradient-to-tr from-blue-400/20 to-purple-400/20 dark:from-blue-600/15 dark:to-purple-600/15 rounded-full blur-3xl" style={{ bottom: '-10%', left: '-5%' }} />
                <div className="absolute w-80 h-80 bg-gradient-to-br from-pink-300/25 to-orange-300/25 dark:from-pink-500/15 dark:to-orange-500/15 rounded-full blur-3xl" style={{ top: '40%', left: '50%', transform: 'translateX(-50%)' }} />
            </div>

            {!id && (
                <div className="relative">
                    <DashboardHeader onToggleTheme={() => {
                        const isDark = document.documentElement.classList.contains('dark');
                        document.documentElement.classList.toggle('dark', !isDark);
                        localStorage.setItem('theme', !isDark ? 'dark' : 'light');
                    }} />
                </div>
            )}

            {!id && (
                <div className="sticky top-[68px] z-20 flex justify-center py-3">
                    <div className="inline-flex items-center gap-1.5 p-1.5 bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl rounded-full border border-zinc-200/50 dark:border-brand-border/30 shadow-lg shadow-zinc-900/5 dark:shadow-zinc-950/30">
                        {/* Chat Tab */}
                        <button
                            onClick={() => navigate('/dashboard')}
                            className="group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="hidden sm:inline">Chat</span>
                            <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                Chat
                            </span>
                        </button>

                        {/* Transfer Tab */}
                        <button
                            className="group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                            <span className="hidden sm:inline">Transfer</span>
                            <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                Transfer
                            </span>
                        </button>

                        {/* Notes Tab */}
                        <button
                            onClick={() => navigate('/dashboard/notes')}
                            className="group relative flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm transition-all duration-200 bg-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <span className="hidden sm:inline">Notes</span>
                            <span className="sm:hidden absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-zinc-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                Notes
                            </span>
                        </button>
                    </div>
                </div>
            )}

            <main className={id ? "relative z-10 min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8" : "relative z-10 w-full max-w-6xl mx-auto pt-4 pb-8 px-4 sm:px-6 lg:px-8"}>
                <div className={id ? "w-full max-w-md" : "max-w-2xl mx-auto"}>
                    {fatalError && (
                        <div className="mb-6 p-4 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50/70 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
                            <div className="font-semibold mb-1">Something went wrong</div>
                            <div className="opacity-90">{fatalError}</div>
                            <div className="opacity-75 mt-1 text-xs">phase: {phaseRef.current}</div>
                            {fatalStack && (
                                <pre className="mt-2 overflow-auto text-xs opacity-70 whitespace-pre-wrap">{fatalStack}</pre>
                            )}
                        </div>
                    )}
                    {!id && (
                        <div className="mb-8">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl blur-lg opacity-40"></div>
                                    <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="17 8 12 3 7 8" />
                                            <line x1="12" y1="3" x2="12" y2="15" />
                                        </svg>
                                    </div>
                                </div>
                                <div>
                                    <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent">Direct Transfer</h1>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">Fast, secure & private peer-to-peer file sharing</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {id && (
                        <div className="text-center mb-6">
                            <div className="relative inline-block mb-4">
                                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-pink-500 rounded-3xl blur-xl opacity-50 animate-pulse"></div>
                                <div className="relative h-16 w-16 rounded-3xl bg-gradient-to-br from-purple-500 to-pink-500 text-white flex items-center justify-center shadow-2xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </div>
                            </div>
                            <h2 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent mb-2">Direct Transfer</h2>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">Secure peer-to-peer file sharing</p>
                        </div>
                    )}

                    <div className={id ? "bg-white/90 dark:bg-brand-surface/80 backdrop-blur-xl border border-zinc-200/60 dark:border-brand-border/40 rounded-2xl p-6 md:p-8 space-y-6 shadow-2xl shadow-zinc-900/10 dark:shadow-black/40" : "bg-white/70 dark:bg-brand-surface/70 backdrop-blur-xl border border-zinc-200/50 dark:border-brand-border/30 rounded-2xl p-6 space-y-6 shadow-xl shadow-zinc-900/5 dark:shadow-zinc-950/50"}>
                        {/* Sender approval modal */}
                        {approvalModal.open && !id && (
                            <div className="relative overflow-hidden p-4 sm:p-5 rounded-2xl border border-amber-200 dark:border-amber-800/50 bg-gradient-to-br from-amber-50/90 to-orange-50/90 dark:from-amber-900/20 dark:to-orange-900/20 backdrop-blur-sm shadow-lg">
                                <div className="flex flex-col sm:flex-row items-start gap-4">
                                    <div className="flex-shrink-0">
                                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                            </svg>
                                        </div>
                                    </div>
                                    <div className="flex-1 w-full min-w-0">
                                        <h3 className="font-bold text-base sm:text-lg text-amber-900 dark:text-amber-100 mb-3">Download Request</h3>
                                        <div className="space-y-2 text-sm text-amber-800 dark:text-amber-200/90">
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                                <span className="text-amber-600 dark:text-amber-400 font-medium sm:min-w-[70px]">Device:</span>
                                                <span className="font-medium break-words">{approvalModal.info?.platform || 'Unknown'}</span>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                                <span className="text-amber-600 dark:text-amber-400 font-medium sm:min-w-[70px]">Browser:</span>
                                                <span className="font-medium break-all text-xs sm:text-sm">{approvalModal.info?.userAgent || 'Unknown'}</span>
                                            </div>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                                <span className="text-amber-600 dark:text-amber-400 font-medium sm:min-w-[70px]">IP:</span>
                                                <span className="font-medium break-words">{approvalModal.info?.ip || 'Unknown'}</span>
                                            </div>
                                        </div>
                                        <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
                                            <button
                                                onClick={() => {
                                                    transferApprovedRef.current = true
                                                    setApprovalModal({ open: false, info: null })
                                                    try { localStorage.removeItem('transfer:approval') } catch { }
                                                    socketRef.current?.emit('transfer-accepted', { roomId: roomIdRef.current })
                                                    // Force a fresh offer on acceptance to avoid stale negotiations
                                                    ensureSenderOffer(true)
                                                    // Fallback: if channel not open within a few seconds, try again
                                                    setTimeout(() => {
                                                        try {
                                                            if (!dcRef.current || dcRef.current.readyState !== 'open') {
                                                                ensureSenderOffer(true)
                                                            }
                                                        } catch { }
                                                    }, 4000)
                                                    // Don't auto-start - let user click Send button
                                                }}
                                                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] text-center"
                                            >
                                                Accept Request
                                            </button>
                                            <button
                                                onClick={() => {
                                                    transferApprovedRef.current = false
                                                    setApprovalModal({ open: false, info: null })
                                                    try { localStorage.removeItem('transfer:approval') } catch { }
                                                    socketRef.current?.emit('transfer-declined', { roomId: roomIdRef.current, reason: 'Sender declined the request' })
                                                }}
                                                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-200 font-semibold transition-all duration-200 text-center"
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-purple-50/50 to-pink-50/50 dark:from-purple-900/10 dark:to-pink-900/10 border border-purple-100/50 dark:border-purple-800/30">
                            <div>
                                <div className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">Connection Status</div>
                                <div className="font-semibold text-zinc-900 dark:text-white">{status}</div>
                            </div>
                            <div className="flex items-center gap-2">
                                {pathType && (
                                    <span className={"inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full shadow-sm " + (pathType === 'Relayed' ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800/50" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50")}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${pathType === 'Relayed' ? 'bg-orange-500' : 'bg-emerald-500'} animate-pulse`}></div>
                                        {pathType}
                                    </span>
                                )}
                                {encEnabled && (
                                    <span title="End-to-end encrypted" className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                        Encrypted
                                    </span>
                                )}
                            </div>
                        </div>

                        {encError && (
                            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50/70 dark:bg-red-900/20 border border-red-200/50 dark:border-red-800/40 rounded-lg p-2">
                                {encError}
                            </div>
                        )}

                        {!id && (
                            <div className="space-y-5">
                                <div className="relative group">
                                    <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl blur opacity-0 group-hover:opacity-30 transition duration-300"></div>
                                    <div
                                        className="relative border-2 border-dashed border-zinc-300 dark:border-zinc-600 rounded-2xl p-10 text-center hover:border-purple-500 dark:hover:border-purple-400 hover:bg-purple-50/30 dark:hover:bg-purple-900/10 transition-all duration-300 cursor-pointer"
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => { e.preventDefault(); onPickFile(e.dataTransfer.files) }}
                                        onClick={() => document.getElementById('fileInput')?.click()}
                                    >
                                        <div className="mb-4">
                                            <div className="inline-flex p-4 bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 rounded-2xl">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                    <polyline points="17 8 12 3 7 8" />
                                                    <line x1="12" y1="3" x2="12" y2="15" />
                                                </svg>
                                            </div>
                                        </div>
                                        <p className="text-base font-medium text-zinc-900 dark:text-white mb-1">Drop files here or click to browse</p>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400">Support for multiple files</p>
                                        <input id="fileInput" type="file" multiple className="hidden" onChange={(e) => onPickFile(e.target.files)} />
                                    </div>
                                </div>

                                {fileQueue.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                                Selected Files ({fileQueue.length})
                                            </span>
                                            <button
                                                onClick={() => {
                                                    // Close all peer connections
                                                    if (pcRef.current) {
                                                        pcRef.current.close();
                                                        pcRef.current = null;
                                                    }
                                                    if (dcRef.current) {
                                                        dcRef.current.close();
                                                        dcRef.current = null;
                                                    }

                                                    // Clear file state
                                                    setFileQueue([]);
                                                    setFileMeta(null);
                                                    setFileObj(null);
                                                    setCurrentFileIndex(-1);
                                                    setOverallProgress(0);

                                                    // Clear link and QR
                                                    setLink('');

                                                    // Reset all transfer state
                                                    setState(prev => ({ ...prev, fileMeta: null, fileObj: null, link: '', roomId: null }));

                                                    // Clear password
                                                    setPassword('');
                                                    setPasswordEnabled(false);
                                                    setPasswordHash('');

                                                    // Clear room and generate new one
                                                    const newRoomId = createId();
                                                    roomIdRef.current = newRoomId;

                                                    // Clear progress and stats
                                                    setSendProgress(0);
                                                    setSendStats({ bytes: 0, total: 0, speed: 0 });
                                                    setIsSending(false);
                                                    setHasStartedSend(false);
                                                    setPeerCanceled(false);

                                                    // Reset refs
                                                    offsetRef.current = 0;
                                                    seqRef.current = 0;
                                                    lastAckOffsetRef.current = 0;
                                                    sendingRef.current = false;
                                                    pausedRef.current = false;
                                                    cancelRef.current = false;
                                                    transferApprovedRef.current = false;

                                                    // Clear approval modal
                                                    setApprovalModal({ open: false, info: null });

                                                    // Clear encryption
                                                    setEncEnabled(false);
                                                    keyStrRef.current = null;
                                                    cryptoKeyRef.current = null;
                                                    useEncRef.current = false;

                                                    // Reset status
                                                    setStatus('Idle');

                                                    // Clear local storage
                                                    try {
                                                        localStorage.removeItem('transfer:meta');
                                                        localStorage.removeItem('transfer:session');
                                                        localStorage.removeItem('transfer:link');
                                                        localStorage.removeItem('transfer:approval');
                                                        deleteFile('transfer:file');
                                                    } catch { }

                                                    // Notify user and refresh
                                                    setToast({ show: true, title: 'Cleared!', message: 'Refreshing page...' });
                                                    setTimeout(() => {
                                                        window.location.reload();
                                                    }, 500);
                                                }}
                                                className="text-sm text-red-500 hover:text-red-600 transition-colors"
                                            >
                                                Clear All
                                            </button>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto space-y-1.5">
                                            {fileQueue.map((item, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`p-2.5 rounded-lg backdrop-blur-md border flex items-center justify-between ${item.status === 'completed'
                                                        ? 'bg-green-50/60 dark:bg-green-900/20 border-green-200/50 dark:border-green-800/50'
                                                        : item.status === 'sending'
                                                            ? 'bg-blue-50/60 dark:bg-blue-900/20 border-blue-200/50 dark:border-blue-800/50'
                                                            : 'bg-white/60 dark:bg-zinc-800/60 border-zinc-200/50 dark:border-zinc-700/50'
                                                        }`}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-sm truncate">{item.meta.name}</div>
                                                        <div className="text-xs text-zinc-500">{(item.meta.size / 1024 / 1024).toFixed(2)} MB</div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {item.status === 'completed' && (
                                                            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                        {item.status === 'sending' && (
                                                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {fileMeta && link && (
                                    <div className="flex flex-col md:flex-row items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-purple-50/80 to-pink-50/80 dark:from-purple-950/30 dark:to-pink-950/30 backdrop-blur-lg border border-purple-200/50 dark:border-purple-800/30">
                                        <QR text={link} />
                                        <div className="text-sm flex-1 w-full">
                                            <div className="text-zinc-600 dark:text-zinc-400 mb-2 font-medium">Share this link</div>
                                            <div className="p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm border border-zinc-200/50 dark:border-zinc-700/50 flex items-center gap-2">
                                                <div className="font-mono text-xs break-all flex-1">
                                                    {link}
                                                </div>
                                                <button
                                                    onClick={copy}
                                                    title={copied ? 'Copied' : 'Copy link'}
                                                    aria-label="Copy link"
                                                    className="flex-shrink-0 p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                                >
                                                    {copied ? (
                                                        // Check icon
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
                                                            <polyline points="20 6 9 17 4 12"></polyline>
                                                        </svg>
                                                    ) : (
                                                        // Copy icon
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700 dark:text-zinc-200">
                                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Sender: password protection controls */}
                                {!id && fileMeta && (
                                    <div className="mt-4 p-3 rounded-lg bg-white/60 dark:bg-zinc-800/60 border border-zinc-200/50 dark:border-zinc-700/50">
                                        <div className="flex items-center gap-3">
                                            <label className="inline-flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={passwordEnabled}
                                                    onChange={async (e) => {
                                                        const enabled = e.target.checked
                                                        setPasswordEnabled(enabled)
                                                        if (!enabled) {
                                                            setPassword('')
                                                            setPasswordHash('')
                                                            try {
                                                                socketRef.current?.emit('set-room-password', { roomId: roomIdRef.current, passwordHash: null })
                                                            } catch { }
                                                        } else {
                                                            // show input for immediate entry
                                                            setShowPasswordInput(true)
                                                        }
                                                    }}
                                                    className="w-4 h-4 rounded border-zinc-300"
                                                />
                                                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Protect with password</span>
                                            </label>

                                            {passwordEnabled && (
                                                <div className="flex items-center gap-2 flex-1">
                                                    <div className="relative flex-1">
                                                        <input
                                                            type={showPasswordInput ? 'text' : 'password'}
                                                            value={password}
                                                            onChange={(e) => setPassword(e.target.value)}
                                                            placeholder="Enter password"
                                                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-sm focus:outline-none"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowPasswordInput(s => !s)}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
                                                            aria-label={showPasswordInput ? 'Hide password' : 'Show password'}
                                                        >
                                                            {showPasswordInput ? (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                                            ) : (
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                            )}
                                                        </button>
                                                    </div>

                                                    <button
                                                        onClick={async () => {
                                                            if (!password) return
                                                            try {
                                                                const hash = await hashPassword(password)
                                                                setPasswordHash(hash)
                                                                // inform server
                                                                socketRef.current?.emit('set-room-password', { roomId: roomIdRef.current, passwordHash: hash })
                                                                setToast({ show: true, title: 'Password set', message: 'Transfer is now password protected' })
                                                                setTimeout(() => setToast({ show: false, title: '', message: '' }), 2000)
                                                            } catch (e) { }
                                                        }}
                                                        disabled={!password}
                                                        className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm disabled:opacity-50"
                                                    >
                                                        Set
                                                    </button>

                                                    <button
                                                        onClick={() => {
                                                            setPassword('')
                                                            setPasswordHash('')
                                                            setPasswordEnabled(false)
                                                            try { socketRef.current?.emit('set-room-password', { roomId: roomIdRef.current, passwordHash: null }) } catch { }
                                                            setToast({ show: true, title: 'Password cleared', message: 'Transfer is no longer password protected' })
                                                            setTimeout(() => setToast({ show: false, title: '', message: '' }), 1600)
                                                        }}
                                                        className="px-3 py-2 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-sm"
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {sendProgress > 0 && !peerCanceled && (
                                    <>
                                        {sendProgress === 100 ? (
                                            // Success message when transfer is complete
                                            <div className="w-full p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-shrink-0">
                                                        <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="font-semibold text-green-900 dark:text-green-100">File transferred successfully!</p>
                                                        <p className="text-sm text-green-700 dark:text-green-300">{fileObj?.name} ({(sendStats.total / 1024 / 1024).toFixed(2)} MB)</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            // Progress bar and details during transfer
                                            <>
                                                <div className="flex justify-between text-xs mb-1 font-mono text-zinc-500 dark:text-zinc-400">
                                                    <span>{(sendStats.bytes / 1024 / 1024).toFixed(2)} MB / {(sendStats.total / 1024 / 1024).toFixed(2)} MB</span>
                                                    <span>{sendStats.speed > 0 ? `${(sendStats.speed / 1024 / 1024).toFixed(2)} MB/s` : ''}</span>
                                                </div>
                                                <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                                                    <div className="bg-gradient-to-r from-purple-500 to-pink-500 h-2" style={{ width: `${sendProgress}%` }} />
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}

                                {!peerCanceled && (
                                    !isSending ? (
                                        <button
                                            disabled={!fileObj || !dcRef.current || dcRef.current.readyState !== 'open' || !transferApprovedRef.current}
                                            onClick={fileQueue.length > 1 ? sendAllFiles : sendFile}
                                            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-50"
                                        >
                                            {(!dcRef.current || dcRef.current.readyState !== 'open') ? 'Waiting for receiver...' : (transferApprovedRef.current ? (fileQueue.length > 1 ? `Send ${fileQueue.length} Files` : 'Send File') : 'Waiting approval…')}
                                        </button>
                                    ) : (
                                        hasStartedSend && (
                                            <div className="flex gap-2">
                                                {!isPaused ? (
                                                    <button onClick={pauseSending} className="flex-1 py-3 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-semibold rounded-xl">Pause</button>
                                                ) : (
                                                    <button onClick={resumeSending} className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl">Resume</button>
                                                )}
                                                <button onClick={cancelSending} className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl">Cancel</button>
                                            </div>
                                        )
                                    )
                                )}
                            </div>
                        )}

                        {id && (
                            <div className="space-y-4">
                                <div className="text-sm text-zinc-600 dark:text-zinc-400">This page will connect to the sender automatically.</div>

                                {needsSaveLocation && (
                                    <button
                                        onClick={chooseSaveLocation}
                                        className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-semibold rounded-xl transition-all duration-200"
                                    >
                                        Choose Save Location ({expectedRef.current ? `${(expectedRef.current.size / 1024 / 1024).toFixed(2)} MB` : ''})
                                    </button>
                                )}

                                {receiveProgress > 0 && (
                                    <>
                                        {receiveProgress === 100 ? (
                                            // Success message when transfer is complete
                                            <div className="w-full p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-shrink-0">
                                                        <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="font-semibold text-green-900 dark:text-green-100">File received successfully!</p>
                                                        <p className="text-sm text-green-700 dark:text-green-300">{receivedFile?.name || 'File'} ({(recvStats.total / 1024 / 1024).toFixed(2)} MB)</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            // Progress bar and details during transfer
                                            <>
                                                {/* Show current file name being received */}
                                                {expectedRef.current && (
                                                    <div className="mb-2 p-2 rounded-lg bg-blue-50/60 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/50">
                                                        <div className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                                                            📥 Receiving: {expectedRef.current.name}
                                                        </div>
                                                        {receivedFiles.length > 0 && (
                                                            <div className="text-xs text-blue-700 dark:text-blue-300">
                                                                File {receivedFiles.length + 1}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex justify-between text-xs mb-1 font-mono text-zinc-500 dark:text-zinc-400">
                                                    <span>{(recvStats.bytes / 1024 / 1024).toFixed(2)} MB / {(recvStats.total / 1024 / 1024).toFixed(2)} MB</span>
                                                    <span>{recvStats.speed > 0 ? `${(recvStats.speed / 1024 / 1024).toFixed(2)} MB/s` : ''}</span>
                                                </div>
                                                <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
                                                    <div className="bg-green-500 h-2" style={{ width: `${receiveProgress}%` }} />
                                                </div>
                                            </>
                                        )}
                                    </>
                                )}

                                {/* Waiting for sender to start sending after approval */}
                                {waitingApproval && !isReceiving && receiveProgress === 0 && receivedFiles.length === 0 && !needsSaveLocation && (
                                    <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-950/30 dark:to-indigo-950/30 backdrop-blur-lg border border-blue-200/50 dark:border-blue-800/30">
                                        <div className="flex items-center gap-3">
                                            <div className="flex-shrink-0">
                                                <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-semibold text-blue-900 dark:text-blue-100">Waiting for sender...</p>
                                                <p className="text-sm text-blue-700 dark:text-blue-300">Sender will start the transfer shortly</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {receiveProgress === 0 && !receivedFile && !needsSaveLocation && !isReceiving && !waitingApproval && receivedFiles.length === 0 && (
                                    <button
                                        onClick={() => {
                                            try {
                                                setWaitingApproval(true)
                                                setStatus('Waiting for sender approval…')
                                                const info = {
                                                    userAgent: navigator.userAgent,
                                                    platform: navigator.platform,
                                                    language: navigator.language,
                                                }
                                                socketRef.current?.emit('transfer-request', { roomId: roomIdRef.current, info, passwordHash: passwordHash || undefined })
                                                try { localStorage.setItem('transfer:pending', JSON.stringify({ roomId: roomIdRef.current, ts: Date.now() })) } catch { }
                                            } catch (e) {
                                                setFatalError(e?.message || 'Failed to request transfer')
                                            }
                                        }}
                                        className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl transition-all duration-200 disabled:opacity-60"
                                        disabled={waitingApproval}
                                    >
                                        {waitingApproval ? 'Waiting for sender approval…' : 'Download'}
                                    </button>
                                )}
                                {isReceiving && !needsSaveLocation && !receivedFile && (
                                    <div className="flex gap-2">
                                        {!isPausedRx ? (
                                            <button
                                                onClick={() => { try { dcRef.current?.send(JSON.stringify({ type: 'pause-req' })); setIsPausedRx(true); setStatus('Pause requested…') } catch { } }}
                                                className="flex-1 py-3 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 font-semibold rounded-xl"
                                            >
                                                Pause
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => { try { dcRef.current?.send(JSON.stringify({ type: 'resume-req' })); setIsPausedRx(false); setStatus('Resume requested…') } catch { } }}
                                                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl"
                                            >
                                                Resume
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { try { rxCancelInitiatedRef.current = true; dcRef.current?.send(JSON.stringify({ type: 'cancel-req' })); setIsReceiving(false); setIsPausedRx(false); setStatus('Canceled') } catch { } }}
                                            className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                )}

                                {/* Display all received files */}
                                {receivedFiles.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                            Received Files ({receivedFiles.length})
                                        </div>
                                        <div className="max-h-60 overflow-y-auto space-y-2">
                                            {receivedFiles.map((file, idx) => (
                                                <div key={idx}>
                                                    {file.url ? (
                                                        <a
                                                            href={file.url}
                                                            download={file.name}
                                                            className="block p-3 rounded-xl bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:from-green-950/30 dark:to-emerald-950/30 backdrop-blur-lg border border-green-200/50 dark:border-green-800/30 text-green-700 dark:text-green-400 hover:shadow-lg transition-all duration-200"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                                    <polyline points="7 10 12 15 17 10" />
                                                                    <line x1="12" y1="15" x2="12" y2="3" />
                                                                </svg>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-semibold text-sm truncate">{file.name}</div>
                                                                    <div className="text-xs opacity-70">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                                                </div>
                                                            </div>
                                                        </a>
                                                    ) : (
                                                        <div className="p-3 rounded-xl bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:from-green-950/30 dark:to-emerald-950/30 backdrop-blur-lg border border-green-200/50 dark:border-green-800/30 text-green-700 dark:text-green-400">
                                                            <div className="flex items-center gap-3">
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-semibold text-sm truncate">{file.name}</div>
                                                                    <div className="text-xs opacity-70">Saved • {(file.size / 1024 / 1024).toFixed(2)} MB</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Password Modal for Receiver */}
            {showPasswordModal && id && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-sm bg-white dark:bg-brand-surface rounded-2xl p-6 shadow-2xl border border-zinc-200 dark:border-brand-border">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600 dark:text-purple-400">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">Password Required</h3>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">This transfer is password protected</p>
                            </div>
                        </div>

                        {passwordError && (
                            <div className="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 text-sm text-red-700 dark:text-red-300">
                                {passwordError}
                            </div>
                        )}

                        <div className="relative mb-4">
                            <input
                                type={showPasswordInput ? "text" : "password"}
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && passwordInput) {
                                        (async () => {
                                            const hash = await hashPassword(passwordInput)
                                            setPasswordHash(hash)
                                            setPasswordError('')
                                            setShowPasswordModal(false)
                                            try {
                                                const s = socketRef.current
                                                if (s && roomIdRef.current) {
                                                    s.emit('join-room', { roomId: roomIdRef.current, passwordHash: hash })
                                                    setStatus('Preparing connection…')
                                                }
                                            } catch { }
                                        })()
                                    }
                                }}
                                placeholder="Enter password"
                                className="w-full px-4 py-3 pr-12 text-sm rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={() => setShowPasswordInput(!showPasswordInput)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                                aria-label={showPasswordInput ? "Hide password" : "Show password"}
                            >
                                {showPasswordInput ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                        <line x1="1" y1="1" x2="23" y2="23"></line>
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                )}
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setShowPasswordModal(false)
                                    setPasswordError('')
                                    setPasswordInput('')
                                    navigate('/dashboard')
                                }}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-medium text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!passwordInput) return
                                    const hash = await hashPassword(passwordInput)
                                    setPasswordHash(hash)
                                    setPasswordError('')
                                    setShowPasswordModal(false)
                                    try {
                                        const s = socketRef.current
                                        if (s && roomIdRef.current) {
                                            s.emit('join-room', { roomId: roomIdRef.current, passwordHash: hash })
                                            setStatus('Preparing connection…')
                                        }
                                    } catch { }
                                }}
                                disabled={!passwordInput}
                                className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium text-sm transition-all disabled:opacity-50"
                            >
                                Unlock
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
