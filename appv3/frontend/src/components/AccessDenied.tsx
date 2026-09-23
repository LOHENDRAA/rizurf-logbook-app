import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeading } from './PageHeading'

export function AccessDenied({ copy, backTo = '/supervisor/dashboard', backLabel = 'Back to interns', eyebrow = 'SUPERVISOR' }: {
  copy: string
  backTo?: string
  backLabel?: string
  eyebrow?: string
}) {
  return (
    <>
      <Link className="back-link" to={backTo}><ArrowLeft size={15} /> {backLabel}</Link>
      <PageHeading eyebrow={eyebrow} title="Access denied" description={copy} />
      <section className="card"><h3>Not available</h3><p className="empty-copy">{copy}</p></section>
    </>
  )
}
