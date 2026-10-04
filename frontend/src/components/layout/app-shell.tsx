"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Files,
  Menu,
  MessageSquare,
  LogOut,
  FileSpreadsheet,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: Files },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sidebarOpen, sidebarCollapsed, toggleSidebar, closeSidebar, toggleSidebarCollapse } = useUIStore();
  const { user, logout, refreshProfile } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    refreshProfile();
  }, [refreshProfile]);

  // If user is not logged in, render clean full-width shell without the sidebar
  if (!mounted || !user) {
    return (
      <div className="min-h-dvh flex flex-col bg-zinc-50/50 dark:bg-zinc-950 text-foreground">
        <header className="border-b border-zinc-200/80 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-emerald-800 dark:text-emerald-400">
            <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shadow-sm">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span>AI-Documenter</span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-zinc-500 hidden sm:inline">Intelligent Document RAG</span>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-medium transition shadow-sm"
            >
              Sign In
            </Link>
          </div>
        </header>
        <main className="flex-1 flex flex-col w-full max-w-6xl mx-auto px-6 py-8">{children}</main>
      </div>
    );
  }

  // Authenticated: ChatGPT / Claude style collapsible sidebar
  return (
    <div className="min-h-dvh flex bg-zinc-50/40 dark:bg-zinc-950 text-foreground overflow-x-hidden">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden animate-fade-in"
        />
      )}

      {/* Collapsible Sidebar */}
      <aside
        id="sidebar"
        className={cn(
          "fixed md:sticky top-0 h-dvh z-50 md:z-20 bg-zinc-50 dark:bg-zinc-950 border-r border-zinc-200/80 dark:border-zinc-800/80 transition-all duration-300 ease-in-out flex flex-col justify-between shrink-0",
          // Mobile state
          sidebarOpen ? "left-0 w-64 shadow-2xl" : "-left-64 md:left-0",
          // Desktop state
          sidebarCollapsed ? "md:w-16" : "md:w-64"
        )}
      >
        {/* Top Header / Brand / Collapse Toggle */}
        <div className="p-3">
          <div
            className={cn(
              "flex items-center gap-2 mb-3 px-2 py-1.5",
              sidebarCollapsed ? "justify-center" : "justify-between"
            )}
          >
            {!sidebarCollapsed && (
              <Link href="/" className="flex items-center gap-2 font-bold text-sm text-emerald-800 dark:text-emerald-400 truncate">
                <div className="w-7 h-7 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <span className="truncate">AI-Documenter</span>
              </Link>
            )}

            {/* Desktop Collapse / Expand Button (ChatGPT/Claude Style) */}
            <button
              onClick={toggleSidebarCollapse}
              className="hidden md:inline-flex p-1.5 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition cursor-pointer"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={closeSidebar}
              className="md:hidden p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-200/60"
              aria-label="Close sidebar"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Action Button: New Chat */}
          <Link
            href="/chat"
            onClick={closeSidebar}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition mb-4",
              sidebarCollapsed ? "justify-center px-0" : ""
            )}
            title="New Chat"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            {!sidebarCollapsed && <span className="truncate">New Chat</span>}
          </Link>

          {/* Main Navigation Links */}
          <nav aria-label="Main navigation" className="space-y-1">
            {navigation.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={closeSidebar}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60",
                    active && "bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-300 font-semibold",
                    sidebarCollapsed && "justify-center px-0"
                  )}
                  title={label}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {!sidebarCollapsed && <span className="truncate">{label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom User Profile Section */}
        <div className="p-3 border-t border-zinc-200/80 dark:border-zinc-800/80">
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl p-2 bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm",
              sidebarCollapsed ? "justify-center p-2" : "justify-between"
            )}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              {!sidebarCollapsed && (
                <div className="truncate text-xs leading-tight">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{user.username}</p>
                  <p className="text-zinc-400 truncate text-[11px]">{user.email}</p>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <button
                onClick={() => void logout()}
                className="text-zinc-400 hover:text-red-600 transition p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick Signout icon when collapsed */}
          {sidebarCollapsed && (
            <button
              onClick={() => void logout()}
              className="mt-2 w-full flex justify-center p-2 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-zinc-200/60 dark:hover:bg-zinc-800/60 transition cursor-pointer"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Bar */}
        <header className="flex items-center justify-between border-b border-zinc-200/80 dark:border-zinc-800 p-3 md:hidden bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 font-bold text-sm text-emerald-800 dark:text-emerald-400">
            <FileSpreadsheet className="w-4 h-4" />
            <span>AI-Documenter</span>
          </div>
          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-semibold">
            {user.username.charAt(0).toUpperCase()}
          </div>
        </header>

        {/* Content Container */}
        <main id="main" className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
