import React from 'react'
import Header from '../components/Header'

export default function Contact() {
    return (
        <div className="bg-white dark:bg-brand-bg text-zinc-900 dark:text-brand-text-primary font-sans antialiased">
            <div className="fixed top-0 left-0 w-full h-full overflow-hidden">
                <div className="bg-shapes">
                    <div className="bg-brand-accent-purple" style={{ width: 500, height: 500, top: '-20%', left: '-10%', position: 'absolute', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.25, zIndex: -1 }} />
                    <div className="bg-brand-accent-blue" style={{ width: 600, height: 600, top: '50%', left: '20%', position: 'absolute', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.25, zIndex: -1 }} />
                    <div className="bg-brand-accent-pink" style={{ width: 550, height: 550, top: '10%', right: '-15%', position: 'absolute', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.25, zIndex: -1 }} />
                </div>
            </div>

            <div className="relative">
                <Header />
                <main className="pt-40 py-20">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">Get in Touch</h1>
                            <p className="mt-6 max-w-2xl mx-auto text-lg text-zinc-600 dark:text-brand-text-secondary">Have a question, feedback, or a partnership idea? We'd love to hear from you.</p>
                        </div>

                        <div className="bg-white dark:bg-brand-surface border-2 border-zinc-900 dark:border-zinc-500 rounded-2xl p-8 sm:p-12 mb-24">
                            <form action="#" method="POST" className="space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div>
                                        <label htmlFor="first-name" className="block text-sm font-medium mb-2">First Name</label>
                                        <input type="text" name="first-name" id="first-name" required className="form-input block w-full bg-zinc-100 dark:bg-brand-bg border-2 border-zinc-900 dark:border-zinc-500 rounded-lg p-3 focus:outline-none" />
                                    </div>
                                    <div>
                                        <label htmlFor="last-name" className="block text-sm font-medium mb-2">Last Name</label>
                                        <input type="text" name="last-name" id="last-name" required className="form-input block w-full bg-zinc-100 dark:bg-brand-bg border-2 border-zinc-900 dark:border-zinc-500 rounded-lg p-3 focus:outline-none" />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium mb-2">Email Address</label>
                                    <input type="email" name="email" id="email" required className="form-input block w-full bg-zinc-100 dark:bg-brand-bg border-2 border-zinc-900 dark:border-zinc-500 rounded-lg p-3 focus:outline-none" />
                                </div>
                                <div>
                                    <label htmlFor="message" className="block text-sm font-medium mb-2">Message</label>
                                    <textarea name="message" id="message" rows="6" required className="form-input block w-full bg-zinc-100 dark:bg-brand-bg border-2 border-zinc-900 dark:border-zinc-500 rounded-lg p-3 focus:outline-none" />
                                </div>
                                <div>
                                    <button type="submit" className="w-full font-bold bg-zinc-900 dark:bg-white text-white dark:text-black px-8 py-4 rounded-xl transition-transform hover:scale-[1.02] active:scale-95">Send Message</button>
                                </div>
                            </form>
                        </div>

                        <div className="py-12">
                            <div className="text-center mb-16">
                                <h2 className="text-4xl font-bold">Frequently Asked Questions</h2>
                                <p className="mt-4 max-w-2xl mx-auto text-lg text-zinc-600 dark:text-brand-text-secondary">Quick answers to common questions.</p>
                            </div>
                            <div className="space-y-4 max-w-2xl mx-auto">
                                <details className="p-6 bg-white dark:bg-brand-surface border-2 border-zinc-900 dark:border-zinc-500 rounded-xl">
                                    <summary className="font-bold text-lg cursor-pointer">Is P2P Hub really secure?</summary>
                                    <p className="mt-4 text-zinc-600 dark:text-brand-text-secondary">Yes. We use WebRTC to establish a direct, end-to-end encrypted connection between you and your peer. Your data is never stored on our servers, ensuring maximum privacy.</p>
                                </details>
                                <details className="p-6 bg-white dark:bg-brand-surface border-2 border-zinc-900 dark:border-zinc-500 rounded-xl">
                                    <summary className="font-bold text-lg cursor-pointer">Do I need to install any software?</summary>
                                    <p className="mt-4 text-zinc-600 dark:text-brand-text-secondary">No. P2P Hub is a fully web-based application. All you need is a modern web browser like Chrome, Firefox, or Safari to get started.</p>
                                </details>
                                <details className="p-6 bg-white dark:bg-brand-surface border-2 border-zinc-900 dark:border-zinc-500 rounded-xl">
                                    <summary className="font-bold text-lg cursor-pointer">Is the service completely free?</summary>
                                    <p className="mt-4 text-zinc-600 dark:text-brand-text-secondary">Yes, the core features of P2P Hub are completely free to use. We may introduce premium features for power users in the future, but our commitment to free, private communication will remain.</p>
                                </details>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="border-t border-zinc-200/50 dark:border-brand-border/50 mt-20">
                    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center">
                        <p className="text-zinc-600 dark:text-brand-text-secondary">© 2025 P2P Hub. All Rights Reserved.</p>
                    </div>
                </footer>
            </div>
        </div>
    )
}
