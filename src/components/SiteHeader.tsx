import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/use-session";
import { useIsAdmin } from "@/lib/use-is-admin";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SiteHeader() {
  const { user, loading } = useSession();
  const isAdmin = useIsAdmin(user?.id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Auto<span className="text-primary">Claim</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          <ThemeToggle />
          {loading ? null : user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Menu className="size-4" /> Menu
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isAdmin.data ? (
                    <DropdownMenuItem asChild><Link to="/admin">Insurer dashboard</Link></DropdownMenuItem>
                  ) : (
                    <>
                      <DropdownMenuItem asChild><Link to="/upload">New claim</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/claims">My claims</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/garages">Nearby garages</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/assistant">Claim assistant</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild><Link to="/admin">Insurer dashboard</Link></DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {user.email}
              </span>
              <Button variant="outline" size="sm" onClick={signOut}>
                Sign out
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
