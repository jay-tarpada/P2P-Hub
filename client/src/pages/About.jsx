import React from 'react'
import Header from '../components/Header'

export default function About() {
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
                    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="text-center mb-16">
                            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">We're building the future of private communication.</h1>
                            <p className="mt-6 max-w-3xl mx-auto text-lg text-zinc-600 dark:text-brand-text-secondary">P2P Hub was born from a simple idea: that everyone deserves a secure, private, and powerful way to collaborate without relying on centralized servers.</p>
                        </div>

                        <div className="relative bg-white dark:bg-brand-surface border-2 border-zinc-900 dark:border-zinc-500 rounded-2xl p-8 sm:p-12 shadow-3d-light dark:shadow-3d-dark card-3d">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold">Our Mission</h2>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">In a world where data privacy is increasingly scarce, our mission is to empower individuals and teams with tools that put them back in control. We leverage the power of peer-to-peer technology (WebRTC) to create direct, encrypted connections for all your collaborative needs.</p>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">This means your files, messages, and ideas are never stored on a server. They travel directly from your device to your peer's, ensuring unparalleled privacy and security.</p>
                                </div>
                                <div className="space-y-6">
                                    <h2 className="text-3xl font-bold">The Vision</h2>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">We envision a web where collaboration is decentralized, secure by default, and free from surveillance. P2P Hub is our first step towards this goal—a robust, user-friendly platform that demonstrates the potential of a serverless internet.</p>
                                    <ul className="space-y-3">
                                        <li className="flex items-center gap-3"><svg className="w-6 h-6 text-brand-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span className="font-medium">Radical Privacy</span></li>
                                        <li className="flex items-center gap-3"><svg className="w-6 h-6 text-brand-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span className="font-medium">User Empowerment</span></li>
                                        <li className="flex items-center gap-3"><svg className="w-6 h-6 text-brand-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><span className="font-medium">Open & Accessible Tech</span></li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <div className="py-24">
                            <div className="text-center mb-16">
                                <h2 className="text-4xl font-bold">Our Core Values</h2>
                                <p className="mt-4 max-w-2xl mx-auto text-lg text-zinc-600 dark:text-brand-text-secondary">The principles that guide our development and decisions.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
                                <div className="bg-white dark:bg-brand-surface border-2 border-zinc-900 dark:border-zinc-500 rounded-2xl p-8">
                                    <h3 className="text-2xl font-bold mb-2">Privacy First</h3>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">Your data is yours alone. We are committed to building software that respects your privacy at every level.</p>
                                </div>
                                <div className="bg-white dark:bg-brand-surface border-2 border-zinc-900 dark:border-zinc-500 rounded-2xl p-8">
                                    <h3 className="text-2xl font-bold mb-2">Simplicity</h3>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">Powerful technology should be easy to use. We focus on intuitive design and a seamless user experience.</p>
                                </div>
                                <div className="bg-white dark:bg-brand-surface border-2 border-zinc-900 dark:border-zinc-500 rounded-2xl p-8">
                                    <h3 className="text-2xl font-bold mb-2">Transparency</h3>
                                    <p className="text-zinc-600 dark:text-brand-text-secondary">We believe in open development and clear communication about how our technology works.</p>
                                </div>
                            </div>
                        </div>

                        <div className="py-12">
                            <div className="text-center mb-16">
                                <h2 className="text-4xl font-bold">Meet the Team</h2>
                                <p className="mt-4 max-w-2xl mx-auto text-lg text-zinc-600 dark:text-brand-text-secondary">The minds behind the mission.</p>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                                <div className="text-center">
                                    <img className="w-32 h-32 rounded-full mx-auto mb-4 border-4 border-white dark:border-brand-surface object-cover" src="https://placehold.co/200x200/E2E8F0/4A5568?text=JT" alt="Team member photo" />
                                    <h3 className="text-xl font-bold">Jay Tarpada</h3>
                                    <p className="text-brand-accent-purple font-medium">Founder & Lead Developer</p>
                                </div>
                                <div className="text-center">
                                    <img className="w-32 h-32 rounded-full mx-auto mb-4 border-4 border-white dark:border-brand-surface object-cover" src="https://placehold.co/200x200/E2E8F0/4A5568?text=BM" alt="Team member photo" />
                                    <h3 className="text-xl font-bold">Jay Tarpada</h3>
                                    <p className="text-brand-accent-purple font-medium">UX/UI Designer</p>
                                </div>
                                <div className="text-center">
                                    <img className="w-32 h-32 rounded-full mx-auto mb-4 border-4 border-white dark:border-brand-surface object-cover" src="https://placehold.co/200x200/E2E8F0/4A5568?text=CJ" alt="Team member photo" />
                                    <h3 className="text-xl font-bold">Jay Tarpada</h3>
                                    <p className="text-brand-accent-purple font-medium">WebRTC Specialist</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
