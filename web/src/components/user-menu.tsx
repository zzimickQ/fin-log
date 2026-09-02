import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut, useSession } from '@/lib/auth-client'
import { toast } from '@/lib/stores'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Settings, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Profile button (top-right). Opens a menu with profile navigation, admin
 * and sign out — the only place the current user's account actions live.
 */
export function UserMenu() {
  const navigate = useNavigate()
  const { data: session } = useSession()
  const [open, setOpen] = useState(false)
  const user = session?.user

  if (!user) return null

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 gap-1.5 rounded-full px-1.5',
            open && 'bg-muted',
          )}
          aria-label="Account menu"
        >
          <UserAvatar name={user.name} image={user.image} />
          <span className="hidden max-w-28 truncate md:inline">
            {user.name}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/profile')}>
          <UserRound />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate('/admin/dashboard')}>
          <Settings />
          Admin
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() =>
            signOut({ callbackURL: '/' }).then(({ error }) => {
              if (error) {
                toast.error(error.message ?? 'Unable to sign out')
                setOpen(false)
              }
            })
          }
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Initials circle, or the user's picture when one is set. */
function UserAvatar({ name, image }: { name: string; image?: string | null }) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className="size-6 rounded-full object-cover"
        referrerPolicy="no-referrer"
      />
    )
  }
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground select-none">
      {initials || '?'}
    </span>
  )
}
