// Minimal IndexedDB helper for persisting the transfer file Blob

const DB_NAME = 'transfer-db'
const STORE = 'files'

function openDB() {
    return new Promise((resolve, reject) => {
        // Open without specifying a version to avoid "requested version < existing version" errors
        const req = indexedDB.open(DB_NAME)
        req.onupgradeneeded = () => {
            // Fresh DB creation path
            const db = req.result
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE)
            }
        }
        req.onsuccess = () => {
            const db = req.result
            // If the store somehow doesn't exist on an existing DB, upgrade to add it
            if (!db.objectStoreNames.contains(STORE)) {
                const newVersion = (db.version || 1) + 1
                db.close()
                const req2 = indexedDB.open(DB_NAME, newVersion)
                req2.onupgradeneeded = () => {
                    const db2 = req2.result
                    if (!db2.objectStoreNames.contains(STORE)) {
                        db2.createObjectStore(STORE)
                    }
                }
                req2.onsuccess = () => resolve(req2.result)
                req2.onerror = () => reject(req2.error)
                req2.onblocked = () => {
                    // Another tab might be holding the DB open; advise user to close other tabs if needed
                    console.warn('IndexedDB upgrade is blocked. Close other tabs using this site to continue.')
                }
                return
            }
            resolve(db)
        }
        req.onerror = () => reject(req.error)
        req.onblocked = () => {
            console.warn('IndexedDB open is blocked. Close other tabs using this site to continue.')
        }
    })
}

export async function putFile(key, blob) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        store.put(blob, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

export async function getFile(key) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const store = tx.objectStore(STORE)
        const req = store.get(key)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
    })
}

export async function deleteFile(key) {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const req = store.delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
    })
}

export async function clearStore() {
    const db = await openDB()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const req = store.clear()
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
    })
}
