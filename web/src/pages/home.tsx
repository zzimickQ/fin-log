import { Link } from 'react-router-dom'
import { useSession } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ArrowRight, Download } from 'lucide-react'

export function HomePage() {
  const { data: session, isPending } = useSession()

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-start gap-6 py-12">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Track your money, the simple way.
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Fin Log is a lightweight personal finance logger. Record expenses,
          spot trends, and stay on budget — on any device, even offline.
        </p>
        <div className="flex items-center gap-3">
          {isPending ? null : session ? (
            <Button asChild>
              <Link to="/dashboard">
                Go to dashboard <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to="/sign-up">
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Installable PWA</CardTitle>
            <CardDescription>
              Installable on desktop and mobile. Works offline with cached
              assets.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
            <Download className="size-4" /> Add to home screen
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Secure auth</CardTitle>
            <CardDescription>
              Powered by Better Auth — email/password sessions with a fully
              typed React client.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hash routing</CardTitle>
            <CardDescription>
              HashRouter keeps every route working on static hosting — no server
              rewrites needed.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>
    </div>
  )
}
