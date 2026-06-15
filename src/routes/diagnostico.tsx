import { createFileRoute } from '@tanstack/react-router'
import { FormularioDiagnostico } from '../components/FormularioDiagnostico'

export const Route = createFileRoute('/diagnostico')({
  component: DiagnosticoPage,
})

function DiagnosticoPage() {
  return <FormularioDiagnostico />
}
