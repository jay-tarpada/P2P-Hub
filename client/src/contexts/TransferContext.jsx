import React from 'react'

const TransferContext = React.createContext(null)

export function TransferProvider({ children }) {
    const [state, setState] = React.useState({
        fileMeta: null,
        fileObj: null,
        link: '',
        roomId: null,
        keyStr: null,
    })
    // Persist long-lived refs across routes
    const socketRef = React.useRef(null)
    const pcRef = React.useRef(null)
    const dcRef = React.useRef(null)
    const transferApprovedRef = React.useRef(false)

    const value = React.useMemo(() => ({ state, setState, socketRef, pcRef, dcRef, transferApprovedRef }), [state])
    return <TransferContext.Provider value={value}>{children}</TransferContext.Provider>
}

export function useTransfer() {
    const ctx = React.useContext(TransferContext)
    if (!ctx) throw new Error('useTransfer must be used within a TransferProvider')
    return ctx
}
