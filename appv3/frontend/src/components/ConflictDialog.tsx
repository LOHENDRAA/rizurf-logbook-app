import { useState } from 'react'

/**
 * Compare-then-retry UI for 409/412 version conflicts. Local text is never
 * discarded automatically: the user copies, reconciles, then retries with
 * the fresh server version.
 */
export function ConflictDialog({
  localBody,
  serverBody,
  onRetry,
  onKeepLocal,
}: {
  localBody: string
  serverBody: string
  onRetry: (reconciled: string) => Promise<boolean>
  onKeepLocal: () => void
}) {
  const [reconciled, setReconciled] = useState(localBody)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const submit = () => {
    if (pending) return
    setPending(true)
    void onRetry(reconciled).then((ok) => {
      setPending(false)
      setMessage(ok ? 'Saved with the latest version.' : 'Still out of date — compare again and retry.')
    })
  }

  return (
    <div className="conflict-dialog" role="alertdialog" aria-labelledby="conflict-heading" aria-describedby="conflict-description">
      <h3 id="conflict-heading">This item changed elsewhere</h3>
      <p id="conflict-description">Your edits are preserved below. Compare with the server copy, reconcile, then retry.</p>
      <div className="conflict-columns">
        <label>
          Your unsynced text
          <textarea aria-label="Your unsynced text" value={reconciled} onChange={(event) => setReconciled(event.target.value)} rows={6} />
        </label>
        <label>
          Server copy
          <textarea aria-label="Server copy" value={serverBody} readOnly rows={6} />
        </label>
      </div>
      <div className="editor-actions">
        <button className="button primary" type="button" onClick={submit} disabled={pending}>
          {pending ? 'Retrying…' : 'Retry with latest version'}
        </button>
        <button className="button" type="button" onClick={onKeepLocal}>
          Keep editing mine
        </button>
      </div>
      {message && <p role="status" className="form-success">{message}</p>}
    </div>
  )
}
