import React from 'react'
import Header from './Header'

export default function LandingPage() {
    return (
        <div className="bg-white dark:bg-brand-bg text-zinc-900 dark:text-brand-text-primary font-sans antialiased">
            {/* Tailwind loaded from index.html - no script tags inside JSX */}

            <div className="fixed top-0 left-0 w-full h-full overflow-hidden">
                <div className="bg-shapes">
                    <div className="bg-brand-accent-purple" style={{ width: 500, height: 500, top: '-20%', left: '-10%', position: 'absolute', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.25, zIndex: -1 }} />
                    <div className="bg-brand-accent-blue" style={{ width: 600, height: 600, top: '50%', left: '20%', position: 'absolute', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.25, zIndex: -1 }} />
                    <div className="bg-brand-accent-pink" style={{ width: 550, height: 550, top: '10%', right: '-15%', position: 'absolute', borderRadius: '50%', filter: 'blur(150px)', opacity: 0.25, zIndex: -1 }} />
                </div>
            </div>

            <div className="relative">
                <Header />

                <main className="pt-40 pb-20 text-center">
                    <div className="max-w-4xl mx-auto px-4">
                        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-black to-zinc-600 dark:from-white dark:to-gray-400">Your Private Space for Real-time Collaboration.</h1>
                        <p className="mt-6 max-w-2xl mx-auto text-lg md:text-xl text-zinc-600 dark:text-brand-text-secondary">Share files, sketch ideas on a whiteboard, take notes, and chat instantly with anyone, anywhere—all through a secure, direct peer-to-peer connection. No servers, no clouds, just pure privacy.</p>
                        <div className="mt-10 flex justify-center items-center gap-4">
                            <a href="#" className="font-bold text-base bg-gradient-to-r from-brand-accent-purple to-brand-accent-pink text-white px-8 py-3.5 rounded-xl transition-transform hover:scale-105">Get Started for Free</a>
                            <a href="#features" className="font-medium text-base bg-zinc-100 dark:bg-brand-surface border border-zinc-300 dark:border-brand-border/50 text-zinc-900 dark:text-white px-8 py-3.5 rounded-xl transition-colors hover:border-zinc-400 dark:hover:border-brand-text-primary">Learn More</a>
                        </div>
                    </div>
                </main>

                <section id="features" className="py-20">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <h2 className="text-4xl font-bold">Everything You Need to Collaborate</h2>
                            <p className="mt-4 text-lg text-zinc-600 dark:text-brand-text-secondary">All the tools for seamless peer-to-peer teamwork.</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            {/* four feature cards - omitted inner svg content for brevity but preserved visually */}
                            <div className="feature-card p-8 rounded-2xl bg-gradient-to-br from-white to-zinc-50 dark:from-[rgba(39,39,42,0.5)] dark:to-[rgba(39,39,42,0.2)] border-zinc-200 dark:border-brand-border hover:border-brand-accent-purple">
                                <div className="w-12 h-12 mb-4 bg-brand-accent-blue/20 flex items-center justify-center rounded-xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-accent-blue"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                </div>
                                <h3 className="font-bold text-lg mb-2">Secure File Transfer</h3>
                                <p className="text-sm text-zinc-600 dark:text-brand-text-secondary">Send and receive files of any size directly to your peers with end-to-end encryption. Fast, private, and unlimited.</p>
                            </div>
                            <div className="feature-card p-8 rounded-2xl bg-gradient-to-br from-white to-zinc-50 dark:from-[rgba(39,39,42,0.5)] dark:to-[rgba(39,39,42,0.2)] border-zinc-200 dark:border-brand-border hover:border-brand-accent-purple">
                                <div className="w-12 h-12 mb-4 bg-brand-accent-pink/20 flex items-center justify-center rounded-xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-accent-pink"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /><path d="M2 12h20" /><path d="M21.3 2.7a2.8 2.8 0 0 1 4 4L12 20l-4-4Z" /></svg>
                                </div>
                                <h3 className="font-bold text-lg mb-2">Shared Whiteboard</h3>
                                <p className="text-sm text-zinc-600 dark:text-brand-text-secondary">Brainstorm and visualize ideas together in real-time on a collaborative canvas. Perfect for sketching flows and designs.</p>
                            </div>
                            <div className="feature-card p-8 rounded-2xl bg-gradient-to-br from-white to-zinc-50 dark:from-[rgba(39,39,42,0.5)] dark:to-[rgba(39,39,42,0.2)] border-zinc-200 dark:border-brand-border hover:border-brand-accent-purple">
                                <div className="w-12 h-12 mb-4 bg-brand-accent-purple/20 flex items-center justify-center rounded-xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-accent-purple"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                                </div>
                                <h3 className="font-bold text-lg mb-2">Live Shared Notes</h3>
                                <p className="text-sm text-zinc-600 dark:text-brand-text-secondary">Take meeting minutes, create to-do lists, or draft content together. All changes are synced instantly between peers.</p>
                            </div>
                            <div className="feature-card p-8 rounded-2xl bg-gradient-to-br from-white to-zinc-50 dark:from-[rgba(39,39,42,0.5)] dark:to-[rgba(39,39,42,0.2)] border-zinc-200 dark:border-brand-border hover:border-brand-accent-purple">
                                <div className="w-12 h-12 mb-4 bg-green-500/20 flex items-center justify-center rounded-xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" /></svg>
                                </div>
                                <h3 className="font-bold text-lg mb-2">Encrypted Chat</h3>
                                <p className="text-sm text-zinc-600 dark:text-brand-text-secondary">Communicate securely with instant messaging. Your conversations are private and never pass through a central server.</p>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="how-it-works" className="py-20">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-12">
                            <h2 className="text-4xl font-bold">Get Started in Seconds</h2>
                            <p className="mt-4 text-lg text-zinc-600 dark:text-brand-text-secondary">Connect and collaborate in three simple steps.</p>
                        </div>
                        <div className="relative">
                            <div className="hidden lg:block absolute top-1/2 left-0 w-full h-px -translate-y-1/2">
                                <svg width="100%" height="2"><line x1="0" y1="1" x2="100%" y2="1" strokeWidth="2" strokeDasharray="8 8" className="stroke-zinc-300 dark:stroke-brand-border" /></svg>
                            </div>
                            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-12">
                                <div className="text-center">
                                    <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center bg-zinc-100 dark:bg-brand-surface border-2 border-brand-accent-purple rounded-full text-2xl font-bold">1</div>
                                    <h3 className="font-bold text-xl mb-2">Create Your Account</h3>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">Sign up for a free account to get your unique Peer ID.</p>
                                </div>
                                <div className="text-center">
                                    <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center bg-zinc-100 dark:bg-brand-surface border-2 border-brand-accent-purple rounded-full text-2xl font-bold">2</div>
                                    <h3 className="font-bold text-xl mb-2">Connect with a Peer</h3>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">Share your Link or Open a friend's Link to establish a secure connection.</p>
                                </div>
                                <div className="text-center">
                                    <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center bg-zinc-100 dark:bg-brand-surface border-2 border-brand-accent-purple rounded-full text-2xl font-bold">3</div>
                                    <h3 className="font-bold text-xl mb-2">Start Collaborating</h3>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">That's it! Chat, share files, and create ideas in your private session.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="py-20">
                    <div className="max-w-4xl mx-auto px-4 text-center">
                        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">Ready to Take Back Your Privacy?</h2>
                        <p className="mt-6 max-w-2xl mx-auto text-lg text-zinc-600 dark:text-brand-text-secondary">Join P2P Hub today and experience a new era of secure, serverless collaboration. It's free to get started.</p>
                        <div className="mt-10">
                            <a href="#" className="font-bold text-base bg-gradient-to-r from-brand-accent-purple to-brand-accent-pink text-white px-10 py-4 rounded-xl transition-transform hover:scale-105 inline-block">Sign Up Now</a>
                        </div>
                    </div>
                </section>

                <footer className="border-t border-zinc-200/50 dark:border-brand-border/50">
                    <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-center">
                        <p className="text-zinc-600 dark:text-brand-text-secondary">© 2025 P2P Hub. All Rights Reserved.</p>
                    </div>
                </footer>
            </div>
        </div>
    )
}
