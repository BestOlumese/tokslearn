import { redirect } from 'next/navigation'

export default function SettingsIndex() {
  redirect('/account/settings/profile')
}
