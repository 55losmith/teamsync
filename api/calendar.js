import { createClient } from '@supabase/supabase-js'
import process from 'node:process'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function escapeCalendarText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

function formatCalendarDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function titleCase(value = '') {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function calendarDurationMinutes(event) {
  if (event.event_type === 'game') return 120
  if (event.event_type === 'practice') return 90
  if (event.event_type === 'meeting') return 60
  return 90
}

function buildCalendarFile(events, team) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HuddleUp//Team Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    `X-WR-CALNAME:${escapeCalendarText(`${team.name || 'HuddleUp'} Schedule`)}`,
  ]

  events.forEach((event) => {
    const start = new Date(event.starts_at)
    const end = new Date(start.getTime() + calendarDurationMinutes(event) * 60 * 1000)
    const location = event.event_address || event.location || ''
    const description = [
      event.opponent ? `Opponent: ${event.opponent}` : '',
      event.home_away ? `Home/Away: ${titleCase(event.home_away)}` : '',
      event.our_score !== null && event.opponent_score !== null ? `Score: ${event.our_score}-${event.opponent_score}` : '',
      event.notes || '',
    ].filter(Boolean).join('\n')

    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@huddleup`,
      `DTSTAMP:${formatCalendarDate(new Date(event.updated_at || event.created_at || Date.now()))}`,
      `DTSTART:${formatCalendarDate(start)}`,
      `DTEND:${formatCalendarDate(end)}`,
      `SUMMARY:${escapeCalendarText(event.title || titleCase(event.event_type || 'Event'))}`,
      location ? `LOCATION:${escapeCalendarText(location)}` : '',
      description ? `DESCRIPTION:${escapeCalendarText(description)}` : '',
      event.status === 'cancelled' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  })

  lines.push('END:VCALENDAR')
  return `${lines.filter(Boolean).join('\r\n')}\r\n`
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).send('Method not allowed')
  if (!supabaseUrl || !supabaseServiceRoleKey) return response.status(500).send('Calendar feed is not configured.')

  const teamId = String(request.query.team || '')
  const token = String(request.query.token || '')
  if (!teamId || !token) return response.status(400).send('Missing calendar feed details.')

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)
  const { data: team, error: teamError } = await admin
    .from('teams')
    .select('id, name, calendar_feed_token')
    .eq('id', teamId)
    .eq('calendar_feed_token', token)
    .maybeSingle()

  if (teamError) return response.status(500).send(teamError.message)
  if (!team) return response.status(404).send('Calendar feed not found.')

  const { data: events, error: eventError } = await admin
    .from('events')
    .select('id, title, event_type, starts_at, location, event_address, opponent, home_away, our_score, opponent_score, status, notes, created_at, updated_at')
    .eq('team_id', team.id)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true })

  if (eventError) return response.status(500).send(eventError.message)

  response.setHeader('content-type', 'text/calendar; charset=utf-8')
  response.setHeader('cache-control', 's-maxage=300, stale-while-revalidate=3600')
  response.status(200).send(buildCalendarFile(events || [], team))
}
