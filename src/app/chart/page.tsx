import { redirect } from 'next/navigation';

/** Single chart entry point — embedded chart lives on the dashboard. */
export default function ChartPage() {
  redirect('/dashboard?view=chart');
}
