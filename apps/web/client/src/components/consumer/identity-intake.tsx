import * as React from 'react'
import { Loader2, ShieldCheck, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { api, type Disclosure, type PostalAddress } from '@/lib/api'

const emptyAddress = (): PostalAddress => ({ line1: '', line2: '', city: '', state: '', postalCode: '' })

/**
 * Identity intake.
 *
 * This is the only place the reading gets a reference identity to compare the report's own
 * personal-information section against. Without it, "the name on this report is not your name"
 * is unprovable — a report can only be compared with itself — so the identity checks would have
 * nothing to run on. That is why it sits before the upload rather than beside it.
 */
export function IdentityStep({ onComplete }: { onComplete: () => Promise<void> }) {
  const [fullName, setFullName] = React.useState('')
  const [dateOfBirth, setDateOfBirth] = React.useState('')
  const [ssnLastFour, setSsnLastFour] = React.useState('')
  const [currentAddress, setCurrentAddress] = React.useState<PostalAddress>(emptyAddress)
  const [previousAddresses, setPreviousAddresses] = React.useState<PostalAddress[]>([])
  const [accepted, setAccepted] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [disclosure, setDisclosure] = React.useState<Disclosure | null>(null)

  React.useEffect(() => {
    void api.getDisclosure().then(setDisclosure).catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load the accuracy declaration'))
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!disclosure || !accepted) return
    setBusy(true); setError(null)
    try {
      await api.recordIdentity({
        fullName, dateOfBirth, ssnLastFour,
        currentAddress,
        // A blank row the consumer added and then left empty is not an address they are claiming.
        previousAddresses: previousAddresses.filter(address => address.line1.trim() !== ''),
        attestationVersion: disclosure.identityAttestationVersion,
        accurateAndComplete: true,
      })
      await onComplete()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save your details')
    } finally { setBusy(false) }
  }

  return <section className="mt-10 max-w-3xl" aria-labelledby="identity-heading">
    <h1 id="identity-heading" className="font-serif text-3xl tracking-tight">Tell us who the report should be about.</h1>
    <p className="mt-3 text-muted-foreground">
      Your report has a personal-information section listing the names, dates of birth, and addresses each bureau holds for you.
      This reading compares that section against the details you enter here — that comparison is how a name or address belonging
      to someone else shows up. Enter your details exactly as they appear on your identification.
    </p>

    <form className="mt-8 space-y-8" onSubmit={submit}>
      <fieldset className="border border-rule bg-paper p-6">
        <legend className="eyebrow px-2">About you</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Label className="sm:col-span-2">Full legal name
            <Input required autoComplete="name" value={fullName} placeholder="First Middle Last" onChange={event => setFullName(event.target.value)} />
          </Label>
          <Label>Date of birth
            <Input required type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={dateOfBirth} onChange={event => setDateOfBirth(event.target.value)} />
          </Label>
          <Label>Last four digits of your SSN
            <Input required inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" value={ssnLastFour} placeholder="1234" onChange={event => setSsnLastFour(event.target.value.replace(/\D/g, '').slice(0, 4))} />
            <span className="mt-2 block text-sm text-muted-foreground">Four digits only. Never enter a full Social Security number here or anywhere in this service.</span>
          </Label>
        </div>
      </fieldset>

      <fieldset className="border border-rule bg-paper p-6">
        <legend className="eyebrow px-2">Current address</legend>
        <AddressFields address={currentAddress} onChange={setCurrentAddress} required autoCompletePrefix />
      </fieldset>

      <fieldset className="border border-rule bg-paper p-6">
        <legend className="eyebrow px-2">Previous addresses</legend>
        <p className="text-sm text-muted-foreground">
          Optional, and worth adding. Reports keep old addresses for years — listing yours is what separates
          “an address I used to live at” from “an address I have never seen.”
        </p>
        <ul className="mt-5 space-y-5">
          {previousAddresses.map((address, index) => <li key={index} className="border-t border-rule pt-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="eyebrow">Previous address {index + 1}</span>
              <button type="button" className="flex items-center gap-1 text-sm underline underline-offset-4" onClick={() => setPreviousAddresses(current => current.filter((_, position) => position !== index))}>
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
            <AddressFields address={address} onChange={next => setPreviousAddresses(current => current.map((item, position) => position === index ? next : item))} />
          </li>)}
        </ul>
        {previousAddresses.length < 10 && <Button className="mt-5" type="button" variant="outline" size="sm" onClick={() => setPreviousAddresses(current => [...current, emptyAddress()])}>
          <Plus className="h-4 w-4" /> Add a previous address
        </Button>}
      </fieldset>

      <fieldset className="border border-rule bg-paper p-6">
        <legend className="eyebrow px-2">Accuracy declaration</legend>
        {disclosure
          ? <article className="whitespace-pre-line text-sm leading-relaxed">{disclosure.identityAttestationText}</article>
          : <p role="status" className="text-sm text-muted-foreground">Loading the accuracy declaration…</p>}
        <Label className="mt-6 flex items-start gap-3">
          <input required type="checkbox" className="mt-1" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
          <span>I declare that the details above are my own and are accurate and complete to the best of my knowledge.</span>
        </Label>
      </fieldset>

      {error && <p className="text-sm text-negative" role="alert">{error}</p>}
      <Button type="submit" disabled={!disclosure || !accepted || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Save and continue
      </Button>
    </form>
  </section>
}

function AddressFields({ address, onChange, required = false, autoCompletePrefix = false }: { address: PostalAddress; onChange: (next: PostalAddress) => void; required?: boolean; autoCompletePrefix?: boolean }) {
  const patch = (key: keyof PostalAddress, value: string) => onChange({ ...address, [key]: value })
  return <div className="grid gap-5 sm:grid-cols-6">
    <Label className="sm:col-span-4">Street address
      <Input required={required} autoComplete={autoCompletePrefix ? 'address-line1' : 'off'} value={address.line1} onChange={event => patch('line1', event.target.value)} />
    </Label>
    <Label className="sm:col-span-2">Apt / unit
      <Input autoComplete={autoCompletePrefix ? 'address-line2' : 'off'} value={address.line2 ?? ''} onChange={event => patch('line2', event.target.value)} />
    </Label>
    <Label className="sm:col-span-3">City
      <Input required={required} autoComplete={autoCompletePrefix ? 'address-level2' : 'off'} value={address.city} onChange={event => patch('city', event.target.value)} />
    </Label>
    <Label className="sm:col-span-1">State
      <Input required={required} maxLength={2} placeholder="CA" autoComplete={autoCompletePrefix ? 'address-level1' : 'off'} value={address.state} onChange={event => patch('state', event.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2))} />
    </Label>
    <Label className="sm:col-span-2">ZIP code
      <Input required={required} inputMode="numeric" placeholder="90210" autoComplete={autoCompletePrefix ? 'postal-code' : 'off'} value={address.postalCode} onChange={event => patch('postalCode', event.target.value.replace(/[^\d-]/g, '').slice(0, 10))} />
    </Label>
  </div>
}
