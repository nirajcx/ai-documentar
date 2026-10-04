"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
      <div className="min-h-dvh flex flex-col bg-[#faf8f5] dark:bg-[#141210] text-foreground">
        <header className="border-b border-[#e8dfd3] dark:border-[#322b22] bg-white/80 dark:bg-[#1c1916]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-[#8c6d3b] dark:text-[#d4af6a]">
            <div className="w-8 h-8 rounded-lg bg-[#96743d] hover:bg-[#83632f] text-white flex items-center justify-center shadow-sm">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <span>AI-Documenter</span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-[#827566] hidden sm:inline">Intelligent Document RAG</span>
            <Link
              href="/"
              className="px-3 py-1.5 rounded-lg bg-[#96743d] hover:bg-[#83632f] text-white font-medium transition shadow-sm"
            >
              Sign In
            </Link>
          </div>
        </header>
        <main className="flex-1 flex flex-col w-full max-w-6xl mx-auto px-6 py-8">{children}</main>
      </div>
    );
  }

  // Authenticated: ChatGPT / Claude style collapsible sidebar with warm golden-brown accents
  return (
    <div className="min-h-dvh flex bg-[#faf8f5] dark:bg-[#141210] text-foreground overflow-x-hidden">
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
          "fixed md:sticky top-0 h-dvh z-50 md:z-20 bg-[#f7f2ea] dark:bg-[#181512] border-r border-[#e8dfd3] dark:border-[#322b22] transition-all duration-300 ease-in-out flex flex-col justify-between shrink-0",
          sidebarOpen ? "left-0 w-64 shadow-2xl" : "-left-64 md:left-0",
          sidebarCollapsed ? "md:w-16" : "md:w-64"
        )}
      >
        {/* Top Section */}
        <div className="p-3">
          <div
            className={cn(
              "flex items-center gap-2 mb-3 px-2 py-1.5",
              sidebarCollapsed ? "justify-center" : "justify-between"
            )}
          >
            {!sidebarCollapsed && (
              <Link href="/" className="flex items-center gap-2 font-bold text-sm text-[#8c6d3b] dark:text-[#d4af6a] truncate">
                <div className="w-7 h-7 rounded-lg bg-[#96743d] text-white flex items-center justify-center shrink-0 shadow-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <span className="truncate">AI-Documenter</span>
              </Link>
            )}

            {/* Desktop Collapse / Expand Button */}
            <button
              onClick={toggleSidebarCollapse}
              className="hidden md:inline-flex p-1.5 rounded-lg text-[#827566] hover:text-[#4a3b26] dark:hover:text-[#f3eee7] hover:bg-[#ede3d4] dark:hover:bg-[#27221b] transition cursor-pointer"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={closeSidebar}
              className="md:hidden p-1.5 rounded-lg text-[#827566] hover:bg-[#ede3d4]"
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
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-semibold bg-[#96743d] hover:bg-[#83632f] text-white shadow-sm transition mb-4",
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
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition text-[#5e5141] dark:text-[#c4b5a3] hover:bg-[#ede3d4] dark:hover:bg-[#252019]",
                    active && "bg-[#eddcc2]/70 dark:bg-[#342a1d] text-[#63491f] dark:text-[#e4c48b] font-semibold shadow-xs",
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
        <div className="p-3 border-t border-[#e8dfd3] dark:border-[#322b22]">
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl p-2 bg-white dark:bg-[#1f1b17] border border-[#e8dfd3] dark:border-[#322b22] shadow-sm",
              sidebarCollapsed ? "justify-center p-2" : "justify-between"
            )}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-7 h-7 rounded-full bg-[#f4ebd9] dark:bg-[#32281a] text-[#8c6d3b] dark:text-[#d4af6a] flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5" />
              </div>
              {!sidebarCollapsed && (
                <div className="truncate text-xs leading-tight">
                  <p className="font-semibold text-[#2a241e] dark:text-[#f3eee7] truncate">{user.username}</p>
                  <p className="text-[#827566] truncate text-[11px]">{user.email}</p>
                </div>
              )}
            </div>

            {!sidebarCollapsed && (
              <button
                onClick={() => void logout()}
                className="text-[#827566] hover:text-red-600 transition p-1.5 rounded-md hover:bg-[#f5efe6] dark:hover:bg-[#2b241c] cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>

          {sidebarCollapsed && (
            <button
              onClick={() => void logout()}
              className="mt-2 w-full flex justify-center p-2 text-[#827566] hover:text-red-600 rounded-lg hover:bg-[#ede3d4] dark:hover:bg-[#252019] transition cursor-pointer"
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
        <header className="flex items-center justify-between border-b border-[#e8dfd3] dark:border-[#322b22] p-3 md:hidden bg-white/80 dark:bg-[#1c1916]/80 backdrop-blur-md sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            <Menu className="w-5 h-5 text-[#8c6d3b]" />
          </Button>
          <div className="flex items-center gap-2 font-bold text-sm text-[#8c6d3b] dark:text-[#d4af6a]">
            <FileSpreadsheet className="w-4 h-4" />
            <span>AI-Documenter</span>
          </div>
          <div className="w-7 h-7 rounded-full bg-[#f4ebd9] text-[#8c6d3b] flex items-center justify-center text-xs font-semibold">
            {user.username.charAt(0).toUpperCase()}
          </div>
        </header>

        <main id="main" className="flex-1 w-full max-w-5xl mx-auto p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
