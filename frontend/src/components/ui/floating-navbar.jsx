"use client";
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Link, useLocation } from 'react-router-dom'

export const FloatingNav = ({ navItems, className }) => {
    const location = useLocation();
    const [visible] = useState(true);

    return (
        <AnimatePresence mode="wait">
            <motion.div
                initial={{ opacity: 1, x: 0, scale: 1 }}
                animate={{ x: visible ? 0 : 0, opacity: visible ? 1 : 0, scale: 1 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className={cn(
                    "fixed top-10 left-1/2 -translate-x-1/2 max-w-fit rounded-full bg-neutral-950/75 backdrop-blur-sm border border-neutral-700/40 text-white shadow-lg z-[5000] px-4 py-2 flex items-center justify-center space-x-2",
                    className
                )}
            >
                <div className="relative flex items-center">
                    {/* Sliding background indicator */}
                    <motion.div
                        className="absolute inset-y-0 rounded-full bg-white/10 border border-white/20"
                        layoutId="activeNav"
                        initial={false}
                        animate={{
                            x: navItems?.findIndex(item => item.link === location.pathname) * 68,
                            width: '72px'
                        }}
                        transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30
                        }}
                    />
                    
                    {/* Navigation Links */}
                    {navItems?.map((navItem, idx) => (
                        <Link
                            key={`link=${idx}`}
                            to={navItem.link}
                            className={cn(
                                "relative z-10 items-center flex space-x-1 px-4 py-2 rounded-full transition-colors",
                                location.pathname === navItem.link ? "text-white" : "text-neutral-400 hover:text-neutral-200"
                            )}
                        >
                            <span className="block sm:hidden">{navItem.icon}</span>
                            <span className="hidden sm:block text-sm font-medium">{navItem.name}</span>
                        </Link>
                    ))}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
