import type { ReactNode } from 'react'

export function PageHeading({ eyebrow, title, description, children, className }: { eyebrow: string; title: string; description?: string; children?: ReactNode; className?: string }) {
  return <div className={className ? `page-heading ${className}` : 'page-heading'}><div><span className="eyebrow teal">{eyebrow}</span><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{children}</div>
}
