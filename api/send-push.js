import { createClient } from '@supabase/supabase-js'
import { Buffer } from 'node:buffer'
import { createPrivateKey, sign } from 'node:crypto'
import process from 'node:process'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:team@example.com'

const defaultNotificationPreferences = {
  broadcasts_enabled: true,
  dues_enabled: true,
  lineup_enabled: true,
  messages_enabled: true,
  pitch_enabled: true,
  push_enabled: true,
  schedule_enabled: true,
}

function base64UrlToBuffer(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function bufferToBase64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function derToJoseSignature(signature) {
  let offset = 0
  if (signature[offset++] !== 0x30) throw new Error('Invalid ECDSA signature')

  const sequenceLength = signature[offset++]
  if (sequenceLength + 2 !== signature.length) throw new Error('Invalid ECDSA signature length')

  if (signature[offset++] !== 0x02) throw new Error('Invalid ECDSA signature')
  const rLength = signature[offset++]
  let r = signature.subarray(offset, offset + rLength)
  offset += rLength

  if (signature[offset++] !== 0x02) throw new Error('Invalid ECDSA signature')
  const sLength = signature[offset++]
  let s = signature.subarray(offset, offset + sLength)

  if (r.length > 32) r = r.subarray(r.length - 32)
  if (s.length > 32) s = s.subarray(s.length - 32)

  return Buffer.concat([
    Buffer.concat([Buffer.alloc(32 - r.length), r]),
    Buffer.concat([Buffer.alloc(32 - s.length), s]),
  ])
}

function createVapidHeaders(endpoint) {
  const audience = new URL(endpoint).origin
  const publicKeyBytes = base64UrlToBuffer(vapidPublicKey)
  const privateKey = createPrivateKey({
    format: 'jwk',
    key: {
      crv: 'P-256',
      d: vapidPrivateKey,
      ext: true,
      key_ops: ['sign'],
      kty: 'EC',
      x: bufferToBase64Url(publicKeyBytes.subarray(1, 33)),
      y: bufferToBase64Url(publicKeyBytes.subarray(33, 65)),
    },
  })
  const header = bufferToBase64Url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }))
  const body = bufferToBase64Url(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    sub: vapidSubject,
  }))
  const signature = bufferToBase64Url(derToJoseSignature(sign('sha256', Buffer.from(`${header}.${body}`), privateKey)))
  const jwt = `${header}.${body}.${signature}`

  return {
    authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    ttl: '2419200',
    urgency: 'high',
  }
}

