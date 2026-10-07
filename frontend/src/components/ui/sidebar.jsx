"use client";;
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import React, { useState, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useSelector } from "react-redux";
import { selectCurrentUser } from "@/features/auth/authSlice";
import { assetUrl } from "@/services/config";

const SidebarContext = createContext(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props) => {
  // Check if we're on mobile to conditionally render
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint is 768px
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <>
      {!isMobile && <DesktopSidebar {...props} />}
      {isMobile && <MobileSidebar {...props} />}
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={cn(
        // Force hide on mobile with !important, show only on desktop
        "!hidden md:!flex md:flex-col",
        "h-full px-4 py-4 bg-neutral-100 dark:bg-neutral-900 w-[300px] flex-shrink-0 border-r border-neutral-700",
        className
      )}
      animate={{
        width: animate ? (open ? "300px" : "80px") : "300px",
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}>
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
}) => {
  const { open, setOpen } = useSidebar();
  return (
    <>
      {/* Task 4.3: Mobile-optimized hamburger menu - top right corner, larger touch target */}
      <button
        onClick={() => setOpen(!open)}
        aria-label={open ? "Close menu" : "Open menu"}
        className="fixed top-4 right-4 z-50 md:hidden bg-neutral-800 dark:bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 p-3 rounded-lg shadow-lg transition-all min-h-[48px] min-w-[48px] flex items-center justify-center touch-manipulation"
      >
        <Menu className="text-white h-6 w-6" />
      </button>

      {/* Task 4.3: Backdrop overlay when sidebar is open on mobile */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-[90] md:hidden"
              onClick={() => setOpen(false)}
            />

            {/* Sidebar panel */}
            <motion.div
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: "easeInOut",
              }}
              className={cn(
                "fixed h-full w-[280px] left-0 top-0 bg-white dark:bg-neutral-900 p-6 z-[100] flex flex-col justify-between md:hidden shadow-2xl border-r border-neutral-700",
                className
              )}>
              {/* Close button */}
              <button
                className="absolute right-4 top-4 z-60 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-800 p-2 rounded-lg transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center touch-manipulation"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
              {children}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
  ...props
}) => {
  const { open, animate } = useSidebar();

  const content = (
    <>
      {/* fixed-size icon container so icon remains visible when sidebar is collapsed */}
      <span className="h-6 w-6 flex-shrink-0 text-neutral-700 dark:text-neutral-200 flex items-center justify-center">
        {link.icon}
      </span>

      {/* label: absolutely positioned so it does not reflow the icon when toggling open state */}
      <div className="relative flex-1">
        <motion.span
          aria-hidden={!open}
          animate={{
            opacity: animate ? (open ? 1 : 0) : 1,
            x: animate ? (open ? 0 : -3) : 0,
          }}
          transition={{ duration: 0.18 }}
          className={cn(
            "absolute left-5 top-1/2 -translate-y-1/2 text-neutral-700 dark:text-neutral-200 text-sm transition-transform duration-150 whitespace-pre group-hover/sidebar:translate-x-1",
            !open && "pointer-events-none"
          )}
        >
          {link.label}
        </motion.span>
      </div>
    </>
  );

  // Task 4.3: Enhanced mobile touch targets with min height
  const linkClassName = cn(
    "flex items-center justify-start gap-2 group/sidebar py-3 px-3 rounded-lg border border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 hover:border-neutral-700 transition-colors active:scale-95 touch-manipulation md:min-h-0 min-h-[48px]",
    className
  );

  if (link.onClick) {
    return (
      <button
        onClick={link.onClick}
        className={cn(linkClassName, "w-full text-left")}
        {...props}>
        {content}
      </button>
    );
  }

  return (
    <Link
      to={link.href}
      className={linkClassName}
      {...props}>
      {content}
    </Link>
  );
};

// Simple Logo components used in the Dashboard
export const Logo = () => {
  const { open, animate } = useSidebar();
  const currentUser = useSelector(selectCurrentUser);

  // Get first name from user name
  const getFirstName = (name) => {
    if (!name) return 'User';
    const parts = name.split(' ');
    return parts[0];
  };

  return (
    <div className="group/sidebar flex items-center justify-start gap-2 py-2 px-3">
      <div className="relative flex-1">
        <motion.span
          aria-hidden={!open}
          animate={{
            opacity: animate ? (open ? 1 : 0) : 1,
            x: animate ? (open ? 0 : -3) : 0,
          }}
          transition={{ duration: 0.18 }}
          className={cn(
            "absolute left-0 top-1/2 -translate-y-1/2 font-medium text-neutral-700 dark:text-neutral-200 text-lg whitespace-pre transition-transform duration-150 group-hover/sidebar:translate-x-1",
            !open && "pointer-events-none"
          )}
        >
          Hello, {getFirstName(currentUser?.name)}
        </motion.span>
      </div>
    </div>
  );
};

export const LogoIcon = () => (
  <div className="flex items-center gap-2 px-3 py-2">
    <div className="h-6 w-6 bg-white/90 rounded-md" />
  </div>
);

export const ProfileLink = () => {
  const { open, animate } = useSidebar();
  const currentUser = useSelector(selectCurrentUser);

  // Get user initials for avatar
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="group/sidebar flex items-center justify-start gap-2 py-4 px-3">
      <div className="h-8 w-8 rounded-full bg-sky-500 flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold overflow-hidden">
        {currentUser?.profilePicture ? (
          <img 
            src={assetUrl(currentUser.profilePicture)}
            alt={currentUser.name} 
            className="w-full h-full object-cover"
          />
        ) : (
          currentUser ? getInitials(currentUser.name) : '?'
        )}
      </div>
      <div className="relative flex-1">
        <motion.div
          aria-hidden={!open}
          animate={{
            opacity: animate ? (open ? 1 : 0) : 1,
            x: animate ? (open ? 0 : -3) : 0,
          }}
          transition={{ duration: 0.18 }}
          className={cn(
            "absolute left-2 top-1/2 -translate-y-1/2 text-neutral-700 dark:text-neutral-200 whitespace-pre transition-transform duration-150 group-hover/sidebar:translate-x-1 text-left",
            !open && "pointer-events-none"
          )}
        >
          <div className="text-sm font-medium text-left">{currentUser?.name || 'Guest'}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 capitalize text-left">
            {currentUser?.role?.replace(/_/g, ' ') || 'No role'}
          </div>
        </motion.div>
      </div>
    </div>
  );
};
