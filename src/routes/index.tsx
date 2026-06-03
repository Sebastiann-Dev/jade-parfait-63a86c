import { createFileRoute } from '@tanstack/react-router'
import Cotizador from '../components/Cotizador'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <Cotizador />
}