function notificationAllowed(preferences, notificationType) {
  if (!preferences?.push_enabled) return false
  if (notificationType === 'message') return preferences.messages_enabled
  if (notificationType === 'broadcast') return preferences.broadcasts_enabled
  if (notificationType === 'schedule') return preferences.schedule_enabled
  if (notificationType === 'dues') return preferences.dues_enabled
  if (notificationType === 'lineup') return preferences.lineup_enabled
  if (notificationType === 'pitch') return preferences.pitch_enabled
  return true
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !vapidPublicKey || !vapidPrivateKey) {
    return response.status(500).json({ error: 'Push sender is missing required environment variables.' })
  }

  const authHeader = request.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return response.status(401).json({ error: 'Missing user session.' })

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userError } = await userClient.auth.getUser(token)
  if (userError || !userData.user) return response.status(401).json({ error: 'Invalid user session.' })

  const admin = createClient(supabaseUrl, supabaseServiceRoleKey)
  let body
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {}
  } catch {
    return response.status(400).json({ error: 'Invalid JSON body.' })
  }
  const teamId = body.team_id
  const notificationIds = Array.isArray(body.notification_ids) ? body.notification_ids : []
  const testSelf = body.test_self === true

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, team_id, full_name')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError || !profile?.team_id || profile.team_id !== teamId) {
    return response.status(403).json({ error: 'You can only send HuddleUp pushes for your team.' })
  }

  if (testSelf) {
    const { data: testNotification, error: testNotificationError } = await admin
      .from('notifications')
      .insert({
        body: `Push is working for ${profile.full_name || 'this device'}.`,
        notification_type: 'test',
        recipient_id: profile.id,
        team_id: teamId,
        title: 'HuddleUp Test Push',
      })
      .select('id')
      .maybeSingle()

    if (testNotificationError) return response.status(500).json({ error: testNotificationError.message })
    notificationIds.push(testNotification.id)
  }

  let notificationQuery = admin
    .from('notifications')
    .select('id, team_id, recipient_id, conversation_id, title, body, notification_type, created_at')
    .eq('team_id', teamId)
    .is('push_sent_at', null)
    .order('created_at', { ascending: true })
    .limit(50)

  if (notificationIds.length) notificationQuery = notificationQuery.in('id', notificationIds)

  const { data: notifications, error: notificationError } = await notificationQuery
  if (notificationError) return response.status(500).json({ error: notificationError.message })
  if (!notifications?.length) return response.status(200).json({ sent: 0, skipped: 0 })

  const recipientIds = [...new Set(notifications.map((notification) => notification.recipient_id))]
  const [{ data: subscriptions, error: subscriptionError }, { data: preferences, error: preferenceError }] = await Promise.all([
    admin
      .from('push_subscriptions')
      .select('id, profile_id, endpoint, p256dh, auth')
      .eq('team_id', teamId)
      .eq('enabled', true)
      .in('profile_id', recipientIds),
    admin
      .from('notification_preferences')
      .select('*')
      .eq('team_id', teamId)
      .in('profile_id', recipientIds),
  ])

  if (subscriptionError) return response.status(500).json({ error: subscriptionError.message })
  if (preferenceError) return response.status(500).json({ error: preferenceError.message })

  const preferencesByProfile = new Map((preferences || []).map((preference) => [preference.profile_id, preference]))
  const subscriptionsByProfile = new Map()
  for (const subscription of subscriptions || []) {
    const existing = subscriptionsByProfile.get(subscription.profile_id) || []
    existing.push(subscription)
    subscriptionsByProfile.set(subscription.profile_id, existing)
  }

  let sent = 0
  let skipped = 0
  let failed = 0
  let noSubscription = 0
  let preferenceDisabled = 0
  const deadSubscriptionIds = []
  const sentNotificationIds = []
  const failures = []

  for (const notification of notifications) {
    const preference = preferencesByProfile.get(notification.recipient_id) || defaultNotificationPreferences
    if (!notificationAllowed(preference, notification.notification_type)) {
      skipped += 1
      preferenceDisabled += 1
      sentNotificationIds.push(notification.id)
      continue
    }

    const recipientSubscriptions = subscriptionsByProfile.get(notification.recipient_id) || []
    if (!recipientSubscriptions.length) {
      skipped += 1
      noSubscription += 1
      continue
    }

    let delivered = false
    for (const subscription of recipientSubscriptions) {
      try {
        const pushResponse = await fetch(subscription.endpoint, {
          headers: createVapidHeaders(subscription.endpoint),
          method: 'POST',
        })
        if (pushResponse.ok || pushResponse.status === 201) {
          sent += 1
          delivered = true
        } else if (pushResponse.status === 404 || pushResponse.status === 410) {
          deadSubscriptionIds.push(subscription.id)
          failed += 1
        } else {
          failed += 1
          failures.push({
            endpoint_host: new URL(subscription.endpoint).host,
            notification_id: notification.id,
            status: pushResponse.status,
            status_text: pushResponse.statusText,
          })
        }
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) deadSubscriptionIds.push(subscription.id)
        failed += 1
        failures.push({
          endpoint_host: new URL(subscription.endpoint).host,
          error: error.message || 'Push request failed',
          notification_id: notification.id,
        })
      }
    }

    if (delivered) sentNotificationIds.push(notification.id)
  }

  await Promise.all([
    sentNotificationIds.length
      ? admin.from('notifications').update({ push_sent_at: new Date().toISOString() }).in('id', sentNotificationIds)
      : Promise.resolve(),
    deadSubscriptionIds.length
      ? admin.from('push_subscriptions').update({ enabled: false, updated_at: new Date().toISOString() }).in('id', deadSubscriptionIds)
      : Promise.resolve(),
  ])

  return response.status(200).json({
    failed,
    failures: failures.slice(0, 5),
    no_subscription: noSubscription,
    preference_disabled: preferenceDisabled,
    sent,
    skipped,
  })
}
