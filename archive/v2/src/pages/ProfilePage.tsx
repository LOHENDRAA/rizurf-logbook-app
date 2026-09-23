import { Database, ImagePlus, RotateCcw, ShieldAlert, Stamp, UserRound } from 'lucide-react'
import { useRef, useState } from 'react'
import { PageHeading } from '../components/PageHeading'
import { useApp } from '../state/AppContext'

export function ProfilePage() {
  const { currentUser, data, updateSignature, resetDemo } = useApp()
  const [saved, setSaved] = useState('')
  const signatureRef = useRef<HTMLInputElement>(null)
  const stampRef = useRef<HTMLInputElement>(null)
  if (!currentUser) return null
  const profile = data.signatures[currentUser.id] ?? {}
  const loadImage = (file: File | undefined, field: 'signature' | 'stamp') => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { updateSignature(currentUser.id, { [field]: String(reader.result) }); setSaved(`${field === 'signature' ? 'Signature' : 'Stamp'} saved in this browser.`) }
    reader.readAsDataURL(file)
  }
  return <>
    <PageHeading eyebrow="PROFILE & SETTINGS" title="Your local workspace." description="Manage identity assets and prototype data stored on this device." />
    <div className="settings-grid"><section className="card profile-card"><div className="profile-avatar">{currentUser.avatar}</div><div><span className="eyebrow">SIGNED IN AS</span><h2>{currentUser.name}</h2><p>{currentUser.email}</p><span className="role-pill"><UserRound />{currentUser.role === 'intern' ? 'Intern' : 'Company supervisor'}</span></div></section><section className="card security-card"><ShieldAlert /><div><h3>Prototype security</h3><p>Quick login permits anyone using this browser to access locally stored records. Do not treat this as production-grade protection.</p></div></section></div>
    <section className="card signature-section"><div className="card-head"><div><span className="eyebrow">APPROVAL IDENTITY</span><h2>{currentUser.role === 'supervisor' ? 'Signature & company stamp' : 'Student signature'}</h2><p>Uploaded images are stored only in this browser and applied to completed and approved document output.</p></div><Stamp /></div><div className="asset-grid"><button className={profile.signature ? 'asset-upload has-image' : 'asset-upload'} onClick={() => signatureRef.current?.click()}>{profile.signature ? <img src={profile.signature} alt="Stored signature" /> : <ImagePlus />}<span><strong>{profile.signature ? 'Replace signature' : 'Upload signature'}</strong><small>PNG or JPG with a transparent background recommended</small></span></button><input hidden ref={signatureRef} type="file" accept="image/png,image/jpeg" onChange={(event) => loadImage(event.target.files?.[0], 'signature')} />{currentUser.role === 'supervisor' && <><button className={profile.stamp ? 'asset-upload has-image' : 'asset-upload'} onClick={() => stampRef.current?.click()}>{profile.stamp ? <img src={profile.stamp} alt="Stored company stamp" /> : <ImagePlus />}<span><strong>{profile.stamp ? 'Replace company stamp' : 'Upload company stamp'}</strong><small>Applied automatically when you approve work</small></span></button><input hidden ref={stampRef} type="file" accept="image/png,image/jpeg" onChange={(event) => loadImage(event.target.files?.[0], 'stamp')} /></>}</div>{saved && <div className="form-success">{saved}</div>}</section>
    <section className="card data-section"><div><Database /><span><h3>Browser data</h3><p>Reset all documents, reviews, uploads, notifications, and signatures to the seeded demo state.</p></span></div><button className="button danger" onClick={() => { if (confirm('Reset all prototype data on this browser?')) void resetDemo() }}><RotateCcw />Reset demo data</button></section>
  </>
}
